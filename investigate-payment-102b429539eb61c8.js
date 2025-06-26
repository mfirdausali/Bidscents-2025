#!/usr/bin/env node

/**
 * Investigate Payment Transaction: 102b429539eb61c8
 * 
 * This script investigates why the boost payment was successful but not reflected
 * in the database or featured products display.
 */

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

console.log('🔍 Payment Investigation: 102b429539eb61c8');
console.log('===========================================');
console.log('Payment Time: 27/06/2025, 03:19:49');
console.log('Status: Payment Successful, Boost NOT Activated');
console.log('');

const TRANSACTION_ID = '102b429539eb61c8';

async function checkPaymentInDatabase() {
  console.log('📊 Checking Payment in Database...');
  
  try {
    // Check if this is the bill_id or another identifier
    const response = await fetch(`http://localhost:3000/api/payments/verify-status?bill_id=${TRANSACTION_ID}`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Payment found in database:');
      console.log('   - Payment ID:', data.payment?.id);
      console.log('   - Status:', data.payment?.status);
      console.log('   - Order ID:', data.payment?.order_id);
      console.log('   - Amount:', data.payment?.amount, 'sen');
      console.log('   - Created:', data.payment?.created_at);
      console.log('   - Updated:', data.payment?.updated_at);
      
      if (data.billplz_status) {
        console.log('💳 Billplz Status:');
        console.log('   - Paid:', data.billplz_status.paid);
        console.log('   - State:', data.billplz_status.state);
        console.log('   - Paid At:', data.billplz_status.paid_at);
      }
      
      return data.payment;
    } else if (response.status === 404) {
      console.log('❌ Payment not found in database with bill_id:', TRANSACTION_ID);
      return null;
    } else {
      console.log('❌ Error checking payment:', response.status, response.statusText);
      return null;
    }
  } catch (error) {
    console.log('❌ Error connecting to payment API:', error.message);
    return null;
  }
}

async function checkBillplzDirectly() {
  console.log('\n💳 Checking Billplz API Directly...');
  
  const authHeader = `Basic ${Buffer.from(envVars.BILLPLZ_SECRET_KEY + ':').toString('base64')}`;
  
  try {
    const response = await fetch(`${envVars.BILLPLZ_BASE_URL}/v3/bills/${TRANSACTION_ID}`, {
      headers: { 'Authorization': authHeader }
    });
    
    if (response.ok) {
      const billData = await response.json();
      console.log('✅ Bill found in Billplz:');
      console.log('   - ID:', billData.id);
      console.log('   - Paid:', billData.paid);
      console.log('   - State:', billData.state);
      console.log('   - Amount:', billData.amount, 'sen');
      console.log('   - Paid At:', billData.paid_at);
      console.log('   - Reference 1:', billData.reference_1); // This should be our order_id
      console.log('   - Reference 2:', billData.reference_2); // This should be boost info
      
      return billData;
    } else {
      console.log('❌ Bill not found in Billplz:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('   Response:', errorText);
      return null;
    }
  } catch (error) {
    console.log('❌ Error checking Billplz:', error.message);
    return null;
  }
}

async function checkFeaturedProducts() {
  console.log('\n🌟 Checking Current Featured Products...');
  
  try {
    const response = await fetch('http://localhost:3000/api/products/featured');
    
    if (response.ok) {
      const products = await response.json();
      console.log(`✅ Found ${products.length} featured products:`);
      
      products.forEach((product, index) => {
        console.log(`   ${index + 1}. ID: ${product.id}, Name: "${product.name}"`);
        console.log(`      Featured Until: ${product.featuredUntil}`);
        console.log(`      Status: ${product.status}`);
      });
      
      return products;
    } else {
      console.log('❌ Error fetching featured products:', response.status);
      return [];
    }
  } catch (error) {
    console.log('❌ Error checking featured products:', error.message);
    return [];
  }
}

async function checkServerLogs() {
  console.log('\n📋 Server Log Analysis...');
  console.log('Note: Check server console for webhook processing logs');
  console.log('Look for logs around: 27/06/2025, 03:19:49');
  console.log('');
  console.log('Key logs to search for:');
  console.log('- "🔔 BILLPLZ WEBHOOK RECEIVED"');
  console.log('- "✅ Webhook signature verified"');
  console.log('- "🚀 Processing boost activation"');
  console.log('- "✨ Boost activated for products"');
  console.log('- Any error messages around payment processing');
}

// Run investigation
async function runInvestigation() {
  const payment = await checkPaymentInDatabase();
  const billData = await checkBillplzDirectly();
  const featuredProducts = await checkFeaturedProducts();
  
  await checkServerLogs();
  
  console.log('\n🔍 INVESTIGATION SUMMARY');
  console.log('=======================');
  
  if (billData && billData.paid === true) {
    console.log('✅ Billplz confirms payment was successful');
    
    if (payment) {
      console.log('✅ Payment record exists in our database');
      
      if (payment.status === 'paid') {
        console.log('✅ Payment status is "paid" in our database');
        console.log('');
        console.log('🚨 ISSUE IDENTIFIED:');
        console.log('Payment is successful but boost activation may have failed.');
        console.log('Possible causes:');
        console.log('1. Webhook processing error during boost activation');
        console.log('2. Product IDs missing from payment record');
        console.log('3. Database transaction rollback during activation');
        console.log('4. Product validation failure during activation');
        
        if (billData.reference_1) {
          console.log(`\n🔧 DEBUGGING INFO:`);
          console.log(`Order ID: ${billData.reference_1}`);
          console.log(`Boost Reference: ${billData.reference_2 || 'Not set'}`);
        }
      } else {
        console.log('❌ Payment status in database is:', payment.status);
        console.log('🚨 ISSUE: Payment successful in Billplz but not updated in our database');
      }
    } else {
      console.log('❌ Payment record NOT found in our database');
      console.log('🚨 ISSUE: Webhook may not have been processed or bill_id mismatch');
    }
  } else {
    console.log('❌ Billplz shows payment is not successful or bill not found');
    console.log('🚨 ISSUE: Transaction ID may be incorrect or payment actually failed');
  }
  
  console.log('\n💡 NEXT STEPS:');
  console.log('1. Check server logs for webhook processing errors');
  console.log('2. Verify the payment record has product_ids array populated');
  console.log('3. Check if boost activation transaction failed');
  console.log('4. Consider manual boost activation if payment is confirmed');
}

runInvestigation().catch(console.error);