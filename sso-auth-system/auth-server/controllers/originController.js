import pool from '../../config/database.js';

async function refreshOrigins() {
  try {
    const { refreshOrigins } = await import('../middleware/cors.js');
    return await refreshOrigins();
  } catch (error) {
    console.error('Failed to refresh origins:', error);
    return [];
  }
}

// 🆕 CSP設定も含めて更新する関数
async function refreshOriginsAndCSP() {
  try {
    // Origins を更新（これにより自動的にCSPも更新される）
    const origins = await refreshOrigins();
    
    // 追加でCSP設定を確実に更新
    const { refreshCSPConfiguration } = await import('../server.js');
    await refreshCSPConfiguration();
    
    console.log('🔄 Origins and CSP refreshed:', origins);
    return origins;
  } catch (error) {
    console.error('Failed to refresh origins and CSP:', error);
    return [];
  }
}

class OriginController {
  async listOrigins(req, res) {
    try {
      // 🆕 新しいフィールドを含めて取得
      const result = await pool.query(
        `SELECT o.*, u.username as added_by_username 
         FROM allowed_origins o 
         LEFT JOIN users u ON o.added_by = u.id 
         ORDER BY o.auto_added ASC, o.created_at DESC`
      );
      
      // 🆕 オリジンタイプ別に整理
      const origins = result.rows.map(origin => ({
        ...origin,
        auto_added: Boolean(origin.auto_added),
        origin_type: origin.origin_type || (origin.auto_added ? 'client' : 'manual')
      }));
      
      res.json({
        origins: origins,
        total: result.rows.length,
        statistics: {
          manual: origins.filter(o => !o.auto_added).length,
          auto_added: origins.filter(o => o.auto_added).length,
          client_origins: origins.filter(o => o.origin_type === 'client').length,
          shared_origins: origins.filter(o => o.origin_type === 'shared').length
        }
      });
    } catch (error) {
      console.error('List origins error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addOrigin(req, res) {
    try {
      const { origin, description } = req.body;
      const userId = req.user.sub;
      
      if (!origin) {
        return res.status(400).json({ 
          error: 'invalid_request', 
          error_description: 'Origin is required' 
        });
      }
      
      try {
        new URL(origin);
      } catch (urlError) {
        return res.status(400).json({ 
          error: 'invalid_origin', 
          error_description: 'Invalid origin URL format' 
        });
      }
      
      const existingResult = await pool.query(
        'SELECT id, auto_added, origin_type FROM allowed_origins WHERE origin = ?',
        [origin]
      );
      
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        if (existing.auto_added) {
          // 🆕 自動追加されたオリジンを手動オリジンに変換
          await pool.query(
            `UPDATE allowed_origins 
             SET auto_added = 0, origin_type = 'manual', description = ?, added_by = ?, updated_at = datetime('now')
             WHERE id = ?`,
            [description || 'Manually added origin (converted from auto-added)', userId, existing.id]
          );
          
          await refreshOriginsAndCSP();
          
          const updatedOriginResult = await pool.query(
            'SELECT id, origin, description, is_active, created_at FROM allowed_origins WHERE id = ?',
            [existing.id]
          );
          
          return res.json({
            message: 'Auto-added origin converted to manual origin',
            origin: updatedOriginResult.rows[0],
            converted: true
          });
        } else {
          return res.status(409).json({ 
            error: 'origin_exists', 
            error_description: 'Origin already exists as manual origin' 
          });
        }
      }
      
      // 🆕 手動オリジンとして追加（新しいフィールドを含む）
      const insertResult = await pool.query(
        `INSERT INTO allowed_origins (origin, description, added_by, is_active, auto_added, origin_type) 
         VALUES (?, ?, ?, 1, 0, 'manual')`,
        [origin, description || null, userId]
      );
      
      const newOriginResult = await pool.query(
        'SELECT id, origin, description, is_active, created_at FROM allowed_origins WHERE id = ?',
        [insertResult.lastInsertRowid]
      );
      
      console.log('🔄 Manual origin added, refreshing CORS and CSP...');
      await refreshOriginsAndCSP();
      
      res.status(201).json({
        message: 'Origin added successfully',
        origin: newOriginResult.rows[0]
      });
      
    } catch (error) {
      console.error('Add origin error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async removeOrigin(req, res) {
    try {
      const { id } = req.params;
      
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          error: 'invalid_request', 
          error_description: 'Valid origin ID is required' 
        });
      }
      
      const existingResult = await pool.query(
        'SELECT origin, auto_added, origin_type, source_client_id FROM allowed_origins WHERE id = ?',
        [id]
      );
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'origin_not_found', 
          error_description: 'Origin not found' 
        });
      }
      
      const originToDelete = existingResult.rows[0];
      
      // 🆕 自動追加されたオリジンの削除警告
      if (originToDelete.auto_added) {
        // クライアントがまだアクティブかチェック
        if (originToDelete.source_client_id) {
          const clientResult = await pool.query(
            'SELECT client_id, is_active FROM clients WHERE client_id = ?',
            [originToDelete.source_client_id]
          );
          
          if (clientResult.rows.length > 0 && clientResult.rows[0].is_active) {
            return res.status(400).json({
              error: 'cannot_delete_active_client_origin',
              error_description: `Cannot delete auto-added origin while client '${originToDelete.source_client_id}' is active. Deactivate the client first or convert this to a manual origin.`,
              suggestion: 'Convert to manual origin instead of deleting'
            });
          }
        }
      }
      
      await pool.query('DELETE FROM allowed_origins WHERE id = ?', [id]);
      
      console.log('🔄 Origin removed, refreshing CORS and CSP...');
      await refreshOriginsAndCSP();
      
      res.json({
        message: 'Origin removed successfully',
        removed_origin: originToDelete.origin,
        was_auto_added: Boolean(originToDelete.auto_added)
      });
      
    } catch (error) {
      console.error('Remove origin error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async toggleOrigin(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          error: 'invalid_request', 
          error_description: 'Valid origin ID is required' 
        });
      }
      
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ 
          error: 'invalid_request', 
          error_description: 'is_active must be a boolean' 
        });
      }
      
      const updateResult = await pool.query(
        `UPDATE allowed_origins 
         SET is_active = ?, updated_at = datetime('now') 
         WHERE id = ?`,
        [is_active ? 1 : 0, id]
      );
      
      if (updateResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'origin_not_found', 
          error_description: 'Origin not found' 
        });
      }
      
      const updatedOriginResult = await pool.query(
        'SELECT id, origin, is_active, auto_added, origin_type FROM allowed_origins WHERE id = ?',
        [id]
      );
      
      console.log('🔄 Origin status changed, refreshing CORS and CSP...');
      await refreshOriginsAndCSP();
      
      res.json({
        message: 'Origin status updated successfully',
        origin: updatedOriginResult.rows[0]
      });
      
    } catch (error) {
      console.error('Toggle origin error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async refreshCors(req, res) {
    try {
      console.log('🔄 Manual CORS and CSP refresh requested...');
      const origins = await refreshOriginsAndCSP();
      
      res.json({
        message: 'CORS origins and CSP configuration refreshed successfully',
        active_origins: origins,
        count: origins.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Refresh CORS error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 🆕 オリジンの詳細統計情報を取得
  async getOriginStats(req, res) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_origins,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_origins,
          SUM(CASE WHEN auto_added = 1 THEN 1 ELSE 0 END) as auto_added_origins,
          SUM(CASE WHEN auto_added = 0 THEN 1 ELSE 0 END) as manual_origins,
          SUM(CASE WHEN origin_type = 'client' THEN 1 ELSE 0 END) as client_origins,
          SUM(CASE WHEN origin_type = 'shared' THEN 1 ELSE 0 END) as shared_origins,
          SUM(CASE WHEN origin_type = 'manual' THEN 1 ELSE 0 END) as manual_type_origins
        FROM allowed_origins
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      // クライアント別のオリジン使用状況
      const clientOriginUsage = await pool.query(`
        SELECT 
          source_client_id,
          COUNT(*) as origin_count
        FROM allowed_origins 
        WHERE source_client_id IS NOT NULL
        GROUP BY source_client_id
        ORDER BY origin_count DESC
      `);

      res.json({ 
        stats,
        client_usage: clientOriginUsage.rows
      });
    } catch (error) {
      console.error('Get origin stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // 🆕 自動追加オリジンを手動オリジンに変換
  async convertToManual(req, res) {
    try {
      const { id } = req.params;
      const { description } = req.body;
      const userId = req.user.sub;
      
      if (!id || isNaN(id)) {
        return res.status(400).json({ 
          error: 'invalid_request', 
          error_description: 'Valid origin ID is required' 
        });
      }
      
      const existingResult = await pool.query(
        'SELECT id, origin, auto_added FROM allowed_origins WHERE id = ?',
        [id]
      );
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'origin_not_found', 
          error_description: 'Origin not found' 
        });
      }
      
      const origin = existingResult.rows[0];
      
      if (!origin.auto_added) {
        return res.status(400).json({
          error: 'already_manual',
          error_description: 'Origin is already a manual origin'
        });
      }
      
      await pool.query(
        `UPDATE allowed_origins 
         SET auto_added = 0, origin_type = 'manual', source_client_id = NULL,
             description = ?, added_by = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [description || 'Converted from auto-added to manual origin', userId, id]
      );
      
      const updatedOriginResult = await pool.query(
        'SELECT id, origin, description, is_active, auto_added, origin_type FROM allowed_origins WHERE id = ?',
        [id]
      );
      
      console.log('🔄 Origin converted to manual, refreshing CORS and CSP...');
      await refreshOriginsAndCSP();
      
      res.json({
        message: 'Origin converted to manual successfully',
        origin: updatedOriginResult.rows[0]
      });
      
    } catch (error) {
      console.error('Convert origin error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new OriginController();