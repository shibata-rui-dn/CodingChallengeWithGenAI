# SSO認証システム 詳細仕様書

## 目次

1. [システム概要](#システム概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [技術スタック](#技術スタック)
4. [機能仕様](#機能仕様)
5. [API仕様](#api仕様)
6. [データベース設計](#データベース設計)
7. [セキュリティ](#セキュリティ)
8. [設定・運用](#設定運用)
9. [セットアップ手順](#セットアップ手順)

---

## システム概要

### 概要
Enterprise級のSSO（Single Sign-On）認証システム。OAuth 2.0/OpenID Connectプロトコルを実装し、複数のアプリケーションに対して統一認証と組織管理機能を提供します。

### 主要機能
- **SSO認証**: OAuth 2.0 Authorization Code Flow
- **OpenID Connect**: 標準的なID プロバイダー機能
- **管理画面**: ユーザー・クライアント・設定の統合管理
- **組織管理**: 部署・チーム・上司情報の詳細管理
- **スコープ管理**: 詳細な権限制御（組織情報・管理者権限）
- **CORS管理**: 動的オリジン管理とCSP自動更新
- **従業員データ管理**: 大量従業員データのインポート・管理機能

### 対象ユーザー
- **エンドユーザー**: 各種アプリケーションにSSO経由でアクセス
- **システム管理者**: ユーザー・クライアント・システム設定の管理
- **開発者**: OAuth 2.0クライアントアプリケーションの開発
- **人事・組織管理者**: 従業員データと組織構造の管理

---

## アーキテクチャ

### システム構成

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │    │   Client App    │    │   Admin Panel   │
│  (Frontend)     │    │  (Frontend)     │    │  (Management)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────────────┐
                    │   SSO Auth Server       │
                    │  ┌─────────────────┐    │
                    │  │ OAuth 2.0       │    │
                    │  │ OpenID Connect  │    │
                    │  └─────────────────┘    │
                    │  ┌─────────────────┐    │
                    │  │ Admin API       │    │
                    │  │ RBAC Middleware │    │
                    │  └─────────────────┘    │
                    │  ┌─────────────────┐    │
                    │  │ JWT Service     │    │
                    │  │ (RS256 Support) │    │
                    │  └─────────────────┘    │
                    │  ┌─────────────────┐    │
                    │  │ Organization    │    │
                    │  │ Management      │    │
                    │  └─────────────────┘    │
                    └─────────────────────────┘
                                 │
                    ┌─────────────────────────┐
                    │   SQLite Database       │
                    │  ┌─────────────────┐    │
                    │  │ users (org info)│    │
                    │  │ clients         │    │
                    │  │ auth_codes      │    │
                    │  │ access_tokens   │    │
                    │  │ allowed_origins │    │
                    │  └─────────────────┘    │
                    └─────────────────────────┘
```

### ディレクトリ構造

```
sso-auth-system/
├── auth-server/                    # 認証サーバー本体
│   ├── controllers/                # コントローラー層
│   │   ├── adminController.js      # 管理画面コントローラー
│   │   ├── authController.js       # 認証コントローラー
│   │   ├── clientController.js     # クライアント管理
│   │   ├── originController.js     # CORS オリジン管理
│   │   ├── tokenController.js      # トークン発行
│   │   └── userController.js       # ユーザー管理（組織情報含む）
│   ├── middleware/                 # ミドルウェア
│   │   ├── auth.js                 # JWT認証ミドルウェア
│   │   ├── cors.js                 # 動的CORS制御
│   │   ├── rateLimit.js            # レート制限
│   │   └── rbac.js                 # 役割ベースアクセス制御
│   ├── models/                     # データモデル
│   ├── routes/                     # ルーティング
│   │   ├── admin.js                # 管理画面ルート
│   │   ├── auth.js                 # 認証ルート
│   │   ├── clients.js              # クライアント管理API
│   │   ├── oauth.js                # OAuth 2.0エンドポイント
│   │   ├── origins.js              # CORS管理API
│   │   ├── token.js                # トークンエンドポイント
│   │   ├── userinfo.js             # UserInfo エンドポイント
│   │   ├── users.js                # ユーザー管理API
│   │   └── wellknown.js            # OpenID Connect Discovery
│   ├── services/                   # ビジネスロジック
│   │   └── jwtService.js           # JWT生成・検証（組織情報対応）
│   ├── views/                      # テンプレート（EJS）
│   │   ├── admin/                  # 管理画面テンプレート
│   │   ├── error.ejs               # エラーページ
│   │   └── login.ejs               # ログインページ
│   ├── public/                     # 静的ファイル
│   │   ├── css/                    # スタイルシート
│   │   └── js/                     # JavaScript
│   ├── database/                   # マイグレーション・シード
│   │   └── migrations/             # データベースマイグレーション
│   └── server.js                   # サーバーエントリーポイント
├── config/                         # 設定ファイル
│   ├── config.yaml                 # メイン設定
│   ├── configLoader.js             # 設定ローダー
│   └── database.js                 # データベース設定
├── scripts/                        # 運用スクリプト
│   ├── setup.js                    # 完全セットアップ
│   ├── migrate.js                  # マイグレーション
│   ├── seed.js                     # シードデータ
│   ├── import-employees.js         # 従業員データインポート
│   └── start.js                    # サーバー起動
├── keys/                           # RSA鍵ペア
├── data/                           # データファイル
│   └── employee.json               # 従業員データ（生成される）
└── logs/                           # ログファイル
```

---

## 技術スタック

### Core Technologies
- **Node.js**: 22.0.0+（ESM サポート）
- **Express.js**: 4.18.2（Webフレームワーク）
- **SQLite**: better-sqlite3 8.14.0（データベース）
- **EJS**: 3.1.9（テンプレートエンジン）

### 認証・セキュリティ
- **jsonwebtoken**: 9.0.0（JWT処理・RS256対応）
- **node-jose**: 2.2.0（JWKS生成）
- **bcrypt**: 5.1.0（パスワードハッシュ）
- **helmet**: 6.1.5（セキュリティヘッダー・CSP）
- **cors**: 2.8.5（動的CORS制御）
- **express-rate-limit**: 6.7.0（レート制限）

### セッション・状態管理
- **express-session**: 1.17.3（セッション管理）
- **connect-flash**: 0.1.1（フラッシュメッセージ）

### ユーティリティ・開発支援
- **uuid**: 9.0.0（ID生成）
- **yaml**: 2.3.1（設定ファイル）
- **winston**: 3.8.2（ログ）
- **joi**: 17.9.2（バリデーション）
- **morgan**: 1.10.0（HTTPログ）
- **dotenv**: 16.1.4（環境変数）

---

## 機能仕様

### 1. 認証機能

#### 1.1 OAuth 2.0 Authorization Code Flow

**フロー概要**:
1. クライアントアプリケーションが認証要求（/oauth2/authorize）
2. ユーザーがSSO認証画面でログイン（/auth/login）
3. 認証コード発行（auth_codes テーブル）
4. クライアントがトークン交換（/token）
5. アクセストークン・IDトークン発行（access_tokens テーブル）

**対応エンドポイント**:
- `/oauth2/authorize` - 認証要求（クライアント・リダイレクトURI検証）
- `/token` - トークン交換（client_secret認証）
- `/userinfo` - ユーザー情報取得（スコープ別情報提供）

#### 1.2 OpenID Connect

**対応スコープ**:
- `openid`: 基本ID情報（sub, iss, aud, exp, iat）
- `profile`: プロフィール情報（name, given_name, family_name, preferred_username）
- `email`: メールアドレス（email, email_verified）
- `organization`: 組織情報（department, team, supervisor）
- `admin`: 管理者権限（role, admin フラグ）

**Discovery エンドポイント**:
- `/.well-known/openid-configuration`: OpenID Provider Metadata
- `/.well-known/jwks`: JSON Web Key Set（RSA公開鍵）

### 2. 管理機能

#### 2.1 ユーザー管理

**機能**:
- **CRUD操作**: 作成・読取・更新・削除
- **ページネーション**: page, limit パラメータ対応
- **検索・フィルタリング**: 
  - 全文検索（username, email, first_name, last_name）
  - 役割フィルター（admin/user）
  - ステータスフィルター（active/inactive）
- **組織情報管理**: 部署・チーム・上司の設定
- **パスワード管理**: bcrypt（設定可能ラウンド数）
- **役割管理**: admin/user 役割切り替え
- **統計情報**: 総ユーザー数・管理者数・アクティブユーザー数

**組織情報フィールド**:
```javascript
{
  department: "エンジニアリング部",    // 部署
  team: "バックエンドチーム",          // チーム
  supervisor: "田中部長"              // 上司
}
```

**API エンドポイント**:
- `GET /admin/api/users` - ユーザー一覧（ページネーション・検索対応）
- `POST /admin/api/users` - ユーザー作成
- `GET /admin/api/users/:id` - ユーザー詳細
- `PATCH /admin/api/users/:id` - ユーザー更新
- `DELETE /admin/api/users/:id` - ユーザー削除
- `GET /admin/api/users/stats` - ユーザー統計

#### 2.2 クライアント管理

**機能**:
- **CRUD操作**: OAuth クライアント管理
- **リダイレクトURI管理**: 複数URI登録・検証
- **スコープ管理**: クライアント毎の許可スコープ設定
- **クライアントシークレット**: 自動生成・再生成機能
- **ステータス管理**: アクティブ/非アクティブ切り替え
- **CSP連動**: リダイレクトURIからオリジン自動抽出

**API エンドポイント**:
- `GET /admin/api/clients` - クライアント一覧
- `POST /admin/api/clients` - クライアント作成
- `GET /admin/api/clients/:id` - クライアント詳細
- `PATCH /admin/api/clients/:id` - クライアント更新
- `DELETE /admin/api/clients/:id` - クライアント削除
- `POST /admin/api/clients/:id/regenerate-secret` - シークレット再生成
- `GET /admin/api/clients/stats` - クライアント統計

#### 2.3 CORS オリジン管理

**機能**:
- **動的CORS設定**: オリジン追加・削除の即座反映
- **CSP自動更新**: Content Security Policy form-action 自動更新
- **クライアント連動**: クライアントのリダイレクトURIから自動オリジン抽出
- **ステータス管理**: オリジン毎の有効/無効制御

**API エンドポイント**:
- `GET /admin/origins` - オリジン一覧
- `POST /admin/origins` - オリジン追加
- `DELETE /admin/origins/:id` - オリジン削除
- `PATCH /admin/origins/:id` - オリジンステータス更新
- `POST /admin/origins/refresh` - CORS設定リフレッシュ

#### 2.4 システム情報

**監視項目**:
- **サーバーステータス**: Node.js version, platform, uptime
- **メモリ使用量**: RSS, heap used, heap total, external
- **データベース統計**: 各テーブルのレコード数
- **CSP設定**: 現在のオリジン数・設定状況
- **設定ステータス**: 各コンポーネントの動作状況

### 3. 従業員データ管理

#### 3.1 従業員インポート機能

**機能**:
- **大量データインポート**: JSONファイルからの一括インポート
- **バッチ処理**: 設定可能なバッチサイズ（デフォルト50件）
- **パスワード戦略**: 
  - `default`: 共通パスワード
  - `employeeId`: 従業員IDベース
  - `name`: 名前ベース
- **重複チェック**: username, email の重複回避
- **統計レポート**: インポート結果の詳細統計
- **ドライラン**: テスト実行機能

**コマンドライン操作**:
```bash
# 基本インポート
node scripts/import-employees.js

# オプション指定
node scripts/import-employees.js --file employee.json --batch 100 --strategy employeeId

# 管理操作
node scripts/import-employees.js --stats      # 統計表示
node scripts/import-employees.js --clear      # 従業員データクリア
node scripts/import-employees.js --dry-run    # テスト実行
```

#### 3.2 組織データ分析

**機能**:
- **組織構造分析**: 部署・チーム・階層構造の自動分析
- **統計レポート**: 部署別従業員数・チーム別統計
- **データ検証**: 組織情報の整合性チェック
- **エクスポート**: Markdown レポート生成

---

## API仕様

### 認証API

#### POST /auth/login
ユーザーログイン

**リクエスト**:
```json
{
  "email": "user@company.com",
  "password": "password123",
  "client_id": "demo-client",
  "redirect_uri": "http://localhost:3000/callback",
  "scope": "openid profile email organization",
  "state": "random-state-value"
}
```

**レスポンス**: 認証成功時 redirect_uri にリダイレクト

#### GET /oauth2/authorize
OAuth 2.0 認証要求

**パラメータ**:
- `response_type`: "code" (必須)
- `client_id`: クライアントID (必須)
- `redirect_uri`: リダイレクトURI (必須)
- `scope`: 要求スコープ (任意)
- `state`: CSRF保護用ランダム値 (推奨)

**処理フロー**:
1. クライアント・リダイレクトURI検証
2. ログイン画面表示またはリダイレクト
3. 認証後、認証コード付きでcallback

#### POST /token
アクセストークン取得

**リクエスト**:
```json
{
  "grant_type": "authorization_code",
  "code": "generated-auth-code",
  "client_id": "demo-client",
  "client_secret": "client-secret",
  "redirect_uri": "http://localhost:3000/callback"
}
```

**レスポンス**:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "b8f2c7e1-4a9b-4c8d-9e7f-1a2b3c4d5e6f",
  "scope": "openid profile email organization"
}
```

#### GET /userinfo
ユーザー情報取得

**ヘッダー**: `Authorization: Bearer <access_token>`

**レスポンス**（組織情報スコープ含む）:
```json
{
  "sub": "123",
  "preferred_username": "yamada_taro",
  "email": "yamada@company.com",
  "email_verified": true,
  "name": "山田 太郎",
  "given_name": "太郎",
  "family_name": "山田",
  "updated_at": "2024-12-01T10:00:00Z",
  "department": "エンジニアリング部",
  "team": "バックエンドチーム",
  "supervisor": "田中部長",
  "organization": {
    "department": "エンジニアリング部",
    "team": "バックエンドチーム",
    "supervisor": "田中部長"
  }
}
```

### 管理API

#### GET /admin/api/users
ユーザー一覧取得

**パラメータ**:
- `page`: ページ番号 (デフォルト: 1)
- `limit`: 件数制限 (デフォルト: 10)
- `search`: 検索キーワード (username, email, name対象)
- `role`: 役割フィルター (admin/user)

**レスポンス**:
```json
{
  "users": [
    {
      "id": 1,
      "username": "yamada_taro",
      "email": "yamada@company.com",
      "first_name": "太郎",
      "last_name": "山田",
      "department": "エンジニアリング部",
      "team": "バックエンドチーム",
      "supervisor": "田中部長",
      "role": "user",
      "is_active": true,
      "created_at": "2024-12-01T10:00:00Z",
      "updated_at": "2024-12-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

#### POST /admin/api/users
ユーザー作成

**リクエスト**:
```json
{
  "username": "new_user",
  "email": "newuser@company.com",
  "password": "SecurePass123",
  "first_name": "新規",
  "last_name": "ユーザー",
  "department": "営業部",
  "team": "第1営業チーム",
  "supervisor": "佐藤課長",
  "role": "user",
  "is_active": true
}
```

#### PATCH /admin/api/users/:id
ユーザー更新

**リクエスト**: 部分更新可能
```json
{
  "department": "マーケティング部",
  "team": "デジタルマーケティングチーム",
  "supervisor": "鈴木部長"
}
```

#### GET /admin/api/clients
クライアント一覧取得

**レスポンス**:
```json
{
  "clients": [
    {
      "client_id": "demo-client",
      "name": "Demo Application",
      "redirect_uris": ["http://localhost:3000/callback"],
      "allowed_scopes": ["openid", "profile", "email", "organization"],
      "is_active": true,
      "created_at": "2024-12-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "pages": 1
  }
}
```

#### POST /admin/api/clients
クライアント作成

**リクエスト**:
```json
{
  "client_id": "new-app",
  "name": "New Application",
  "redirect_uris": [
    "http://localhost:3001/callback",
    "https://app.example.com/auth/callback"
  ],
  "allowed_scopes": ["openid", "profile", "email"],
  "is_active": true
}
```

**レスポンス**: クライアントシークレット含む
```json
{
  "message": "Client created successfully",
  "client": {
    "client_id": "new-app",
    "client_secret": "generated-secret-32-chars",
    "name": "New Application",
    "redirect_uris": ["http://localhost:3001/callback"],
    "allowed_scopes": ["openid", "profile", "email"],
    "is_active": true,
    "created_at": "2024-12-01T10:00:00Z"
  },
  "warning": "Store the client_secret securely. It will not be shown again."
}
```

---

## データベース設計

### テーブル構造

#### users
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    department TEXT DEFAULT '-',          -- 🆕 部署情報
    team TEXT DEFAULT '-',                -- 🆕 チーム情報
    supervisor TEXT DEFAULT '-',          -- 🆕 上司情報
    role TEXT DEFAULT 'user',             -- 🆕 役割（admin/user）
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_department ON users(department);
```

#### clients
```sql
CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT UNIQUE NOT NULL,
    client_secret TEXT NOT NULL,
    name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,          -- JSON配列形式
    allowed_scopes TEXT DEFAULT 'openid profile email',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_clients_client_id ON clients(client_id);
CREATE INDEX idx_clients_active ON clients(is_active);
```

#### auth_codes
```sql
CREATE TABLE auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scope TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX idx_auth_codes_code ON auth_codes(code);
CREATE INDEX idx_auth_codes_expires ON auth_codes(expires_at);
```

#### access_tokens
```sql
CREATE TABLE access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    client_id TEXT NOT NULL,
    scope TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX idx_access_tokens_token ON access_tokens(token);
CREATE INDEX idx_access_tokens_expires ON access_tokens(expires_at);
```

#### allowed_origins
```sql
CREATE TABLE allowed_origins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT UNIQUE NOT NULL,
    description TEXT,
    added_by INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

-- インデックス
CREATE INDEX idx_origins_active ON allowed_origins(is_active);
```

### マイグレーション管理

マイグレーションファイル（`auth-server/database/migrations/`）:
- `001_create_users.sql` - ユーザーテーブル作成
- `002_create_clients.sql` - クライアントテーブル作成
- `003_create_auth_codes.sql` - 認証コードテーブル作成
- `004_create_access_tokens.sql` - アクセストークンテーブル作成
- `005_create_allowed_origins.sql` - 許可オリジンテーブル作成
- `006_add_user_roles.sql` - ユーザー役割フィールド追加
- `007_add_organization_fields.sql` - 組織情報フィールド追加

---

## セキュリティ

### 1. 認証セキュリティ

#### パスワード保護
- **bcrypt ハッシュ**: 設定可能ラウンド数（本番推奨: 12）
- **パスワード強度**: 最小6文字（管理画面で強化可能）
- **パスワード更新**: 管理者・本人のみ変更可能

#### JWT セキュリティ
- **署名アルゴリズム**: RS256（RSA-SHA256）
- **フォールバック**: HS256（HMAC-SHA256）
- **トークン有効期限**: 
  - アクセストークン: 1時間（3600秒）
  - IDトークン: 1時間（3600秒）
- **JWKSサポート**: RSA公開鍵の自動配布
- **トークン取り消し**: アクセストークンのデータベース管理

#### JWT ペイロード例
```json
{
  "sub": "123",
  "iss": "http://localhost:3303",
  "aud": "demo-client",
  "exp": 1701234567,
  "iat": 1701230967,
  "scope": "openid profile email organization",
  "username": "yamada_taro",
  "email": "yamada@company.com",
  "name": "山田 太郎",
  "given_name": "太郎",
  "family_name": "山田",
  "preferred_username": "yamada_taro",
  "organization": {
    "department": "エンジニアリング部",
    "team": "バックエンドチーム",
    "supervisor": "田中部長"
  },
  "client_id": "demo-client"
}
```

### 2. アクセス制御

#### RBAC（Role-Based Access Control）
```javascript
// ミドルウェア実装
const requireAdmin = async (req, res, next) => {
  const userRole = await getUserRole(req.user.sub);
  if (userRole !== 'admin') {
    return res.status(403).json({ 
      error: 'forbidden',
      error_description: 'Admin privileges required' 
    });
  }
  next();
};

const requireSelfOrAdmin = async (req, res, next) => {
  const userId = req.user.sub;
  const targetUserId = req.params.id;
  const userRole = await getUserRole(userId);
  
  if (userRole === 'admin' || userId.toString() === targetUserId.toString()) {
    next();
  } else {
    return res.status(403).json({ 
      error: 'forbidden',
      error_description: 'Access denied: insufficient privileges' 
    });
  }
};
```

#### APIセキュリティ
- **認証必須**: Bearer token による API アクセス制御
- **レート制限**: 
  - 認証API: 5req/15min
  - トークンAPI: 10req/15min
  - 一般API: 200req/15min
- **CORS制御**: 動的オリジン管理
- **入力検証**: Joi スキーマによる厳密な検証

### 3. セキュリティヘッダー

#### Content Security Policy
```javascript
{
  defaultSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  scriptSrc: ["'self'"],
  imgSrc: ["'self'", "data:", "https:"],
  formAction: ["'self'", ...dynamicOrigins] // 動的更新
}
```

#### その他ヘッダー
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HTTPS環境)

### 4. セッション管理

#### セッション設定
```javascript
{
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600000,  // 1時間
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'admin.session.id'
}
```

---

## 設定・運用

### 設定ファイル

#### config/config.yaml
```yaml
server:
  auth_domain: "localhost"
  auth_server_url: "http://localhost:3303"
  auth_port: 3303

database:
  name: "auth_db.sqlite"
  path: "./database/"

jwt:
  issuer: "http://localhost:3303"
  audience: "http://localhost:3303"
  algorithm: "RS256"
  access_token_expiry: 3600
  id_token_expiry: 3600
  private_key_path: "./keys/private.pem"
  public_key_path: "./keys/public.pem"

oauth:
  code_expiry: 600
  default_scopes: ["openid", "profile", "email"]
  admin_scopes: ["openid", "profile", "email", "admin"]
  organization_scopes: ["openid", "profile", "email", "organization"]
  available_scopes: 
    - "openid"
    - "profile" 
    - "email"
    - "organization" 
    - "admin"
  scope_descriptions:
    openid: "基本的なID情報"
    profile: "プロフィール情報" 
    email: "メールアドレス"
    organization: "組織情報（部署・チーム・上司）"
    admin: "管理者機能"

security:
  bcrypt_rounds: 4  # 開発環境用（本番: 12推奨）
  session_secret: "change-this-in-production"
  rate_limit:
    window_ms: 900000    # 15分
    max_requests: 200

logging:
  level: "info"
  file: "./logs/auth-server.log"
  console: true

demo:
  admin:
    username: "admin"
    password: "SecurePass123"
  user:
    username: "user0"
    password: "UserPass123"
```

#### 環境変数 (.env)
```bash
# 実行環境
NODE_ENV=production
DEBUG_CSP=false

# サーバー設定
PORT=3303

# データベース
DATABASE_PATH=./database/auth_db.sqlite

# JWT設定
JWT_SECRET=your-super-secret-jwt-key-min-256-bits-change-in-production

# セッション
SESSION_SECRET=your-session-secret-key-change-in-production
```

### 運用スクリプト

#### セットアップ・初期化
```bash
# 完全セットアップ（データベースリセット含む）
node scripts/setup.js

# マイグレーション実行
node scripts/migrate.js

# シードデータ投入
node scripts/seed.js
```

#### サーバー管理
```bash
# サーバー起動
npm start
node scripts/start.js

# 直接起動
node auth-server/server.js
```

#### 従業員データ管理
```bash
# 従業員データインポート
node scripts/import-employees.js

# オプション付きインポート
node scripts/import-employees.js --file employee.json --batch 100 --strategy employeeId

# 管理操作
node scripts/import-employees.js --stats      # 統計表示
node scripts/import-employees.js --clear      # 従業員データクリア
node scripts/import-employees.js --clear-all  # 全ユーザークリア
node scripts/import-employees.js --dry-run    # テスト実行

# ヘルプ表示
node scripts/import-employees.js --help
```

### ログ管理

#### ログレベル・出力
- **error**: エラー情報（認証失敗、システムエラー）
- **warn**: 警告情報（設定問題、非推奨機能）
- **info**: 一般情報（起動、設定読込、トークン発行）
- **debug**: デバッグ情報（詳細フロー、SQL実行）

#### ログファイル
- **メインログ**: `./logs/auth-server.log`
- **エラーログ**: `./logs/error.log`
- **HTTPアクセスログ**: morgan による標準出力
- **コンソール出力**: 開発環境のみ有効

---

## セットアップ手順

### 1. 前提条件

#### 必要環境
- **Node.js**: 22.0.0 以上（ESMサポート必須）
- **npm**: 最新版
- **Git**: バージョン管理用

#### 推奨環境
- **OS**: Linux/macOS/Windows 10+
- **メモリ**: 2GB以上
- **ディスク**: 1GB以上
- **OpenSSL**: RSA鍵生成用（Windowsは不要）

### 2. インストール・セットアップ

#### ワンコマンドセットアップ（推奨）
```bash
# リポジトリクローン
git clone <repository-url>
cd sso-auth-system

# 完全自動セットアップ
npm run setup
```

**セットアップ内容**:
1. ✅ 依存関係インストール
2. ✅ 既存データベース削除
3. ✅ RSA鍵ペア生成
4. ✅ データベース初期化（マイグレーション）
5. ✅ シードデータ投入
6. ✅ 従業員データ生成・インポート
7. ✅ システム動作確認

#### 個別セットアップ
```bash
# 1. 依存関係インストール
npm install

# 2. RSA鍵生成
mkdir -p keys
openssl genpkey -algorithm RSA -out keys/private.pem -pkcs8
openssl rsa -pubout -in keys/private.pem -out keys/public.pem

# 3. 環境設定
cp auth-server/.env.example auth-server/.env

# 4. データベース初期化
node scripts/migrate.js
node scripts/seed.js

# 5. 従業員データインポート（任意）
node create_employee.js                    # 従業員データ生成
node scripts/import-employees.js           # インポート実行
```

### 3. 起動・動作確認

#### サーバー起動
```bash
# 開発環境
npm start

# 本番環境
NODE_ENV=production npm start

# PM2使用（推奨）
npm install -g pm2
pm2 start auth-server/server.js --name "sso-auth"
pm2 startup
pm2 save
```

#### アクセス確認
- **認証サーバー**: `http://localhost:3303`
- **管理画面**: `http://localhost:3303/admin`
- **OpenID設定**: `http://localhost:3303/.well-known/openid-configuration`
- **ヘルスチェック**: `http://localhost:3303/health`

### 4. 初期設定

#### 管理者ログイン
- **URL**: `http://localhost:3303/admin`
- **ユーザー名**: `admin`
- **パスワード**: `SecurePass123`

#### 基本設定手順
1. **管理画面ログイン**: 管理者アカウントでログイン
2. **パスワード変更**: セキュリティ強化
3. **クライアント登録**: OAuth クライアント追加
4. **オリジン設定**: CORS許可オリジン設定
5. **ユーザー管理**: 組織情報設定・追加ユーザー作成

#### Demo アカウント
```bash
# 管理者アカウント
Username: admin
Password: SecurePass123
Role: Administrator
Access: 全機能利用可能

# 一般ユーザーアカウント
Username: user0  
Password: UserPass123
Role: User
Access: 基本機能のみ

# 従業員アカウント（インポート後）
Password: Employee2024! (全従業員共通)
Username: メールプレフィックスまたは名前ベース
Role: User
Organization: 各従業員の組織情報設定済み
```

### 5. 本番環境設定

#### セキュリティ強化
```yaml
# config/config.yaml
security:
  bcrypt_rounds: 12                # パスワードハッシュ強度
  session_secret: "強力な秘密鍵"    # セッション暗号化
  rate_limit:
    window_ms: 900000
    max_requests: 100              # レート制限強化

jwt:
  algorithm: "RS256"               # RSA署名必須
  access_token_expiry: 1800        # トークン有効期限短縮（30分）
```

#### 環境変数設定
```bash
# .env（本番環境）
NODE_ENV=production
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
DATABASE_PATH=/opt/sso/database/auth_db.sqlite
```

#### HTTPS設定
```javascript
// リバースプロキシ設定例（nginx）
server {
    listen 443 ssl;
    server_name sso.company.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    location / {
        proxy_pass http://localhost:3303;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 6. トラブルシューティング

#### よくある問題

**1. ポート競合エラー**
```bash
# ポート使用状況確認
lsof -i :3303
netstat -tulpn | grep :3303

# プロセス終了
kill -9 <PID>
```

**2. データベース権限エラー**
```bash
# ディレクトリ・ファイル権限設定
chmod 755 auth-server/database/
chmod 644 auth-server/database/auth_db.sqlite
```

**3. RSA鍵エラー**
```bash
# 鍵ペア再生成
rm -rf keys/
mkdir keys
node scripts/setup.js  # 自動生成
```

**4. CORS エラー**
```bash
# 管理画面でオリジン追加
# http://localhost:3303/admin -> Origins 管理

# 設定確認
curl http://localhost:3303/.well-known/openid-configuration
```

#### ログ確認
```bash
# リアルタイムログ監視
tail -f logs/auth-server.log
tail -f logs/error.log

# デバッグモード起動
NODE_ENV=development npm start
```

#### システム状況確認
```bash
# ヘルスチェック
curl http://localhost:3303/health

# データベース統計
node scripts/import-employees.js --stats

# システム情報
# 管理画面 -> System Information
```

---

## 拡張・カスタマイズ

### 新機能追加ガイド

#### 1. 新しいスコープ追加
```javascript
// 1. config/config.yaml にスコープ追加
oauth:
  available_scopes:
    - "openid"
    - "profile"
    - "email"
    - "organization"
    - "admin"
    - "custom_scope"  // 新スコープ

// 2. JWT Service でクレーム追加（services/jwtService.js）
if (requestedScopes.includes('custom_scope')) {
  payload.custom_data = {
    custom_field: user.custom_field
  };
}

// 3. UserInfo エンドポイント更新（routes/userinfo.js）
if (requestedScopes.includes('custom_scope')) {
  userInfo.custom_field = user.custom_field;
}
```

#### 2. 新しいデータベースフィールド追加
```sql
-- マイグレーションファイル作成
-- auth-server/database/migrations/008_add_custom_fields.sql
ALTER TABLE users ADD COLUMN custom_field TEXT DEFAULT '';
CREATE INDEX idx_users_custom_field ON users(custom_field);
```

#### 3. 管理画面機能拡張
```javascript
// コントローラー追加（controllers/customController.js）
class CustomController {
  async showCustomPage(req, res) {
    // カスタム機能実装
  }
}

// ルート追加（routes/admin.js）
router.get('/custom', customController.showCustomPage);

// テンプレート作成（views/admin/custom.ejs）
```

### パフォーマンス最適化

#### データベース最適化
```sql
-- インデックス追加
CREATE INDEX idx_users_department_team ON users(department, team);
CREATE INDEX idx_access_tokens_user_client ON access_tokens(user_id, client_id);

-- クエリ最適化例
-- 非効率: SELECT * FROM users WHERE department LIKE '%エンジニアリング%';
-- 効率的: SELECT * FROM users WHERE department = 'エンジニアリング部';
```

#### キャッシュ導入
```javascript
// Redis セッションストア
import RedisStore from "connect-redis";
import { createClient } from "redis";

const redisClient = createClient({
  host: 'localhost',
  port: 6379
});

app.use(session({
  store: new RedisStore({ client: redisClient }),
  // ... 他の設定
}));
```

#### クラスター構成
```javascript
// cluster.js
import cluster from 'cluster';
import os from 'os';

if (cluster.isMaster) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork();
  });
} else {
  // auth-server/server.js を起動
  import('./auth-server/server.js');
}
```

---

## セキュリティベストプラクティス

### 本番環境セキュリティチェックリスト

#### 必須設定
- [ ] **強力なパスワード**: 全アカウントで複雑なパスワード設定
- [ ] **JWT秘密鍵**: 256bit以上のランダム生成秘密鍵
- [ ] **HTTPS**: SSL/TLS証明書設定と強制リダイレクト
- [ ] **CORS**: 必要最小限のオリジンのみ許可
- [ ] **レート制限**: 適切な制限値設定
- [ ] **bcryptラウンド数**: 12以上に設定
- [ ] **セッション設定**: HTTPOnly, Secure, SameSite 有効化
- [ ] **CSP**: Content Security Policy 適切設定

#### 推奨設定
- [ ] **ログ監視**: 異常アクセス・認証失敗の監視
- [ ] **定期更新**: 依存関係・証明書の定期更新
- [ ] **バックアップ**: データベース定期バックアップ
- [ ] **アクセス制御**: IP制限・VPN経由アクセス
- [ ] **監査ログ**: 管理操作の全記録
- [ ] **脆弱性スキャン**: 定期的なセキュリティ検査

#### セキュリティ監視項目
```javascript
// 監視すべきログパターン
{
  // 認証失敗の集中
  "failed_login_attempts": "5分間で同一IPから10回以上の失敗",
  
  // 異常なトークン要求
  "token_request_anomaly": "短期間での大量トークン要求",
  
  // 管理者権限の乱用
  "admin_activity": "通常時間外の管理操作",
  
  // CORS違反
  "cors_violations": "許可されていないオリジンからのアクセス"
}
```

---

## API リファレンス

### OpenID Connect Discovery

#### GET /.well-known/openid-configuration
```json
{
  "issuer": "http://localhost:3303",
  "authorization_endpoint": "http://localhost:3303/oauth2/authorize",
  "token_endpoint": "http://localhost:3303/token",
  "userinfo_endpoint": "http://localhost:3303/userinfo",
  "jwks_uri": "http://localhost:3303/.well-known/jwks",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "scopes_supported": ["openid", "profile", "email", "organization", "admin"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "email", "name", "preferred_username", "department", "team", "supervisor"]
}
```

#### GET /.well-known/jwks
```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "rsa-key-1",
      "n": "base64-encoded-modulus",
      "e": "AQAB"
    }
  ]
}
```

### エラーレスポンス

#### 標準エラー形式
```json
{
  "error": "error_code",
  "error_description": "Human readable error description"
}
```

#### OAuth 2.0 エラーコード
- `invalid_request`: 必須パラメータ不足
- `invalid_client`: クライアント認証失敗
- `invalid_grant`: 認証コード無効/期限切れ
- `unsupported_grant_type`: 対応していないグラントタイプ
- `invalid_scope`: 無効なスコープ指定

#### 管理API エラーコード
- `unauthorized`: 認証が必要
- `forbidden`: 権限不足
- `validation_error`: 入力値検証エラー
- `resource_not_found`: リソースが見つからない
- `duplicate_resource`: リソースの重複

---

## 付録

### 従業員データ形式

#### employee.json 形式例
```json
{
  "employees": [
    {
      "employeeId": "EMP001",
      "name": "山田 太郎",
      "email": "yamada.taro@company.com",
      "department": "エンジニアリング部",
      "team": "バックエンドチーム",
      "position": "シニアエンジニア",
      "supervisor": "田中部長",
      "joinDate": "2022-04-01",
      "location": "東京"
    }
  ],
  "metadata": {
    "generated_at": "2024-12-01T10:00:00Z",
    "total_employees": 150,
    "departments": 8,
    "teams": 25
  }
}
```

### 組織階層の例
```
会社
├── エンジニアリング部
│   ├── バックエンドチーム
│   ├── フロントエンドチーム
│   └── インフラチーム
├── セールス部
│   ├── 新規開拓チーム
│   └── 既存顧客チーム
└── マーケティング部
    ├── デジタルマーケティングチーム
    └── コンテンツチーム
```

### クライアント設定例

#### React アプリケーション
```javascript
// OAuth設定
const authConfig = {
  authority: 'http://localhost:3303',
  client_id: 'react-app',
  redirect_uri: 'http://localhost:3000/callback',
  response_type: 'code',
  scope: 'openid profile email organization',
  post_logout_redirect_uri: 'http://localhost:3000'
};

// oidc-client-js使用例
import { UserManager } from 'oidc-client-js';

const userManager = new UserManager(authConfig);

// ログイン開始
userManager.signinRedirect();

// コールバック処理
userManager.signinRedirectCallback().then(user => {
  console.log('User:', user);
  console.log('Organization:', user.profile.organization);
});
```

#### Node.js Express アプリケーション
```javascript
// passport-openidconnect使用例
import passport from 'passport';
import { Strategy as OpenIDConnectStrategy } from 'passport-openidconnect';

passport.use('oidc', new OpenIDConnectStrategy({
  issuer: 'http://localhost:3303',
  clientID: 'node-app',
  clientSecret: 'node-app-secret',
  callbackURL: 'http://localhost:3001/auth/callback',
  scope: 'openid profile email organization'
}, (tokenset, userinfo, done) => {
  return done(null, userinfo);
}));

// ルート設定
app.get('/auth/login', passport.authenticate('oidc'));
app.get('/auth/callback', passport.authenticate('oidc', {
  successRedirect: '/dashboard',
  failureRedirect: '/login'
}));
```

---

**最終更新**: 2025年7月
**バージョン**: 2.0.0