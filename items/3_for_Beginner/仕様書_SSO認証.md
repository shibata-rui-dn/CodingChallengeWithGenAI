# SSO認証システム - エンタープライズ仕様書

OAuth 2.0およびOpenID Connectプロトコルに対応したエンタープライズ向けシングルサインオン認証サービス。

## システム概要

### 主要機能
- **SSO認証**: OAuth 2.0 Authorization Code Flow
- **OpenID Connect**: RS256署名による標準的なID プロバイダー機能
- **管理画面**: ユーザー・クライアント・設定の統合管理
- **組織管理**: 部署・チーム・上司情報の詳細管理
- **スコープ管理**: 詳細な権限制御（組織情報・管理者権限）
- **CORS管理**: 動的オリジン管理とCSP自動更新
- **従業員データ管理**: 大量従業員データのインポート・管理機能

### 技術スタック
- **Node.js**: 22.0.0+（ESM サポート）
- **Express.js**: 4.18.2
- **SQLite**: better-sqlite3 8.14.0
- **JWT**: RS256 署名サポート
- **セキュリティ**: helmet, bcrypt, CORS制御

## クイックスタート

### セットアップ

```bash
# プロジェクトディレクトリに移動
cd sso-auth-system

# 依存関係をインストール
npm install

# システム初期化（RSA鍵生成、データベース、シードデータ）
npm run setup

# 認証サーバー起動
npm start
```

認証サーバーは `http://localhost:3303` で利用可能になります。

## 認証フロー

### OAuth 2.0 Authorization Code Flow
1. **クライアントアプリケーションが認証要求**（/oauth2/authorize）
2. **ユーザーがSSO認証画面でログイン**（/auth/login）
3. **認証コード発行**（auth_codes テーブル）
4. **クライアントがトークン交換**（/token）
5. **アクセストークン・IDトークン発行**（RS256署名）

### 対応スコープ
- `openid`: 基本ID情報
- `profile`: プロフィール情報
- `email`: メールアドレス
- `organization`: 組織情報（department, team, supervisor）
- `admin`: 管理者権限

## デフォルトアカウント

| 役割 | ユーザー名 | パスワード | アクセスレベル |
|------|------------|------------|----------------|
| 管理者 | `admin` | `SecurePass123` | システム全体へのアクセス |
| 一般ユーザー | `user0` | `UserPass123` | 基本ユーザー機能 |

## 管理機能

### アクセス
管理画面: `http://localhost:3303/admin`

### 主要機能
- **ユーザー管理**: CRUD操作、組織情報管理、役割管理
- **クライアント管理**: OAuth クライアント設定、スコープ管理
- **CORS管理**: 動的オリジン設定、CSP自動更新
- **システム監視**: サーバーステータス、データベース統計

### ユーザー管理

#### 組織情報フィールド
```javascript
{
  department: "エンジニアリング部",    // 部署
  team: "バックエンドチーム",          // チーム
  supervisor: "田中部長"              // 上司
}
```

#### API エンドポイント
- `GET /admin/api/users` - ユーザー一覧（ページネーション・検索対応）
- `POST /admin/api/users` - ユーザー作成
- `PATCH /admin/api/users/:id` - ユーザー更新
- `DELETE /admin/api/users/:id` - ユーザー削除

### クライアント管理

#### 機能
- **CRUD操作**: OAuth クライアント管理
- **リダイレクトURI管理**: 複数URI登録・検証
- **スコープ管理**: クライアント毎の許可スコープ設定
- **クライアントシークレット**: 自動生成・再生成機能

#### API エンドポイント
- `GET /admin/api/clients` - クライアント一覧
- `POST /admin/api/clients` - クライアント作成
- `POST /admin/api/clients/:id/regenerate-secret` - シークレット再生成

## データベース設計

### 主要テーブル

#### users テーブル
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    department TEXT DEFAULT '-',          -- 部署情報
    team TEXT DEFAULT '-',                -- チーム情報
    supervisor TEXT DEFAULT '-',          -- 上司情報
    role TEXT DEFAULT 'user',             -- 役割（admin/user）
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### clients テーブル
```sql
CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT UNIQUE NOT NULL,
    client_secret TEXT NOT NULL,
    name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,          -- JSON配列形式
    allowed_scopes TEXT DEFAULT 'openid profile email',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API仕様

### 認証エンドポイント

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
  "scope": "openid profile email organization"
}
```

#### GET /userinfo
ユーザー情報取得

