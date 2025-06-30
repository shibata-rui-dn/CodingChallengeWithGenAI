import express from 'express';
import pool from '../../config/database.js';
import { apiRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

async function validateClientAndRedirectUri(clientId, redirectUri) {
  if (!clientId || !redirectUri) {
    return { valid: false, error: 'invalid_request', description: 'Missing required parameters' };
  }

  try {
    const clientResult = await pool.query(
      'SELECT client_id, redirect_uris, is_active FROM clients WHERE client_id = ?',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      return { valid: false, error: 'invalid_client', description: 'Client not found' };
    }

    const client = clientResult.rows[0];

    if (!client.is_active) {
      return { valid: false, error: 'invalid_client', description: 'Client is inactive' };
    }

    let allowedUris;
    try {
      allowedUris = JSON.parse(client.redirect_uris);
    } catch (parseError) {
      return { valid: false, error: 'server_error', description: 'Invalid client configuration' };
    }

    if (!Array.isArray(allowedUris) || !allowedUris.includes(redirectUri)) {
      return { valid: false, error: 'invalid_redirect_uri', description: 'Redirect URI not registered' };
    }

    return { valid: true, client };
    
  } catch (error) {
    console.error('OAuth validation error:', error);
    return { valid: false, error: 'server_error', description: 'Internal server error' };
  }
}

router.get('/authorize', apiRateLimit, async (req, res) => {
  const { client_id, redirect_uri, scope, state, response_type } = req.query;
  
  if (response_type !== 'code') {
    return res.status(400).json({ 
      error: 'unsupported_response_type',
      error_description: 'Only authorization_code flow is supported'
    });
  }

  const validation = await validateClientAndRedirectUri(client_id, redirect_uri);
  
  if (!validation.valid) {
    return res.status(400).json({
      error: validation.error,
      error_description: validation.description
    });
  }

  res.redirect(`/auth/login?client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=${encodeURIComponent(scope || '')}&state=${encodeURIComponent(state || '')}`);
});

export default router;