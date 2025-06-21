-- Fix Auction Table Timezone Issues
-- BACKUP YOUR DATA BEFORE RUNNING THIS!

-- Convert auction date columns to timestamptz
ALTER TABLE auctions 
ALTER COLUMN starts_at TYPE TIMESTAMP WITH TIME ZONE 
    USING starts_at AT TIME ZONE 'UTC',
ALTER COLUMN ends_at TYPE TIMESTAMP WITH TIME ZONE 
    USING ends_at AT TIME ZONE 'UTC',
ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE 
    USING created_at AT TIME ZONE 'UTC',
ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE 
    USING updated_at AT TIME ZONE 'UTC';

-- Verify the changes
SELECT 
    column_name, 
    data_type
FROM information_schema.columns 
WHERE table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at');