import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import winston from 'winston';

// ルートのインポート
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import oauthRoutes from './routes/oauth.js';
import externalApiRoutes from './routes/external-api.js';

// ミドルウェアのインポート
import corsMiddleware from './middleware/cors.js';
import authMiddleware from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ログ設定
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();
const PORT = process.env.PORT || 3000;

// セキュリティ設定
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "http://localhost:3303"]
    }
  }
}));

// CORS設定
app.use(corsMiddleware);

// Cookie parser設定
app.use(cookieParser());

// 基本ミドルウェア
app.use(express.json({ limit: '50mb' })); // 大量データ対応でサイズ制限を拡大
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// タイムアウト設定（大量データ処理用）
app.use((req, res, next) => {
  // 外部APIの一括処理は長時間タイムアウト
  if (req.path.startsWith('/external-api/badges/bulk')) {
    req.setTimeout(30 * 60 * 1000); // 30分
    res.setTimeout(30 * 60 * 1000); // 30分
  } else if (req.path.startsWith('/external-api/')) {
    req.setTimeout(5 * 60 * 1000); // 5分
    res.setTimeout(5 * 60 * 1000); // 5分
  }
  next();
});

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// ログミドルウェア
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    isExternalAPI: req.url.startsWith('/external-api')
  });
  next();
});

// ルート設定
app.use('/auth', authRoutes);
app.use('/oauth', oauthRoutes);
app.use('/api', authMiddleware, apiRoutes);

// 外部システム用API（独自の認証ミドルウェアを使用）
app.use('/external-api', externalApiRoutes);

// ヘルスチェック
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'badge-management-demo',
    features: ['web-ui', 'internal-api', 'external-api']
  });
});

// API情報エンドポイント
app.get('/api-info', (req, res) => {
  res.json({
    service: 'Badge Management System',
    version: '1.0.0',
    apis: {
      internal: {
        baseUrl: '/api',
        authentication: 'Session Cookie (SSO)',
        description: 'Internal API for web application'
      },
      external: {
        baseUrl: '/external-api',
        authentication: 'Bearer Token (SSO)',
        description: 'External API for third-party systems',
        documentation: '/external-api/info'
      },
      authentication: {
        baseUrl: '/auth',
        description: 'Authentication management'
      },
      oauth: {
        baseUrl: '/oauth',
        description: 'OAuth 2.0 authentication flow'
      }
    },
    lastUpdated: new Date().toISOString()
  });
});

// メインページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404ハンドラ
app.use((req, res) => {
  logger.warn('404 Not Found:', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`,
    availableAPIs: {
      web: '/',
      internal: '/api',
      external: '/external-api',
      auth: '/auth',
      oauth: '/oauth',
      info: '/api-info'
    }
  });
});

// エラーハンドラ
app.use((err, req, res, next) => {
  logger.error('Server Error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  logger.info(`バッジ管理デモアプリケーション起動: http://localhost:${PORT}`);
  logger.info(`SSO認証サーバー: ${process.env.SSO_AUTH_SERVER || 'http://localhost:3303'}`);
  logger.info('利用可能なAPI:');
  logger.info('  - 内部API: /api (Session Cookie認証)');
  logger.info('  - 外部API: /external-api (Bearer Token認証)');
  logger.info('  - 認証API: /auth, /oauth');
  logger.info('  - ドキュメント: /api-info, /external-api/info');
});