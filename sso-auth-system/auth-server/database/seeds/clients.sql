-- Insert default OAuth clients (SQLite)
INSERT OR IGNORE INTO clients (client_id, client_secret, name, redirect_uris, allowed_scopes) VALUES
('demo-client', 'demo-secret-change-in-production', 'Demo Application', '["http://localhost:3000/callback"]', 'openid profile email'),
('test-app', 'test-secret-change-in-production', 'Test Application', '["http://localhost:3000/auth/callback"]', 'openid profile email');