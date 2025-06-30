#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 鍵ファイルのパス
const KEYS_DIR = path.join(__dirname, '../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

// 認証サーバーの鍵パス（共有する場合）
const AUTH_SERVER_KEYS_DIR = path.join(__dirname, '../../auth-server/keys');
const AUTH_SERVER_PRIVATE_KEY = path.join(AUTH_SERVER_KEYS_DIR, 'private.pem');
const AUTH_SERVER_PUBLIC_KEY = path.join(AUTH_SERVER_KEYS_DIR, 'public.pem');

console.log('🔐 RSA鍵ペア セットアップを開始します...');
console.log('ℹ️  Node.js crypto モジュールを使用します');

async function setupRSAKeys() {
  try {
    // keysディレクトリを作成
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true });
      console.log('✅ keysディレクトリを作成しました');
    }

    // 既存の鍵があるかチェック
    if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
      console.log('🔑 既存のRSA鍵ペアが見つかりました');
      console.log(`   - 秘密鍵: ${PRIVATE_KEY_PATH}`);
      console.log(`   - 公開鍵: ${PUBLIC_KEY_PATH}`);
      
      // 鍵の妥当性をチェック
      const isValid = await validateKeyPair();
      if (isValid) {
        console.log('✅ 既存の鍵ペアは有効です');
        return;
      } else {
        console.log('⚠️ 既存の鍵ペアが無効です。新しい鍵を生成します...');
      }
    }

    // 認証サーバーの鍵を使用するかチェック
    if (fs.existsSync(AUTH_SERVER_PRIVATE_KEY) && fs.existsSync(AUTH_SERVER_PUBLIC_KEY)) {
      console.log('🔄 認証サーバーの鍵が見つかりました');
      console.log('   - 同じ鍵を使用することで署名の一貫性が保たれます');
      
      try {
        // 認証サーバーの鍵をコピー
        fs.copyFileSync(AUTH_SERVER_PRIVATE_KEY, PRIVATE_KEY_PATH);
        fs.copyFileSync(AUTH_SERVER_PUBLIC_KEY, PUBLIC_KEY_PATH);
        
        console.log('✅ 認証サーバーの鍵をコピーしました');
        console.log(`   - 秘密鍵: ${PRIVATE_KEY_PATH}`);
        console.log(`   - 公開鍵: ${PUBLIC_KEY_PATH}`);
        return;
      } catch (error) {
        console.log('⚠️ 認証サーバーの鍵コピーに失敗、新しい鍵を生成します');
      }
    }

    // 新しい鍵ペアを生成
    console.log('🔧 新しいRSA鍵ペアを生成します...');
    await generateKeyPairWithNodejs();
    
    console.log('✅ RSA鍵ペアの生成が完了しました');
    console.log(`   - 秘密鍵: ${PRIVATE_KEY_PATH}`);
    console.log(`   - 公開鍵: ${PUBLIC_KEY_PATH}`);

  } catch (error) {
    console.error('❌ RSA鍵ペアのセットアップに失敗しました:', error.message);
    console.error('詳細:', error);
    process.exit(1);
  }
}

// Node.js crypto モジュールでRSA鍵ペアを生成
async function generateKeyPairWithNodejs() {
  return new Promise((resolve, reject) => {
    try {
      console.log('📦 crypto.generateKeyPair を使用してRSA鍵ペアを生成中...');
      
      crypto.generateKeyPair('rsa', {
        modulusLength: 2048, // 2048ビット
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) {
          reject(new Error(`鍵ペア生成エラー: ${err.message}`));
          return;
        }

        try {
          // 秘密鍵をファイルに保存
          fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
          console.log('✅ RSA秘密鍵を生成しました');

          // 公開鍵をファイルに保存
          fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
          console.log('✅ RSA公開鍵を生成しました');

          resolve();
        } catch (writeError) {
          reject(new Error(`ファイル書き込みエラー: ${writeError.message}`));
        }
      });
    } catch (error) {
      reject(new Error(`crypto.generateKeyPair エラー: ${error.message}`));
    }
  });
}

