import express from 'express';
import { getConfig } from '../../config/configLoader.js';

const router = express.Router();

router.get('/openid-configuration', (req, res) => {
  const config = getConfig();
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  const discoveryConfig = {
    issuer: config.jwt.issuer,
    authorization_endpoint: `${baseUrl}/oauth2/authorize`,
    token_endpoint: `${baseUrl}/token`,
    userinfo_endpoint: `${baseUrl}/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [config.jwt.algorithm],
    scopes_supported: config.oauth.default_scopes,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'email', 'name', 'preferred_username']
  };
  
  res.json(discoveryConfig);
});

router.get('/jwks', async (req, res) => {
  try {
    const jwtService = await import('../services/jwtService.js');
    const jwks = await jwtService.default.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('JWKS error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;