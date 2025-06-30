import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jose from 'node-jose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getConfigSafely() {
  try {
    const { getConfig } = await import('../../config/configLoader.js');
    return getConfig();
  } catch (error) {
    console.error('Config loading error in JWT service:', error);
    return {
      jwt: {
        issuer: 'http://localhost:3303',
        audience: 'http://localhost:3303',
        algorithm: 'HS256',
        access_token_expiry: 3600,
        id_token_expiry: 3600,
        private_key_path: './keys/private.pem',
        public_key_path: './keys/public.pem'
      },
      oauth: {
        default_scopes: ['openid', 'profile', 'email']
      },
      security: {
        session_secret: 'fallback-secret'
      }
    };
  }
}

class JWTService {
  async getKeyPaths() {
    const config = await getConfigSafely();
    return {
      privateKeyPath: path.join(__dirname, '../../', config.jwt.private_key_path),
      publicKeyPath: path.join(__dirname, '../../', config.jwt.public_key_path)
    };
  }

  async generateAccessToken(user, scope = '', clientId = '') {
    const config = await getConfigSafely();
    const { privateKeyPath } = await this.getKeyPaths();
    
    const requestedScopes = scope ? scope.split(' ') : config.oauth.default_scopes;
    
    const payload = {
      sub: user.id.toString(),
      iss: config.jwt.issuer,
      aud: config.jwt.audience,
      exp: Math.floor(Date.now() / 1000) + config.jwt.access_token_expiry,
      iat: Math.floor(Date.now() / 1000),
      scope: requestedScopes.join(' '),
      username: user.username,
      email: user.email,
      client_id: clientId
    };

    // 🆕 Profile scope - 基本プロフィール情報
    if (requestedScopes.includes('profile')) {
      payload.name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      payload.given_name = user.first_name || '';
      payload.family_name = user.last_name || '';
      payload.preferred_username = user.username;
    }

    // 🆕 Organization scope - 組織情報
    if (requestedScopes.includes('organization')) {
      payload.organization = {
        department: user.department || '-',
        team: user.team || '-',
        supervisor: user.supervisor || '-'
      };
      console.log(`🏢 Including organization data for ${user.username}:`, payload.organization);
    }

    // 🆕 Admin scope - 管理者情報
    if (requestedScopes.includes('admin') && user.role === 'admin') {
      payload.role = user.role;
      payload.admin = true;
    }

    try {
      if (fs.existsSync(privateKeyPath)) {
        const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        return jwt.sign(payload, privateKey, { algorithm: config.jwt.algorithm });
      }
    } catch (error) {
      console.warn('RSA key signing failed, falling back to HMAC:', error.message);
    }
    
    const fallbackSecret = process.env.JWT_SECRET || config.security.session_secret;
    return jwt.sign(payload, fallbackSecret, { algorithm: 'HS256' });
  }

  async generateIdToken(user, scope = '', clientId = '') {
    const config = await getConfigSafely();
    const { privateKeyPath } = await this.getKeyPaths();
    
    const requestedScopes = scope ? scope.split(' ') : config.oauth.default_scopes;
    
    const payload = {
      sub: user.id.toString(),
      iss: config.jwt.issuer,
      aud: clientId || config.jwt.audience,
      exp: Math.floor(Date.now() / 1000) + config.jwt.id_token_expiry,
      iat: Math.floor(Date.now() / 1000),
      auth_time: Math.floor(Date.now() / 1000),
      email: user.email,
      email_verified: true
    };

    // 🆕 Profile scope - プロフィール情報
    if (requestedScopes.includes('profile')) {
      payload.name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      payload.given_name = user.first_name || '';
      payload.family_name = user.last_name || '';
      payload.preferred_username = user.username;
    }

    // 🆕 Organization scope - 組織情報をIDトークンにも含める
    if (requestedScopes.includes('organization')) {
      payload.department = user.department || '-';
      payload.team = user.team || '-';
      payload.supervisor = user.supervisor || '-';
      payload.organization_verified = true;
    }

    // 🆕 Admin scope - 管理者情報
    if (requestedScopes.includes('admin') && user.role === 'admin') {
      payload.role = user.role;
    }

    try {
      if (fs.existsSync(privateKeyPath)) {
        const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        return jwt.sign(payload, privateKey, { algorithm: config.jwt.algorithm });
      }
    } catch (error) {
      console.warn('RSA key signing failed, falling back to HMAC:', error.message);
    }
    
    const fallbackSecret = process.env.JWT_SECRET || config.security.session_secret;
    return jwt.sign(payload, fallbackSecret, { algorithm: 'HS256' });
  }

  async getJWKS() {
    const { publicKeyPath } = await this.getKeyPaths();
    
    try {
      if (fs.existsSync(publicKeyPath)) {
        const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
        const keystore = jose.JWK.createKeyStore();
        const key = await keystore.add(publicKey, 'pem');
        
        return {
          keys: [key.toJSON()]
        };
      }
    } catch (error) {
      console.warn('JWKS generation failed:', error.message);
    }
    
    return { keys: [] };
  }
}

export default new JWTService();