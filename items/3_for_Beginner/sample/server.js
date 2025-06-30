import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// ES modules でのファイルパス設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4001;

// 設定
const CONFIG = {
  ssoServer: process.env.SSO_AUTH_SERVER || 'http://localhost:3303',
  badgeServer: process.env.BADGE_SERVER || 'http://localhost:3000',
  clientId: process.env.CLIENT_ID || 'org-viewer-client',
  clientSecret: process.env.CLIENT_SECRET || 'org-viewer-secret',
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:4001/oauth/callback',
  jwtSecret: process.env.JWT_SECRET || 'simple-secret',
  scopes: ['openid', 'profile', 'email', 'organization']
};

console.log('🔧 Configuration:');
console.log('- SSO Server:', CONFIG.ssoServer);
console.log('- Badge Server:', CONFIG.badgeServer);
console.log('- Client ID:', CONFIG.clientId);
console.log('- Redirect URI:', CONFIG.redirectUri);

// セッションストレージ（簡易実装）
const sessions = new Map();

// ミドルウェア
app.use(cors({ 
  origin: process.env.CORS_ORIGIN || 'http://localhost:4001', 
  credentials: true 
}));
app.use(cookieParser());
app.use(express.json());

// 静的ファイル設定
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 認証ミドルウェア
const authMiddleware = (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.decode(token);
    req.user = decoded;
    console.log('🔐 Authenticated user:', {
      username: decoded.user?.preferred_username,
      email: decoded.user?.email,
      role: decoded.user?.role,
      hasTokens: !!decoded.tokens
    });
    next();
  } catch (error) {
    console.error('❌ Token decode error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// === 認証ルート ===

// OAuth開始
app.get('/oauth/login', (req, res) => {
  const state = uuidv4();
  sessions.set(state, { timestamp: Date.now() });

  const authUrl = new URL('/oauth2/authorize', CONFIG.ssoServer);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', CONFIG.clientId);
  authUrl.searchParams.append('redirect_uri', CONFIG.redirectUri);
  authUrl.searchParams.append('scope', CONFIG.scopes.join(' '));
  authUrl.searchParams.append('state', state);

  console.log('🚀 Starting OAuth flow:', authUrl.toString());
  res.redirect(authUrl.toString());
});

// OAuth コールバック
app.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('❌ OAuth error:', error);
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }

  if (!sessions.has(state)) {
    console.error('❌ Invalid state:', state);
    return res.redirect('/?error=invalid_state');
  }

  try {
    console.log('🔄 Exchanging code for tokens...');
    
    // トークン取得
    const tokenResponse = await axios.post(`${CONFIG.ssoServer}/token`, {
      grant_type: 'authorization_code',
      code,
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      redirect_uri: CONFIG.redirectUri
    });

    const tokens = tokenResponse.data;
    console.log('✅ Tokens received:', {
      access_token: tokens.access_token ? '***' : 'missing',
      id_token: tokens.id_token ? '***' : 'missing',
      expires_in: tokens.expires_in
    });

    // ユーザー情報取得
    console.log('👤 Fetching user info...');
    const userResponse = await axios.get(`${CONFIG.ssoServer}/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const user = userResponse.data;
    console.log('✅ User info received:', {
      username: user.preferred_username,
      email: user.email,
      role: user.role || 'user',
      department: user.department,
      organization: !!user.organization
    });

    // セッション作成
    const sessionData = {
      user,
      tokens,
      createdAt: Date.now()
    };

    const sessionToken = jwt.sign(sessionData, CONFIG.jwtSecret, { expiresIn: '24h' });

    res.cookie('auth_token', sessionToken, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    });

    sessions.delete(state);
    console.log('✅ Authentication successful, redirecting to dashboard');
    res.redirect('/');

  } catch (error) {
    console.error('❌ Authentication failed:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    res.redirect(`/?error=${encodeURIComponent('Authentication failed')}`);
  }
});

// 認証状態確認
app.get('/api/auth/status', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, CONFIG.jwtSecret);
    res.json({
      authenticated: true,
      user: decoded.user
    });
  } catch (error) {
    console.error('❌ Auth status check failed:', error.message);
    res.json({ authenticated: false });
  }
});

// ログアウト
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  console.log('👋 User logged out');
  res.json({ success: true });
});

// === 組織データ API ===

// デバッグ用：バッジサーバー接続テスト
app.get('/api/debug/badge-server', authMiddleware, async (req, res) => {
  try {
    const { tokens } = req.user;
    
    console.log('🧪 Testing badge server connection...');
    const response = await axios.get(`${CONFIG.badgeServer}/external-api/info`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      timeout: 10000
    });
    
    console.log('✅ Badge server test successful:', response.status);
    res.json({
      success: true,
      status: response.status,
      data: response.data
    });
  } catch (error) {
    console.error('❌ Badge server test failed:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data,
      status: error.response?.status
    });
  }
});

// 組織構造取得（改善版）
app.get('/api/organization', authMiddleware, async (req, res) => {
  try {
    const { tokens, user } = req.user;
    
    console.log('🏢 Fetching organization data...');
    console.log('User details:', {
      username: user.preferred_username,
      role: user.role,
      department: user.department,
      email: user.email
    });

    // まずバッジサーバーの接続をテスト
    try {
      const testResponse = await axios.get(`${CONFIG.badgeServer}/health`, {
        timeout: 5000
      });
      console.log('✅ Badge server health check passed');
    } catch (healthError) {
      console.error('❌ Badge server health check failed:', healthError.message);
      throw new Error('Badge server is not accessible');
    }

    // バッジシステムの外部APIを使用して組織データを取得
    console.log('📊 Requesting system stats from badge server...');
    const statsResponse = await axios.get(`${CONFIG.badgeServer}/external-api/stats/system`, {
      headers: { 
        Authorization: `Bearer ${tokens.access_token}`,
        'User-Agent': 'org-viewer/1.0.0'
      },
      timeout: 15000
    });

    console.log('✅ Stats response received:', {
      status: statsResponse.status,
      hasData: !!statsResponse.data,
      departmentStats: statsResponse.data?.departmentStats?.length || 0
    });

    const orgData = {
      departments: statsResponse.data.departmentStats || [],
      structure: {
        'KK Company': {
          '経営陣': ['CEO Office'],
          '開発部': ['フロントエンド', 'バックエンド', 'インフラ', 'モバイル', 'AI・ML', 'QA'],
          'プロダクト部': ['プロダクトマネジメント', 'UI/UX', 'データアナリスト'],
          '営業部': ['エンタープライズ', 'SMB', 'パートナー'],
          'マーケティング部': ['デジタルマーケティング', 'コンテンツ', 'イベント'],
          '人事部': ['採用', '労務', '人事企画'],
          '総務・経理部': ['総務', '経理', '法務'],
          'カスタマーサクセス部': ['サポート', 'オンボーディング', 'アカウントマネジメント']
        }
      }
    };

    console.log('✅ Organization data prepared successfully');
    res.json(orgData);
    
  } catch (error) {
    console.error('❌ Organization data fetch failed:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 3)
    });
    
    // より詳細なエラーレスポンス
    res.status(500).json({ 
      error: 'Failed to fetch organization data',
      details: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        code: error.code
      }
    });
  }
});

// 部署の従業員取得（改善版）
app.get('/api/employees/:department', authMiddleware, async (req, res) => {
  try {
    const { department } = req.params;
    const { tokens } = req.user;

    console.log('👥 Fetching employees for department:', department);

    const response = await axios.get(
      `${CONFIG.badgeServer}/external-api/badges/department/${encodeURIComponent(department)}`,
      { 
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeout: 10000
      }
    );

    console.log('✅ Employees data received:', {
      status: response.status,
      employeeCount: response.data?.employees?.length || 0
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Employee fetch failed:', {
      department,
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).json({ 
      error: 'Failed to fetch employees',
      department,
      details: error.response?.data
    });
  }
});

// 従業員詳細取得（改善版）
app.get('/api/employee/:employeeId', authMiddleware, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { tokens } = req.user;

    console.log('👤 Fetching employee details:', employeeId);

    const response = await axios.get(
      `${CONFIG.badgeServer}/external-api/badges/user/${encodeURIComponent(employeeId)}?includeStats=true`,
      { 
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeout: 10000
      }
    );

    console.log('✅ Employee details received:', {
      status: response.status,
      hasEmployee: !!response.data?.employee,
      badgeCount: response.data?.badges?.length || 0
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Employee details fetch failed:', {
      employeeId,
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).json({ 
      error: 'Failed to fetch employee details',
      employeeId,
      details: error.response?.data
    });
  }
});

// === メインルート ===
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath);
});

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    config: {
      ssoServer: CONFIG.ssoServer,
      badgeServer: CONFIG.badgeServer,
      clientId: CONFIG.clientId
    }
  });
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// サーバー起動
const server = app.listen(PORT, () => {
  console.log(`🚀 Organization Viewer Server running on http://localhost:${PORT}`);
  console.log(`🔧 Configuration:`);
  console.log(`   - SSO Server: ${CONFIG.ssoServer}`);
  console.log(`   - Badge Server: ${CONFIG.badgeServer}`);
  console.log(`   - Client ID: ${CONFIG.clientId}`);
  console.log(`📊 Debug endpoints:`);
  console.log(`   - Health: http://localhost:${PORT}/health`);
  console.log(`   - Badge Test: http://localhost:${PORT}/api/debug/badge-server`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});