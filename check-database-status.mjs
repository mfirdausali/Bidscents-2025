#!/usr/bin/env node

/**
 * DATABASE STATUS CHECKER
 * Verifies if critical fixes need to be applied
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 CHECKING DATABASE STATUS...\n');

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

async function checkDatabaseStatus() {
  try {
    console.log('=== DATABASE HEALTH CHECK ===\n');
    
    // 1. Check timestamp types
    console.log('1. 🕐 Checking timestamp consistency...');
    const { data: timestampData, error: timestampError } = await supabase
      .rpc('exec_sql', {
        sql_query: `
          SELECT table_name, column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name IN ('auctions', 'bids') 
            AND column_name LIKE '%_at' 
          ORDER BY table_name, column_name;
        `
      })
      .single();
    
    if (timestampError) {
      console.log('   ⚠️  Cannot directly check timestamp types via RPC');
      console.log('   📝 Manual check needed in Supabase SQL Editor');
    } else {
      console.log('   ✅ Timestamp check available via RPC');
    }
    
    // 2. Check for active expired auctions
    console.log('\n2. 🔍 Checking for expired active auctions...');
    const { data: expiredAuctions, error: expiredError } = await supabase
      .from('auctions')
      .select('id, ends_at, status')
      .eq('status', 'active')
      .lt('ends_at', new Date().toISOString());
    
    if (expiredError) {
      console.log(`   ❌ Error checking expired auctions: ${expiredError.message}`);
    } else {
      if (expiredAuctions && expiredAuctions.length > 0) {
        console.log(`   🚨 FOUND ${expiredAuctions.length} EXPIRED ACTIVE AUCTIONS!`);
        console.log('   📋 These auctions should have been closed automatically:');
        expiredAuctions.forEach(auction => {
          console.log(`      - Auction ${auction.id}: ended ${auction.ends_at}`);
        });
        console.log('   ⚡ This indicates the timing bug is still active');
      } else {
        console.log('   ✅ No expired active auctions found');
      }
    }
    
    // 3. Check auth integration fields
    console.log('\n3. 🔐 Checking Supabase auth integration...');
    const { data: authFields, error: authError } = await supabase
      .from('users')
      .select('provider_id, provider, supabase_user_id')
      .limit(1);
    
    if (authError) {
      if (authError.message.includes('provider_id')) {
        console.log('   📝 Auth integration fields missing (fixes needed)');
      } else {
        console.log(`   ⚠️  Error checking auth fields: ${authError.message}`);
      }
    } else {
      console.log('   ✅ Auth integration fields present');
    }
    
    // 4. Check financial precision by looking at decimal places
    console.log('\n4. 💰 Checking financial precision...');
    const { data: bidSample, error: bidError } = await supabase
      .from('bids')
      .select('amount')
      .not('amount', 'is', null)
      .limit(5);
    
    if (bidError) {
      console.log(`   ⚠️  Error checking bid amounts: ${bidError.message}`);
    } else if (bidSample && bidSample.length > 0) {
      console.log('   📊 Sample bid amounts:');
      bidSample.forEach((bid, index) => {
        console.log(`      ${index + 1}. ${bid.amount}`);
      });
      
      // Check if values look like they have proper precision
      const hasDecimals = bidSample.some(bid => 
        String(bid.amount).includes('.') || bid.amount % 1 !== 0
      );
      
      if (hasDecimals) {
        console.log('   ✅ Financial values appear to have decimal precision');
      } else {
        console.log('   ⚠️  All values are integers - might need decimal conversion');
      }
    } else {
      console.log('   ℹ️  No bid data to analyze financial precision');
    }
    
    // 5. Overall auction health
    console.log('\n5. 📊 Overall auction health...');
    const { count: totalAuctions } = await supabase
      .from('auctions')
      .select('*', { count: 'exact', head: true });
    
    const { count: activeAuctions } = await supabase
      .from('auctions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    const { count: completedAuctions } = await supabase
      .from('auctions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');
    
    console.log(`   📈 Total auctions: ${totalAuctions || 0}`);
    console.log(`   🟢 Active auctions: ${activeAuctions || 0}`);
    console.log(`   ✅ Completed auctions: ${completedAuctions || 0}`);
    
    // 6. Generate recommendations
    console.log('\n=== RECOMMENDATIONS ===\n');
    
    const needsTimestampFix = expiredAuctions && expiredAuctions.length > 0;
    const needsAuthIntegration = authError && authError.message.includes('provider_id');
    const needsFinancialFix = !bidSample || bidSample.length === 0 || !bidSample.some(bid => String(bid.amount).includes('.'));
    
    if (needsTimestampFix || needsAuthIntegration || needsFinancialFix) {
      console.log('🔧 FIXES NEEDED:');
      
      if (needsTimestampFix) {
        console.log('   🚨 HIGH PRIORITY: Auction timing bug fix required');
      }
      if (needsAuthIntegration) {
        console.log('   🔐 MEDIUM PRIORITY: Supabase auth integration needed');
      }
      if (needsFinancialFix) {
        console.log('   💰 MEDIUM PRIORITY: Financial precision conversion needed');
      }
      
      console.log('\n📋 NEXT STEPS:');
      console.log('   1. Open Supabase Dashboard → SQL Editor');
      console.log('   2. Execute: manual-supabase-fixes.sql (step by step)');
      console.log('   3. Verify each step with provided test queries');
      console.log('   4. Start auction auto-closure service');
      
    } else {
      console.log('✅ DATABASE APPEARS HEALTHY!');
      console.log('   All critical systems seem to be working correctly.');
      console.log('   Consider starting the auction auto-closure service for maintenance.');
    }
    
    console.log('\n🚀 READY FOR NEXT PHASE');
    
  } catch (error) {
    console.error('\n❌ STATUS CHECK FAILED:', error.message);
    console.error('   Please verify Supabase connectivity and configuration');
  }
}

checkDatabaseStatus();