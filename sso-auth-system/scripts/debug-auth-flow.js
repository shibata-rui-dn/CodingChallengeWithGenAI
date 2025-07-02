// scripts/debug-auth-flow.js
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AuthFlowDebugger {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.baseURL = 'http://localhost:3303';
    this.clientApp = 'http://localhost:4001';
  }

  async debugAuthenticationFlow(clientId = 'org-viewer-client') {
    console.log('🔍 OAuth Authentication Flow Debug');
    console.log('='.repeat(60));
    console.log(`Client ID: ${clientId}`);
    console.log(`Auth Server: ${this.baseURL}`);
    console.log(`Client App: ${this.clientApp}`);
    console.log('');

    try {
      // 1. クライアント設定確認
      console.log('1️⃣ Verifying client configuration...');
      const clientInfo = await this.verifyClientConfig(clientId);
      if (!clientInfo.valid) {
        console.log('❌ Client configuration is invalid. Stopping debug.');
        return;
      }

      // 2. Authorization URL生成とテスト
      console.log('\n2️⃣ Testing authorization endpoint...');
      const authResult = await this.testAuthorizationEndpoint(clientId);
      
      // 3. Token endpoint テスト (仮想的に)
      console.log('\n3️⃣ Testing token endpoint configuration...');
      await this.testTokenEndpointConfig();
      
      // 4. CORS とCSP設定確認
      console.log('\n4️⃣ Checking CORS and CSP configuration...');
      await this.testCORSAndCSP();
      
      // 5. UserInfo endpoint テスト
      console.log('\n5️⃣ Testing UserInfo endpoint...');
      await this.testUserInfoEndpoint();
      
      // 6. 完全なフローシミュレーション
      console.log('\n6️⃣ Simulating complete authentication flow...');
      await this.simulateAuthFlow(clientId);
      
      // 7. 問題の診断
      console.log('\n🩺 Diagnosis and Recommendations:');
      await this.provideDiagnosis(clientId);
      
    } catch (error) {
      console.error('❌ Debug process failed:', error.message);
      throw error;
    }
  }

  async verifyClientConfig(clientId) {
    try {
      const { default: pool } = await import('../config/database.js');
      
      const result = await pool.query(
        'SELECT * FROM clients WHERE client_id = ?',
        [clientId]
      );

      if (result.rows.length === 0) {
        console.log(`❌ Client '${clientId}' not found in database`);
        return { valid: false, error: 'Client not found' };
      }

      const client = result.rows[0];
      console.log(`✅ Client found: ${client.name}`);
      console.log(`   Status: ${client.is_active ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   Client Secret: ${client.client_secret.substring(0, 8)}...`);
      
      let redirectUris;
      try {
        redirectUris = JSON.parse(client.redirect_uris);
        console.log(`   Redirect URIs: ${redirectUris.join(', ')}`);
      } catch (error) {
        console.log(`❌ Invalid redirect_uris JSON: ${client.redirect_uris}`);
        return { valid: false, error: 'Invalid redirect URIs' };
      }

      const scopes = client.allowed_scopes.split(' ');
      console.log(`   Allowed Scopes: ${scopes.join(', ')}`);
      
      // Check if the expected redirect URI is present
      const expectedRedirectUri = 'http://localhost:4001/oauth/callback';
      const hasCorrectRedirectUri = redirectUris.includes(expectedRedirectUri);
      console.log(`   Expected Redirect URI (${expectedRedirectUri}): ${hasCorrectRedirectUri ? '✅ Present' : '❌ Missing'}`);

      return { 
        valid: client.is_active && hasCorrectRedirectUri,
        client,
        redirectUris,
        scopes
      };
    } catch (error) {
      console.log(`❌ Database error: ${error.message}`);
      return { valid: false, error: error.message };
    }
  }

  async testAuthorizationEndpoint(clientId) {
    const redirectUri = 'http://localhost:4001/oauth/callback';
    const scope = 'openid profile email organization';
    const state = 'debug-test-' + Date.now();
    
    const authURL = `${this.baseURL}/oauth2/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      state: state
    }).toString();

    console.log(`🔗 Authorization URL: ${authURL}`);
    
    try {
      const response = await fetch(authURL, {
        method: 'GET',
        redirect: 'manual'
      });

      console.log(`   HTTP Status: ${response.status}`);
      
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        console.log(`   ✅ Redirecting to: ${location}`);
        
        if (location && location.includes('/auth/login')) {
          console.log(`   ✅ Properly redirecting to login page`);
          return { success: true, loginUrl: location };
        } else {
          console.log(`   ⚠️ Unexpected redirect location`);
          return { success: false, error: 'Unexpected redirect' };
        }
      } else if (response.status === 400) {
        const errorText = await response.text();
        console.log(`   ❌ Bad Request: ${errorText}`);
        return { success: false, error: errorText };
      } else {
        console.log(`   ⚠️ Unexpected status: ${response.status}`);
        return { success: false, error: `Unexpected status: ${response.status}` };
      }
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async testTokenEndpointConfig() {
    try {
      const response = await fetch(`${this.baseURL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'test-code',
          client_id: 'test',
          client_secret: 'test',
          redirect_uri: 'http://test.com'
        })
      });

      console.log(`   Token endpoint status: ${response.status}`);
      
      if (response.status === 400) {
        const result = await response.json();
        if (result.error === 'invalid_grant' || result.error === 'invalid_client') {
          console.log(`   ✅ Token endpoint is working (expected error for test data)`);
        } else {
          console.log(`   ⚠️ Unexpected error: ${result.error}`);
        }
      } else {
        console.log(`   ⚠️ Unexpected status for token endpoint test`);
      }
    } catch (error) {
      console.log(`   ❌ Token endpoint test failed: ${error.message}`);
    }
  }

  async testCORSAndCSP() {
    try {
      // Test CORS origins
      const { getAllowedOrigins, getCSPOrigins } = await import('../auth-server/middleware/cors.js');
      
      const corsOrigins = await getAllowedOrigins();
      const cspOrigins = await getCSPOrigins();
      
      console.log(`   CORS Origins: ${corsOrigins.length} configured`);
      console.log(`   CSP Origins: ${cspOrigins.length} configured`);
      
      const localhost4001 = 'http://localhost:4001';
      const corsHasLocalhost = corsOrigins.includes(localhost4001);
      const cspHasLocalhost = cspOrigins.includes(localhost4001);
      
      console.log(`   localhost:4001 in CORS: ${corsHasLocalhost ? '✅ Yes' : '❌ No'}`);
      console.log(`   localhost:4001 in CSP: ${cspHasLocalhost ? '✅ Yes' : '❌ No'}`);
      
      if (!corsHasLocalhost || !cspHasLocalhost) {
        console.log(`   ⚠️ localhost:4001 not properly configured for cross-origin requests`);
        console.log(`   💡 This could cause authentication callback failures`);
      }
      
      return { corsOk: corsHasLocalhost, cspOk: cspHasLocalhost };
    } catch (error) {
      console.log(`   ❌ CORS/CSP check failed: ${error.message}`);
      return { corsOk: false, cspOk: false };
    }
  }

  async testUserInfoEndpoint() {
    try {
      const response = await fetch(`${this.baseURL}/userinfo`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-token'
        }
      });

      console.log(`   UserInfo endpoint status: ${response.status}`);
      
      if (response.status === 401) {
        console.log(`   ✅ UserInfo endpoint is working (expected 401 for invalid token)`);
      } else {
        console.log(`   ⚠️ Unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ UserInfo endpoint test failed: ${error.message}`);
    }
  }

  async simulateAuthFlow(clientId) {
    console.log('   Simulating step-by-step authentication flow...');
    
    // Step 1: Initial authorization request
    console.log('   Step 1: Authorization request...');
    const authResult = await this.testAuthorizationEndpoint(clientId);
    if (!authResult.success) {
      console.log('   ❌ Authorization step failed');
      return;
    }
    
    // Step 2: Login simulation
    console.log('   Step 2: Login would happen here...');
    console.log('   ✅ Login page accessible');
    
    // Step 3: Callback simulation  
    console.log('   Step 3: Simulating callback...');
    console.log('   💭 After login, user would be redirected to:');
    console.log('      http://localhost:4001/oauth/callback?code=AUTHORIZATION_CODE&state=STATE');
    
    // Step 4: Token exchange simulation
    console.log('   Step 4: Token exchange simulation...');
    console.log('   💭 Client app would exchange code for tokens at:');
    console.log('      POST /token');
    
    console.log('   ✅ Flow simulation complete');
  }

  async provideDiagnosis(clientId) {
    const issues = [];
    const recommendations = [];
    
    // Check common issues
    try {
      const { default: pool } = await import('../config/database.js');
      const clientResult = await pool.query('SELECT * FROM clients WHERE client_id = ?', [clientId]);
      
      if (clientResult.rows.length === 0) {
        issues.push('Client does not exist in database');
        recommendations.push('Create the client using: node scripts/create-org-viewer-client.js');
      } else {
        const client = clientResult.rows[0];
        
        if (!client.is_active) {
          issues.push('Client is inactive');
          recommendations.push('Activate the client through admin panel');
        }
        
        const redirectUris = JSON.parse(client.redirect_uris);
        if (!redirectUris.includes('http://localhost:4001/oauth/callback')) {
          issues.push('Missing redirect URI for localhost:4001');
          recommendations.push('Add http://localhost:4001/oauth/callback to client redirect URIs');
        }
        
        if (!client.allowed_scopes.includes('organization')) {
          issues.push('Missing organization scope');
          recommendations.push('Add "organization" to allowed scopes');
        }
      }
    } catch (error) {
      issues.push(`Database connection error: ${error.message}`);
      recommendations.push('Check database connection and ensure server is running');
    }
    
    // Check CORS/CSP
    try {
      const corsResult = await this.testCORSAndCSP();
      if (!corsResult.corsOk) {
        issues.push('localhost:4001 not in CORS origins');
        recommendations.push('Refresh CORS configuration or add origin manually');
      }
      if (!corsResult.cspOk) {
        issues.push('localhost:4001 not in CSP origins');
        recommendations.push('Refresh CSP configuration: POST /admin/refresh-csp');
      }
    } catch (error) {
      issues.push('Could not verify CORS/CSP configuration');
    }
    
    // Display diagnosis
    if (issues.length === 0) {
      console.log('✅ No obvious issues detected');
      console.log('💡 If authentication still fails, check:');
      console.log('   - Client application logs');
      console.log('   - Network requests in browser developer tools');
      console.log('   - Server logs for detailed error messages');
    } else {
      console.log('❌ Issues detected:');
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
      
      console.log('\n💡 Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n🔧 Quick fixes to try:');
    console.log('   1. Run: node scripts/create-org-viewer-client.js');
    console.log('   2. Manual CSP refresh: node scripts/test-client-updates.js --refresh-csp');
    console.log('   3. Check server logs: tail -f logs/auth-server.log');
    console.log('   4. Verify client app is making correct requests');
  }

  async generateTestCredentials(clientId) {
    console.log('\n🔑 Test Credentials for Manual Testing:');
    console.log(`Client ID: ${clientId}`);
    
    try {
      const { default: pool } = await import('../config/database.js');
      const result = await pool.query('SELECT client_secret FROM clients WHERE client_id = ?', [clientId]);
      
      if (result.rows.length > 0) {
        console.log(`Client Secret: ${result.rows[0].client_secret}`);
      }
    } catch (error) {
      console.log('Could not retrieve client secret');
    }
    
    console.log('Redirect URI: http://localhost:4001/oauth/callback');
    console.log('Auth URL: http://localhost:3303/oauth2/authorize');
    console.log('Token URL: http://localhost:3303/token');
    console.log('UserInfo URL: http://localhost:3303/userinfo');
    console.log('Scopes: openid profile email organization');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const authDebugger = new AuthFlowDebugger();

  const clientId = args.find(arg => arg.startsWith('--client='))?.replace('--client=', '') || 'org-viewer-client';

  if (args.includes('--help')) {
    console.log('🔍 OAuth Authentication Flow Debugger');
    console.log('');
    console.log('Usage:');
    console.log('  node scripts/debug-auth-flow.js                     # Debug org-viewer-client');
    console.log('  node scripts/debug-auth-flow.js --client=test-app   # Debug specific client');
    console.log('  node scripts/debug-auth-flow.js --help              # Show help');
    return;
  }

  await authDebugger.debugAuthenticationFlow(clientId);
  await authDebugger.generateTestCredentials(clientId);
}

// Export for use in other scripts
export { AuthFlowDebugger };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('❌ Debug script failed:', error.message);
    process.exit(1);
  });
}