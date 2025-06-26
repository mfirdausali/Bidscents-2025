#!/usr/bin/env node

/**
 * Search for payment by Order ID: 60039fbd-e3ae-413a-9153-2197a2c3c665
 * 
 * This script searches for the payment record using the order ID from Billplz
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

const ORDER_ID = '60039fbd-e3ae-413a-9153-2197a2c3c665';
const BILL_ID = '102b429539eb61c8';
const BOOST_PACKAGE_ID = 27; // From reference_2: boost_27

console.log('🔍 Searching for Payment by Order ID');
console.log('===================================');
console.log('Order ID:', ORDER_ID);
console.log('Bill ID:', BILL_ID);
console.log('Boost Package ID:', BOOST_PACKAGE_ID);
console.log('');

async function searchPaymentByOrderId() {
  console.log('📊 Searching in payments table by order_id...');
  
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', ORDER_ID);
    
    if (error) {
      console.error('❌ Database error:', error.message);
      return null;
    }
    
    if (payments && payments.length > 0) {
      console.log(`✅ Found ${payments.length} payment(s):`);
      payments.forEach((payment, index) => {
        console.log(`\n   Payment ${index + 1}:`);
        console.log('   - ID:', payment.id);
        console.log('   - Order ID:', payment.order_id);
        console.log('   - Bill ID:', payment.bill_id);
        console.log('   - Amount:', payment.amount, 'sen');
        console.log('   - Status:', payment.status);
        console.log('   - Payment Type:', payment.payment_type);
        console.log('   - Boost Option ID:', payment.boost_option_id);
        console.log('   - Product IDs:', payment.product_ids);
        console.log('   - Created:', payment.created_at);
        console.log('   - Updated:', payment.updated_at);
        console.log('   - Paid At:', payment.paid_at);
      });
      return payments[0];
    } else {
      console.log('❌ No payment found with order_id:', ORDER_ID);
      return null;
    }
  } catch (error) {
    console.error('❌ Error searching payments:', error.message);
    return null;
  }
}

async function searchPaymentByBillId() {
  console.log('\n📊 Searching in payments table by bill_id...');
  
  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('bill_id', BILL_ID);
    
    if (error) {
      console.error('❌ Database error:', error.message);
      return null;
    }
    
    if (payments && payments.length > 0) {
      console.log(`✅ Found ${payments.length} payment(s) by bill_id:`);
      payments.forEach((payment, index) => {
        console.log(`\n   Payment ${index + 1}:`);
        console.log('   - ID:', payment.id);
        console.log('   - Order ID:', payment.order_id);
        console.log('   - Bill ID:', payment.bill_id);
        console.log('   - Status:', payment.status);
        console.log('   - Product IDs:', payment.product_ids);
      });
      return payments[0];
    } else {
      console.log('❌ No payment found with bill_id:', BILL_ID);
      return null;
    }
  } catch (error) {
    console.error('❌ Error searching payments by bill_id:', error.message);
    return null;
  }
}

async function searchRecentPayments() {
  console.log('\n📊 Searching recent payments (last 24 hours)...');
  
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('❌ Database error:', error.message);
      return [];
    }
    
    console.log(`✅ Found ${payments?.length || 0} recent payments:`);
    
    payments?.forEach((payment, index) => {
      console.log(`\n   Payment ${index + 1}:`);
      console.log('   - Order ID:', payment.order_id);
      console.log('   - Bill ID:', payment.bill_id || 'Not set');
      console.log('   - Status:', payment.status);
      console.log('   - Amount:', payment.amount, 'sen');
      console.log('   - Created:', new Date(payment.created_at).toLocaleString());
    });
    
    return payments || [];
  } catch (error) {
    console.error('❌ Error searching recent payments:', error.message);
    return [];
  }
}

async function checkBoostPackage() {
  console.log('\n📦 Checking boost package ID 27...');
  
  try {
    const { data: packages, error } = await supabase
      .from('boost_packages')
      .select('*')
      .eq('id', BOOST_PACKAGE_ID);
    
    if (error) {
      console.error('❌ Database error:', error.message);
      return null;
    }
    
    if (packages && packages.length > 0) {
      const pkg = packages[0];
      console.log('✅ Boost package found:');
      console.log('   - ID:', pkg.id);
      console.log('   - Name:', pkg.name);
      console.log('   - Type:', pkg.package_type);
      console.log('   - Price:', pkg.price, 'sen');
      console.log('   - Duration:', pkg.duration_hours, 'hours');
      console.log('   - Item Count:', pkg.item_count);
      console.log('   - Active:', pkg.is_active);
      return pkg;
    } else {
      console.log('❌ Boost package not found with ID:', BOOST_PACKAGE_ID);
      return null;
    }
  } catch (error) {
    console.error('❌ Error checking boost package:', error.message);
    return null;
  }
}

// Main investigation
async function runSearch() {
  const paymentByOrderId = await searchPaymentByOrderId();
  const paymentByBillId = await searchPaymentByBillId();
  const recentPayments = await searchRecentPayments();
  const boostPackage = await checkBoostPackage();
  
  console.log('\n🔍 SEARCH SUMMARY');
  console.log('================');
  
  if (paymentByOrderId || paymentByBillId) {
    console.log('✅ Payment record found in database');
    const payment = paymentByOrderId || paymentByBillId;
    
    if (payment.status === 'paid') {
      console.log('✅ Payment status is "paid"');
      
      if (payment.product_ids && payment.product_ids.length > 0) {
        console.log('✅ Product IDs are present:', payment.product_ids);
        console.log('');
        console.log('🚨 ISSUE: Payment successful but boost not activated');
        console.log('Possible causes:');
        console.log('1. Boost activation logic failed after payment update');
        console.log('2. Database transaction rollback during product update');
        console.log('3. Product validation errors during activation');
      } else {
        console.log('❌ Product IDs missing from payment record');
        console.log('🚨 ISSUE: Payment created without product selection data');
      }
    } else {
      console.log('❌ Payment status is:', payment.status);
      console.log('🚨 ISSUE: Webhook not processed to update payment status');
    }
  } else {
    console.log('❌ Payment record NOT found in database');
    console.log('🚨 CRITICAL ISSUE: Webhook completely failed to process');
    console.log('');
    console.log('Possible causes:');
    console.log('1. Webhook URL not accessible from Billplz');
    console.log('2. Webhook signature verification failed');
    console.log('3. Database connection issues during webhook processing');
    console.log('4. Server was down when webhook was sent');
    console.log('');
    console.log('💡 IMMEDIATE ACTION NEEDED:');
    console.log('1. Manually create payment record with correct data');
    console.log('2. Manually activate boost for the intended products');
    console.log('3. Fix webhook processing to prevent future issues');
  }
  
  console.log('\n📋 RECOMMENDED ACTIONS:');
  console.log('1. Check server accessibility from external networks');
  console.log('2. Verify webhook URL in Billplz configuration');
  console.log('3. Check server logs for webhook processing errors');
  console.log('4. Consider manual boost activation for this successful payment');
}

runSearch().catch(console.error);