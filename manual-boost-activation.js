#!/usr/bin/env node

/**
 * Manual Boost Activation for Payment: 102b429539eb61c8
 * 
 * This script manually activates the boost for the successful payment
 * that didn't get processed due to webhook issues.
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

// Payment details from investigation
const ORDER_ID = '60039fbd-e3ae-413a-9153-2197a2c3c665';
const BILL_ID = '102b429539eb61c8';
const PAYMENT_ID = 'b0b57446-e959-4cff-baa7-1797be3a2510';
const BOOST_PACKAGE_ID = 27;
const AMOUNT = 1000; // sen
const PAID_AT = '2025-06-27T02:19:49.929+08:00';

console.log('🔧 Manual Boost Activation');
console.log('==========================');
console.log('Payment ID:', PAYMENT_ID);
console.log('Order ID:', ORDER_ID);
console.log('Bill ID:', BILL_ID);
console.log('Boost Package:', BOOST_PACKAGE_ID, '(Premium Boost - 1 Item)');
console.log('');

async function getBoostPackageDetails() {
  console.log('📦 Getting boost package details...');
  
  const { data: boostPackage, error } = await supabase
    .from('boost_packages')
    .select('*')
    .eq('id', BOOST_PACKAGE_ID)
    .single();
    
  if (error) {
    console.error('❌ Error getting boost package:', error.message);
    return null;
  }
  
  console.log('✅ Boost package loaded:');
  console.log('   - Name:', boostPackage.name);
  console.log('   - Duration:', boostPackage.duration_hours, 'hours');
  console.log('   - Item Count:', boostPackage.item_count);
  console.log('   - Price:', boostPackage.price, 'sen');
  
  return boostPackage;
}

async function getUserFromPayment() {
  console.log('\n👤 Getting user details from payment...');
  
  const { data: payment, error } = await supabase
    .from('payments')
    .select('user_id')
    .eq('id', PAYMENT_ID)
    .single();
    
  if (error) {
    console.error('❌ Error getting payment:', error.message);
    return null;
  }
  
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, username, email')
    .eq('id', payment.user_id)
    .single();
    
  if (userError) {
    console.error('❌ Error getting user:', userError.message);
    return null;
  }
  
  console.log('✅ User found:');
  console.log('   - ID:', user.id);
  console.log('   - Username:', user.username);
  console.log('   - Email:', user.email);
  
  return { payment, user };
}

async function getUserProducts(userId) {
  console.log('\n📦 Getting user products to select for boosting...');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, brand, price, status, is_featured')
    .eq('seller_id', userId)
    .eq('status', 'active')
    .eq('is_featured', false);
    
  if (error) {
    console.error('❌ Error getting user products:', error.message);
    return [];
  }
  
  console.log(`✅ Found ${products.length} eligible products for boosting:`);
  products.forEach((product, index) => {
    console.log(`   ${index + 1}. ID: ${product.id}, Name: "${product.name}" by ${product.brand} - RM ${product.price}`);
  });
  
  return products;
}

async function updatePaymentRecord(productIds) {
  console.log('\n💾 Updating payment record...');
  
  const updateData = {
    bill_id: BILL_ID,
    status: 'paid',
    paid_at: new Date(PAID_AT).toISOString(),
    product_ids: productIds,
    updated_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase
    .from('payments')
    .update(updateData)
    .eq('id', PAYMENT_ID)
    .select()
    .single();
    
  if (error) {
    console.error('❌ Error updating payment:', error.message);
    return false;
  }
  
  console.log('✅ Payment record updated successfully');
  console.log('   - Status:', data.status);
  console.log('   - Bill ID:', data.bill_id);
  console.log('   - Product IDs:', data.product_ids);
  
  return true;
}

async function activateBoostForProducts(productIds, boostPackage) {
  console.log('\n🚀 Activating boost for products...');
  
  const now = new Date();
  const featuredUntil = new Date(now.getTime() + (boostPackage.duration_hours * 60 * 60 * 1000));
  
  console.log('   - Featured until:', featuredUntil.toISOString());
  console.log('   - Duration:', boostPackage.duration_hours, 'hours');
  
  const updateData = {
    is_featured: true,
    status: 'featured',
    featured_at: now.toISOString(),
    featured_until: featuredUntil.toISOString(),
    featured_duration_hours: boostPackage.duration_hours,
    boost_package_id: boostPackage.id,
    updated_at: now.toISOString()
  };
  
  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .in('id', productIds)
    .select('id, name, is_featured, featured_until');
    
  if (error) {
    console.error('❌ Error activating boost for products:', error.message);
    return false;
  }
  
  console.log('✅ Boost activated for products:');
  data.forEach(product => {
    console.log(`   - ${product.name} (ID: ${product.id})`);
    console.log(`     Featured: ${product.is_featured}`);
    console.log(`     Until: ${product.featured_until}`);
  });
  
  return true;
}

async function runManualActivation() {
  console.log('🚀 Starting manual boost activation...\n');
  
  // Get boost package details
  const boostPackage = await getBoostPackageDetails();
  if (!boostPackage) return;
  
  // Get user and payment details
  const result = await getUserFromPayment();
  if (!result) return;
  
  const { user } = result;
  
  // Get user's products
  const products = await getUserProducts(user.id);
  if (products.length === 0) {
    console.log('❌ No eligible products found for boosting');
    return;
  }
  
  // Select the first product for boost (since it's 1-item package)
  const selectedProductIds = [products[0].id];
  
  console.log(`\n🎯 Selected for boosting: "${products[0].name}" (ID: ${products[0].id})`);
  console.log('Note: Since this is a 1-item premium boost package, selecting the first eligible product.');
  
  // Update payment record
  const paymentUpdated = await updatePaymentRecord(selectedProductIds);
  if (!paymentUpdated) return;
  
  // Activate boost for products
  const boostActivated = await activateBoostForProducts(selectedProductIds, boostPackage);
  if (!boostActivated) return;
  
  console.log('\n🎉 MANUAL BOOST ACTIVATION COMPLETED!');
  console.log('====================================');
  console.log('✅ Payment record updated to "paid" status');
  console.log('✅ Product(s) activated as featured');
  console.log('✅ Featured status will expire in', boostPackage.duration_hours, 'hours');
  console.log('');
  console.log('🔍 Verification:');
  console.log('1. Check homepage Featured Products section');
  console.log('2. Check seller dashboard for boost status');
  console.log('3. Product should show "Featured" badge');
  console.log('');
  console.log('⚠️  IMPORTANT: Fix webhook URL for future payments');
  console.log('   Replace localhost URLs with publicly accessible domain');
}

// Add confirmation prompt
console.log('⚠️  This script will manually activate the boost for payment:', BILL_ID);
console.log('   This should only be run for confirmed successful payments.');
console.log('');

runManualActivation().catch(console.error);