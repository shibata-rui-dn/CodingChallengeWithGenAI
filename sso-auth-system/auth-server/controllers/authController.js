import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import pool from '../../config/database.js';

async function getConfigSafely() {
  try {
    const { getConfig } = await import('../../config/configLoader.js');
    return getConfig();
  } catch (error) {
    console.error('Config loading error:', error);
    return {
      demo: {
        username: 'admin',
        password: 'SecurePass123'
      },
      oauth: {
        code_expiry: 600
      }
    };
  }
}

async function validateClientRedirectUri(clientId, redirectUri) {
  if (!clientId || !redirectUri) {
    return { valid: false, error: 'Missing client_id or redirect_uri' };
  }

  try {
    const clientResult = await pool.query(
      'SELECT redirect_uris, is_active FROM clients WHERE client_id = ?',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return { valid: false, error: 'Invalid client' };
    }

    const client = clientResult.rows[0];
    
    if (!client.is_active) {
      return { valid: false, error: 'Client is inactive' };
    }

    let allowedUris;
    try {
      allowedUris = JSON.parse(client.redirect_uris);
    } catch (parseError) {
      return { valid: false, error: 'Invalid client configuration' };
    }

    if (!Array.isArray(allowedUris) || !allowedUris.includes(redirectUri)) {
      return { valid: false, error: 'Invalid redirect URI' };
    }

    return { valid: true };
    
  } catch (error) {
    console.error('Client validation error:', error);
    return { valid: false, error: 'Server error' };
  }
}

class AuthController {
  async showLogin(req, res) {
    try {
      const config = await getConfigSafely();
      const { client_id, redirect_uri, scope, state } = req.query;

      if (client_id && redirect_uri) {
        const validation = await validateClientRedirectUri(client_id, redirect_uri);
        if (!validation.valid) {
          return res.status(400).render('error', {
            error: 'Invalid authentication request. Please contact support.'
          });
        }
      }

      const error = req.flash('error');
      const message = req.flash('message');

      const urlMessage = req.query.message;
      let displayMessage = '';

      if (urlMessage === 'logged_out') {
        displayMessage = 'Successfully logged out.';
      }

      const finalMessage = message.length > 0 ? message[message.length - 1] : displayMessage;

      res.render('login', {
        client_id,
        redirect_uri,
        scope,
        state,
        error: error.length > 0 ? error[error.length - 1] : '',
        message: finalMessage,
        demo_admin_email: 'admin@company.com',
        demo_admin_password: config.demo?.admin?.password || 'SecurePass123',
        demo_user_email: 'user0@company.com',
        demo_user_password: config.demo?.user?.password || 'UserPass123'
      });
    } catch (error) {
      console.error('Login page error:', error);
      res.status(500).render('error', { error: 'Internal Server Error' });
    }
  }

  async handleLogin(req, res) {
    try {
      const config = await getConfigSafely();
      const { email, password, client_id, redirect_uri, scope, state } = req.body;

      if (!email || !password) {
        req.flash('error', 'Email and password are required');
        return res.redirect(`/auth/login?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`);
      }

      if (!client_id || !redirect_uri) {
        return res.status(400).render('error', {
          error: 'Invalid authentication request'
        });
      }

      const validation = await validateClientRedirectUri(client_id, redirect_uri);
      if (!validation.valid) {
        return res.status(400).render('error', {
          error: 'Authentication request validation failed'
        });
      }

      const userResult = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

      if (userResult.rows.length === 0) {
        req.flash('error', 'Invalid email or password');
        return res.redirect(`/auth/login?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`);
      }

      const user = userResult.rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        req.flash('error', 'Invalid email or password');
        return res.redirect(`/auth/login?client_id=${client_id}&redirect_uri=${redirect_uri}&scope=${scope}&state=${state}`);
      }

      const authCode = uuidv4();
      const codeExpiry = config.oauth?.code_expiry || 600;
      const expiresAt = new Date(Date.now() + codeExpiry * 1000);

      await pool.query(
        'INSERT INTO auth_codes (code, user_id, client_id, redirect_uri, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        [authCode, user.id, client_id, redirect_uri, scope, expiresAt.toISOString()]
      );

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      if (state) redirectUrl.searchParams.set('state', state);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error('Login error:', error);
      req.flash('error', 'Authentication error occurred');

      const { client_id, redirect_uri, scope, state } = req.body;
      const cleanRedirectUrl = `/auth/login?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${scope}&state=${state}`;
      res.redirect(cleanRedirectUrl);
    }
  }

  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      res.redirect('/auth/login');
    });
  }
}

export default new AuthController();