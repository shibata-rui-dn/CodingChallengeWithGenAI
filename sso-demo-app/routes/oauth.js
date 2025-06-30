import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// OAuth設定
const OAUTH_CONFIG = {
  authServerUrl: process.env.SSO_AUTH_SERVER || 'http://localhost:3303',
  clientId: process.env.OAUTH_CLIENT_ID || 'demo-client',
  clientSecret: process.env.OAUTH_CLIENT_SECRET || 'demo-secret-change-in-production',
  redirectUri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
  scopes: ['openid', 'profile', 'email', 'organization']
};

// RSA秘密鍵のキャッシュ
let privateKey = null;

// RSA秘密鍵を取得する関数
function getPrivateKey() {
  if (privateKey) {
    return privateKey;
  }

  try {
    // ローカルファイルから秘密鍵を読み込み
    const privateKeyPath = path.join(__dirname, '../keys/private.pem');
    if (fs.existsSync(privateKeyPath)) {
      privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      console.log('RSA秘密鍵をローカルファイルから読み込みました');
      return privateKey;
    }

    // フォールバック：環境変数から取得
    if (process.env.JWT_PRIVATE_KEY) {
      privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
      console.log('RSA秘密鍵を環境変数から読み込みました');
      return privateKey;
    }

    throw new Error('RSA秘密鍵が見つかりません');

  } catch (error) {
    console.error('RSA秘密鍵取得エラー:', error.message);
    throw new Error('RSA秘密鍵の取得に失敗しました');
  }
}

// セッションストレージ（本番環境では Redis などを使用）
const sessions = new Map();

// OAuth認証開始
router.get('/login', (req, res) => {
  const state = uuidv4();
  const authUrl = new URL('/oauth2/authorize', OAUTH_CONFIG.authServerUrl);
  
  // セッション状態を保存
  sessions.set(state, {
    timestamp: Date.now(),
    returnUrl: req.query.returnUrl || '/'
  });

  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', OAUTH_CONFIG.clientId);
  authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirectUri);
  authUrl.searchParams.append('scope', OAUTH_CONFIG.scopes.join(' '));
  authUrl.searchParams.append('state', state);

  console.log('OAuth認証開始:', {
    state,
    authUrl: authUrl.toString(),
    clientId: OAUTH_CONFIG.clientId
  });

  res.redirect(authUrl.toString());
});

// OAuth コールバック処理
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  console.log('OAuth callback受信:', { 
    code: !!code, 
    state: !!state, 
    error, 
    error_description,
    query: req.query 
  });

  if (error) {
    console.error('OAuth認証エラー:', { error, error_description });
    return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code || !state) {
    console.error('OAuth callback: 必須パラメータが不足:', { code: !!code, state: !!state });
    return res.redirect('/?error=missing_parameters');
  }

  // セッション状態確認
  const sessionData = sessions.get(state);
  if (!sessionData) {
    console.error('OAuth callback: 無効なstate parameter:', { state, availableStates: Array.from(sessions.keys()) });
    return res.redirect('/?error=invalid_state');
  }

  // 古いセッションをクリーンアップ（30分以上古い）
  const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
  for (const [key, value] of sessions.entries()) {
    if (value.timestamp < thirtyMinutesAgo) {
      sessions.delete(key);
    }
  }

  try {
    console.log('トークン交換開始:', {
      authServerUrl: OAUTH_CONFIG.authServerUrl,
      clientId: OAUTH_CONFIG.clientId,
      redirectUri: OAUTH_CONFIG.redirectUri
    });

    // アクセストークン取得
    const tokenResponse = await axios.post(
      `${OAUTH_CONFIG.authServerUrl}/token`,
      {
        grant_type: 'authorization_code',
        code: code,
        client_id: OAUTH_CONFIG.clientId,
        client_secret: OAUTH_CONFIG.clientSecret,
        redirect_uri: OAUTH_CONFIG.redirectUri
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const tokens = tokenResponse.data;
    console.log('トークン取得成功:', {
      hasAccessToken: !!tokens.access_token,
      hasIdToken: !!tokens.id_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope
    });

    // ユーザー情報取得
    console.log('ユーザー情報取得開始...');
    const userInfoResponse = await axios.get(
      `${OAUTH_CONFIG.authServerUrl}/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        },
        timeout: 10000
      }
    );

    const userInfo = userInfoResponse.data;
    console.log('ユーザー情報取得成功:', {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      preferred_username: userInfo.preferred_username,
      organization: userInfo.organization
    });

    // RSA秘密鍵を取得
    const rsaPrivateKey = getPrivateKey();

    // セッション作成（RS256で署名）
    const sessionToken = jwt.sign(
      {
        userInfo: userInfo,
        tokens: {
          access_token: tokens.access_token,
          id_token: tokens.id_token,
          refresh_token: tokens.refresh_token,
          expires_at: Date.now() + (tokens.expires_in * 1000),
          scope: tokens.scope
        },
        createdAt: Date.now()
      },
      rsaPrivateKey,
      { 
        expiresIn: '24h',
        algorithm: 'RS256',
        issuer: OAUTH_CONFIG.authServerUrl,
        audience: OAUTH_CONFIG.authServerUrl
      }
    );

    console.log('セッショントークン作成完了 (RS256)');

    // Cookieにセッショントークンを設定
    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24時間
      path: '/'
    });

    console.log('Cookie設定完了');

    // セッション状態をクリーンアップ
    sessions.delete(state);

    // HTMLレスポンスでリダイレクト（JSでの状態更新を含む）
    const returnUrl = sessionData.returnUrl || '/';
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>ログイン完了</title>
        <meta charset="UTF-8">
    </head>
    <body>
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>ログイン成功 (RS256)</h2>
            <p>しばらくお待ちください...</p>
            <div style="margin: 20px;">
                <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        </div>
        
        <style>
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        </style>
        
        <script>
        console.log('OAuth callback完了 (RS256), リダイレクト中...');
        // 少し待ってからリダイレクト（Cookieが確実に設定されるように）
        setTimeout(function() {
            window.location.href = '${returnUrl}';
        }, 1000);
        </script>
    </body>
    </html>
    `;

    res.send(html);

  } catch (error) {
    console.error('OAuth callback処理エラー:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      config: error.config
    });

    return res.redirect(`/?error=${encodeURIComponent('OAuth認証に失敗しました: ' + error.message)}`);
  }
});

