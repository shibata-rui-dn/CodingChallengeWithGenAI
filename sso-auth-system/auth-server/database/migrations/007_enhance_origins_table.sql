-- Add auto_added and source_client_id columns to allowed_origins table
ALTER TABLE allowed_origins ADD COLUMN auto_added BOOLEAN DEFAULT 0;
ALTER TABLE allowed_origins ADD COLUMN source_client_id TEXT;
ALTER TABLE allowed_origins ADD COLUMN origin_type TEXT DEFAULT 'manual';

-- Create index for auto_added origins
CREATE INDEX IF NOT EXISTS idx_allowed_origins_auto_added ON allowed_origins(auto_added);
CREATE INDEX IF NOT EXISTS idx_allowed_origins_source_client ON allowed_origins(source_client_id);
CREATE INDEX IF NOT EXISTS idx_allowed_origins_type ON allowed_origins(origin_type);

-- Update existing origins to be marked as manual
UPDATE allowed_origins SET origin_type = 'manual', auto_added = 0 WHERE auto_added IS NULL;