// 鍵ペアの妥当性をチェック
async function validateKeyPair() {
  try {
    const privateKeyContent = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
    const publicKeyContent = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');

    // 鍵の形式をチェック
    if (!privateKeyContent.includes('-----BEGIN PRIVATE KEY-----')) {
      console.log('❌ 秘密鍵の形式が無効です');
      return false;
    }

    if (!publicKeyContent.includes('-----BEGIN PUBLIC KEY-----')) {
      console.log('❌ 公開鍵の形式が無効です');
      return false;
    }

    // JWT署名テスト
    const jwt = await import('jsonwebtoken');
    const testPayload = { test: 'validation', timestamp: Date.now() };
    
    const token = jwt.default.sign(testPayload, privateKeyContent, { algorithm: 'RS256' });
    const decoded = jwt.default.verify(token, publicKeyContent, { algorithms: ['RS256'] });

    if (decoded.test === 'validation') {
      console.log('✅ JWT署名・検証テスト成功');
      return true;
    }

    return false;

  } catch (error) {
    console.log('❌ 鍵ペアの検証に失敗しました:', error.message);
    return false;
  }
}

// 鍵の詳細情報をチェック
function analyzeKeys() {
  try {
    console.log('\n🔍 鍵の詳細分析:');
    
    if (fs.existsSync(PRIVATE_KEY_PATH)) {
      const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
      const keyObject = crypto.createPrivateKey(privateKey);
      
      console.log('秘密鍵情報:');
      console.log(`  - タイプ: ${keyObject.asymmetricKeyType}`);
      console.log(`  - サイズ: ${keyObject.asymmetricKeySize * 8} bits`);
      console.log(`  - フォーマット: PKCS#8 PEM`);
    }

    if (fs.existsSync(PUBLIC_KEY_PATH)) {
      const publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
      const keyObject = crypto.createPublicKey(publicKey);
      
      console.log('公開鍵情報:');
      console.log(`  - タイプ: ${keyObject.asymmetricKeyType}`);
      console.log(`  - サイズ: ${keyObject.asymmetricKeySize * 8} bits`);
      console.log(`  - フォーマット: SPKI PEM`);
    }

  } catch (error) {
    console.warn('⚠️ 鍵分析でエラーが発生:', error.message);
  }
}

// ファイル権限を設定
function setFilePermissions() {
  try {
    // Unix系OSでのみファイル権限を設定
    if (process.platform !== 'win32') {
      // 秘密鍵は所有者のみ読み書き可能
      fs.chmodSync(PRIVATE_KEY_PATH, 0o600);
      // 公開鍵は読み取り可能
      fs.chmodSync(PUBLIC_KEY_PATH, 0o644);
      
      console.log('✅ ファイル権限を設定しました (Unix)');
    } else {
      console.log('ℹ️  Windows環境のため、ファイル権限設定をスキップしました');
    }
  } catch (error) {
    console.warn('⚠️ ファイル権限の設定に失敗しました:', error.message);
  }
}

// 設定情報を表示
function displayInfo() {
  console.log('\n📋 RSA鍵ペア情報:');
  console.log('=====================================');
  
  try {
    const privateStats = fs.statSync(PRIVATE_KEY_PATH);
    const publicStats = fs.statSync(PUBLIC_KEY_PATH);
    
    console.log(`秘密鍵: ${PRIVATE_KEY_PATH}`);
    console.log(`  - サイズ: ${privateStats.size} bytes`);
    console.log(`  - 更新日: ${privateStats.mtime.toISOString()}`);
    
    console.log(`公開鍵: ${PUBLIC_KEY_PATH}`);
    console.log(`  - サイズ: ${publicStats.size} bytes`);
    console.log(`  - 更新日: ${publicStats.mtime.toISOString()}`);
    
  } catch (error) {
    console.error('❌ 鍵情報の取得に失敗しました:', error.message);
  }
  
  console.log('\n🔐 環境変数設定例:');
  console.log('===================================');
  console.log('# .env ファイルに追加（オプション）');
  console.log(`JWT_PRIVATE_KEY_PATH=${PRIVATE_KEY_PATH}`);
  console.log(`JWT_PUBLIC_KEY_PATH=${PUBLIC_KEY_PATH}`);
  
  console.log('\n🚀 次のステップ:');
  console.log('================');
  console.log('1. バッジ管理アプリを再起動してください');
  console.log('   npm start');
  console.log('2. 認証フローをテストしてください');
  console.log('   npm run test');
  console.log('3. ブラウザでアクセスしてください');
  console.log('   http://localhost:3000');
}

