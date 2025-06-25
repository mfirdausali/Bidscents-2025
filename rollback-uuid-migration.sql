-- ================================================================
-- UUID MIGRATION ROLLBACK - BIDSCENTS MFA
-- Removes unused UUID-based tables and standardizes integer-based architecture
-- ================================================================

BEGIN;

-- =================
-- 1. BACKUP VERIFICATION
-- =================
-- Verify that legacy tables contain data and new tables are empty/unused

DO $$
DECLARE
    legacy_users_count INTEGER;
    new_users_count INTEGER;
    legacy_products_count INTEGER;
    new_listings_count INTEGER;
    legacy_auctions_count INTEGER;
    new_auctions_count INTEGER;
BEGIN
    -- Check legacy table counts
    SELECT COUNT(*) INTO legacy_users_count FROM users;
    SELECT COUNT(*) INTO legacy_products_count FROM products;
    SELECT COUNT(*) INTO legacy_auctions_count FROM auctions;
    
    -- Check new table counts (if they exist)
    BEGIN
        SELECT COUNT(*) INTO new_users_count FROM users_new;
    EXCEPTION
        WHEN undefined_table THEN
            new_users_count := 0;
    END;
    
    BEGIN
        SELECT COUNT(*) INTO new_listings_count FROM listings_new;
    EXCEPTION
        WHEN undefined_table THEN
            new_listings_count := 0;
    END;
    
    BEGIN
        SELECT COUNT(*) INTO new_auctions_count FROM auctions_new;
    EXCEPTION
        WHEN undefined_table THEN
            new_auctions_count := 0;
    END;
    
    -- Log verification results
    RAISE NOTICE 'MIGRATION ROLLBACK VERIFICATION:';
    RAISE NOTICE '  Legacy users: %', legacy_users_count;
    RAISE NOTICE '  Legacy products: %', legacy_products_count;
    RAISE NOTICE '  Legacy auctions: %', legacy_auctions_count;
    RAISE NOTICE '  New users: %', new_users_count;
    RAISE NOTICE '  New listings: %', new_listings_count;
    RAISE NOTICE '  New auctions: %', new_auctions_count;
    
    -- Safety check: Ensure legacy tables have data
    IF legacy_users_count = 0 OR legacy_products_count = 0 THEN
        RAISE EXCEPTION 'SAFETY CHECK FAILED: Legacy tables appear to be empty. Aborting rollback.';
    END IF;
    
    -- Warning if new tables have data
    IF new_users_count > 0 OR new_listings_count > 0 OR new_auctions_count > 0 THEN
        RAISE WARNING 'WARNING: New tables contain data that will be lost in rollback.';
    END IF;
END $$;

-- =================
-- 2. DROP UUID-BASED TABLES
-- =================
-- Remove all new tables in correct order to handle foreign key dependencies

RAISE NOTICE 'Dropping UUID-based tables...';

-- Drop dependent tables first
DROP TABLE IF EXISTS conversation_participants_new CASCADE;
DROP TABLE IF EXISTS device_tokens_new CASCADE;
DROP TABLE IF EXISTS bans_new CASCADE;
DROP TABLE IF EXISTS transactions_new CASCADE;
DROP TABLE IF EXISTS payments_new CASCADE;
DROP TABLE IF EXISTS follows_new CASCADE;
DROP TABLE IF EXISTS favorites_new CASCADE;
DROP TABLE IF EXISTS notification_preferences_new CASCADE;
DROP TABLE IF EXISTS notifications_new CASCADE;
DROP TABLE IF EXISTS listing_images_new CASCADE;
DROP TABLE IF EXISTS bids_new CASCADE;
DROP TABLE IF EXISTS auctions_new CASCADE;
DROP TABLE IF EXISTS conversations_new CASCADE;
DROP TABLE IF EXISTS messages_new CASCADE;
DROP TABLE IF EXISTS listings_new CASCADE;
DROP TABLE IF EXISTS users_new CASCADE;

RAISE NOTICE 'UUID-based tables dropped successfully';

