-- Add organization fields to users table (SQLite)
-- Migration: 007_add_user_organization_fields.sql

BEGIN TRANSACTION;

-- Add department field
ALTER TABLE users ADD COLUMN department TEXT DEFAULT '-';

-- Add team field  
ALTER TABLE users ADD COLUMN team TEXT DEFAULT '-';

-- Add supervisor field
ALTER TABLE users ADD COLUMN supervisor TEXT DEFAULT '-';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team);
CREATE INDEX IF NOT EXISTS idx_users_supervisor ON users(supervisor);

-- Update existing users to have default values
UPDATE users SET 
    department = '-',
    team = '-', 
    supervisor = '-'
WHERE department IS NULL OR team IS NULL OR supervisor IS NULL;

COMMIT;