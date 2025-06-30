import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SSO_AUTH_SERVER = process.env.SSO_AUTH_SERVER || 'http://localhost:3303';

// RSA公開鍵のキャッシュ
let publicKey = null;
let jwksCache = null;
let jwksCacheExpiry = 0;

// 公開鍵を取得する関数
async function getPublicKey() {
  if (publicKey) {
    return publicKey;
  }

  try {
    // 1. ローカルファイルから公開鍵を読み込み（開発環境用）
    const publicKeyPath = path.join(__dirname, '../keys/public.pem');
    if (fs.existsSync(publicKeyPath)) {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      console.log('RSA公開鍵をローカルファイルから読み込みました');
      return publicKey;
    }

    // 2. JWKSエンドポイントから取得（本番環境推奨）
    const jwks = await getJWKS();
    if (jwks && jwks.keys && jwks.keys.length > 0) {
      // JWKSから公開鍵を抽出（簡易実装）
      const key = jwks.keys[0];
      if (key.kty === 'RSA' && key.use === 'sig') {
        // JWKからPEM形式に変換（実際の実装では jose ライブラリなどを使用）
        console.log('JWKS取得成功、但し JWK→PEM 変換は別途実装が必要');
      }
    }

    // 3. フォールバック：認証サーバーから直接取得
    const response = await axios.get(`${SSO_AUTH_SERVER}/public-key`, {
      timeout: 5000
    });
    
    if (response.data && response.data.publicKey) {
      publicKey = response.data.publicKey;
      console.log('RSA公開鍵を認証サーバーから取得しました');
      return publicKey;
    }

    throw new Error('公開鍵を取得できませんでした');

  } catch (error) {
    console.error('公開鍵取得エラー:', error.message);
    throw new Error('公開鍵の取得に失敗しました');
  }
}

// JWKSを取得する関数
async function getJWKS() {
  const now = Date.now();
  
  // キャッシュが有効な場合は使用
  if (jwksCache && now < jwksCacheExpiry) {
    return jwksCache;
  }

  try {
    const response = await axios.get(`${SSO_AUTH_SERVER}/.well-known/jwks`, {
      timeout: 5000
    });
    
    jwksCache = response.data;
    jwksCacheExpiry = now + 3600000; // 1時間キャッシュ
    
    console.log('JWKS取得成功:', {
      keysCount: jwksCache.keys?.length || 0,
      cacheExpiry: new Date(jwksCacheExpiry).toISOString()
    });
    
    return jwksCache;
  } catch (error) {
    console.error('JWKS取得エラー:', error.message);
    return null;
  }
}

// メイン認証ミドルウェア
// middleware/auth.js - メイン認証ミドルウェアの修正部分

export default async function authMiddleware(req, res, next) {
  const sessionToken = req.cookies && req.cookies.session_token;

  console.log('認証ミドルウェア (RS256) - Cookie情報:', {
    hasCookies: !!req.cookies,
    hasSessionToken: !!sessionToken,
    cookieCount: req.cookies ? Object.keys(req.cookies).length : 0
  });

  if (!sessionToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No session token provided',
      action: 'login_required'
    });
  }

  try {
    // RSA公開鍵を取得
    const rsaPublicKey = await getPublicKey();

    // セッショントークンを検証（RS256）
    const decoded = jwt.verify(sessionToken, rsaPublicKey, {
      algorithms: ['RS256'],
      issuer: SSO_AUTH_SERVER,
      audience: SSO_AUTH_SERVER
    });

    const { userInfo, tokens } = decoded;

    // トークンの有効期限チェック
    if (tokens.expires_at < Date.now()) {
      return res.status(401).json({
        error: 'Token Expired',
        message: 'Access token has expired',
        action: 'refresh_required'
      });
    }

    // ユーザー情報をリクエストオブジェクトに追加
    req.user = {
      ...userInfo,
      // メールアドレスをemployeeIdとして使用（セットアップと一致）
      employeeId: userInfo.email || userInfo.preferred_username || userInfo.sub,
      accessToken: tokens.access_token
    };

    console.log('認証成功 (RS256):', {
      employeeId: req.user.employeeId,
      email: req.user.email,
      name: req.user.name,
      algorithm: 'RS256',
      idSource: userInfo.email ? 'email' : (userInfo.preferred_username ? 'preferred_username' : 'sub')
    });

    next();

  } catch (error) {
    console.error('認証エラー (RS256):', {
      error: error.message,
      name: error.name
    });
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Session Expired',
        message: 'Session token has expired',
        action: 'login_required'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'Session token is invalid (RS256 verification failed)',
        action: 'login_required'
      });
    }

    if (error.message.includes('公開鍵')) {
      return res.status(500).json({
        error: 'Authentication Service Error',
        message: 'Failed to verify token signature',
        details: error.message
      });
    }

    return res.status(500).json({
      error: 'Authentication Error',
      message: 'Failed to authenticate user',
      details: error.message
    });
  }
}

// 管理者権限チェック用ミドルウェア
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // 管理者権限チェック（organizationスコープまたはroleで判定）
  const isAdmin = req.user.role === 'admin' || 
                  req.user.role === 'CEO' || 
                  req.user.role === 'CTO' || 
                  req.user.role === 'CPO' ||
                  (req.user.organization && req.user.organization.department === '経営陣');

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
  }

  next();
}

// 部門マネージャー権限チェック用ミドルウェア
export function requireManager(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  const isManager = req.user.role && (
    req.user.role.includes('Manager') ||
    req.user.role.includes('Lead') ||
    req.user.role.includes('Director') ||
    req.user.role === 'CEO' ||
    req.user.role === 'CTO' ||
    req.user.role === 'CPO'
  );

  if (!isManager) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Manager privileges required'
    });
  }

  next();
}

// SSO認証サーバーでのトークン検証（オプション）
export async function validateWithSSO(req, res, next) {
  if (!req.user || !req.user.accessToken) {
    return next();
  }

  try {
    // SSO認証サーバーでトークンの有効性を検証
    const response = await axios.get(`${SSO_AUTH_SERVER}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${req.user.accessToken}`
      },
      timeout: 5000 // 5秒タイムアウト
    });

    // 最新のユーザー情報で更新
    req.user = {
      ...req.user,
      ...response.data,
      employeeId: response.data.preferred_username || response.data.sub
    };

    next();

  } catch (error) {
    console.error('SSO validation error:', error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: 'Invalid Token',
        message: 'Token validation failed with SSO server',
        action: 'login_required'
      });
    }

    // SSO検証に失敗しても、ローカルトークンが有効なら続行
    console.warn('SSO validation failed, continuing with local token');
    next();
  }
}

// レート制限ミドルウェア（簡易版）
const rateLimitStore = new Map();

export function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const clientId = req.user?.employeeId || req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;

    // 古いレコードをクリーンアップ
    for (const [key, timestamps] of rateLimitStore.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, validTimestamps);
      }
    }

    // 現在のクライアントのリクエスト履歴を取得
    const clientRequests = rateLimitStore.get(clientId) || [];
    const recentRequests = clientRequests.filter(t => t > windowStart);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    // 新しいリクエストを記録
    recentRequests.push(now);
    rateLimitStore.set(clientId, recentRequests);

    // レスポンスヘッダーに制限情報を追加
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - recentRequests.length),
      'X-RateLimit-Reset': Math.ceil((windowStart + windowMs) / 1000)
    });

    next();
  };
}