-- =================
-- 3. VERIFY LEGACY TABLE STRUCTURE
-- =================
-- Ensure legacy tables have correct structure for marketplace functionality

-- Check that users table has required fields
DO $$
BEGIN
    -- Verify critical user fields exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        RAISE EXCEPTION 'Critical field users.email is missing';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'username'
    ) THEN
        RAISE EXCEPTION 'Critical field users.username is missing';
    END IF;
    
    RAISE NOTICE 'Legacy table structure verification passed';
END $$;

-- =================
-- 4. CLEAN UP ORPHANED CONSTRAINTS
-- =================
-- Remove any constraints that might reference dropped tables

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Find and drop constraints referencing non-existent tables
    FOR constraint_record IN
        SELECT conname, conrelid::regclass as table_name
        FROM pg_constraint
        WHERE conname LIKE '%_new_%' OR conname LIKE '%new_%'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %s', 
                          constraint_record.table_name, 
                          constraint_record.conname);
            RAISE NOTICE 'Dropped orphaned constraint: %', constraint_record.conname;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop constraint %: %', constraint_record.conname, SQLERRM;
        END;
    END LOOP;
END $$;

-- =================
-- 5. CLEAN UP ORPHANED INDEXES
-- =================
-- Remove any indexes that might reference dropped tables

DO $$
DECLARE
    index_record RECORD;
BEGIN
    -- Find and drop indexes referencing non-existent tables
    FOR index_record IN
        SELECT indexname
        FROM pg_indexes
        WHERE indexname LIKE '%_new_%' OR indexname LIKE '%new_%'
    LOOP
        BEGIN
            EXECUTE format('DROP INDEX IF EXISTS %s', index_record.indexname);
            RAISE NOTICE 'Dropped orphaned index: %', index_record.indexname;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop index %: %', index_record.indexname, SQLERRM;
        END;
    END LOOP;
END $$;

-- =================
-- 6. STANDARDIZE LEGACY TABLE STRUCTURE
-- =================
-- Ensure legacy tables are properly structured for continued use

-- Add missing fields to users table for Supabase auth integration
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS supabase_user_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP;

-- Add missing timestamps to products table
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP;

-- Add missing timestamps to other core tables
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP;

-- =================
-- 7. CREATE ESSENTIAL INDEXES FOR PERFORMANCE
-- =================
-- Add critical indexes for marketplace performance

-- User authentication indexes
CREATE INDEX IF NOT EXISTS idx_users_provider_id 
  ON users(provider_id) WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id 
  ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_unique 
  ON users(email);

