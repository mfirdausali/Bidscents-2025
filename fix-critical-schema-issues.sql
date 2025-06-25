-- ================================================================
-- CRITICAL SCHEMA FIXES FOR BIDSCENTS MFA
-- Addresses auction timing bug, auth linking, and financial precision
-- ================================================================

-- =================
-- 1. FIX AUCTION TIMING BUG
-- =================
-- Root cause: Mixed timestamp types causing 1-hour early expiration
-- Solution: Standardize all timestamp fields to 'timestamp with time zone'

BEGIN;

-- Fix auctions table timestamp inconsistencies
ALTER TABLE auctions 
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC';

-- Fix bids table timestamp issues  
ALTER TABLE bids
  ALTER COLUMN placed_at TYPE timestamp with time zone USING placed_at AT TIME ZONE 'UTC';

-- Add updated_at trigger for auctions if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auctions
DROP TRIGGER IF EXISTS update_auctions_updated_at ON auctions;
CREATE TRIGGER update_auctions_updated_at 
  BEFORE UPDATE ON auctions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;

-- =================
-- 2. FIX FINANCIAL PRECISION
-- =================
-- Root cause: Using double precision for monetary values
-- Solution: Convert to decimal(12,2) for proper financial calculations

BEGIN;

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

COMMIT;

-- =================
-- 3. SUPABASE AUTH INTEGRATION
-- =================
-- Root cause: Missing provider_id and provider fields for Supabase auth linking
-- Solution: Add auth linking fields and create proper constraints

BEGIN;

-- Add Supabase auth linking fields to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS supabase_user_id uuid;

-- Create unique constraint on provider_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id 
  ON users(provider_id) WHERE provider_id IS NOT NULL;

-- Create index on supabase_user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id 
  ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;

COMMIT;

-- =================
-- 4. PERFORMANCE OPTIMIZATIONS
-- =================
-- Add critical indexes for auction system performance

BEGIN;

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

COMMIT;

-- =================
-- 5. DATA INTEGRITY CONSTRAINTS
-- =================
-- Add proper constraints for data validation

BEGIN;

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

COMMIT;

-- =================
-- 6. CREATE AUCTION AUTO-CLOSURE FUNCTION
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
        
        -- TODO: Add winner notification logic here
        -- TODO: Add payment processing trigger here
        
        RAISE NOTICE 'Closed expired auction ID: %, Winner: %, Amount: %', 
            expired_auction.id, 
            expired_auction.current_bidder_id, 
            expired_auction.current_bid;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =================
-- 7. AUCTION MONITORING VIEW
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
-- VERIFICATION QUERIES
-- =================
-- Run these to verify the fixes

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

-- =================
-- MANUAL EXECUTION STEPS
-- =================
-- 1. Run this SQL file against your Supabase database
-- 2. Set up cron job to run close_expired_auctions() every minute:
--    SELECT cron.schedule('close-expired-auctions', '* * * * *', 'SELECT close_expired_auctions();');
-- 3. Update application timezone handling to always use UTC
-- 4. Test auction timing with new schema
-- 5. Update Drizzle schema definitions to match

COMMIT;