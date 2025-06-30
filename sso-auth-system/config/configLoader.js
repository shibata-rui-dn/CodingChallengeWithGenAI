import yaml from 'yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedConfig = null;

function loadConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(__dirname, 'config.yaml');
  
  try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    cachedConfig = yaml.parse(configFile);
    return cachedConfig;
  } catch (error) {
    console.error('Failed to load configuration:', error.message);
    return {
      server: {
        auth_domain: 'localhost',
        auth_server_url: 'http://localhost:3303',
        auth_port: 3303
      },
      database: {
        name: "auth_db.sqlite"
      },
      jwt: {
        issuer: 'http://localhost:3303',
        audience: 'http://localhost:3303',
        algorithm: 'RS256',
        access_token_expiry: 3600,
        id_token_expiry: 3600,
        private_key_path: './keys/private.pem',
        public_key_path: './keys/public.pem'
      },
      oauth: {
        code_expiry: 600,
        default_scopes: ['openid', 'profile', 'email']
      },
      security: {
        bcrypt_rounds: 12,
        session_secret: 'change-this-in-production',
        rate_limit: {
          window_ms: 900000,
          max_requests: 100
        }
      },
      logging: {
        level: 'info',
        file: './logs/auth-server.log',
        console: true
      },
      demo: {
        admin: {
          username: 'admin',
          password: 'SecurePass123'
        },
        user: {
          username: 'user0',
          password: 'UserPass123'
        }
      }
    };
  }
}

function getConfig(path) {
  const config = loadConfig();
  
  if (!path) {
    return config;
  }
  
  return path.split('.').reduce((obj, key) => obj && obj[key], config);
}

function refreshConfig() {
  cachedConfig = null;
  return loadConfig();
}

export { loadConfig, getConfig, refreshConfig };
export default { loadConfig, getConfig, refreshConfig };