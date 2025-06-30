import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', 'auth-server', '.env') });

async function getConfigSafely() {
  try {
    const { getConfig } = await import('../config/configLoader.js');
    return getConfig();
  } catch (error) {
    console.warn('Config loading failed, using defaults:', error.message);
    return {
      demo: { 
        admin: {
          username: 'admin',
          password: 'SecurePass123'
        },
        user: {
          username: 'user0',
          password: 'UserPass123'
        }
      },
      security: { bcrypt_rounds: 12 }
    };
  }
}

async function generatePasswordHash(password, rounds = 12) {
  try {
    const hash = await bcrypt.hash(password, rounds);
    console.log(`  🔐 Generated hash: ${hash.substring(0, 20)}...`);
    return hash;
  } catch (error) {
    console.error('❌ Password hash generation failed:', error);
    throw error;
  }
}

async function seedUsers(pool) {
  console.log('👥 Seeding users with dynamic password hashes...');
  
  try {
    const config = await getConfigSafely();
    const bcryptRounds = config.security?.bcrypt_rounds || 12;
    
    console.log(`  🔧 Bcrypt rounds: ${bcryptRounds}`);
    
    const users = [
      { 
        username: config.demo?.admin?.username || 'admin',
        email: 'admin@company.com', 
        firstName: 'System', 
        lastName: 'Administrator', 
        role: 'admin',
        password: config.demo?.admin?.password || 'SecurePass123',
        department: '-',
        team: '-',
        supervisor: '-'
      },
      { 
        username: config.demo?.user?.username || 'user0',
        email: 'user0@company.com', 
        firstName: 'Demo', 
        lastName: 'User', 
        role: 'user',
        password: config.demo?.user?.password || 'UserPass123',
        department: '-',
        team: '-',
        supervisor: '-'
      }
    ];
    
    for (const userData of users) {
      try {
        console.log(`  📝 Using password for ${userData.username}: "${userData.password}"`);
        const passwordHash = await generatePasswordHash(userData.password, bcryptRounds);
        
        const result = pool.query(
          `INSERT OR IGNORE INTO users (username, email, password_hash, first_name, last_name, role, department, team, supervisor) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userData.username, userData.email, passwordHash, userData.firstName, userData.lastName, userData.role, userData.department, userData.team, userData.supervisor]
        );
        
        if (result.rowCount > 0) {
          console.log(`  ✅ User '${userData.username}' created with role '${userData.role}' and organization fields`);
        } else {
          const updateResult = pool.query(
            'UPDATE users SET password_hash = ?, role = ?, department = ?, team = ?, supervisor = ? WHERE username = ?',
            [passwordHash, userData.role, userData.department, userData.team, userData.supervisor, userData.username]
          );
          console.log(`  🔄 User '${userData.username}' updated with role '${userData.role}' and organization fields`);
        }
      } catch (error) {
        console.error(`❌ Failed to create/update user '${userData.username}':`, error.message);
        throw error;
      }
    }
    
    console.log('✅ User seeding completed');
    
  } catch (error) {
    console.error('❌ User seeding failed:', error);
    throw error;
  }
}

async function seedClients(pool) {
  console.log('🔑 Seeding OAuth clients...');
  
  try {
    const clients = [
      {
        clientId: 'demo-client',
        clientSecret: 'demo-secret-change-in-production',
        name: 'Demo Application',
        // 🔧 修正: /oauth/callback に変更
        redirectUris: '["http://localhost:3000/oauth/callback"]',
        allowedScopes: 'openid profile email organization'
      },
      {
        clientId: 'test-app',
        clientSecret: 'test-secret-change-in-production',
        name: 'Test Application',
        // 🔧 修正: 両方のパターンをサポート
        redirectUris: '["http://localhost:3000/auth/callback", "http://localhost:3000/oauth/callback"]',
        allowedScopes: 'openid profile email organization'
      },
      {
        clientId: 'admin-panel',
        clientSecret: 'admin-secret-change-in-production',
        name: 'Admin Panel',
        redirectUris: '["http://localhost:3303/admin/callback"]',
        allowedScopes: 'openid profile email admin organization'
      }
    ];
    
    for (const client of clients) {
      try {
        const result = pool.query(
          `INSERT OR REPLACE INTO clients (client_id, client_secret, name, redirect_uris, allowed_scopes) 
           VALUES (?, ?, ?, ?, ?)`,
          [client.clientId, client.clientSecret, client.name, client.redirectUris, client.allowedScopes]
        );
        
        console.log(`  ✅ Client '${client.clientId}' updated with correct redirect URIs`);
        
      } catch (error) {
        console.error(`❌ Failed to update client '${client.clientId}':`, error.message);
        throw error;
      }
    }
    
    console.log('✅ Client seeding completed with fixed redirect URIs');
    
  } catch (error) {
    console.error('❌ Client seeding failed:', error);
    throw error;
  }
}

async function runSeeds() {
  console.log('🌱 Seeding database with dynamic data generation...');
  
  try {
    const { default: pool } = await import('../config/database.js');
    
    await seedUsers(pool);
    await seedClients(pool);
    
    console.log('✅ Database seeding completed successfully');
    console.log('💡 All password hashes generated fresh for maximum security');
    console.log('🔐 Admin user with admin role and user0 with user role created');
    console.log('🏢 Admin panel OAuth client created with proper callback URL');
    console.log('👥 Both admin and user demo accounts available on login page');
    console.log('🏢 Organization fields (department, team, supervisor) initialized to "-" for demo accounts');
    
  } catch (error) {
    console.error('❌ Seed error:', error);
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeeds().catch(console.error);
}

export { runSeeds };