// ログアウト
router.post('/logout', (req, res) => {
  // Cookieをクリア
  res.clearCookie('session_token');
  
  // SSO認証サーバーのログアウトURLにリダイレクト（オプション）
  const logoutUrl = `${OAUTH_CONFIG.authServerUrl}/logout?returnTo=${encodeURIComponent('http://localhost:3000')}`;
  
  res.json({
    success: true,
    message: 'Logged out successfully (RS256)',
    logoutUrl: logoutUrl
  });
});

// トークン更新
router.post('/refresh', async (req, res) => {
  const sessionToken = req.cookies && req.cookies.session_token;
  
  if (!sessionToken) {
    return res.status(401).json({ error: 'No session token' });
  }

  try {
    // RSA公開鍵を取得（実際の実装では認証サーバーから取得）
    const publicKeyPath = path.join(__dirname, '../keys/public.pem');
    let publicKey;
    
    if (fs.existsSync(publicKeyPath)) {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    } else {
      throw new Error('公開鍵が見つかりません');
    }

    const decoded = jwt.verify(sessionToken, publicKey, {
      algorithms: ['RS256'],
      issuer: OAUTH_CONFIG.authServerUrl,
      audience: OAUTH_CONFIG.authServerUrl
    });
    
    const { tokens } = decoded;

    if (!tokens.refresh_token) {
      return res.status(401).json({ error: 'No refresh token available' });
    }

    // リフレッシュトークンで新しいアクセストークンを取得
    const tokenResponse = await axios.post(
      `${OAUTH_CONFIG.authServerUrl}/token`,
      {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: OAUTH_CONFIG.clientId,
        client_secret: OAUTH_CONFIG.clientSecret
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const newTokens = tokenResponse.data;

    // RSA秘密鍵で新しいセッショントークンを作成
    const rsaPrivateKey = getPrivateKey();
    const newSessionToken = jwt.sign(
      {
        userInfo: decoded.userInfo,
        tokens: {
          access_token: newTokens.access_token,
          id_token: newTokens.id_token,
          refresh_token: newTokens.refresh_token || tokens.refresh_token,
          expires_at: Date.now() + (newTokens.expires_in * 1000)
        }
      },
      rsaPrivateKey,
      { 
        expiresIn: '24h',
        algorithm: 'RS256',
        issuer: OAUTH_CONFIG.authServerUrl,
        audience: OAUTH_CONFIG.authServerUrl
      }
    );

    // 新しいCookieを設定
    res.cookie('session_token', newSessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Token refreshed successfully (RS256)',
      expiresIn: newTokens.expires_in
    });

  } catch (error) {
    console.error('Token refresh error:', error.message);
    res.status(401).json({
      error: 'Token refresh failed',
      message: error.message
    });
  }
});

// 認証状態確認
router.get('/status', async (req, res) => {
  const sessionToken = req.cookies && req.cookies.session_token;
  
  if (!sessionToken) {
    return res.json({ authenticated: false });
  }

  try {
    // RSA公開鍵を取得
    const publicKeyPath = path.join(__dirname, '../keys/public.pem');
    let publicKey;
    
    if (fs.existsSync(publicKeyPath)) {
      publicKey = fs.readFileSync(publicKeyPath, 'utf8');
    } else {
      // 認証サーバーから公開鍵を取得
      const response = await axios.get(`${OAUTH_CONFIG.authServerUrl}/public-key`);
      publicKey = response.data.publicKey;
    }

    const decoded = jwt.verify(sessionToken, publicKey, {
      algorithms: ['RS256'],
      issuer: OAUTH_CONFIG.authServerUrl,
      audience: OAUTH_CONFIG.authServerUrl
    });
    
    const { userInfo, tokens } = decoded;

    // トークンの有効期限チェック
    const isExpired = tokens.expires_at < Date.now();
    
    res.json({
      authenticated: true,
      user: userInfo,
      tokenExpired: isExpired,
      expiresAt: new Date(tokens.expires_at).toISOString(),
      algorithm: 'RS256'
    });

  } catch (error) {
    console.error('OAuth status check error (RS256):', error.message);
    res.json({ 
      authenticated: false,
      error: error.message,
      algorithm: 'RS256'
    });
  }
});

export default router;