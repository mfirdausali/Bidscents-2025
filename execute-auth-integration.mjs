#!/usr/bin/env node

/**
 * SUPABASE AUTH INTEGRATION - FINAL STEP
 * Adds Supabase authentication fields to users table
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔐 EXECUTING SUPABASE AUTH INTEGRATION...\n');

// Read .env file
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim().replace(/"/g, '');
    }
  }
});

const supabase = createClient(envVars.VITE_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function executeAuthIntegration() {
  try {
    console.log('=== ADDING SUPABASE AUTH INTEGRATION FIELDS ===\n');
    
    // Check if fields already exist
    console.log('1. 🔍 Checking current user table structure...');
    const { data: existingFields, error: checkError } = await supabase
      .from('users')
      .select('provider_id, provider, supabase_user_id')
      .limit(1);
    
    if (checkError && !checkError.message.includes('provider_id')) {
      console.error(`   ❌ Error checking table structure: ${checkError.message}`);
      return;
    }
    
    if (!checkError) {
      console.log('   ✅ Auth integration fields already exist!');
      console.log('   📊 Fields found: provider_id, provider, supabase_user_id');
      console.log('\n🎉 AUTH INTEGRATION ALREADY COMPLETED!');
      return;
    }
    
    console.log('   📝 Auth fields missing - proceeding with integration...');
    
    // Since we can't execute DDL directly through Supabase client, 
    // we'll provide the exact SQL commands to run
    console.log('\n2. 📋 SQL COMMANDS TO EXECUTE:');
    console.log('   Copy and paste these commands into Supabase SQL Editor:\n');
    
    const sqlCommands = `
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
`;
    
    console.log(sqlCommands);
    
    console.log('\n3. 🎯 EXECUTION INSTRUCTIONS:');
    console.log('   1. Open Supabase Dashboard: https://supabase.com/dashboard');
    console.log('   2. Navigate to: SQL Editor');
    console.log('   3. Copy the SQL commands above');
    console.log('   4. Paste and execute them');
    console.log('   5. Verify with the test queries');
    
    console.log('\n4. ✅ EXPECTED RESULTS:');
    console.log('   - Three new columns added to users table');
    console.log('   - Two new indexes created for performance');
    console.log('   - Users table ready for Supabase auth linking');
    
    console.log('\n5. 🔄 NEXT STEPS AFTER SQL EXECUTION:');
    console.log('   - Test user registration with Supabase auth');
    console.log('   - Verify provider_id linking works correctly');
    console.log('   - Update authentication flow to use new fields');
    
    console.log('\n📝 SAVING SQL TO FILE...');
    const sqlFilePath = path.join(__dirname, 'supabase-auth-integration.sql');
    fs.writeFileSync(sqlFilePath, sqlCommands);
    console.log(`   ✅ SQL saved to: ${sqlFilePath}`);
    
    console.log('\n🚀 AUTH INTEGRATION PREPARATION COMPLETE!');
    
  } catch (error) {
    console.error('\n❌ PREPARATION FAILED:', error.message);
    console.error('   Please check Supabase connectivity and try again');
  }
}

executeAuthIntegration();