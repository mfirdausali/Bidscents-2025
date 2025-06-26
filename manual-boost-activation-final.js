#!/usr/bin/env node

/**
 * Manual Boost Activation (Final Fixed Version) for Payment: 102b429539eb61c8
 * 
 * This script manually activates the boost using the correct database schema
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

// Payment details
const ORDER_ID = '60039fbd-e3ae-413a-9153-2197a2c3c665';
const BILL_ID = '102b429539eb61c8';
const PAYMENT_ID = 'b0b57446-e959-4cff-baa7-1797be3a2510';
const PAID_AT = '2025-06-27T02:19:49.929+08:00';
const PRODUCT_ID = 221; // Hermès Pearl Whisper
const DURATION_HOURS = 36; // Premium boost

console.log('🔧 Manual Boost Activation (Final Version)');
console.log('==========================================');
console.log('Payment ID:', PAYMENT_ID);
console.log('Bill ID:', BILL_ID);
console.log('Product ID:', PRODUCT_ID);
console.log('Duration:', DURATION_HOURS, 'hours');
console.log('');

async function updatePaymentStatus() {
  console.log('💾 Updating payment status to paid...');
  
  const { data, error } = await supabase
    .from('payments')
    .update({
      bill_id: BILL_ID,
      status: 'paid',
      paid_at: new Date(PAID_AT).toISOString()
    })
    .eq('id', PAYMENT_ID)
    .select()
    .single();
    
  if (error) {
    console.error('❌ Error updating payment:', error.message);
    return false;
  }
  
  console.log('✅ Payment status updated:');
  console.log('   - Status:', data.status);
  console.log('   - Bill ID:', data.bill_id);
  console.log('   - Paid At:', data.paid_at);
  
  return true;
}

async function activateBoost() {
  console.log('\n🚀 Activating boost for product...');
  
  const now = new Date();
  const featuredUntil = new Date(now.getTime() + (DURATION_HOURS * 60 * 60 * 1000));
  
  console.log('   - Featured from:', now.toISOString());
  console.log('   - Featured until:', featuredUntil.toISOString());
  console.log('   - Duration:', DURATION_HOURS, 'hours');
  
  // Get current product status
  const { data: currentProduct } = await supabase
    .from('products')
    .select('id, name, brand, is_featured, status')
    .eq('id', PRODUCT_ID)
    .single();
    
  console.log('\n📦 Product before boost:');
  console.log('   - Name:', currentProduct.name);
  console.log('   - Brand:', currentProduct.brand);
  console.log('   - Featured:', currentProduct.is_featured);
  console.log('   - Status:', currentProduct.status);
  
  const updateData = {
    is_featured: true,
    status: 'featured',
    featured_at: now.toISOString(),
    featured_until: featuredUntil.toISOString(),
    featured_duration_hours: DURATION_HOURS,
    boost_package_id: 27 // Premium boost package ID
  };
  
  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', PRODUCT_ID)
    .select('id, name, brand, is_featured, status, featured_until')
    .single();
    
  if (error) {
    console.error('❌ Error activating boost:', error.message);
    return false;
  }
  
  console.log('\n✅ Boost activated successfully!');
  console.log('📦 Product after boost:');
  console.log('   - Name:', data.name);
  console.log('   - Brand:', data.brand);
  console.log('   - Featured:', data.is_featured);
  console.log('   - Status:', data.status);
  console.log('   - Featured Until:', data.featured_until);
  
  return true;
}

async function verifyActivation() {
  console.log('\n🔍 Verifying activation...');
  
  // Check featured products API
  try {
    const response = await fetch('http://localhost:3000/api/products/featured');
    if (response.ok) {
      const products = await response.json();
      console.log(`✅ Featured products API returns ${products.length} products:`);
      
      const targetProduct = products.find(p => p.id === PRODUCT_ID);
      if (targetProduct) {
        console.log(`🎯 Target product found in featured products:`);
        console.log(`   - "${targetProduct.name}" by ${targetProduct.brand}`);
        console.log(`   - Featured until: ${targetProduct.featuredUntil}`);
      } else {
        console.log(`❌ Target product NOT found in featured products`);
      }
      
      products.forEach((product, index) => {
        console.log(`   ${index + 1}. "${product.name}" by ${product.brand} (ID: ${product.id})`);
      });
    } else {
      console.log('❌ Featured products API error:', response.status);
    }
  } catch (error) {
    console.log('❌ Error checking featured products API:', error.message);
  }
  
  // Check database directly
  const { data: dbProduct } = await supabase
    .from('products')
    .select('name, is_featured, status, featured_until')
    .eq('id', PRODUCT_ID)
    .single();
    
  console.log('\n📊 Database verification:');
  console.log('   - Featured:', dbProduct.is_featured);
  console.log('   - Status:', dbProduct.status);
  console.log('   - Featured Until:', dbProduct.featured_until);
}

async function runActivation() {
  console.log('🚀 Starting manual boost activation...\n');
  
  // Update payment status
  const paymentUpdated = await updatePaymentStatus();
  if (!paymentUpdated) {
    console.log('❌ Failed to update payment status');
    return;
  }
  
  // Activate boost
  const boostActivated = await activateBoost();
  if (!boostActivated) {
    console.log('❌ Failed to activate boost');
    return;
  }
  
  // Verify activation
  await verifyActivation();
  
  console.log('\n🎉 MANUAL BOOST ACTIVATION COMPLETED!');
  console.log('====================================');
  console.log('✅ Payment 102b429539eb61c8 marked as paid');
  console.log('✅ Product "Hermès Pearl Whisper" is now featured');
  console.log('✅ Boost active for 36 hours (Premium package)');
  console.log('');
  console.log('🎯 Results:');
  console.log('1. ✅ Homepage Featured Products section should show your product');
  console.log('2. ✅ Seller dashboard should show boost status');
  console.log('3. ✅ Product should have "Featured" badge');
  console.log('');
  console.log('⚠️  CRITICAL: Fix webhook URL for future payments!');
  console.log('   Current issue: localhost:3000 not accessible from Billplz');
  console.log('   Solution: Use ngrok or deploy to accessible domain');
}

console.log('⚠️  This will activate boost for payment 102b429539eb61c8');
console.log('   Product: Hermès Pearl Whisper (ID: 221)');
console.log('   Duration: 36 hours');
console.log('');

runActivation().catch(console.error);