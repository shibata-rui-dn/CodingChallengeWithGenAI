-- Check if role column exists and add it if it doesn't (SQLite compatible)
-- This migration handles the case where role column might already exist

-- First, check if we need to add the role column by attempting to select from it
-- If it fails, we'll add the column; if it succeeds, we'll skip the addition

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a different approach
-- We'll use a transaction to handle this safely

BEGIN TRANSACTION;

-- Try to add the role column (will fail if it already exists)
-- We'll catch this in the migration script

-- Add role field to users table if it doesn't exist
-- This will be handled by the migration script logic

-- Update existing admin user to have admin role (this is safe to run multiple times)
UPDATE users SET role = 'admin' WHERE username = 'admin' AND (role IS NULL OR role != 'admin');

-- Update other users to have user role if they don't have one set
UPDATE users SET role = 'user' WHERE role IS NULL;

-- Create index for role field (IF NOT EXISTS is supported for indexes)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

COMMIT;