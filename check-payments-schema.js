#!/usr/bin/env node

/**
 * Check actual payments table schema
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment variables
const envContent = readFileSync('.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim().replace(/"/g, '');
  }
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function checkPaymentsSchema() {
  console.log('🔍 Checking actual payments table schema...');
  
  try {
    // Get a sample payment to see actual columns
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    if (payments && payments.length > 0) {
      console.log('✅ Payments table columns:');
      const columns = Object.keys(payments[0]);
      columns.forEach(col => {
        console.log(`   - ${col}: ${typeof payments[0][col]} (${payments[0][col]})`);
      });
    } else {
      console.log('❌ No payments found to analyze schema');
    }
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
  }
}

async function checkSpecificPayment() {
  console.log('\n🔍 Checking the specific payment record...');
  
  const PAYMENT_ID = 'b0b57446-e959-4cff-baa7-1797be3a2510';
  
  try {
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', PAYMENT_ID)
      .single();
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }
    
    console.log('✅ Payment record:');
    Object.entries(payment).forEach(([key, value]) => {
      console.log(`   - ${key}: ${value}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkPaymentsSchema().then(() => checkSpecificPayment()).catch(console.error);