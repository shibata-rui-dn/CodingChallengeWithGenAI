import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmployeeImporter {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.importedCount = 0;
        this.skippedCount = 0;
        this.errorCount = 0;
        this.errors = [];
    }

    async importEmployees(options = {}) {
        const {
            filename = 'employee.json',
            batchSize = 50,
            defaultPassword = 'Welcome123!',
            passwordStrategy = 'default', // 'default', 'employeeId', 'name'
            dryRun = false,
            silent = false // 🆕 サイレントモード追加
        } = options;

        if (!silent) {
            console.log('👥 SSO Employee Import System');
            console.log('='.repeat(50));
            console.log(`📄 Source file: ${filename}`);
            console.log(`🔐 Password strategy: ${passwordStrategy}`);
            console.log(`📦 Batch size: ${batchSize}`);
            console.log(`🧪 Dry run: ${dryRun ? 'Yes' : 'No'}`);
            console.log('');
        }

        try {
            // 1. Load employee data
            const employees = await this.loadEmployeeData(filename, silent);
            if (!silent) {
                console.log(`📊 Loaded ${employees.length} employees from ${filename}`);
            }

            // 2. Initialize database
            const pool = await this.initializeDatabase(silent);

            // 3. Get config for password hashing
            const config = await this.getConfigSafely();
            const bcryptRounds = config.security?.bcrypt_rounds || 12;

            // 4. Process employees in batches
            const batches = this.createBatches(employees, batchSize);
            if (!silent) {
                console.log(`📦 Processing ${batches.length} batches of up to ${batchSize} employees each`);
                console.log('');
            }

            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                if (!silent) {
                    console.log(`🔄 Processing batch ${i + 1}/${batches.length} (${batch.length} employees)...`);
                }

                await this.processBatch(batch, pool, bcryptRounds, passwordStrategy, defaultPassword, dryRun);

                // Show progress
                if (!silent) {
                    const processed = (i + 1) * batchSize;
                    const total = employees.length;
                    const progress = Math.min(100, ((processed / total) * 100)).toFixed(1);
                    console.log(`   📈 Progress: ${progress}% (${Math.min(processed, total)}/${total})`);
                }

                // Small delay to prevent overwhelming the system
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            if (!silent) {
                console.log('');
                console.log('✅ Employee import completed!');
                console.log('📊 Import Statistics:');
                console.log(`   ✅ Imported: ${this.importedCount} employees`);
                console.log(`   ⏭️  Skipped: ${this.skippedCount} employees (already exist)`);
                console.log(`   ❌ Errors: ${this.errorCount} employees`);

                if (this.errors.length > 0) {
                    console.log('\n⚠️ Error Details:');
                    this.errors.slice(0, 10).forEach((error, index) => {
                        console.log(`   ${index + 1}. ${error.employee} - ${error.message}`);
                    });
                    if (this.errors.length > 10) {
                        console.log(`   ... and ${this.errors.length - 10} more errors`);
                    }
                }

                // Sample login info
                if (this.importedCount > 0 && !dryRun) {
                    console.log('\n🔐 Sample Login Credentials:');
                    const sampleEmployees = employees.slice(0, 3);
                    for (const emp of sampleEmployees) {
                        const username = this.generateUsername(emp);
                        const password = this.generatePassword(emp, passwordStrategy, defaultPassword);
                        console.log(`   👤 ${emp.name} (${emp.department} - ${emp.team}): ${username} / ${password}`);
                    }
                    console.log('   💡 All other employees use the same password pattern');
                }
            }

            return {
                success: true,
                imported: this.importedCount,
                skipped: this.skippedCount,
                errors: this.errorCount,
                total: employees.length
            };

        } catch (error) {
            if (!silent) {
                console.error('❌ Employee import failed:', error.message);
            }
            return {
                success: false,
                error: error.message,
                imported: this.importedCount,
                skipped: this.skippedCount,
                errors: this.errorCount
            };
        }
    }

    async loadEmployeeData(filename, silent = false) {
        const filePath = path.join(this.projectRoot, 'data', filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Employee data file not found: ${filePath}\nPlease run: node create_employee.js first`);
        }

        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);

            // Handle both direct array and wrapped format
            const employees = data.employees || data;

            if (!Array.isArray(employees)) {
                throw new Error('Employee data should be an array');
            }

            if (employees.length === 0) {
                throw new Error('No employees found in data file');
            }

            // Validate employee data structure
            const requiredFields = ['name', 'email', 'employeeId'];
            const invalidEmployees = employees.filter(emp =>
                !requiredFields.every(field => emp[field])
            );

            if (invalidEmployees.length > 0 && !silent) {
                console.warn(`⚠️ Found ${invalidEmployees.length} employees with missing required fields (will be skipped)`);
            }

            const validEmployees = employees.filter(emp =>
                requiredFields.every(field => emp[field])
            );

            if (!silent) {
                console.log(`✅ Validated ${validEmployees.length} employees`);
            }
            return validEmployees;

        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON in employee data file: ${error.message}`);
            }
            throw error;
        }
    }

    async initializeDatabase(silent = false) {
        try {
            const { default: pool } = await import('../config/database.js');

            // Test database connection
            await pool.query('SELECT 1');
            if (!silent) {
                console.log('✅ Database connection established');
            }

            return pool;
        } catch (error) {
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }

    async getConfigSafely() {
        try {
            const { getConfig } = await import('../config/configLoader.js');
            return getConfig();
        } catch (error) {
            console.warn('⚠️ Config loading failed, using defaults');
            return {
                security: { bcrypt_rounds: 12 }
            };
        }
    }

    createBatches(employees, batchSize) {
        const batches = [];
        for (let i = 0; i < employees.length; i += batchSize) {
            batches.push(employees.slice(i, i + batchSize));
        }
        return batches;
    }

    async processBatch(batch, pool, bcryptRounds, passwordStrategy, defaultPassword, dryRun) {
        for (const employee of batch) {
            try {
                await this.processEmployee(employee, pool, bcryptRounds, passwordStrategy, defaultPassword, dryRun);
            } catch (error) {
                this.errorCount++;
                this.errors.push({
                    employee: employee.name || employee.email || 'Unknown',
                    message: error.message
                });
            }
        }
    }

    async processEmployee(employee, pool, bcryptRounds, passwordStrategy, defaultPassword, dryRun) {
        // Generate username and password
        const username = this.generateUsername(employee);
        const password = this.generatePassword(employee, passwordStrategy, defaultPassword);

        // Check for existing user
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, employee.email]
        );

        if (existingUser.rows.length > 0) {
            this.skippedCount++;
            return;
        }

        if (dryRun) {
            this.importedCount++;
            return;
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, bcryptRounds);

        // Parse name
        const { firstName, lastName } = this.parseName(employee.name);

        // 🆕 Extract organization information
        const department = employee.department || '-';
        const team = employee.team || '-';
        const supervisor = employee.supervisor || '-';

        // Insert user with organization fields
        const result = await pool.query(
            `INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active, department, team, supervisor) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                username,
                employee.email,
                passwordHash,
                firstName,
                lastName,
                'user', // All employees are regular users
                1, // Active by default
                department,
                team,
                supervisor
            ]
        );

        if (result.rowCount > 0) {
            this.importedCount++;
        }
    }

    generateUsername(employee) {
        // Use employee email prefix or generate from name
        if (employee.email && employee.email.includes('@')) {
            const emailPrefix = employee.email.split('@')[0];

            // 🔧 修正: ドットやハイフンをアンダースコアに置き換え
            let username = emailPrefix.toLowerCase()
                .replace(/\./g, '_')        // ドット → アンダースコア
                .replace(/-/g, '_')         // ハイフン → アンダースコア  
                .replace(/[^a-z0-9_]/g, '') // その他特殊文字削除
                .replace(/_+/g, '_')        // 連続アンダースコア→1つに
                .replace(/^_|_$/g, '');     // 先頭末尾アンダースコア削除

            return username;
        }

        // Fallback: generate from name  
        const cleanName = employee.name
            .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z\s]/g, '')
            .trim();

        const parts = cleanName.split(/\s+/);
        if (parts.length >= 2) {
            return `${parts[0]}_${parts[1]}`.toLowerCase();
        }

        return cleanName.toLowerCase().replace(/\s/g, '');
    }

    generatePassword(employee, strategy, defaultPassword) {
        switch (strategy) {
            case 'employeeId':
                if (employee.employeeId) {
                    return `${employee.employeeId}@kk`;
                }
                return defaultPassword;

            case 'name':
                const nameParts = employee.name.split(/\s+/);
                if (nameParts.length >= 2) {
                    return `${nameParts[1]}${nameParts[0]}123`;
                }
                return defaultPassword;

            case 'default':
            default:
                return defaultPassword;
        }
    }

    parseName(fullName) {
        const parts = fullName.trim().split(/\s+/);

        if (parts.length >= 2) {
            // Japanese name format: 姓 名
            return {
                firstName: parts.slice(1).join(' '), // 名
                lastName: parts[0] // 姓
            };
        }

        return {
            firstName: fullName,
            lastName: ''
        };
    }

    async clearEmployees(keepAdmin = true) {
        console.log('🗑️ Clearing existing employee data...');

        try {
            const pool = await this.initializeDatabase(true); // silent = true

            let query = 'DELETE FROM users WHERE role = ?';
            let params = ['user'];

            if (!keepAdmin) {
                query = 'DELETE FROM users';
                params = [];
            }

            const result = await pool.query(query, params);
            console.log(`✅ Removed ${result.rowCount} employee records`);

            return result.rowCount;
        } catch (error) {
            console.error('❌ Failed to clear employees:', error.message);
            throw error;
        }
    }

    async getImportStatistics() {
        try {
            const pool = await this.initializeDatabase(true); // silent = true

            const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
          COUNT(DISTINCT department) as department_count,
          COUNT(DISTINCT team) as team_count
        FROM users
      `);

            return stats.rows[0];
        } catch (error) {
            console.error('❌ Failed to get statistics:', error.message);
            return null;
        }
    }

    // 🆕 部署別統計の取得
    async getDepartmentStatistics() {
        try {
            const pool = await this.initializeDatabase(true);

            const stats = await pool.query(`
        SELECT 
          department,
          COUNT(*) as employee_count,
          COUNT(DISTINCT team) as team_count
        FROM users 
        WHERE role = 'user' AND department != '-'
        GROUP BY department
        ORDER BY employee_count DESC
      `);

            return stats.rows;
        } catch (error) {
            console.error('❌ Failed to get department statistics:', error.message);
            return [];
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const importer = new EmployeeImporter();

    // Parse command line arguments
    const options = {
        filename: 'employee.json',
        batchSize: 50,
        defaultPassword: 'Welcome123!',
        passwordStrategy: 'default',
        dryRun: false
    };

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];

        switch (key) {
            case '--file':
                options.filename = value;
                break;
            case '--batch':
                options.batchSize = parseInt(value) || 50;
                break;
            case '--password':
                options.defaultPassword = value;
                break;
            case '--strategy':
                options.passwordStrategy = value;
                break;
            case '--dry-run':
                options.dryRun = true;
                i--; // No value for this flag
                break;
            case '--clear':
                await importer.clearEmployees(true);
                return;
            case '--clear-all':
                await importer.clearEmployees(false);
                return;
            case '--stats':
                const stats = await importer.getImportStatistics();
                if (stats) {
                    console.log('📊 User Statistics:');
                    console.log(`   Total Users: ${stats.total_users}`);
                    console.log(`   Admins: ${stats.admin_count}`);
                    console.log(`   Employees: ${stats.user_count}`);
                    console.log(`   Active: ${stats.active_users}`);
                    console.log(`   Departments: ${stats.department_count}`);
                    console.log(`   Teams: ${stats.team_count}`);
                }

                const deptStats = await importer.getDepartmentStatistics();
                if (deptStats.length > 0) {
                    console.log('\n📈 Department Breakdown:');
                    deptStats.forEach(dept => {
                        console.log(`   ${dept.department}: ${dept.employee_count} employees, ${dept.team_count} teams`);
                    });
                }
                return;
            case '--help':
                console.log('🔧 Employee Import Tool Usage:');
                console.log('');
                console.log('Import employees:');
                console.log('  node scripts/import-employees.js');
                console.log('');
                console.log('Options:');
                console.log('  --file <filename>       Source JSON file (default: employee.json)');
                console.log('  --batch <size>          Batch size (default: 50)');
                console.log('  --password <password>   Default password (default: Welcome123!)');
                console.log('  --strategy <strategy>   Password strategy: default|employeeId|name');
                console.log('  --dry-run              Test run without database changes');
                console.log('');
                console.log('Management:');
                console.log('  --clear                Clear employee users (keep admins)');
                console.log('  --clear-all            Clear all users');
                console.log('  --stats                Show user and department statistics');
                console.log('  --help                 Show this help');
                console.log('');
                console.log('Examples:');
                console.log('  node scripts/import-employees.js --dry-run');
                console.log('  node scripts/import-employees.js --password "Company2024!"');
                console.log('  node scripts/import-employees.js --strategy employeeId');
                console.log('  node scripts/import-employees.js --stats');
                return;
        }
    }

    // Run import
    await importer.importEmployees(options);
}

// Export for use in other scripts
export { EmployeeImporter };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    });
}