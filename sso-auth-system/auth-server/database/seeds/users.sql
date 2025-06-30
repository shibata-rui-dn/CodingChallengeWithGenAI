-- Insert default users for development and testing (SQLite)
-- Note: Password hashes are generated dynamically during seeding process
-- for better security and maintainability.

-- This file is a template. Actual user insertion is handled by seed.js
-- with dynamically generated password hashes.

-- Default password for users: configured in config.yaml (demo.password)
-- Hash generation: bcrypt.hash(password, security.bcrypt_rounds)

-- Template SQL (not executed):
-- INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES
-- ('admin', 'admin@company.com', '[DYNAMIC_HASH]', 'System', 'Administrator'),
-- ('user', 'user@company.com', '[DYNAMIC_HASH]', 'Demo', 'User');