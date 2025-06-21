-- Fix for Auctions Expiring 1 Hour Early
-- The issue: Server is comparing times incorrectly, causing auctions to expire 1 hour early

-- 1. First, let's verify the issue by checking a recent auction
SELECT 
    id,
    ends_at,
    ends_at::text as ends_at_text,
    updated_at,
    status,
    (updated_at - ends_at) as time_difference,
    ROUND(EXTRACT(EPOCH FROM (updated_at - ends_at)) / 60, 2) as minutes_early
FROM auctions
WHERE id IN (35, 23, 34, 33)
ORDER BY id DESC;

-- 2. Check your Node.js server timezone setting
-- The issue is likely that your Node.js server is running with a timezone offset
-- Run this to see current active auctions and when they'll actually expire
SELECT 
    a.id,
    p.name as product_name,
    a.ends_at AT TIME ZONE 'UTC' as ends_at_utc,
    a.ends_at as ends_at_stored,
    -- If server is checking with 1 hour offset, it will expire when:
    (a.ends_at - INTERVAL '1 hour') as will_actually_expire_at,
    CASE 
        WHEN NOW() >= (a.ends_at - INTERVAL '1 hour') THEN 'WILL EXPIRE SOON'
        ELSE 'SAFE FOR NOW'
    END as warning
FROM auctions a
JOIN products p ON a.product_id = p.id
WHERE a.status = 'active'
ORDER BY a.ends_at ASC;

-- 3. TEMPORARY FIX: Extend all active auctions by 1 hour to compensate
-- Only run this if you need to quickly fix currently active auctions
UPDATE auctions 
SET ends_at = ends_at + INTERVAL '1 hour'
WHERE status = 'active'
AND ends_at > NOW();

-- 4. After running the update, verify the changes
SELECT 
    id,
    ends_at,
    status
FROM auctions
WHERE status = 'active'
ORDER BY ends_at ASC;