-- Check Supabase Timezone Configuration
-- Run these queries in your Supabase SQL Editor

-- 1. Check current database timezone
SELECT current_setting('TIMEZONE') as database_timezone;

-- 2. Check server time in different formats
SELECT 
    NOW() as current_timestamp_with_tz,
    NOW()::timestamp as current_timestamp_no_tz,
    NOW() AT TIME ZONE 'UTC' as current_utc,
    NOW() AT TIME ZONE 'Europe/London' as current_london,
    EXTRACT(TIMEZONE_HOUR FROM NOW()) as timezone_offset_hours;

-- 3. Check auctions table column types
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at')
ORDER BY ordinal_position;

-- 4. Test timezone conversion with a sample auction
SELECT 
    id,
    ends_at,
    ends_at::text as ends_at_text,
    ends_at AT TIME ZONE 'UTC' as ends_at_utc,
    ends_at AT TIME ZONE 'Europe/London' as ends_at_london,
    CASE 
        WHEN ends_at < NOW() THEN 'EXPIRED'
        ELSE 'ACTIVE'
    END as calculated_status,
    status as actual_status
FROM auctions
WHERE id = 34
OR status = 'active'
LIMIT 5;

-- 5. Check if there are any database triggers on auctions table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'auctions';