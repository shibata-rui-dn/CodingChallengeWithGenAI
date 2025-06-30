-- Create OAuth clients table (SQLite)
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT UNIQUE NOT NULL,
    client_secret TEXT NOT NULL,
    name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    allowed_scopes TEXT DEFAULT 'openid profile email',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);