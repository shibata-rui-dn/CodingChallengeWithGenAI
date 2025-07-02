import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', 'auth-server', '.env') });

async function checkColumnExists(pool, tableName, columnName) {
  try {
    const result = pool.rawDb.prepare(`PRAGMA table_info(${tableName})`).all();
    return result.some(column => column.name === columnName);
  } catch (error) {
    console.error('Error checking column existence:', error);
    return false;
  }
}

async function runMigrations() {
  console.log('🔄 Running database migrations...');
  
  try {
    const { default: pool } = await import('../config/database.js');
    
    const migrationsDir = path.join(__dirname, '..', 'auth-server', 'database', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('Migrations directory not found');
      return;
    }

    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      console.log(`Executing: ${file}`);
      
      // Special handling for the role column migration
      if (file === '006_add_user_roles.sql') {
        const roleColumnExists = await checkColumnExists(pool, 'users', 'role');
        
        if (!roleColumnExists) {
          // Add the role column
          try {
            pool.rawDb.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT \'user\'');
            console.log('  ✅ Added role column to users table');
          } catch (error) {
            console.error(`  ❌ Failed to add role column: ${error.message}`);
            throw error;
          }
        } else {
          console.log('  ⚠️ Role column already exists, skipping column addition');
        }
        
        // Run the remaining SQL (updates and index creation)
        try {
          // Update existing admin user to have admin role
          pool.rawDb.exec("UPDATE users SET role = 'admin' WHERE username = 'admin' AND (role IS NULL OR role != 'admin')");
          
          // Update other users to have user role if they don't have one set
          pool.rawDb.exec("UPDATE users SET role = 'user' WHERE role IS NULL");
          
          // Create index for role field
          pool.rawDb.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
          
          console.log('  ✅ Updated user roles and created index');
        } catch (error) {
          console.warn(`  ⚠️ Warning during role updates: ${error.message}`);
        }
        
        console.log(`  ✅ ${file} completed`);
        continue;
      }

      // 🆕 Special handling for the enhanced origins table migration
      if (file === '007_enhance_origins_table.sql') {
        const autoAddedExists = await checkColumnExists(pool, 'allowed_origins', 'auto_added');
        const sourceClientExists = await checkColumnExists(pool, 'allowed_origins', 'source_client_id');
        const originTypeExists = await checkColumnExists(pool, 'allowed_origins', 'origin_type');
        
        if (!autoAddedExists) {
          try {
            pool.rawDb.exec('ALTER TABLE allowed_origins ADD COLUMN auto_added BOOLEAN DEFAULT 0');
            console.log('  ✅ Added auto_added column to allowed_origins table');
          } catch (error) {
            console.warn(`  ⚠️ Warning adding auto_added column: ${error.message}`);
          }
        }
        
        if (!sourceClientExists) {
          try {
            pool.rawDb.exec('ALTER TABLE allowed_origins ADD COLUMN source_client_id TEXT');
            console.log('  ✅ Added source_client_id column to allowed_origins table');
          } catch (error) {
            console.warn(`  ⚠️ Warning adding source_client_id column: ${error.message}`);
          }
        }
        
        if (!originTypeExists) {
          try {
            pool.rawDb.exec('ALTER TABLE allowed_origins ADD COLUMN origin_type TEXT DEFAULT \'manual\'');
            console.log('  ✅ Added origin_type column to allowed_origins table');
          } catch (error) {
            console.warn(`  ⚠️ Warning adding origin_type column: ${error.message}`);
          }
        }
        
        // Create indexes
        try {
          pool.rawDb.exec('CREATE INDEX IF NOT EXISTS idx_allowed_origins_auto_added ON allowed_origins(auto_added)');
          pool.rawDb.exec('CREATE INDEX IF NOT EXISTS idx_allowed_origins_source_client ON allowed_origins(source_client_id)');
          pool.rawDb.exec('CREATE INDEX IF NOT EXISTS idx_allowed_origins_type ON allowed_origins(origin_type)');
          console.log('  ✅ Created indexes for enhanced origins table');
        } catch (error) {
          console.warn(`  ⚠️ Warning creating indexes: ${error.message}`);
        }
        
        // Update existing origins
        try {
          pool.rawDb.exec("UPDATE allowed_origins SET origin_type = 'manual', auto_added = 0 WHERE auto_added IS NULL OR origin_type IS NULL");
          console.log('  ✅ Updated existing origins with default values');
        } catch (error) {
          console.warn(`  ⚠️ Warning updating existing origins: ${error.message}`);
        }
        
        console.log(`  ✅ ${file} completed`);
        continue;
      }
      
      // Regular migration handling for other files
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      try {
        const statements = sql.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
          if (statement.trim()) {
            pool.rawDb.exec(statement.trim());
          }
        }
        
        console.log(`  ✅ ${file} completed`);
      } catch (error) {
        console.error(`  ❌ ${file} failed:`, error.message);
        throw error;
      }
    }
    
    console.log('✅ Migration completed');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch(console.error);
}

export { runMigrations };