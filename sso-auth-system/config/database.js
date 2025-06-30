import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getConfig } from './configLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const config = getConfig();

const projectRoot = path.resolve(__dirname, '..');
const dbDir = path.join(projectRoot, 'auth-server', 'database');

let dbPath;
if (process.env.DATABASE_PATH) {
  dbPath = path.isAbsolute(process.env.DATABASE_PATH) 
    ? process.env.DATABASE_PATH 
    : path.resolve(projectRoot, process.env.DATABASE_PATH);
} else if (config.database?.path) {
  dbPath = path.isAbsolute(config.database.path) 
    ? path.join(config.database.path, config.database.name || 'auth_db.sqlite')
    : path.resolve(projectRoot, config.database.path, config.database.name || 'auth_db.sqlite');
} else {
  dbPath = path.join(dbDir, config.database.name || 'auth_db.sqlite');
}

const dbFileDir = path.dirname(dbPath);

if (!fs.existsSync(dbFileDir)) {
  fs.mkdirSync(dbFileDir, { recursive: true });
}

const db = new Database(dbPath, {
  verbose: config.logging?.level === 'debug' ? console.log : null
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

class DatabaseWrapper {
  constructor(database) {
    this.db = database;
  }

  query(sql, params = []) {
    try {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return { rows };
      } else {
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...params);
        return { 
          rows: [], 
          rowCount: result.changes,
          lastInsertRowid: result.lastInsertRowid 
        };
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  transaction(callback) {
    const trx = this.db.transaction(callback);
    return trx;
  }

  close() {
    this.db.close();
  }

  get rawDb() {
    return this.db;
  }
}

const pool = new DatabaseWrapper(db);

console.log(`📁 SQLite database initialized: ${dbPath}`);

export default pool;