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

class OriginController {
  async listOrigins(req, res) {
    try {
      const result = await pool.query(
        `SELECT o.*, u.username as added_by_username 
         FROM allowed_origins o 
         LEFT JOIN users u ON o.added_by = u.id 
         ORDER BY o.created_at DESC`
      );
      
      res.json({
        origins: result.rows,
        total: result.rows.length
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
        'SELECT id FROM allowed_origins WHERE origin = ?',
        [origin]
      );
      
      if (existingResult.rows.length > 0) {
        return res.status(409).json({ 
          error: 'origin_exists', 
          error_description: 'Origin already exists' 
        });
      }
      
      const insertResult = await pool.query(
        `INSERT INTO allowed_origins (origin, description, added_by, is_active) 
         VALUES (?, ?, ?, 1)`,
        [origin, description || null, userId]
      );
      
      const newOriginResult = await pool.query(
        'SELECT id, origin, description, is_active, created_at FROM allowed_origins WHERE id = ?',
        [insertResult.lastInsertRowid]
      );
      
      await refreshOrigins();
      
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
        'SELECT origin FROM allowed_origins WHERE id = ?',
        [id]
      );
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'origin_not_found', 
          error_description: 'Origin not found' 
        });
      }
      
      await pool.query('DELETE FROM allowed_origins WHERE id = ?', [id]);
      
      await refreshOrigins();
      
      res.json({
        message: 'Origin removed successfully',
        removed_origin: existingResult.rows[0].origin
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
        'SELECT id, origin, is_active FROM allowed_origins WHERE id = ?',
        [id]
      );
      
      await refreshOrigins();
      
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
      const origins = await refreshOrigins();
      
      res.json({
        message: 'CORS origins refreshed successfully',
        active_origins: origins,
        count: origins.length
      });
      
    } catch (error) {
      console.error('Refresh CORS error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new OriginController();