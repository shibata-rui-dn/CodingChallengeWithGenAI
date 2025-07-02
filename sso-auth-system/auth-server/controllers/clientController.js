import crypto from 'crypto';
import pool from '../../config/database.js';

async function refreshCSPOrigins() {
  try {
    // cors.jsの関数を呼び出してOriginをリフレッシュ
    const { refreshOrigins } = await import('../middleware/cors.js');
    await refreshOrigins();
    
    // server.jsの関数を呼び出してCSP設定を更新
    const { refreshCSPConfiguration } = await import('../server.js');
    const newCSPOrigins = await refreshCSPConfiguration();
    
    console.log('🔄 CSP origins refreshed after client change:', newCSPOrigins);
    return newCSPOrigins;
  } catch (error) {
    console.error('❌ Failed to refresh CSP origins:', error);
    return [];
  }
}

// 🆕 クライアントのリダイレクトURIからオリジンを抽出
function extractOriginsFromRedirectUris(redirectUris) {
  const origins = new Set();
  
  if (!Array.isArray(redirectUris)) {
    return [];
  }
  
  for (const uri of redirectUris) {
    try {
      const url = new URL(uri);
      const origin = `${url.protocol}//${url.host}`;
      origins.add(origin);
    } catch (error) {
      console.warn(`⚠️ Invalid redirect URI: ${uri}`);
    }
  }
  
  return Array.from(origins);
}

