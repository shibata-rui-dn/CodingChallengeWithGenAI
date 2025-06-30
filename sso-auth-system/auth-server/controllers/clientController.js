import crypto from 'crypto';
import pool from '../../config/database.js';

async function refreshCSPOrigins() {
  try {
    const { refreshCSPConfiguration } = await import('../server.js');
    const newCSPOrigins = await refreshCSPConfiguration();
    console.log('🔄 CSP origins refreshed after client change:', newCSPOrigins);
    return newCSPOrigins;
  } catch (error) {
    console.error('❌ Failed to refresh CSP origins:', error);
    return [];
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

      if (redirectUrisChanged) {
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
        'SELECT name FROM clients WHERE client_id = ?',
        [client_id]
      );

      if (existingClientResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

      const clientToDelete = existingClientResult.rows[0];

      const deleteResult = await pool.query('DELETE FROM clients WHERE client_id = ?', [client_id]);

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ 
          error: 'client_not_found',
          error_description: 'Client not found' 
        });
      }

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