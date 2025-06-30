import cors from 'cors';

// 許可されたオリジンの定義
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3303', // SSO認証サーバー
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3303'
  ];

  // 本番環境の場合、環境変数から追加オリジンを取得
  if (process.env.NODE_ENV === 'production') {
    const prodOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    origins.push(...prodOrigins);
  }

  return origins;
};

// CORS設定
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    // 開発環境では origin が undefined の場合も許可（Postman等からのリクエスト）
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Cookie を含むリクエストを許可
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-CSRF-Token',
    'X-Requested-With'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  maxAge: 86400 // 24時間のプリフライトキャッシュ
};

// CORS エラーハンドラ
const corsErrorHandler = (err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      origin: req.get('Origin'),
      allowedOrigins: getAllowedOrigins()
    });
  } else {
    next(err);
  }
};

// CORS ミドルウェアの設定
const corsMiddleware = [
  cors(corsOptions),
  corsErrorHandler
];

export default corsMiddleware;