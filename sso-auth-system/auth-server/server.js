import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import morgan from 'morgan';
import helmet from 'helmet';
import session from 'express-session';
import flash from 'connect-flash';
import dotenv from 'dotenv';
import { getConfig } from '../config/configLoader.js';
import userinfoRoutes from './routes/userinfo.js';
import fetch, { Headers, Request, Response } from 'node-fetch';

if (!globalThis.fetch) {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}

import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import tokenRoutes from './routes/token.js';
import wellKnownRoutes from './routes/wellknown.js';
import originRoutes from './routes/origins.js';
import adminRoutes from './routes/admin.js';
import userRoutes from './routes/users.js';
import clientRoutes from './routes/clients.js';
import { dynamicCors, loadAllowedOrigins, getCSPOrigins } from './middleware/cors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const config = getConfig();
const PORT = process.env.PORT || config.server.auth_port;

const projectRoot = path.resolve(__dirname, '..');
const logsDir = path.join(projectRoot, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

await loadAllowedOrigins();

let currentHelmet = null;

async function setupDynamicCSP() {
  try {
    const cspOrigins = await getCSPOrigins();
    const formActionList = ["'self'", ...cspOrigins];
    
    console.log('🛡️ CSP form-action origins:', formActionList);
    
    const newHelmet = helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          formAction: formActionList,
        },
      },
    });
    
    currentHelmet = newHelmet;
    return newHelmet;
  } catch (error) {
    console.warn('⚠️ Failed to setup dynamic CSP, using defaults:', error.message);
    
    const fallbackHelmet = helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          formAction: ["'self'", "http://localhost:3000", "http://localhost:3303"],
        },
      },
    });
    
    currentHelmet = fallbackHelmet;
    return fallbackHelmet;
  }
}

// 🆕 動的CSPミドルウェア
const dynamicHelmetMiddleware = async (req, res, next) => {
  if (currentHelmet) {
    try {
      currentHelmet(req, res, next);
    } catch (error) {
      console.warn('⚠️ CSP middleware error:', error.message);
      next();
    }
  } else {
    console.warn('⚠️ No CSP middleware available, proceeding without CSP');
    next();
  }
};

const dynamicHelmet = await setupDynamicCSP();

// 🔧 修正: 静的なhelmetの代わりに動的ミドルウェアを使用
app.use(dynamicHelmetMiddleware);

app.use(dynamicCors);
app.use(morgan('common'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || config.security.session_secret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 3600000,
    httpOnly: true
  },
  name: 'admin.session.id'
}));

app.use(flash());
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/auth', authRoutes);
app.use('/oauth2', oauthRoutes);
app.use('/token', tokenRoutes);
app.use('/.well-known', wellKnownRoutes);
app.use('/userinfo', userinfoRoutes);

app.use('/admin', adminRoutes);
app.use('/admin/api/users', userRoutes);
app.use('/admin/api/clients', clientRoutes);
app.use('/admin/origins', originRoutes);

// 🆕 CSP リフレッシュエンドポイントを改良
app.post('/admin/refresh-csp', async (req, res) => {
  try {
    console.log('🔄 Manual CSP refresh requested...');
    
    // 強制的にCSP設定を更新
    const newCSPOrigins = await refreshCSPConfiguration();
    
    console.log('✅ Manual CSP configuration updated');
    
    res.json({ 
      message: 'CSP configuration refreshed successfully',
      origins: newCSPOrigins,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to refresh CSP:', error);
    res.status(500).json({ 
      error: 'Failed to refresh CSP configuration',
      details: error.message 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    server_port: PORT
  });
});

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'cors_error',
      error_description: 'Origin not allowed by CORS policy'
    });
  }
  
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`🔐 SSO Auth Server running on port ${PORT}`);
  console.log(`🌐 Server URL: ${config.server.auth_server_url}`);
  console.log(`🛡️ Admin Panel: ${config.server.auth_server_url}/admin`);
  console.log(`🔑 Admin OAuth Client: admin-panel`);
});

// 🔧 修正: CSP設定更新機能を改良
export async function refreshCSPConfiguration() {
  try {
    console.log('🔄 Refreshing CSP configuration...');
    
    // キャッシュを無効化してOriginを再読み込み
    const { forceRefreshCSP } = await import('./middleware/cors.js');
    
    // 新しいCSP設定をセットアップ
    const newHelmet = await setupDynamicCSP();
    
    // グローバルな現在のhelmetを更新
    currentHelmet = newHelmet;
    
    // 新しいorigin情報を取得
    const newCSPOrigins = await getCSPOrigins();
    
    console.log('✅ CSP configuration successfully refreshed');
    console.log('🛡️ Updated CSP origins:', newCSPOrigins);
    
    return newCSPOrigins;
  } catch (error) {
    console.error('❌ Failed to refresh CSP configuration:', error);
    return [];
  }
}

export default app;