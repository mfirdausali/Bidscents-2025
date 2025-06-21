-- Diagnostic Script to Find the Real Timing Issue
-- Run this in your Supabase SQL Editor to understand what's happening

-- 1. First, check if columns already have timezone support
SELECT 
    column_name, 
    data_type,
    datetime_precision,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'auctions'
AND column_name IN ('starts_at', 'ends_at', 'created_at', 'updated_at');

-- 2. Check server timezone and current time
SELECT 
    current_setting('TIMEZONE') as server_timezone,
    NOW() as server_now,
    NOW()::text as server_now_text,
    CURRENT_TIMESTAMP as current_timestamp,
    CURRENT_TIMESTAMP::text as current_timestamp_text,
    NOW() AT TIME ZONE 'UTC' as utc_now,
    NOW() AT TIME ZONE 'Asia/Kuala_Lumpur' as malaysia_now;

-- 3. Examine active auctions with detailed timing analysis
SELECT 
    a.id,
    p.name as product_name,
    a.ends_at,
    a.ends_at::text as ends_at_stored,
    NOW() as current_time,
    NOW()::text as current_time_text,
    a.ends_at - NOW() as time_difference,
    EXTRACT(EPOCH FROM (a.ends_at - NOW())) as seconds_until_expiry,
    ROUND(EXTRACT(EPOCH FROM (a.ends_at - NOW())) / 3600, 2) as hours_until_expiry,
    CASE 
        WHEN a.ends_at <= NOW() THEN 'SHOULD BE EXPIRED'
        ELSE 'STILL ACTIVE'
    END as expected_status,
    a.status as actual_status
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status = 'active'
ORDER BY a.ends_at ASC
LIMIT 10;

-- 4. Find discrepancies - auctions that should have expired
SELECT 
    a.id,
    p.name as product_name,
    a.ends_at,
    a.ends_at::text as ends_at_text,
    NOW() as now,
    NOW() - a.ends_at as overdue_by,
    ROUND(EXTRACT(EPOCH FROM (NOW() - a.ends_at)) / 3600, 2) as hours_overdue,
    a.status
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status = 'active' 
AND a.ends_at < NOW();

-- 5. Check the last few auction status changes
SELECT 
    a.id,
    p.name as product_name,
    a.ends_at,
    a.updated_at,
    a.status,
    a.updated_at - a.ends_at as processing_delay,
    ROUND(EXTRACT(EPOCH FROM (a.updated_at - a.ends_at)) / 60, 2) as delay_minutes
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status IN ('pending', 'reserve_not_met', 'ended')
ORDER BY a.updated_at DESC
LIMIT 10;

-- 6. Test timestamp parsing issue
-- Create a test to see how different formats are interpreted
WITH test_times AS (
    SELECT 
        '2025-06-21 14:21:44.615+00'::timestamptz as format1,
        '2025-06-21T14:21:44.615+00'::timestamptz as format2,
        '2025-06-21 14:21:44.615'::timestamp as format3_no_tz,
        '2025-06-21T14:21:44.615Z'::timestamptz as format4_iso
)
SELECT 
    format1,
    format2,
    format3_no_tz,
    format4_iso,
    format1 = format2 as formats_equal,
    EXTRACT(EPOCH FROM (format1 - format2)) as seconds_difference
FROM test_times;

-- 7. Check if the cron job timing might be the issue
-- Look for patterns in when auctions actually get marked as expired
SELECT 
    DATE_TRUNC('minute', updated_at) as update_minute,
    COUNT(*) as auctions_updated,
    STRING_AGG(CAST(id as TEXT), ', ') as auction_ids
FROM auctions
WHERE status IN ('pending', 'reserve_not_met', 'ended')
AND updated_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('minute', updated_at)
ORDER BY update_minute DESC;