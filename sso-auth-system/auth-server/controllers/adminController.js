import pool from '../../config/database.js';

class AdminController {
  async showDashboard(req, res) {
    try {
      const [userStats, clientStats, originStats] = await Promise.all([
        pool.query(`
          SELECT 
            COUNT(*) as total_users,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
            SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users
          FROM users
        `),
        pool.query(`
          SELECT 
            COUNT(*) as total_clients,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_clients
          FROM clients
        `),
        pool.query(`
          SELECT 
            COUNT(*) as total_origins,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_origins
          FROM allowed_origins
        `)
      ]);

      const recentUsers = await pool.query(`
        SELECT id, username, email, role, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 5
      `);

      const recentClients = await pool.query(`
        SELECT client_id, name, is_active, created_at
        FROM clients
        ORDER BY created_at DESC
        LIMIT 5
      `);

      res.render('admin/dashboard', {
        user: req.user,
        stats: {
          users: userStats.rows[0],
          clients: clientStats.rows[0],
          origins: originStats.rows[0]
        },
        recentUsers: recentUsers.rows,
        recentClients: recentClients.rows,
        pageTitle: 'Admin Dashboard'
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).render('error', { 
        error: 'Failed to load dashboard',
        user: req.user 
      });
    }
  }

  async showUsers(req, res) {
    try {
      res.render('admin/users', {
        user: req.user,
        pageTitle: 'User Management'
      });
    } catch (error) {
      console.error('Users page error:', error);
      res.status(500).render('error', { 
        error: 'Failed to load users page',
        user: req.user 
      });
    }
  }

  async showClients(req, res) {
    try {
      res.render('admin/clients', {
        user: req.user,
        pageTitle: 'Client Management'
      });
    } catch (error) {
      console.error('Clients page error:', error);
      res.status(500).render('error', { 
        error: 'Failed to load clients page',
        user: req.user 
      });
    }
  }

  async showOrigins(req, res) {
    try {
      res.render('admin/origins', {
        user: req.user,
        pageTitle: 'Origin Management'
      });
    } catch (error) {
      console.error('Origins page error:', error);
      res.status(500).render('error', { 
        error: 'Failed to load origins page',
        user: req.user 
      });
    }
  }

  async showSystemInfo(req, res) {
    try {
      const systemInfo = {
        node_version: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      };

      const dbInfo = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as user_count,
          (SELECT COUNT(*) FROM clients) as client_count,
          (SELECT COUNT(*) FROM allowed_origins) as origin_count,
          (SELECT COUNT(*) FROM auth_codes) as active_auth_codes,
          (SELECT COUNT(*) FROM access_tokens) as active_tokens
      `);

      let cspInfo = {
        origins: [],
        clientOrigins: [],
        totalOrigins: 0
      };

      try {
        const { getCSPOrigins } = await import('../middleware/cors.js');
        const cspOrigins = await getCSPOrigins();
        
        const clientsResult = await pool.query('SELECT redirect_uris FROM clients WHERE is_active = 1');
        const clientOrigins = new Set();
        
        for (const row of clientsResult.rows) {
          try {
            const redirectUris = JSON.parse(row.redirect_uris);
            if (Array.isArray(redirectUris)) {
              for (const uri of redirectUris) {
                try {
                  const url = new URL(uri);
                  const origin = `${url.protocol}//${url.host}`;
                  clientOrigins.add(origin);
                } catch (urlError) {
                  
                }
              }
            }
          } catch (parseError) {
            
          }
        }

        cspInfo = {
          origins: cspOrigins.slice(0, 10),
          clientOrigins: Array.from(clientOrigins),
          totalOrigins: cspOrigins.length
        };
      } catch (error) {
        console.warn('Failed to get CSP info:', error.message);
      }

      res.render('admin/system', {
        user: req.user,
        pageTitle: 'System Information',
        systemInfo,
        dbInfo: dbInfo.rows[0],
        cspInfo
      });
    } catch (error) {
      console.error('System info error:', error);
      res.status(500).render('error', { 
        error: 'Failed to load system information',
        user: req.user 
      });
    }
  }
}

export default new AdminController();