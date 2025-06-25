
-- =============================================
-- SUPABASE AUTH INTEGRATION - EXECUTE THESE SQL COMMANDS
-- =============================================

-- Step 1: Add authentication fields to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'supabase',
  ADD COLUMN IF NOT EXISTS supabase_user_id text;

-- Step 2: Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_id 
  ON users(provider_id) WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_supabase_user_id 
  ON users(supabase_user_id) WHERE supabase_user_id IS NOT NULL;

-- Step 3: Verification query (run this to confirm)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'users' 
  AND column_name IN ('provider_id', 'provider', 'supabase_user_id')
ORDER BY column_name;

-- Step 4: Test the integration (should return structure)
SELECT 
  COUNT(*) as total_users,
  COUNT(provider_id) as users_with_provider_id,
  COUNT(supabase_user_id) as users_with_supabase_id
FROM users;
