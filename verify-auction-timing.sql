-- Verification Script: Run this AFTER applying the timezone fix
-- This will help you verify that the fix is working correctly

-- 1. Check Supabase timezone configuration
SHOW timezone;

-- 2. Display current time in different formats
SELECT 
    CURRENT_TIMESTAMP as current_timestamp,
    CURRENT_TIMESTAMP::text as current_timestamp_text,
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC' as current_utc,
    CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur' as current_malaysia,
    timezone('UTC', CURRENT_TIMESTAMP) as utc_time,
    to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZ') as formatted_time;

-- 3. Check active auctions with detailed timing info
SELECT 
    a.id,
    a.status,
    p.name as product_name,
    a.starts_at,
    a.ends_at,
    a.ends_at::text as ends_at_raw,
    to_char(a.ends_at, 'YYYY-MM-DD HH24:MI:SS TZ') as ends_at_formatted,
    a.ends_at AT TIME ZONE 'UTC' as ends_at_utc,
    EXTRACT(EPOCH FROM (a.ends_at - CURRENT_TIMESTAMP)) as seconds_remaining,
    ROUND(EXTRACT(EPOCH FROM (a.ends_at - CURRENT_TIMESTAMP)) / 3600.0, 2) as hours_remaining,
    CASE 
        WHEN a.ends_at < CURRENT_TIMESTAMP THEN 'SHOULD BE EXPIRED'
        ELSE 'ACTIVE'
    END as expected_status
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status = 'active'
ORDER BY a.ends_at ASC
LIMIT 10;

-- 4. Find any auctions that should have expired but haven't
SELECT 
    a.id,
    p.name as product_name,
    a.status,
    a.ends_at,
    CURRENT_TIMESTAMP as current_time,
    (CURRENT_TIMESTAMP - a.ends_at) as time_past_expiry
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status = 'active' 
AND a.ends_at < CURRENT_TIMESTAMP;

-- 5. Check recently expired auctions
SELECT 
    a.id,
    p.name as product_name,
    a.status,
    a.ends_at,
    a.updated_at,
    (a.updated_at - a.ends_at) as processing_delay
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status IN ('pending', 'reserve_not_met', 'ended')
AND a.updated_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
ORDER BY a.updated_at DESC
LIMIT 10;

-- 6. Diagnostic: Compare different timestamp interpretations
WITH sample_auction AS (
    SELECT * FROM auctions 
    WHERE status = 'active' 
    LIMIT 1
)
SELECT 
    ends_at,
    ends_at::text as stored_value,
    ends_at::timestamp as without_tz,
    ends_at::timestamptz as with_tz,
    to_char(ends_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as iso_format
FROM sample_auction;