-- Supabase Timezone Fix for Auction Early Expiry Issue
-- Run this in your Supabase SQL Editor

-- 1. First, let's check the current column types
SELECT 
    column_name, 
    data_type,
    datetime_precision,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at');

-- 2. Convert auction timestamp columns to TIMESTAMP WITH TIME ZONE
ALTER TABLE auctions 
ALTER COLUMN starts_at TYPE TIMESTAMP WITH TIME ZONE 
    USING starts_at AT TIME ZONE 'UTC',
ALTER COLUMN ends_at TYPE TIMESTAMP WITH TIME ZONE 
    USING ends_at AT TIME ZONE 'UTC',
ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE 
    USING created_at AT TIME ZONE 'UTC',
ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE 
    USING updated_at AT TIME ZONE 'UTC';

-- 3. Also fix the bids table timestamps
ALTER TABLE bids 
ALTER COLUMN placed_at TYPE TIMESTAMP WITH TIME ZONE 
    USING placed_at AT TIME ZONE 'UTC';

-- 4. Fix the bid_audit_trail table
ALTER TABLE bid_audit_trail 
ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE 
    USING created_at AT TIME ZONE 'UTC';

-- 5. Verify the changes were applied
SELECT 
    column_name, 
    data_type,
    datetime_precision
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at');

-- 6. Check a sample of your auction data to ensure times look correct
SELECT 
    id,
    starts_at,
    ends_at,
    starts_at::text as starts_at_text,
    ends_at::text as ends_at_text,
    (ends_at AT TIME ZONE 'UTC') as ends_at_utc,
    (ends_at - CURRENT_TIMESTAMP) as time_remaining
FROM auctions 
WHERE status = 'active'
ORDER BY ends_at 
LIMIT 5;

-- 7. Optional: If you need to adjust existing auction end times that were set incorrectly
-- Uncomment and modify this based on your timezone offset
-- For example, if auctions were expiring 1 hour early:
-- UPDATE auctions 
-- SET ends_at = ends_at + INTERVAL '1 hour'
-- WHERE status = 'active' 
-- AND ends_at > CURRENT_TIMESTAMP;