-- Product marketplace indexes
CREATE INDEX IF NOT EXISTS idx_products_seller_status 
  ON products(seller_id, status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_category_status 
  ON products(category_id, status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_featured_until 
  ON products(is_featured, featured_until) WHERE is_featured = true;

-- Auction system indexes
CREATE INDEX IF NOT EXISTS idx_auctions_status_ends_at 
  ON auctions(status, ends_at) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auctions_product_status 
  ON auctions(product_id, status);

CREATE INDEX IF NOT EXISTS idx_auctions_bidder_status 
  ON auctions(current_bidder_id, status) WHERE current_bidder_id IS NOT NULL;

-- Bidding system indexes
CREATE INDEX IF NOT EXISTS idx_bids_auction_placed_at 
  ON bids(auction_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_bidder_placed_at 
  ON bids(bidder_id, placed_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_winning 
  ON bids(auction_id, is_winning) WHERE is_winning = true;

-- Messaging system indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON messages(sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_receiver_unread 
  ON messages(receiver_id, is_read, created_at DESC) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_messages_product_created 
  ON messages(product_id, created_at DESC) WHERE product_id IS NOT NULL;

-- =================
-- 8. ADD DATA INTEGRITY CONSTRAINTS
-- =================
-- Ensure data quality with proper constraints

-- User constraints
ALTER TABLE users
  ADD CONSTRAINT IF NOT EXISTS chk_users_email_format 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  ADD CONSTRAINT IF NOT EXISTS chk_users_wallet_balance_non_negative 
    CHECK (wallet_balance >= 0);

-- Product constraints
ALTER TABLE products
  ADD CONSTRAINT IF NOT EXISTS chk_products_price_positive 
    CHECK (price > 0),
  ADD CONSTRAINT IF NOT EXISTS chk_products_remaining_percentage_valid 
    CHECK (remaining_percentage >= 0 AND remaining_percentage <= 100),
  ADD CONSTRAINT IF NOT EXISTS chk_products_stock_non_negative 
    CHECK (stock_quantity >= 0);

-- Auction constraints
ALTER TABLE auctions
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_ends_after_starts 
    CHECK (ends_at > starts_at),
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_starting_price_positive 
    CHECK (starting_price > 0),
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_bid_increment_positive 
    CHECK (bid_increment > 0),
  ADD CONSTRAINT IF NOT EXISTS chk_auctions_reserve_price_valid 
    CHECK (reserve_price IS NULL OR reserve_price >= starting_price);

-- Bid constraints
ALTER TABLE bids
  ADD CONSTRAINT IF NOT EXISTS chk_bids_amount_positive 
    CHECK (amount > 0);

-- =================
-- 9. CREATE AUDIT TRIGGERS
-- =================
-- Add updated_at triggers for data tracking

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_auctions_updated_at ON auctions;
CREATE TRIGGER update_auctions_updated_at 
  BEFORE UPDATE ON auctions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =================
-- 10. FINAL VERIFICATION
-- =================
-- Verify rollback completed successfully

DO $$
DECLARE
    new_table_count INTEGER;
    legacy_table_count INTEGER;
BEGIN
    -- Count remaining new tables (should be 0)
    SELECT COUNT(*) INTO new_table_count
    FROM information_schema.tables 
    WHERE table_name LIKE '%_new' AND table_schema = 'public';
    
    -- Count essential legacy tables (should be > 0)
    SELECT COUNT(*) INTO legacy_table_count
    FROM information_schema.tables 
    WHERE table_name IN ('users', 'products', 'auctions', 'bids', 'messages')
    AND table_schema = 'public';
    
    RAISE NOTICE 'ROLLBACK VERIFICATION:';
    RAISE NOTICE '  New tables remaining: % (should be 0)', new_table_count;
    RAISE NOTICE '  Legacy tables present: % (should be 5)', legacy_table_count;
    
    IF new_table_count > 0 THEN
        RAISE WARNING 'Warning: % new tables still exist', new_table_count;
    END IF;
    
    IF legacy_table_count < 5 THEN
        RAISE WARNING 'Warning: Missing legacy tables (found %, expected 5)', legacy_table_count;
    END IF;
    
    IF new_table_count = 0 AND legacy_table_count >= 5 THEN
        RAISE NOTICE 'SUCCESS: UUID migration rollback completed successfully';
    END IF;
END $$;

COMMIT;

-- =================
-- POST-ROLLBACK VERIFICATION QUERIES
-- =================
-- Run these manually to verify the rollback

-- Check table structure
SELECT 
    schemaname,
    tablename,
    tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Check for any remaining new tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE '%_new' 
AND table_schema = 'public';

-- Verify critical table row counts
SELECT 
    'users' as table_name, COUNT(*) as row_count FROM users
UNION ALL
SELECT 
    'products' as table_name, COUNT(*) as row_count FROM products
UNION ALL
SELECT 
    'auctions' as table_name, COUNT(*) as row_count FROM auctions
UNION ALL
SELECT 
    'bids' as table_name, COUNT(*) as row_count FROM bids
UNION ALL
SELECT 
    'messages' as table_name, COUNT(*) as row_count FROM messages;

-- Check foreign key relationships
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

RAISE NOTICE '=== UUID MIGRATION ROLLBACK COMPLETED ===';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Run fix-critical-schema-issues.sql for timestamp and financial fixes';
RAISE NOTICE '2. Replace shared/schema.ts with shared/schema-corrected.ts';
RAISE NOTICE '3. Test auction timing with UTC enforcement';
RAISE NOTICE '4. Verify Supabase auth integration';
RAISE NOTICE '5. Run application tests to ensure functionality';