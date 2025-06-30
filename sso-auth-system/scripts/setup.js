import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SystemSetup {
  constructor() {
    this.isWindows = os.platform() === 'win32';
    this.projectRoot = path.resolve(__dirname, '..');
    this.employeeImportStats = null; // 🆕 従業員インポート統計を保存

    this.config = {
      server: {
        auth_port: 3303
      },
      jwt: {
        private_key_path: './keys/private.pem',
        public_key_path: './keys/public.pem'
      }
    };
  }

  async setup() {
    console.log('🚀 SSO Authentication System - Complete Setup');
    console.log('⚠️  This will completely reset the system and database');

    try {
      await this.checkDependencies();
      await this.installDependencies();
      await this.cleanDatabase();
      await this.generateKeys();
      await this.setupDatabase();
      await this.runEmployeeDataCheck();
      await this.importEmployeeData(); // 🆕 従業員データインポートを追加

      console.log('\n✅ Complete setup finished!');
      console.log('🔄 Database reset and initialized with fresh data');
      console.log('👥 Demo accounts created:');
      console.log('   📋 Admin: admin / SecurePass123');
      console.log('   👤 User: user0 / UserPass123');
      console.log('📊 Employee data structure analyzed and exported');
      
      // 🆕 インポート統計を表示
      if (this.employeeImportStats) {
        console.log(`👥 Employee data imported: ${this.employeeImportStats.imported} users`);
        if (this.employeeImportStats.skipped > 0) {
          console.log(`   ⏭️  Skipped: ${this.employeeImportStats.skipped} (duplicates)`);
        }
        if (this.employeeImportStats.errors > 0) {
          console.log(`   ❌ Errors: ${this.employeeImportStats.errors}`);
        }
      }
      
      console.log('');
      console.log('🚀 Start command: npm start');
      console.log(`🌐 Access URL: http://localhost:${this.config.server.auth_port}`);
    } catch (error) {
      console.error('❌ Setup error:', error.message);
      process.exit(1);
    }
  }

  async checkDependencies() {
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
      const major = parseInt(nodeVersion.replace('v', '').split('.')[0]);
      if (major < 16) {
        throw new Error(`Node.js 16+ required (current: ${nodeVersion})`);
      }
      console.log(`✅ Node.js ${nodeVersion}`);
    } catch (error) {
      console.log('Please install Node.js 16 or higher');
      throw error;
    }
  }

  async installDependencies() {
    console.log('📦 Installing dependencies...');

    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`package.json not found at ${packageJsonPath}`);
      }

      execSync('npm install', {
        stdio: 'inherit',
        cwd: this.projectRoot
      });

      console.log('✅ Dependencies installed');
    } catch (error) {
      console.error('npm package installation failed');
      throw error;
    }
  }

  async cleanDatabase() {
    console.log('🗄️ Cleaning existing database...');
    
    try {
      // 可能なデータベースファイルの場所を確認
      const possibleDbPaths = [
        path.join(this.projectRoot, 'auth-server', 'database', 'auth_db.sqlite'),
        path.join(this.projectRoot, 'database', 'auth_db.sqlite'),
        path.join(this.projectRoot, 'auth_db.sqlite')
      ];

      // .envファイルからDATABASE_PATHを読み取り
      const envPath = path.join(this.projectRoot, 'auth-server', '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const dbPathMatch = envContent.match(/DATABASE_PATH=(.+)/);
        if (dbPathMatch) {
          const envDbPath = dbPathMatch[1].replace(/["']/g, '');
          const resolvedPath = path.isAbsolute(envDbPath) 
            ? envDbPath 
            : path.resolve(this.projectRoot, envDbPath);
          possibleDbPaths.unshift(resolvedPath);
        }
      }

      let deletedCount = 0;
      
      for (const dbPath of possibleDbPaths) {
        if (fs.existsSync(dbPath)) {
          try {
            fs.unlinkSync(dbPath);
            console.log(`  🗑️ Deleted: ${path.relative(this.projectRoot, dbPath)}`);
            deletedCount++;
          } catch (error) {
            console.warn(`  ⚠️ Could not delete ${dbPath}: ${error.message}`);
          }
        }
      }

      // WALファイルとSHMファイルも削除
      for (const dbPath of possibleDbPaths) {
        const walPath = dbPath + '-wal';
        const shmPath = dbPath + '-shm';
        
        if (fs.existsSync(walPath)) {
          try {
            fs.unlinkSync(walPath);
            console.log(`  🗑️ Deleted WAL file: ${path.relative(this.projectRoot, walPath)}`);
          } catch (error) {
            console.warn(`  ⚠️ Could not delete WAL file: ${error.message}`);
          }
        }
        
        if (fs.existsSync(shmPath)) {
          try {
            fs.unlinkSync(shmPath);
            console.log(`  🗑️ Deleted SHM file: ${path.relative(this.projectRoot, shmPath)}`);
          } catch (error) {
            console.warn(`  ⚠️ Could not delete SHM file: ${error.message}`);
          }
        }
      }

      if (deletedCount === 0) {
        console.log('  ℹ️ No existing database files found (fresh installation)');
      } else {
        console.log(`✅ Database cleanup completed (${deletedCount} files removed)`);
      }

    } catch (error) {
      console.error('Database cleanup failed:', error);
      throw error;
    }
  }

  async generateKeys() {
    console.log('🔑 Generating RSA key pair...');
    const keysDir = path.join(this.projectRoot, 'keys');

    try {
      // キーディレクトリをクリーンアップ
      if (fs.existsSync(keysDir)) {
        const files = fs.readdirSync(keysDir);
        for (const file of files) {
          if (file.endsWith('.pem')) {
            fs.unlinkSync(path.join(keysDir, file));
            console.log(`  🗑️ Removed old key: ${file}`);
          }
        }
      } else {
        fs.mkdirSync(keysDir, { recursive: true });
      }

      const privateKeyPath = path.join(keysDir, path.basename(this.config.jwt.private_key_path));
      const publicKeyPath = path.join(keysDir, path.basename(this.config.jwt.public_key_path));

      try {
        execSync(`openssl genpkey -algorithm RSA -out "${privateKeyPath}" -pkcs8 -pass pass:`,
          { stdio: 'pipe' });

        execSync(`openssl rsa -pubout -in "${privateKeyPath}" -out "${publicKeyPath}"`,
          { stdio: 'pipe' });

        console.log('✅ RSA key pair generated (OpenSSL)');
      } catch (opensslError) {
        const crypto = await import('crypto');
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        fs.writeFileSync(privateKeyPath, privateKey);
        fs.writeFileSync(publicKeyPath, publicKey);
        console.log('✅ RSA key pair generated (Node.js crypto)');
      }
    } catch (error) {
      console.error('RSA key pair generation failed');
      throw error;
    }
  }

  async setupDatabase() {
    console.log('🗄️ Setting up fresh database...');
    try {
      const envPath = path.join(this.projectRoot, 'auth-server', '.env');
      if (!fs.existsSync(envPath)) {
        const envExamplePath = envPath + '.example';
        if (fs.existsSync(envExamplePath)) {
          fs.copyFileSync(envExamplePath, envPath);
          console.log('✅ .env file created from template');
        }
      }

      // 🔧 パスワードハッシュ生成能力の確認
      try {
        const bcrypt = await import('bcrypt');
        const testHash = await bcrypt.hash('SecurePass123', 12);
        console.log('✅ Password hashing capability verified');
        console.log(`  Sample hash: ${testHash.substring(0, 20)}...`);
      } catch (hashError) {
        console.warn('⚠️ bcrypt not available for password hashing:', hashError.message);
      }

      // マイグレーション実行
      console.log('📋 Running database migrations...');
      const { runMigrations } = await import('./migrate.js');
      await runMigrations();
      console.log('✅ Database migrations completed');

      // シード実行  
      console.log('🌱 Seeding fresh database data...');
      const { runSeeds } = await import('./seed.js');
      await runSeeds();
      console.log('✅ Database seeding completed');

      console.log('✅ Fresh database setup completed');
    } catch (error) {
      console.error('Database setup failed');
      throw error;
    }
  }

  // 🆕 従業員データチェック機能を追加
  async runEmployeeDataCheck() {
    console.log('👥 Running employee data structure analysis...');
    
    try {
      const createEmployeeScriptPath = path.join(this.projectRoot, 'create_employee.js');
      
      // create_employee.jsファイルの存在確認
      if (!fs.existsSync(createEmployeeScriptPath)) {
        console.log('  ℹ️ create_employee.js not found, skipping employee data analysis');
        return;
      }

      console.log('  📊 Analyzing organization structure and generating employee data...');

      // create_employee.jsを実行
      try {
        execSync('node create_employee.js', {
          stdio: 'inherit',
          cwd: this.projectRoot,
          timeout: 30000 // 30秒タイムアウト
        });
        
        console.log('✅ Employee data analysis completed'); // data/employees.jsonが生成される
        
        // 生成されたファイルの確認
        const dataDir = path.join(this.projectRoot, 'data');
        if (fs.existsSync(dataDir)) {
          const files = fs.readdirSync(dataDir);
          const generatedFiles = files.filter(file => 
            file.endsWith('.json') || file.endsWith('.md')
          );
          
          if (generatedFiles.length > 0) {
            console.log('  📄 Generated files:');
            generatedFiles.forEach(file => {
              const filePath = path.join(dataDir, file);
              const stats = fs.statSync(filePath);
              const size = (stats.size / 1024).toFixed(2);
              console.log(`    - ${file} (${size} KB)`);
            });
          }
        }
        
      } catch (execError) {
        console.warn(`  ⚠️ Employee data check execution failed: ${execError.message}`);
        
        // より詳細なエラー情報
        if (execError.status) {
          console.warn(`    Exit code: ${execError.status}`);
        }
        if (execError.signal) {
          console.warn(`    Signal: ${execError.signal}`);
        }
      }
      
    } catch (error) {
      // 非致命的エラーとして処理
      console.warn(`  ⚠️ Employee data analysis warning: ${error.message}`);
    }
  }

  // 🆕 従業員データインポート機能を追加
  async importEmployeeData() {
    console.log('👤 Importing employee data to user database...');
    
    try {
      // employee.jsonファイルの存在確認
      const employeeJsonPath = path.join(this.projectRoot, 'data', 'employee.json');
      
      if (!fs.existsSync(employeeJsonPath)) {
        console.log('  ℹ️ employee.json not found, skipping employee data import');
        console.log('  💡 Employee data will only contain admin and demo users');
        return;
      }

      // EmployeeImporterクラスをインポート
      const { EmployeeImporter } = await import('./import-employees.js');
      const importer = new EmployeeImporter();

      // インポート設定
      const importOptions = {
        filename: 'employee.json',
        batchSize: 100,          // セットアップ時は高速処理
        defaultPassword: 'Employee2024!', // 従業員共通パスワード
        passwordStrategy: 'default',      // 全員同じパスワード
        dryRun: false           // 実際にインポート
      };

      console.log(`  📄 Source: ${importOptions.filename}`);
      console.log(`  🔐 Password: ${importOptions.defaultPassword} (for all employees)`);
      console.log(`  📦 Batch size: ${importOptions.batchSize}`);

      // インポート実行
      const result = await importer.importEmployees(importOptions);
      
      if (result.success) {
        this.employeeImportStats = result; // 統計を保存
        console.log('✅ Employee data import completed successfully');
        console.log(`  👥 Imported: ${result.imported} employees`);
        
        if (result.skipped > 0) {
          console.log(`  ⏭️  Skipped: ${result.skipped} (already exist)`);
        }
        
        if (result.errors > 0) {
          console.log(`  ❌ Errors: ${result.errors} employees failed to import`);
        }
        
        // サンプル従業員の認証情報を表示
        const sampleEmployees = await this.getSampleEmployees(5);
        if (sampleEmployees.length > 0) {
          console.log('  🔐 Sample employee login credentials:');
          sampleEmployees.forEach(emp => {
            console.log(`    👤 ${emp.name}: ${emp.username} / ${importOptions.defaultPassword}`);
          });
          console.log(`    💡 All ${result.imported} employees use password: ${importOptions.defaultPassword}`);
        }
        
      } else {
        console.warn(`⚠️ Employee data import failed: ${result.error}`);
        console.log('  📋 System will continue with admin and demo users only');
      }
      
    } catch (error) {
      // 非致命的エラーとして処理
      console.warn(`  ⚠️ Employee import warning: ${error.message}`);
      console.log('  📋 System will continue with admin and demo users only');
    }
  }

  // 🆕 サンプル従業員取得
  async getSampleEmployees(count = 5) {
    try {
      const employeeJsonPath = path.join(this.projectRoot, 'data', 'employee.json');
      
      if (!fs.existsSync(employeeJsonPath)) {
        return [];
      }

      const fileContent = fs.readFileSync(employeeJsonPath, 'utf8');
      const data = JSON.parse(fileContent);
      const employees = data.employees || data;
      
      if (!Array.isArray(employees)) {
        return [];
      }

      // 様々な部署から従業員をサンプリング
      const departments = [...new Set(employees.map(emp => emp.department))];
      const samples = [];
      
      for (const dept of departments) {
        const deptEmployees = employees.filter(emp => emp.department === dept);
        if (deptEmployees.length > 0) {
          const sample = deptEmployees[0];
          samples.push({
            name: sample.name,
            username: this.generateUsername(sample),
            department: sample.department,
            position: sample.position
          });
          
          if (samples.length >= count) break;
        }
      }
      
      return samples;
      
    } catch (error) {
      console.warn('Failed to get sample employees:', error.message);
      return [];
    }
  }

  // 🆕 ユーザー名生成（import-employees.jsと同じロジック）
  generateUsername(employee) {
    // Use employee email prefix or generate from name
    if (employee.email && employee.email.includes('@')) {
      const emailPrefix = employee.email.split('@')[0];
      // Clean up email prefix
      return emailPrefix.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // Fallback: generate from name
    const cleanName = employee.name
      .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z\s]/g, '')
      .trim();
    
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      // For Japanese names: surname + given name
      return `${parts[0]}${parts[1]}`.toLowerCase().replace(/\s/g, '');
    }
    
    return cleanName.toLowerCase().replace(/\s/g, '');
  }

  async showCompletionInfo() {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SSO Authentication System Setup Complete!');
    console.log('='.repeat(60));
    console.log('');
    console.log('📋 System Status:');
    console.log('   ✅ Dependencies installed');
    console.log('   ✅ Database reset and initialized');
    console.log('   ✅ RSA keys generated');
    console.log('   ✅ Demo accounts created');
    console.log('   ✅ Employee data structure analyzed');
    
    // 🆕 インポート統計の表示
    if (this.employeeImportStats) {
      console.log(`   ✅ Employee users imported (${this.employeeImportStats.imported} users)`);
    } else {
      console.log('   ℹ️ No employee data imported (admin/demo only)');
    }
    
    console.log('');
    console.log('👥 Available User Accounts:');
    console.log('');
    console.log('   🔴 System Administrator:');
    console.log('      Username: admin');
    console.log('      Password: SecurePass123');
    console.log('      Access: Full admin panel access');
    console.log('');
    console.log('   🔵 Demo User:');
    console.log('      Username: user0');
    console.log('      Password: UserPass123');
    console.log('      Access: Standard user features');
    
    // 🆕 従業員アカウント情報
    if (this.employeeImportStats && this.employeeImportStats.imported > 0) {
      console.log('');
      console.log('   👥 Employee Accounts:');
      console.log(`      Count: ${this.employeeImportStats.imported} users`);
      console.log('      Password: Employee2024! (for all employees)');
      console.log('      Username: Generated from email or name');
      console.log('      Access: Standard user features');
      
      // サンプル従業員の表示
      const samples = await this.getSampleEmployees(3);
      if (samples.length > 0) {
        console.log('      Examples:');
        samples.forEach(emp => {
          console.log(`        ${emp.username} (${emp.name} - ${emp.department})`);
        });
      }
    }
    
    console.log('');
    console.log('📊 Generated Files:');
    console.log('   📄 Employee data and organization structure');
    console.log('   📋 Markdown reports in data/ folder');
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Run: npm start');
    console.log(`   2. Open: http://localhost:${this.config.server.auth_port}`);
    console.log('   3. Test login with any available account');
    console.log('   4. Review generated organization reports');
    
    // 🆕 従業員管理の追加情報
    if (this.employeeImportStats && this.employeeImportStats.imported > 0) {
      console.log('   5. Access admin panel to manage employee accounts');
      console.log('   6. Import additional employees: node scripts/import-employees.js');
    }
    
    console.log('');
    console.log('🛡️ Security Notes:');
    console.log('   ⚠️ Change default passwords in production');
    console.log('   ⚠️ Update JWT secrets in config/config.yaml');
    console.log('   ⚠️ Configure proper CORS origins');
    
    // 🆕 従業員パスワードのセキュリティ注意
    if (this.employeeImportStats && this.employeeImportStats.imported > 0) {
      console.log('   ⚠️ Employee password (Employee2024!) should be changed');
      console.log('   💡 Use admin panel to update individual passwords');
    }
    
    console.log('');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const setup = new SystemSetup();
  setup.setup().then(() => {
    setup.showCompletionInfo();
  }).catch(console.error);
}

export default SystemSetup;