**レスポンス**（組織情報スコープ含む）:
```json
{
  "sub": "123",
  "preferred_username": "yamada_taro",
  "email": "yamada@company.com",
  "name": "山田 太郎",
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

### OpenID Connect Discovery

#### GET /.well-known/openid-configuration
```json
{
  "issuer": "http://localhost:3303",
  "authorization_endpoint": "http://localhost:3303/oauth2/authorize",
  "token_endpoint": "http://localhost:3303/token",
  "userinfo_endpoint": "http://localhost:3303/userinfo",
  "jwks_uri": "http://localhost:3303/.well-known/jwks",
  "scopes_supported": ["openid", "profile", "email", "organization", "admin"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

## OAuth連携実装例

### フロントエンド実装

```javascript
// 設定値
const CLIENT_ID = 'my-organization-app';
const REDIRECT_URI = 'http://localhost:3001/auth/callback';
const SSO_BASE_URL = 'http://localhost:3303';

// 1. 認証開始
function startLogin() {
  const state = generateRandomString();
  sessionStorage.setItem('oauth_state', state);
  
  const authUrl = `${SSO_BASE_URL}/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=openid profile email organization&` +
    `state=${state}`;
  
  window.location.href = authUrl;
}

// 2. コールバック処理
async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const state = urlParams.get('state');
  
  // CSRF防止チェック
  const savedState = sessionStorage.getItem('oauth_state');
  if (state !== savedState) {
    console.error('不正なstateパラメータ');
    return;
  }
  
  // トークン交換（サーバーサイドで実行）
  const tokens = await exchangeCodeForTokens(code);
  
  if (tokens.access_token) {
    const userInfo = await getUserInfo(tokens.access_token);
    console.log('ユーザー情報:', userInfo);
    window.location.href = '/dashboard';
  }
}
```

### サーバーサイド実装

```javascript
// トークン交換
async function exchangeCodeForTokens(authorizationCode) {
  const response = await fetch(`${SSO_BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI
    })
  });
  
  if (!response.ok) {
    throw new Error(`トークン交換エラー: ${response.status}`);
  }
  
  return await response.json();
}

// ユーザー情報取得
async function getUserInfo(accessToken) {
  const response = await fetch(`${SSO_BASE_URL}/userinfo`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`ユーザー情報取得エラー: ${response.status}`);
  }
  
  return await response.json();
}
```

### 組織情報取得例

```javascript
// 従業員情報取得
async function getEmployeeDetails(accessToken) {
  const userInfo = await getUserInfo(accessToken);
  
  return {
    basic: {
      id: userInfo.sub,
      username: userInfo.preferred_username,
      name: userInfo.name,
      email: userInfo.email
    },
    organization: {
      department: userInfo.department,
      team: userInfo.team,
      supervisor: userInfo.supervisor
    },
    admin: {
      role: userInfo.role,
      isAdmin: userInfo.admin === true
    }
  };
}
```

## 従業員データ管理

### 一括インポート
```bash
# JSONファイルから従業員データをインポート
node scripts/import-employees.js --file employee.json

# インポート統計を表示
node scripts/import-employees.js --stats

# テスト実行
node scripts/import-employees.js --dry-run
```

### データ形式
```json
{
  "employees": [
    {
      "employeeId": "EMP001",
      "name": "山田 太郎",
      "email": "yamada.taro@company.com",
      "department": "エンジニアリング部",
      "team": "バックエンドチーム",
      "supervisor": "田中部長"
    }
  ]
}
```

## セキュリティ

### JWT セキュリティ
- **署名アルゴリズム**: RS256（RSA-SHA256）
- **トークン有効期限**: アクセストークン1時間、IDトークン1時間
- **JWKSサポート**: RSA公開鍵の自動配布

### アクセス制御
- **RBAC**: Role-Based Access Control
- **レート制限**: API毎の制限設定
- **CORS制御**: 動的オリジン管理
- **セキュリティヘッダー**: CSP、XSS Protection

### パスワード保護
- **bcrypt ハッシュ**: 設定可能ラウンド数
- **セッション管理**: HTTPOnly, Secure, SameSite

## 設定

### 環境変数（.env）
```bash
NODE_ENV=production
PORT=3303
JWT_SECRET=your-super-secret-jwt-key-min-256-bits
SESSION_SECRET=your-session-secret-key
DATABASE_PATH=./database/auth_db.sqlite
```

### YAML設定（config/config.yaml）
```yaml
server:
  auth_domain: "localhost"
  auth_server_url: "http://localhost:3303"
  auth_port: 3303

jwt:
  algorithm: "RS256"
  access_token_expiry: 3600
  id_token_expiry: 3600

oauth:
  available_scopes: 
    - "openid"
    - "profile" 
    - "email"
    - "organization" 
    - "admin"

security:
  bcrypt_rounds: 12
  rate_limit:
    window_ms: 900000
    max_requests: 200
```

## 運用

### システム管理
```bash
# データベースリセットと再シード
npm run setup

# マイグレーション実行
npm run migrate

# 従業員データクリア
node scripts/import-employees.js --clear
```

### 監視
- **システム情報**: `/admin/system`
- **ヘルスチェック**: `/health`
- **ログファイル**: `logs/auth-server.log`

## トラブルシューティング

### よくある問題

#### CORS エラー
管理画面の「Origins」でアプリケーションのオリジンを追加

#### リダイレクトURIエラー
クライアント設定のRedirect URIが正確に設定されているか確認

#### スコープエラー
クライアント設定で必要なスコープが有効になっているか確認

### デバッグ方法
```javascript
// JWTトークンのペイロード確認
function debugToken(token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('トークン内容:', payload);
  console.log('有効期限:', new Date(payload.exp * 1000));
  console.log('スコープ:', payload.scope);
}
```

## システム要件

- **ランタイム**: Node.js 22.0.0以上
- **データベース**: SQLite 3.x
- **メモリ**: 最低512MB
- **ストレージ**: 100MB

---

**最終更新**: 2025年7月
**バージョン**: 2.0.0