// 🆕 クライアントのオリジンを allowed_origins テーブルに自動追加
async function manageClientOrigins(clientId, redirectUris, operation = 'upsert') {
  const origins = extractOriginsFromRedirectUris(redirectUris);
  
  try {
    if (operation === 'upsert' && origins.length > 0) {
      console.log(`🔗 Managing ${origins.length} origins for client ${clientId}`);
      
      for (const origin of origins) {
        // 既存のオリジンをチェック
        const existingOrigin = await pool.query(
          'SELECT id, auto_added, source_client_id FROM allowed_origins WHERE origin = ?',
          [origin]
        );
        
        if (existingOrigin.rows.length === 0) {
          // 新しいオリジンを自動追加
          await pool.query(
            `INSERT INTO allowed_origins (origin, description, added_by, is_active, auto_added, source_client_id, origin_type) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              origin,
              `Auto-added from client: ${clientId}`,
              1, // system user ID
              1, // active
              1, // auto_added
              clientId,
              'client'
            ]
          );
          console.log(`  ✅ Auto-added origin: ${origin}`);
          
        } else if (existingOrigin.rows[0].auto_added && existingOrigin.rows[0].source_client_id !== clientId) {
          // 他のクライアントによって自動追加されたオリジンの場合、複数クライアント参照に更新
          await pool.query(
            `UPDATE allowed_origins 
             SET description = ?, source_client_id = ?, origin_type = 'shared'
             WHERE origin = ?`,
            [
              `Shared origin used by multiple clients including: ${clientId}`,
              null, // 複数クライアントで使用される場合はnull
              origin
            ]
          );
          console.log(`  🔗 Updated origin to shared: ${origin}`);
        }
      }
      
    } else if (operation === 'cleanup') {
      // クライアント削除時のクリーンアップ
      console.log(`🗑️ Cleaning up origins for deleted client ${clientId}`);
      
      // このクライアントが単独で使用していた自動追加オリジンを削除
      const clientOrigins = await pool.query(
        'SELECT id, origin FROM allowed_origins WHERE source_client_id = ? AND auto_added = 1',
        [clientId]
      );
      
      for (const originRow of clientOrigins.rows) {
        // 他のクライアントが同じオリジンを使用しているかチェック
        const otherClientsUsingOrigin = await pool.query(
          `SELECT COUNT(*) as count FROM clients 
           WHERE client_id != ? AND is_active = 1 
           AND redirect_uris LIKE ?`,
          [clientId, `%${originRow.origin}%`]
        );
        
        if (otherClientsUsingOrigin.rows[0].count === 0) {
          // 他のクライアントが使用していない場合は削除
          await pool.query('DELETE FROM allowed_origins WHERE id = ?', [originRow.id]);
          console.log(`  🗑️ Removed unused auto-added origin: ${originRow.origin}`);
        } else {
          // 他のクライアントも使用している場合は参照を更新
          await pool.query(
            `UPDATE allowed_origins 
             SET source_client_id = NULL, origin_type = 'shared',
                 description = 'Shared origin used by multiple clients'
             WHERE id = ?`,
            [originRow.id]
          );
          console.log(`  🔗 Updated origin to shared after client deletion: ${originRow.origin}`);
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Failed to manage origins for client ${clientId}:`, error);
  }
}

class ClientController {
  async listClients(req, res) {
    try {
      const { page = 1, limit = 10, search = '', active = '' } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT client_id, name, redirect_uris, allowed_scopes, is_active, created_at, updated_at
        FROM clients
        WHERE 1=1
      `;
      let countQuery = 'SELECT COUNT(*) as total FROM clients WHERE 1=1';
      const params = [];
      const countParams = [];

      if (search) {
        query += ` AND (client_id LIKE ? OR name LIKE ?)`;
        countQuery += ` AND (client_id LIKE ? OR name LIKE ?)`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern);
        countParams.push(searchPattern, searchPattern);
      }

      if (active) {
        const isActive = active === 'true' ? 1 : 0;
        query += ` AND is_active = ?`;
        countQuery += ` AND is_active = ?`;
        params.push(isActive);
        countParams.push(isActive);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const [clientsResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams)
      ]);

      const clients = clientsResult.rows.map(client => ({
        ...client,
        redirect_uris: JSON.parse(client.redirect_uris),
        allowed_scopes: client.allowed_scopes.split(' '),
        client_secret: undefined
      }));

      res.json({
        clients,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult.rows[0].total,
          pages: Math.ceil(countResult.rows[0].total / limit)
        }
      });
    } catch (error) {
      console.error('List clients error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getClient(req, res) {
    try {
      const { client_id } = req.params;

      const result = await pool.query(
        'SELECT client_id, name, redirect_uris, allowed_scopes, is_active, created_at, updated_at FROM clients WHERE client_id = ?',
        [client_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      const client = result.rows[0];
      client.redirect_uris = JSON.parse(client.redirect_uris);
      client.allowed_scopes = client.allowed_scopes.split(' ');

      res.json({ client });
    } catch (error) {
      console.error('Get client error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createClient(req, res) {
    try {
      const { client_id, name, redirect_uris, allowed_scopes } = req.body;

      if (!client_id || !name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
        return res.status(400).json({ 
          error: 'invalid_request',
          error_description: 'client_id, name, and redirect_uris are required' 
        });
      }

      const clientIdRegex = /^[a-zA-Z0-9_-]+$/;
      if (!clientIdRegex.test(client_id)) {
        return res.status(400).json({ 
          error: 'invalid_client_id',
          error_description: 'Client ID can only contain letters, numbers, hyphens, and underscores' 
        });
      }

      for (const uri of redirect_uris) {
        try {
          new URL(uri);
        } catch (urlError) {
          return res.status(400).json({ 
            error: 'invalid_redirect_uri',
            error_description: `Invalid redirect URI: ${uri}` 
          });
        }
      }

      const scopes = allowed_scopes && Array.isArray(allowed_scopes) && allowed_scopes.length > 0 
        ? allowed_scopes 
        : ['openid', 'profile', 'email'];

      const existingClient = await pool.query(
        'SELECT client_id FROM clients WHERE client_id = ?',
        [client_id]
      );

      if (existingClient.rows.length > 0) {
        return res.status(409).json({ 
          error: 'client_exists',
          error_description: 'Client ID already exists' 
        });
      }

      const client_secret = crypto.randomBytes(32).toString('hex');

      const insertResult = await pool.query(
        `INSERT INTO clients (client_id, client_secret, name, redirect_uris, allowed_scopes, is_active) 
         VALUES (?, ?, ?, ?, ?, 1)`,
        [client_id, client_secret, name, JSON.stringify(redirect_uris), scopes.join(' ')]
      );

      // 🆕 クライアントのオリジンを自動的に allowed_origins に追加
      await manageClientOrigins(client_id, redirect_uris, 'upsert');

      // CSP設定を即座に更新
      console.log('🔄 Client created, refreshing CSP configuration...');
      await refreshCSPOrigins();

      const newClientResult = await pool.query(
        'SELECT client_id, client_secret, name, redirect_uris, allowed_scopes, is_active, created_at FROM clients WHERE client_id = ?',
        [client_id]
      );

      const newClient = newClientResult.rows[0];
      newClient.redirect_uris = JSON.parse(newClient.redirect_uris);
      newClient.allowed_scopes = newClient.allowed_scopes.split(' ');

      res.status(201).json({
        message: 'Client created successfully',
        client: newClient,
        warning: 'Store the client_secret securely. It will not be shown again.'
      });

    } catch (error) {
      console.error('Create client error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateClient(req, res) {
    try {
      const { client_id } = req.params;
      const { name, redirect_uris, allowed_scopes, is_active } = req.body;

      const existingClientResult = await pool.query(
        'SELECT * FROM clients WHERE client_id = ?',
        [client_id]
      );

      if (existingClientResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      const updateFields = [];
      const updateParams = [];
      let redirectUrisChanged = false;

      if (name !== undefined) {
        updateFields.push('name = ?');
        updateParams.push(name);
      }

      if (redirect_uris !== undefined) {
        if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
          return res.status(400).json({ 
            error: 'invalid_redirect_uris',
            error_description: 'redirect_uris must be a non-empty array' 
          });
        }

        for (const uri of redirect_uris) {
          try {
            new URL(uri);
          } catch (urlError) {
            return res.status(400).json({ 
              error: 'invalid_redirect_uri',
              error_description: `Invalid redirect URI: ${uri}` 
            });
          }
        }

        updateFields.push('redirect_uris = ?');
        updateParams.push(JSON.stringify(redirect_uris));
        redirectUrisChanged = true;
      }

      if (allowed_scopes !== undefined) {
        if (!Array.isArray(allowed_scopes)) {
          return res.status(400).json({ 
            error: 'invalid_scopes',
            error_description: 'allowed_scopes must be an array' 
          });
        }

        updateFields.push('allowed_scopes = ?');
        updateParams.push(allowed_scopes.join(' '));
      }

      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        updateParams.push(is_active ? 1 : 0);
        redirectUrisChanged = true;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ 
          error: 'no_updates',
          error_description: 'No valid fields to update' 
        });
      }

      updateFields.push('updated_at = datetime(\'now\')');

      updateParams.push(client_id);
      const updateQuery = `UPDATE clients SET ${updateFields.join(', ')} WHERE client_id = ?`;
      
      const updateResult = await pool.query(updateQuery, updateParams);

      if (updateResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      // 🆕 リダイレクトURIが変更された場合は、オリジン管理を更新
      if (redirectUrisChanged && redirect_uris) {
        await manageClientOrigins(client_id, redirect_uris, 'upsert');
      }

      // リダイレクトURIまたはステータスが変更された場合はCSPを更新
      if (redirectUrisChanged) {
        console.log('🔄 Client updated, refreshing CSP configuration...');
        await refreshCSPOrigins();
      }

      const updatedClientResult = await pool.query(
        'SELECT client_id, name, redirect_uris, allowed_scopes, is_active, created_at, updated_at FROM clients WHERE client_id = ?',
        [client_id]
      );

      const updatedClient = updatedClientResult.rows[0];
      updatedClient.redirect_uris = JSON.parse(updatedClient.redirect_uris);
      updatedClient.allowed_scopes = updatedClient.allowed_scopes.split(' ');

      res.json({
        message: 'Client updated successfully',
        client: updatedClient
      });

    } catch (error) {
      console.error('Update client error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteClient(req, res) {
    try {
      const { client_id } = req.params;

      const existingClientResult = await pool.query(
        'SELECT name, redirect_uris FROM clients WHERE client_id = ?',
        [client_id]
      );

      if (existingClientResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      const clientToDelete = existingClientResult.rows[0];

      // 🆕 クライアント削除前にオリジンのクリーンアップ
      const redirectUris = JSON.parse(clientToDelete.redirect_uris);
      await manageClientOrigins(client_id, redirectUris, 'cleanup');

      const deleteResult = await pool.query('DELETE FROM clients WHERE client_id = ?', [client_id]);

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      // クライアント削除後CSPを更新
      console.log('🔄 Client deleted, refreshing CSP configuration...');
      await refreshCSPOrigins();

      res.json({
        message: 'Client deleted successfully',
        deleted_client: {
          client_id,
          name: clientToDelete.name
        }
      });

    } catch (error) {
      console.error('Delete client error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async regenerateSecret(req, res) {
    try {
      const { client_id } = req.params;

      const existingClientResult = await pool.query(
        'SELECT name FROM clients WHERE client_id = ?',
        [client_id]
      );

      if (existingClientResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      const new_client_secret = crypto.randomBytes(32).toString('hex');

      const updateResult = await pool.query(
        'UPDATE clients SET client_secret = ?, updated_at = datetime(\'now\') WHERE client_id = ?',
        [new_client_secret, client_id]
      );

      if (updateResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      res.json({
        message: 'Client secret regenerated successfully',
        client_id,
        client_secret: new_client_secret,
        warning: 'Store the new client_secret securely. The old secret is now invalid.'
      });

    } catch (error) {
      console.error('Regenerate client secret error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getClientStats(req, res) {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_clients,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_clients,
          SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_clients
        FROM clients
      `;

      const result = await pool.query(statsQuery);
      const stats = result.rows[0];

      res.json({ stats });
    } catch (error) {
      console.error('Get client stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default new ClientController();