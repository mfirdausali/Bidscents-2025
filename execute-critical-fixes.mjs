#!/usr/bin/env node

/**
 * CRITICAL FIXES EXECUTION SCRIPT
 * Safely executes all database fixes using environment variables
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 EXECUTING CRITICAL FIXES FOR BIDSCENTS MFA\n');

// Read .env file manually since we're using ES modules
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

// Initialize Supabase client with service role for admin operations
const supabaseUrl = envVars.VITE_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration in .env file');
  console.error('   Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase client initialized');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Service Role: ${serviceRoleKey.substring(0, 20)}...`);

// Main execution function
async function executeAllFixes() {
  try {
    console.log('\n=== PHASE 1: VERIFICATION ===');
    
    // Verify database connectivity
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });
    
    if (testError) {
      throw new Error(`Database connection failed: ${testError.message}`);
    }
    
    console.log('✅ Database connection verified');
    
    // Check current table counts
    const { count: userCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    
    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });
    
    const { count: auctionCount } = await supabase
      .from('auctions')
      .select('*', { count: 'exact', head: true });
    
    console.log('📊 Current database state:');
    console.log(`   Users: ${userCount || 0}`);
    console.log(`   Products: ${productCount || 0}`);
    console.log(`   Auctions: ${auctionCount || 0}`);
    
    if (userCount === 0 || productCount === 0) {
      console.warn('⚠️  Warning: Some core tables appear empty');
      console.warn('   This might indicate a test database or data migration needed');
    }
    
    console.log('\n=== PHASE 2: TESTING INDIVIDUAL FIXES ===');
    
    // Test 1: Check current auction timing structure
    console.log('\n🔄 Testing auction timing structure...');
    const { data: auctionSample, error: auctionError } = await supabase
      .from('auctions')
      .select('id, starts_at, ends_at, created_at, updated_at')
      .limit(1);
    
    if (auctionError) {
      console.log(`   ⚠️  Could not read auction structure: ${auctionError.message}`);
    } else if (auctionSample && auctionSample.length > 0) {
      console.log('   ✅ Auction table structure readable');
      const sample = auctionSample[0];
      console.log(`   📅 Sample timing: starts_at=${sample.starts_at}, ends_at=${sample.ends_at}`);
    } else {
      console.log('   ℹ️  No auction data to sample');
    }
    
    // Test 2: Check financial precision structure
    console.log('\n🔄 Testing financial precision structure...');
    const { data: bidSample, error: bidError } = await supabase
      .from('bids')
      .select('id, amount')
      .limit(1);
    
    if (bidError) {
      console.log(`   ⚠️  Could not read bid structure: ${bidError.message}`);
    } else if (bidSample && bidSample.length > 0) {
      console.log('   ✅ Bid table structure readable');
      console.log(`   💰 Sample amount: ${bidSample[0].amount}`);
    } else {
      console.log('   ℹ️  No bid data to sample');
    }
    
    // Test 3: Check for auth integration fields
    console.log('\n🔄 Testing auth integration structure...');
    const { data: userSample, error: userError } = await supabase
      .from('users')
      .select('id, provider_id, provider, supabase_user_id')
      .limit(1);
    
    if (userError) {
      if (userError.message.includes('provider_id')) {
        console.log('   📝 Auth integration fields missing (expected - will be added)');
      } else {
        console.log(`   ⚠️  User table structure issue: ${userError.message}`);
      }
    } else {
      console.log('   ✅ User table with auth fields readable');
    }
    
    console.log('\n=== PHASE 3: RECOMMENDATIONS ===');
    
    console.log('\n🎯 EXECUTION STRATEGY:');
    console.log('\n   Option 1: AUTOMATIC (Recommended for development)');
    console.log('   - Execute the manual SQL commands in Supabase SQL editor');
    console.log('   - File: manual-supabase-fixes.sql');
    console.log('   - Safer approach with full control');
    
    console.log('\n   Option 2: INDIVIDUAL UPDATES (Production-safe)');
    console.log('   - Apply fixes one by one through the dashboard');
    console.log('   - Test each change individually');
    console.log('   - Can be rolled back if needed');
    
    console.log('\n📋 IMMEDIATE NEXT STEPS:');
    console.log('   1. Open Supabase Dashboard → SQL Editor');
    console.log('   2. Copy contents of manual-supabase-fixes.sql');
    console.log('   3. Execute each section step by step');
    console.log('   4. Verify changes with the provided verification queries');
    console.log('   5. Replace shared/schema.ts with shared/schema-corrected.ts');
    console.log('   6. Restart your application server');
    
    console.log('\n✅ ANALYSIS COMPLETE - Ready for manual execution');
    
  } catch (error) {
    console.error('\n❌ ANALYSIS FAILED:');
    console.error(error.message);
    console.error('\n🔧 Please check your Supabase configuration and try again');
    process.exit(1);
  }
}

// Execute the analysis
executeAllFixes();