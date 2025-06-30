# 組織可視化システム

シンプルな組織構造と従業員情報の可視化システムです。SSO認証システムとバッジ管理システムと連携しています。

## 機能

- 🏢 **組織構造の可視化** - 会社の部署・チーム構造をツリー表示
- 👥 **従業員一覧** - 部署別の従業員リスト表示
- 🏅 **バッジ情報** - 各従業員の取得バッジとポイント表示
- 🔐 **SSO認証** - OAuth 2.0による認証連携

## セットアップ

### 前提条件

1. **SSO認証システム** (localhost:3303) が稼働していること
2. **バッジ管理システム** (localhost:3000) が稼働していること
3. Node.js 18+ がインストール済み

### インストールと起動

```bash
# 1. 依存関係インストール
npm install

# 2. アプリケーション起動
npm start

# 3. ブラウザでアクセス
# http://localhost:4001
```

### SSO認証システムでのクライアント登録

SSO認証システムの管理画面 (http://localhost:3303/admin) で以下のクライアントを登録してください：

```json
{
  "client_id": "org-viewer-client",
  "client_secret": "org-viewer-secret",
  "name": "組織可視化システム",
  "redirect_uris": ["http://localhost:4001/oauth/callback"],
  "allowed_scopes": ["openid", "profile", "email", "organization"]
}
```

## 使用方法

1. **ログイン**: http://localhost:4001 にアクセスしてSSO認証でログイン
2. **組織構造確認**: 左パネルで会社の組織構造を確認
3. **従業員検索**: 右パネルで部署を選択して従業員一覧を表示
4. **詳細表示**: 従業員をクリックして詳細情報とバッジを確認

## アーキテクチャ

```
組織可視化システム (localhost:4001)
├── フロントエンド: バニラJS SPA
├── バックエンド: Express.js
├── 認証: SSO認証システム (OAuth 2.0)
└── データ: バッジ管理システム (外部API)
```

### API構成

- `GET /api/auth/status` - 認証状態確認
- `GET /api/organization` - 組織構造取得
- `GET /api/employees/:department` - 部署の従業員一覧
- `GET /api/employee/:employeeId` - 従業員詳細とバッジ情報

### ファイル構成

```
organization-viewer/
├── package.json          # 依存関係定義
├── server.js             # Express.js サーバー
├── public/
│   ├── index.html        # メインHTML
│   ├── style.css         # スタイル
│   └── app.js            # フロントエンドJS
└── README.md            # このファイル
```

## 連携システム

### SSO認証システム
- **URL**: http://localhost:3303
- **機能**: OAuth 2.0認証、ユーザー情報取得
- **スコープ**: organization (組織情報取得用)

### バッジ管理システム
- **URL**: http://localhost:3000
- **機能**: 従業員のバッジ情報取得
- **API**: `/external-api/*` (Bearer Token認証)

## 開発情報

### 技術スタック
- **バックエンド**: Node.js + Express.js
- **フロントエンド**: バニラJS + CSS
- **認証**: OAuth 2.0 / JWT
- **通信**: REST API + Fetch API

### カスタマイズ

環境変数で設定を変更できます：

```bash
# .env ファイル作成
PORT=4001
SSO_AUTH_SERVER=http://localhost:3303
BADGE_SERVER=http://localhost:3000
```

### 機能拡張

最小限の実装のため、以下の機能拡張が可能です：

- 検索機能の追加
- フィルタリング機能
- エクスポート機能
- リアルタイム更新
- 組織図の可視化強化

## トラブルシューティング

### よくある問題

1. **ログインできない**
   - SSO認証システムが起動しているか確認
   - クライアント登録が正しいか確認

2. **従業員データが表示されない**
   - バッジ管理システムが起動しているか確認
   - 外部API権限があるか確認

3. **CORS エラー**
   - 各システムのCORS設定を確認
   - オリジンが許可されているか確認

### ログ確認

```bash
# サーバーログの確認
npm start
# ブラウザの開発者ツールでエラーを確認
```

## ライセンス

MIT License

---

組織可視化システムのサンプルです。