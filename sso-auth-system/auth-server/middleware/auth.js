import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getConfigSafely() {
  try {
    const { getConfig } = await import('../../config/configLoader.js');
    return getConfig();
  } catch (error) {
    console.error('Config loading error:', error);
    return {
      jwt: {
        algorithm: 'RS256',
        public_key_path: './keys/public.pem',
        private_key_path: './keys/private.pem'
      },
      security: {
        session_secret: 'fallback-secret'
      }
    };
  }
}

async function getVerificationKey() {
  const config = await getConfigSafely();
  
  // RSAキーを優先的に使用
  if (config.jwt.algorithm === 'RS256') {
    const publicKeyPath = path.join(__dirname, '../../', config.jwt.public_key_path);
    
    try {
      if (fs.existsSync(publicKeyPath)) {
        const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
        return { key: publicKey, algorithm: 'RS256' };
      }
    } catch (error) {
      console.warn('RSA public key loading failed:', error.message);
    }
  }
  
  // フォールバックとしてHMACを使用
  const hmacSecret = process.env.JWT_SECRET || config.security?.session_secret || 'fallback-secret';
  return { key: hmacSecret, algorithm: 'HS256' };
}

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // トークンの有効性をデータベースで確認（期限切れチェック含む）
    const tokenResult = await pool.query(
      `SELECT * FROM access_tokens 
       WHERE token = ? 
       AND expires_at > datetime('now')`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // JWT検証用のキーとアルゴリズムを取得
    const { key, algorithm } = await getVerificationKey();
    
    let decoded;
    try {
      // 指定されたアルゴリズムで検証
      decoded = jwt.verify(token, key, { algorithms: [algorithm] });
    } catch (jwtError) {
      // RSA検証が失敗した場合、HMACでも試行
      if (algorithm === 'RS256') {
        console.warn('RSA verification failed, trying HMAC fallback');
        const config = await getConfigSafely();
        const hmacSecret = process.env.JWT_SECRET || config.security?.session_secret || 'fallback-secret';
        
        try {
          decoded = jwt.verify(token, hmacSecret, { algorithms: ['HS256'] });
        } catch (hmacError) {
          console.error('Both RSA and HMAC verification failed:', { rsa: jwtError.message, hmac: hmacError.message });
          return res.status(403).json({ error: 'Invalid token signature' });
        }
      } else {
        console.error('JWT verification failed:', jwtError.message);
        return res.status(403).json({ error: 'Invalid token' });
      }
    }

    // デコードされたトークン情報をリクエストに追加
    req.user = decoded;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication service error' });
  }
};

// トークン情報だけを検証する（データベースチェックなし）
const verifyTokenOnly = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const { key, algorithm } = await getVerificationKey();
    
    let decoded;
    try {
      decoded = jwt.verify(token, key, { algorithms: [algorithm] });
    } catch (jwtError) {
      if (algorithm === 'RS256') {
        const config = await getConfigSafely();
        const hmacSecret = process.env.JWT_SECRET || config.security?.session_secret || 'fallback-secret';
        
        try {
          decoded = jwt.verify(token, hmacSecret, { algorithms: ['HS256'] });
        } catch (hmacError) {
          return res.status(403).json({ error: 'Invalid token' });
        }
      } else {
        return res.status(403).json({ error: 'Invalid token' });
      }
    }

    req.user = decoded;
    next();
    
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ error: 'Token verification service error' });
  }
};

export { authenticateToken, verifyTokenOnly };