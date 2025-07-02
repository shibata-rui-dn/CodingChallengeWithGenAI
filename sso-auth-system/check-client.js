// scripts/check-client.js
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkClient() {
  try {
    const { default: pool } = await import('./config/database.js');
    
    console.log('🔍 Checking org-viewer-client configuration...\n');
    
    // クライアント情報を取得
    const result = await pool.query(
      'SELECT * FROM clients WHERE client_id = ?',
      ['org-viewer-client']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Client "org-viewer-client" not found in database');
      
      // 全クライアント一覧を表示
      const allClients = await pool.query('SELECT client_id, name, is_active FROM clients');
      console.log('\n📋 Available clients:');
      allClients.rows.forEach(client => {
        console.log(`  - ${client.client_id} (${client.name}) - ${client.is_active ? 'Active' : 'Inactive'}`);
      });
      return;
    }
    
    const client = result.rows[0];
    
    console.log('✅ Client found:');
    console.log('  Client ID:', client.client_id);
    console.log('  Client Secret:', client.client_secret);
    console.log('  Name:', client.name);
    console.log('  Status:', client.is_active ? '✅ Active' : '❌ Inactive');
    console.log('  Redirect URIs:', client.redirect_uris);
    console.log('  Allowed Scopes:', client.allowed_scopes);
    console.log('  Created:', client.created_at);
    
    console.log('\n📋 Environment Variables for your client:');
    console.log(`OAUTH_CLIENT_ID=org-viewer-client`);
    console.log(`OAUTH_CLIENT_SECRET=${client.client_secret}`);
    console.log(`OAUTH_REDIRECT_URI=http://localhost:4001/oauth/callback`);
    console.log(`OAUTH_AUTH_URL=http://localhost:3303/oauth2/authorize`);
    console.log(`OAUTH_TOKEN_URL=http://localhost:3303/token`);
    console.log(`OAUTH_USERINFO_URL=http://localhost:3303/userinfo`);
    
    // Redirect URIをパース
    try {
      const redirectUris = JSON.parse(client.redirect_uris);
      console.log('\n🔗 Configured Redirect URIs:');
      redirectUris.forEach((uri, index) => {
        console.log(`  ${index + 1}. ${uri}`);
      });
      
      if (!redirectUris.includes('http://localhost:4001/oauth/callback')) {
        console.log('\n⚠️  WARNING: http://localhost:4001/oauth/callback is not in the redirect URIs list!');
      }
    } catch (e) {
      console.log('\n❌ Invalid redirect_uris JSON format');
    }
    
  } catch (error) {
    console.error('❌ Error checking client:', error.message);
  }
}

checkClient();