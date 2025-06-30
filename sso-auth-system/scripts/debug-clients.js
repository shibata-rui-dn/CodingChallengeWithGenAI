import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ClientViewer {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
    }

    async displayClients(options = {}) {
        const {
            format = 'table', // 'table', 'json', 'list'
            showSecrets = false, // セキュリティ上の理由でデフォルトは false
            includeInactive = true,
            sortBy = 'created_at' // 'name', 'client_id', 'created_at'
        } = options;

        console.log('🔑 SSO OAuth Client List');
        console.log('='.repeat(60));

        try {
            // データベース接続の初期化
            const pool = await this.initializeDatabase();
            
            // クライアント一覧の取得
            const clients = await this.fetchClients(pool, { includeInactive, sortBy });
            
            if (clients.length === 0) {
                console.log('📋 No OAuth clients found in the database.');
                return;
            }

            console.log(`📊 Found ${clients.length} OAuth client(s)\n`);
            
            // フォーマットに応じた表示
            switch (format) {
                case 'json':
                    this.displayAsJson(clients, showSecrets);
                    break;
                case 'list':
                    this.displayAsList(clients, showSecrets);
                    break;
                case 'table':
                default:
                    this.displayAsTable(clients, showSecrets);
                    break;
            }

            // 統計情報の表示
            this.displayStatistics(clients);

        } catch (error) {
            console.error('❌ Error:', error.message);
            throw error;
        }
    }

    async initializeDatabase() {
        try {
            const { default: pool } = await import('../config/database.js');
            
            // データベース接続のテスト
            await pool.query('SELECT 1');
            return pool;
        } catch (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    async fetchClients(pool, options = {}) {
        const { includeInactive = true, sortBy = 'created_at' } = options;
        
        let query = `
            SELECT 
                client_id,
                client_secret,
                name,
                redirect_uris,
                allowed_scopes,
                is_active,
                created_at,
                updated_at
            FROM clients
        `;
        
        const params = [];
        
        // アクティブなクライアントのみ表示する場合
        if (!includeInactive) {
            query += ' WHERE is_active = ?';
            params.push(1);
        }
        
        // ソート順の設定
        const validSortFields = ['client_id', 'name', 'created_at', 'updated_at'];
        if (validSortFields.includes(sortBy)) {
            query += ` ORDER BY ${sortBy}`;
            if (sortBy.includes('_at')) {
                query += ' DESC'; // 日付は新しい順
            }
        }

        try {
            const result = await pool.query(query, params);
            
            // JSON文字列のパース
            return result.rows.map(client => ({
                ...client,
                redirect_uris: this.safeJsonParse(client.redirect_uris, []),
                allowed_scopes: client.allowed_scopes ? client.allowed_scopes.split(' ') : [],
                is_active: Boolean(client.is_active)
            }));
        } catch (error) {
            throw new Error(`Failed to fetch clients: ${error.message}`);
        }
    }

    safeJsonParse(jsonString, defaultValue = null) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            return defaultValue;
        }
    }

    displayAsTable(clients, showSecrets = false) {
        console.log('📋 Client Table View');
        console.log('-'.repeat(100));
        
        // テーブルヘッダー
        const headers = ['Client ID', 'Name', 'Status', 'Scopes', 'Redirect URIs'];
        if (showSecrets) {
            headers.splice(2, 0, 'Client Secret');
        }
        
        console.log(headers.join(' | ').padEnd(100));
        console.log('-'.repeat(100));
        
        // クライアント行
        clients.forEach(client => {
            const row = [
                client.client_id.padEnd(20),
                client.name.substring(0, 25).padEnd(25),
                showSecrets ? this.maskSecret(client.client_secret).padEnd(20) : '',
                (client.is_active ? '✅ Active' : '❌ Inactive').padEnd(10),
                client.allowed_scopes.slice(0, 3).join(', ').substring(0, 20).padEnd(20),
                client.redirect_uris.length > 0 ? client.redirect_uris[0].substring(0, 30) : 'None'
            ];
            
            if (!showSecrets) {
                row.splice(2, 1); // client_secretを除去
            }
            
            console.log(row.join(' | '));
        });
        
        console.log('-'.repeat(100));
    }

    displayAsList(clients, showSecrets = false) {
        console.log('📋 Client List View\n');
        
        clients.forEach((client, index) => {
            console.log(`${index + 1}. ${client.name}`);
            console.log(`   Client ID: ${client.client_id}`);
            
            if (showSecrets) {
                console.log(`   Client Secret: ${this.maskSecret(client.client_secret)}`);
            }
            
            console.log(`   Status: ${client.is_active ? '✅ Active' : '❌ Inactive'}`);
            console.log(`   Allowed Scopes: ${client.allowed_scopes.join(', ')}`);
            console.log(`   Redirect URIs:`);
            
            if (client.redirect_uris.length === 0) {
                console.log(`     - None configured`);
            } else {
                client.redirect_uris.forEach(uri => {
                    console.log(`     - ${uri}`);
                });
            }
            
            console.log(`   Created: ${this.formatDate(client.created_at)}`);
            if (client.updated_at) {
                console.log(`   Updated: ${this.formatDate(client.updated_at)}`);
            }
            console.log('');
        });
    }

    displayAsJson(clients, showSecrets = false) {
        console.log('📋 Client JSON View\n');
        
        const outputClients = clients.map(client => {
            const output = { ...client };
            
            if (!showSecrets) {
                delete output.client_secret;
            } else {
                output.client_secret = this.maskSecret(client.client_secret);
            }
            
            return output;
        });
        
        console.log(JSON.stringify(outputClients, null, 2));
    }

    displayStatistics(clients) {
        console.log('\n📊 Client Statistics:');
        console.log('-'.repeat(30));
        
        const activeCount = clients.filter(c => c.is_active).length;
        const inactiveCount = clients.length - activeCount;
        
        console.log(`Total Clients: ${clients.length}`);
        console.log(`Active: ${activeCount}`);
        console.log(`Inactive: ${inactiveCount}`);
        
        // スコープ統計
        const scopeUsage = {};
        clients.forEach(client => {
            client.allowed_scopes.forEach(scope => {
                scopeUsage[scope] = (scopeUsage[scope] || 0) + 1;
            });
        });
        
        if (Object.keys(scopeUsage).length > 0) {
            console.log('\nScope Usage:');
            Object.entries(scopeUsage)
                .sort(([,a], [,b]) => b - a)
                .forEach(([scope, count]) => {
                    console.log(`  ${scope}: ${count} client(s)`);
                });
        }

        // リダイレクトURI統計
        const totalRedirectUris = clients.reduce((sum, client) => sum + client.redirect_uris.length, 0);
        console.log(`\nTotal Redirect URIs: ${totalRedirectUris}`);
        
        // ドメイン統計
        const domains = new Set();
        clients.forEach(client => {
            client.redirect_uris.forEach(uri => {
                try {
                    const url = new URL(uri);
                    domains.add(url.hostname);
                } catch (error) {
                    // 無効なURLはスキップ
                }
            });
        });
        
        if (domains.size > 0) {
            console.log(`Unique Domains: ${domains.size}`);
            console.log(`Domains: ${Array.from(domains).join(', ')}`);
        }
    }

    maskSecret(secret) {
        if (!secret || secret.length <= 8) {
            return '***';
        }
        return secret.substring(0, 4) + '*'.repeat(secret.length - 8) + secret.substring(secret.length - 4);
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleString('ja-JP', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    // 特定のクライアント詳細表示
    async displayClientDetails(clientId) {
        console.log(`🔍 Client Details: ${clientId}`);
        console.log('='.repeat(60));

        try {
            const pool = await this.initializeDatabase();
            const result = await pool.query(
                'SELECT * FROM clients WHERE client_id = ?',
                [clientId]
            );

            if (result.rows.length === 0) {
                console.log(`❌ Client '${clientId}' not found.`);
                return;
            }

            const client = result.rows[0];
            client.redirect_uris = this.safeJsonParse(client.redirect_uris, []);
            client.allowed_scopes = client.allowed_scopes ? client.allowed_scopes.split(' ') : [];

            console.log(`Name: ${client.name}`);
            console.log(`Client ID: ${client.client_id}`);
            console.log(`Client Secret: ${this.maskSecret(client.client_secret)}`);
            console.log(`Status: ${client.is_active ? '✅ Active' : '❌ Inactive'}`);
            console.log(`Created: ${this.formatDate(client.created_at)}`);
            console.log(`Updated: ${this.formatDate(client.updated_at)}`);
            
            console.log('\nAllowed Scopes:');
            client.allowed_scopes.forEach(scope => {
                console.log(`  - ${scope}`);
            });
            
            console.log('\nRedirect URIs:');
            if (client.redirect_uris.length === 0) {
                console.log('  - None configured');
            } else {
                client.redirect_uris.forEach(uri => {
                    console.log(`  - ${uri}`);
                });
            }

        } catch (error) {
            console.error('❌ Error:', error.message);
            throw error;
        }
    }

    // クライアント検索
    async searchClients(searchTerm) {
        console.log(`🔍 Searching for clients: "${searchTerm}"`);
        console.log('='.repeat(60));

        try {
            const pool = await this.initializeDatabase();
            const result = await pool.query(`
                SELECT * FROM clients 
                WHERE client_id LIKE ? OR name LIKE ?
                ORDER BY name
            `, [`%${searchTerm}%`, `%${searchTerm}%`]);

            if (result.rows.length === 0) {
                console.log(`❌ No clients found matching "${searchTerm}".`);
                return;
            }

            const clients = result.rows.map(client => ({
                ...client,
                redirect_uris: this.safeJsonParse(client.redirect_uris, []),
                allowed_scopes: client.allowed_scopes ? client.allowed_scopes.split(' ') : [],
                is_active: Boolean(client.is_active)
            }));

            console.log(`📊 Found ${clients.length} matching client(s)\n`);
            this.displayAsList(clients, false);

        } catch (error) {
            console.error('❌ Error:', error.message);
            throw error;
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const viewer = new ClientViewer();

    // コマンドライン引数の解析
    const options = {
        format: 'table',
        showSecrets: false,
        includeInactive: true,
        sortBy: 'created_at'
    };

    let command = 'list';
    let searchTerm = '';
    let clientId = '';

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '--format':
                options.format = args[++i] || 'table';
                break;
            case '--show-secrets':
                options.showSecrets = true;
                break;
            case '--active-only':
                options.includeInactive = false;
                break;
            case '--sort':
                options.sortBy = args[++i] || 'created_at';
                break;
            case '--search':
                command = 'search';
                searchTerm = args[++i] || '';
                break;
            case '--details':
                command = 'details';
                clientId = args[++i] || '';
                break;
            case '--help':
                console.log('🔑 OAuth Client Viewer - Usage:');
                console.log('');
                console.log('Basic usage:');
                console.log('  node view-clients.js                    # Show all clients (table format)');
                console.log('');
                console.log('Options:');
                console.log('  --format <type>       Output format: table|list|json (default: table)');
                console.log('  --show-secrets        Show masked client secrets');
                console.log('  --active-only         Show only active clients');
                console.log('  --sort <field>        Sort by: client_id|name|created_at (default: created_at)');
                console.log('');
                console.log('Commands:');
                console.log('  --search <term>       Search clients by name or client_id');
                console.log('  --details <client_id> Show detailed info for specific client');
                console.log('  --help                Show this help');
                console.log('');
                console.log('Examples:');
                console.log('  node view-clients.js --format json');
                console.log('  node view-clients.js --show-secrets --active-only');
                console.log('  node view-clients.js --search demo');
                console.log('  node view-clients.js --details demo-client');
                return;
        }
    }

    // コマンド実行
    try {
        switch (command) {
            case 'search':
                if (!searchTerm) {
                    console.error('❌ Search term required. Use: --search <term>');
                    return;
                }
                await viewer.searchClients(searchTerm);
                break;
            case 'details':
                if (!clientId) {
                    console.error('❌ Client ID required. Use: --details <client_id>');
                    return;
                }
                await viewer.displayClientDetails(clientId);
                break;
            case 'list':
            default:
                await viewer.displayClients(options);
                break;
        }
    } catch (error) {
        console.error('❌ Command failed:', error.message);
        process.exit(1);
    }
}

// Export for use in other scripts
export { ClientViewer };

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    });
}