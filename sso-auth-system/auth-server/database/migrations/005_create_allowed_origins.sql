-- Create allowed origins table for dynamic CORS management (SQLite)
CREATE TABLE IF NOT EXISTS allowed_origins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT UNIQUE NOT NULL,
    description TEXT,
    added_by INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_allowed_origins_origin ON allowed_origins(origin);
CREATE INDEX IF NOT EXISTS idx_allowed_origins_active ON allowed_origins(is_active);

INSERT OR IGNORE INTO allowed_origins (origin, description, is_active) VALUES
('http://localhost:3000', 'Default frontend app', 1),
('http://localhost:3303', 'Default auth server', 1);