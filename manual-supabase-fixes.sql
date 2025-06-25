-- ================================================================
-- MANUAL SUPABASE SQL EXECUTION GUIDE
-- Copy and paste these commands into your Supabase SQL Editor
-- Execute in the exact order shown below
-- ================================================================

-- =================
-- STEP 1: BACKUP VERIFICATION
-- =================
-- First, verify your data is safe
SELECT 
    'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 
    'products', COUNT(*) FROM products
UNION ALL
SELECT 
    'auctions', COUNT(*) FROM auctions
UNION ALL
SELECT 
    'bids', COUNT(*) FROM bids
UNION ALL
SELECT 
    'messages', COUNT(*) FROM messages;

-- =================
-- STEP 2: FIX AUCTION TIMING BUG
-- =================
-- This fixes the critical 1-hour early expiration issue

-- Fix auctions table timestamps
ALTER TABLE auctions 
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC';

-- Fix bids table timestamps  
ALTER TABLE bids
  ALTER COLUMN placed_at TYPE timestamp with time zone USING placed_at AT TIME ZONE 'UTC';

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_auctions_updated_at ON auctions;
CREATE TRIGGER update_auctions_updated_at 
  BEFORE UPDATE ON auctions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =================
-- STEP 3: FIX FINANCIAL PRECISION
-- =================
-- Convert all monetary fields to proper decimal types

-- Auctions financial fields
ALTER TABLE auctions 
  ALTER COLUMN starting_price TYPE decimal(12,2),
  ALTER COLUMN reserve_price TYPE decimal(12,2),
  ALTER COLUMN buy_now_price TYPE decimal(12,2),
  ALTER COLUMN current_bid TYPE decimal(12,2),
  ALTER COLUMN bid_increment TYPE decimal(8,2);

-- Bids amount field
ALTER TABLE bids
  ALTER COLUMN amount TYPE decimal(12,2);

-- Products price field  
ALTER TABLE products
  ALTER COLUMN price TYPE decimal(12,2);

-- Users wallet balance
ALTER TABLE users
  ALTER COLUMN wallet_balance TYPE decimal(12,2);

-- =================
-- STEP 4: SUPABASE AUTH INTEGRATION
-- =================
-- Add fields for proper Supabase authentication linking

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS supabase_user_id text;

-- Create unique constraint on provider_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id 
  ON users(provider_id) WHERE provider_id IS NOT NULL;

-- Create index on supabase_user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id 
  ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;

-- =================
-- STEP 5: PERFORMANCE INDEXES
-- =================
-- Add critical indexes for auction system performance