// メイン実行
async function main() {
  try {
    await setupRSAKeys();
    setFilePermissions();
    analyzeKeys();
    await validateKeyPair();
    displayInfo();
    
    console.log('\n🎉 RSA鍵ペアのセットアップが完了しました！');
    
  } catch (error) {
    console.error('❌ セットアップに失敗しました:', error.message);
    process.exit(1);
  }
}

// 環境チェック
function checkEnvironment() {
  console.log('\n🔧 環境チェック:');
  console.log('=================');
  console.log(`Node.js バージョン: ${process.version}`);
  console.log(`プラットフォーム: ${process.platform}`);
  console.log(`アーキテクチャ: ${process.arch}`);
  console.log(`作業ディレクトリ: ${process.cwd()}`);
  console.log(`crypto サポート: ${crypto.constants ? '✅' : '❌'}`);
  
  // crypto.generateKeyPairの可用性チェック
  if (typeof crypto.generateKeyPair === 'function') {
    console.log('crypto.generateKeyPair: ✅ 利用可能');
  } else {
    console.log('crypto.generateKeyPair: ❌ 利用不可');
    throw new Error('このNode.jsバージョンではcrypto.generateKeyPairがサポートされていません');
  }
}

// コマンドライン引数の処理
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🔐 RSA鍵ペア セットアップスクリプト (Node.js版)

使用方法:
  node setup-rsa-keys.js [オプション]

オプション:
  --help, -h     このヘルプを表示
  --force, -f    既存の鍵を強制的に再生成
  --validate, -v 既存の鍵の妥当性をチェック
  --check, -c    環境チェックのみ実行

例:
  node setup-rsa-keys.js
  node setup-rsa-keys.js --force
  node setup-rsa-keys.js --validate
  node setup-rsa-keys.js --check

特徴:
  - Node.js標準のcryptoモジュールを使用
  - OpenSSLのインストール不要
  - クロスプラットフォーム対応
  - 2048ビットRSA鍵ペア生成
  - PKCS#8/SPKI形式対応
`);
  process.exit(0);
}

if (args.includes('--check') || args.includes('-c')) {
  // 環境チェックのみ
  checkEnvironment();
  process.exit(0);
}

if (args.includes('--validate') || args.includes('-v')) {
  // 鍵の妥当性チェックのみ
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    validateKeyPair().then(isValid => {
      if (isValid) {
        console.log('✅ RSA鍵ペアは有効です');
        analyzeKeys();
        process.exit(0);
      } else {
        console.log('❌ RSA鍵ペアが無効です');
        process.exit(1);
      }
    });
  } else {
    console.log('❌ RSA鍵ペアが見つかりません');
    process.exit(1);
  }
} else {
  // 強制再生成オプション
  if (args.includes('--force') || args.includes('-f')) {
    if (fs.existsSync(PRIVATE_KEY_PATH)) fs.unlinkSync(PRIVATE_KEY_PATH);
    if (fs.existsSync(PUBLIC_KEY_PATH)) fs.unlinkSync(PUBLIC_KEY_PATH);
    console.log('🗑️ 既存の鍵を削除しました');
  }
  
  // 環境チェック実行
  try {
    checkEnvironment();
    main();
  } catch (error) {
    console.error('❌ 環境チェックに失敗:', error.message);
    process.exit(1);
  }
}