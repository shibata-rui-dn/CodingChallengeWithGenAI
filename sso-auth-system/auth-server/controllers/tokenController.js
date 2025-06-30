import { v4 as uuidv4 } from 'uuid';
import pool from '../../config/database.js';
import jwtService from '../services/jwtService.js';

async function getConfigSafely() {
  try {
    const { getConfig } = await import('../../config/configLoader.js');
    return getConfig();
  } catch (error) {
    console.error('Config loading error:', error);
    return {
      jwt: {
        access_token_expiry: 3600,
        id_token_expiry: 3600
      }
    };
  }
}

async function validateClientCredentials(clientId, clientSecret) {
  try {
    const clientResult = await pool.query(
      'SELECT client_secret, is_active FROM clients WHERE client_id = ?',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return { valid: false, error: 'invalid_client' };
    }

    const client = clientResult.rows[0];

    if (!client.is_active) {
      return { valid: false, error: 'invalid_client' };
    }

    if (client.client_secret !== clientSecret) {
      return { valid: false, error: 'invalid_client' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Client credential validation error:', error);
    return { valid: false, error: 'server_error' };
  }
}

class TokenController {
  async handleTokenRequest(req, res) {
    try {
      const config = await getConfigSafely();
      const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;

      if (grant_type !== 'authorization_code') {
        return res.status(400).json({
          error: 'unsupported_grant_type',
          error_description: 'Only authorization_code grant type is supported'
        });
      }

      if (!code || !client_id || !client_secret) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters'
        });
      }

      const clientValidation = await validateClientCredentials(client_id, client_secret);
      if (!clientValidation.valid) {
        return res.status(401).json({
          error: clientValidation.error,
          error_description: 'Client authentication failed'
        });
      }

      const codeResult = await pool.query(
        `SELECT * FROM auth_codes 
         WHERE code = ? 
         AND client_id = ? 
         AND expires_at > datetime('now')`,
        [code, client_id]
      );

      if (codeResult.rows.length === 0) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code'
        });
      }

      const authCode = codeResult.rows[0];

      if (redirect_uri && authCode.redirect_uri !== redirect_uri) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Redirect URI mismatch'
        });
      }

      const userResult = await pool.query('SELECT * FROM users WHERE id = ?', [authCode.user_id]);
      
      if (userResult.rows.length === 0) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'User not found'
        });
      }
      
      const user = userResult.rows[0];

      const accessToken = await jwtService.generateAccessToken(user, authCode.scope, client_id);
      const idToken = await jwtService.generateIdToken(user, authCode.scope, client_id);
      const refreshToken = uuidv4();

      const tokenExpiresAt = new Date(Date.now() + (config.jwt?.access_token_expiry || 3600) * 1000);
      await pool.query(
        'INSERT INTO access_tokens (token, user_id, client_id, scope, expires_at) VALUES (?, ?, ?, ?, ?)',
        [accessToken, user.id, client_id, authCode.scope, tokenExpiresAt.toISOString()]
      );

      await pool.query('DELETE FROM auth_codes WHERE code = ?', [code]);

      const includeOrg = authCode.scope && authCode.scope.includes('organization');
      console.log(`🔐 Token issued for ${user.username} (org data: ${includeOrg ? 'included' : 'excluded'})`);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: config.jwt?.access_token_expiry || 3600,
        id_token: idToken,
        refresh_token: refreshToken,
        scope: authCode.scope
      });
    } catch (error) {
      console.error('Token error:', error);
      res.status(500).json({
        error: 'server_error',
        error_description: 'Internal server error'
      });
    }
  }
}

export default new TokenController();