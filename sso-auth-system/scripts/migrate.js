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