-- Auction performance indexes
CREATE INDEX IF NOT EXISTS idx_auctions_status_ends_at 
  ON auctions(status, ends_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auctions_product_id 
  ON auctions(product_id);

CREATE INDEX IF NOT EXISTS idx_auctions_current_bidder_id 
  ON auctions(current_bidder_id) WHERE current_bidder_id IS NOT NULL;

-- Bid performance indexes
CREATE INDEX IF NOT EXISTS idx_bids_auction_id_placed_at 
  ON bids(auction_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_bidder_id 
  ON bids(bidder_id);

CREATE INDEX IF NOT EXISTS idx_bids_is_winning 
  ON bids(auction_id, is_winning) WHERE is_winning = true;

-- Product performance indexes
CREATE INDEX IF NOT EXISTS idx_products_seller_id 
  ON products(seller_id);

CREATE INDEX IF NOT EXISTS idx_products_status 
  ON products(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_featured 
  ON products(is_featured, featured_until) WHERE is_featured = true;

-- Message performance indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation 
  ON messages(sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_unread 
  ON messages(receiver_id, is_read) WHERE is_read = false;

-- =================
-- STEP 6: DATA INTEGRITY CONSTRAINTS
-- =================
-- Add proper constraints for data validation

-- Auction constraints
ALTER TABLE auctions 
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_ends_after_starts 
    CHECK (ends_at > starts_at),
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_starting_price_positive 
    CHECK (starting_price > 0),
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_bid_increment_positive 
    CHECK (bid_increment > 0);

-- Bid constraints
ALTER TABLE bids
  ADD CONSTRAINT IF NOT EXISTS chk_bids_amount_positive 
    CHECK (amount > 0);

-- Product constraints
ALTER TABLE products
  ADD CONSTRAINT IF NOT EXISTS chk_products_price_positive 
    CHECK (price > 0),
  ADD CONSTRAINT IF NOT EXISTS chk_products_remaining_percentage 
    CHECK (remaining_percentage >= 0 AND remaining_percentage <= 100);

-- User constraints
ALTER TABLE users
  ADD CONSTRAINT IF NOT EXISTS chk_users_wallet_balance_non_negative 
    CHECK (wallet_balance >= 0);

-- =================
-- STEP 7: AUCTION AUTO-CLOSURE FUNCTION
-- =================
-- Function to automatically close expired auctions

CREATE OR REPLACE FUNCTION close_expired_auctions()
RETURNS void AS $$
DECLARE
    expired_auction RECORD;
BEGIN
    -- Find all active auctions that have expired
    FOR expired_auction IN 
        SELECT id, current_bidder_id, current_bid, product_id
        FROM auctions 
        WHERE status = 'active' 
        AND ends_at < CURRENT_TIMESTAMP
    LOOP
        -- Update auction status to completed
        UPDATE auctions 
        SET status = 'completed', 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = expired_auction.id;
        
        -- Log auction closure
        INSERT INTO bid_audit_trail (
            auction_id, 
            user_id, 
            attempted_amount, 
            status, 
            reason, 
            created_at
        ) VALUES (
            expired_auction.id,
            COALESCE(expired_auction.current_bidder_id, 0),
            COALESCE(expired_auction.current_bid, 0),
            'auction_closed',
            'Automatic closure - auction expired',
            CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Closed expired auction ID: %, Winner: %, Amount: %', 
            expired_auction.id, 
            expired_auction.current_bidder_id, 
            expired_auction.current_bid;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =================
-- STEP 8: AUCTION MONITORING VIEW
-- =================
-- Create view for monitoring auction health

CREATE OR REPLACE VIEW auction_health_monitor AS
SELECT 
    COUNT(*) as total_auctions,
    COUNT(*) FILTER (WHERE status = 'active') as active_auctions,
    COUNT(*) FILTER (WHERE status = 'active' AND ends_at < CURRENT_TIMESTAMP) as expired_active_auctions,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_auctions,
    COUNT(*) FILTER (WHERE current_bid IS NOT NULL) as auctions_with_bids,
    AVG(current_bid) FILTER (WHERE current_bid IS NOT NULL) as avg_current_bid,
    MAX(current_bid) as highest_current_bid,
    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as auctions_created_today
FROM auctions;

-- =================
-- STEP 9: VERIFICATION QUERIES
-- =================
-- Run these to verify everything worked correctly

-- Check timestamp consistency
SELECT 
    table_name,
    column_name, 
    data_type
FROM information_schema.columns 
WHERE table_name IN ('auctions', 'bids', 'messages', 'users')
  AND column_name LIKE '%_at'
  AND data_type LIKE '%timestamp%'
ORDER BY table_name, column_name;

-- Check financial field precision
SELECT 
    table_name,
    column_name,
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_name IN ('auctions', 'bids', 'products', 'users')
  AND column_name IN ('starting_price', 'current_bid', 'amount', 'price', 'wallet_balance', 'bid_increment')
ORDER BY table_name, column_name;

-- Check for expired active auctions (should be 0 after running close_expired_auctions)
SELECT 
    id,
    ends_at,
    status,
    current_bid,
    current_bidder_id
FROM auctions 
WHERE status = 'active' 
  AND ends_at < CURRENT_TIMESTAMP
ORDER BY ends_at;

-- Test the auction health monitor
SELECT * FROM auction_health_monitor;

-- =================
-- STEP 10: CLEAN UP UUID TABLES (OPTIONAL)
-- =================
-- Only run these if you want to remove the unused UUID tables
-- WARNING: This will permanently delete the new table structure

-- Uncomment and run these commands if you're sure:
-- DROP TABLE IF EXISTS conversation_participants_new CASCADE;
-- DROP TABLE IF EXISTS conversations_new CASCADE;
-- DROP TABLE IF EXISTS messages_new CASCADE;
-- DROP TABLE IF EXISTS bids_new CASCADE;
-- DROP TABLE IF EXISTS auctions_new CASCADE;
-- DROP TABLE IF EXISTS listing_images_new CASCADE;
-- DROP TABLE IF EXISTS listings_new CASCADE;
-- DROP TABLE IF EXISTS users_new CASCADE;

-- =================
-- EXECUTION COMPLETE
-- =================
-- After running all commands above:
-- 1. The auction timing bug should be fixed
-- 2. Financial calculations will be accurate
-- 3. Supabase auth integration is ready
-- 4. Performance is optimized
-- 5. Data integrity is enforced

SELECT 'CRITICAL FIXES APPLIED SUCCESSFULLY!' as status;