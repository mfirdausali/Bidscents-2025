-- =====================================================
-- CRITICAL AUCTION TIMING DATABASE MIGRATION
-- =====================================================
-- This migration ensures proper timezone handling for Malaysian marketplace
-- Run this in your Supabase SQL Editor after deploying the hotfix

-- Step 1: Backup current auction data
CREATE TABLE IF NOT EXISTS auctions_backup_20250625 AS 
SELECT * FROM auctions WHERE created_at >= NOW() - INTERVAL '30 days';

-- Step 2: Check current column types
DO $$
BEGIN
    RAISE NOTICE 'Current auction table schema:';
END $$;

SELECT 
    column_name, 
    data_type,
    datetime_precision,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at')
ORDER BY ordinal_position;

-- Step 3: Ensure timezone consistency
-- Check if columns are already TIMESTAMPTZ
SELECT 
    column_name,
    data_type,
    CASE 
        WHEN data_type = 'timestamp with time zone' THEN '✅ TIMESTAMPTZ'
        WHEN data_type = 'timestamp without time zone' THEN '⚠️  TIMESTAMP (needs migration)'
        ELSE '❓ UNKNOWN'
    END as timezone_status
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at');

-- Step 4: Convert to TIMESTAMPTZ if needed (run only if columns are TIMESTAMP)
-- UNCOMMENT THESE LINES IF YOUR COLUMNS ARE NOT TIMESTAMPTZ:

-- ALTER TABLE auctions 
-- ALTER COLUMN starts_at TYPE TIMESTAMPTZ USING starts_at AT TIME ZONE 'UTC';

-- ALTER TABLE auctions 
-- ALTER COLUMN ends_at TYPE TIMESTAMPTZ USING ends_at AT TIME ZONE 'UTC';

-- ALTER TABLE auctions 
-- ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- ALTER TABLE auctions 
-- ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

-- Step 5: Set database timezone to UTC for consistency
-- This ensures all new timestamps are stored in UTC
ALTER DATABASE postgres SET timezone TO 'UTC';

-- Step 6: Create function to validate auction timing
CREATE OR REPLACE FUNCTION validate_auction_timing()
RETURNS TABLE (
    auction_id INTEGER,
    ends_at_text TEXT,
    ends_at_parsed TIMESTAMPTZ,
    current_time TIMESTAMPTZ,
    hours_until_expiry NUMERIC,
    status TEXT,
    issue_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as auction_id,
        a.ends_at::TEXT as ends_at_text,
        a.ends_at as ends_at_parsed,
        NOW() as current_time,
        ROUND(EXTRACT(EPOCH FROM (a.ends_at - NOW())) / 3600, 2) as hours_until_expiry,
        a.status,
        CASE 
            WHEN a.ends_at < NOW() AND a.status = 'active' THEN 'OVERDUE'
            WHEN a.ends_at > NOW() AND a.status IN ('pending', 'ended') THEN 'PREMATURE_END'
            WHEN a.ends_at IS NULL THEN 'MISSING_END_TIME'
            ELSE 'OK'
        END as issue_type
    FROM auctions a
    WHERE a.status IN ('active', 'pending', 'ended')
    ORDER BY a.ends_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Run validation check
SELECT * FROM validate_auction_timing() 
WHERE issue_type != 'OK'
LIMIT 10;

-- Step 8: Create trigger to log auction status changes
CREATE OR REPLACE FUNCTION log_auction_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Log when auction status changes from active to ended/pending
    IF OLD.status = 'active' AND NEW.status IN ('pending', 'ended', 'reserve_not_met') THEN
        INSERT INTO auction_timing_log (
            auction_id,
            status_change,
            scheduled_end_time,
            actual_end_time,
            processing_delay_seconds,
            created_at
        ) VALUES (
            NEW.id,
            OLD.status || ' -> ' || NEW.status,
            OLD.ends_at,
            NOW(),
            EXTRACT(EPOCH FROM (NOW() - OLD.ends_at)),
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create log table for auction timing
CREATE TABLE IF NOT EXISTS auction_timing_log (
    id SERIAL PRIMARY KEY,
    auction_id INTEGER REFERENCES auctions(id),
    status_change TEXT NOT NULL,
    scheduled_end_time TIMESTAMPTZ,
    actual_end_time TIMESTAMPTZ,
    processing_delay_seconds NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger
DROP TRIGGER IF EXISTS auction_status_change_trigger ON auctions;
CREATE TRIGGER auction_status_change_trigger
    AFTER UPDATE ON auctions
    FOR EACH ROW
    EXECUTE FUNCTION log_auction_status_change();

-- Step 9: Create monitoring view
CREATE OR REPLACE VIEW auction_timing_monitor AS
SELECT 
    a.id,
    p.name as product_name,
    a.ends_at,
    a.status,
    NOW() as check_time,
    ROUND(EXTRACT(EPOCH FROM (a.ends_at - NOW())) / 3600, 2) as hours_until_expiry,
    CASE 
        WHEN a.ends_at < NOW() - INTERVAL '1 hour' AND a.status = 'active' THEN 'CRITICAL_OVERDUE'
        WHEN a.ends_at < NOW() AND a.status = 'active' THEN 'OVERDUE'
        WHEN a.ends_at < NOW() + INTERVAL '5 minutes' AND a.status = 'active' THEN 'EXPIRING_SOON'
        ELSE 'OK'
    END as timing_status
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status = 'active'
ORDER BY a.ends_at ASC;

-- Step 10: Final validation
SELECT 
    'Database timezone: ' || current_setting('TIMEZONE') as config_check
UNION ALL
SELECT 
    'Current time: ' || NOW()::TEXT
UNION ALL
SELECT 
    'Total active auctions: ' || COUNT(*)::TEXT
FROM auctions WHERE status = 'active'
UNION ALL
SELECT 
    'Auctions with timing issues: ' || COUNT(*)::TEXT
FROM auction_timing_monitor WHERE timing_status != 'OK';

-- Step 11: Grant permissions for monitoring
GRANT SELECT ON auction_timing_monitor TO authenticated;
GRANT SELECT ON auction_timing_log TO authenticated;

-- Step 12: Create index for performance
CREATE INDEX IF NOT EXISTS idx_auctions_status_ends_at 
ON auctions(status, ends_at) 
WHERE status = 'active';

-- Step 13: Final summary
SELECT 
    '✅ Database migration completed successfully!' as status,
    'Auction timing issues should now be resolved' as message,
    'Monitor the auction_timing_monitor view for ongoing health checks' as next_steps;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Deploy the server-side hotfix (already done)
-- 2. Monitor auction_timing_monitor view for 24 hours
-- 3. Check auction_timing_log for processing delays
-- 4. Set up automated alerts based on timing_status
-- =====================================================