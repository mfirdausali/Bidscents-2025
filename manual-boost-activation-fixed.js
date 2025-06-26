#!/usr/bin/env node

/**
 * Manual Boost Activation (Fixed Schema) for Payment: 102b429539eb61c8
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

console.log('🔧 Manual Boost Activation (Schema Fixed)');
console.log('==========================================');
console.log('Payment ID:', PAYMENT_ID);
console.log('Bill ID:', BILL_ID);
console.log('');

async function getPaymentDetails() {
  console.log('📊 Getting payment details...');
  
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', PAYMENT_ID)
    .single();
    
  if (error) {
    console.error('❌ Error getting payment:', error.message);
    return null;
  }
  
  console.log('✅ Payment loaded:');
  console.log('   - Status:', payment.status);
  console.log('   - Amount:', payment.amount, 'sen');
  console.log('   - Product ID:', payment.product_id);
  console.log('   - Boost Option ID:', payment.boost_option_id);
  
  // Parse webhook payload to get selected products and boost details
  let webhookData = {};
  if (payment.webhook_payload) {
    try {
      webhookData = JSON.parse(payment.webhook_payload);
      console.log('   - Selected Products:', webhookData.selected_products);
      console.log('   - Boost Package:', webhookData.boost_package?.name);
      console.log('   - Duration:', webhookData.boost_package?.duration_hours, 'hours');
    } catch (e) {
      console.log('   - Webhook payload parse error:', e.message);
    }
  }
  
  return { payment, webhookData };
}

async function updatePaymentStatus() {
  console.log('\n💾 Updating payment status to paid...');
  
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
  
  console.log('✅ Payment status updated to "paid"');
  console.log('   - Bill ID:', data.bill_id);
  console.log('   - Paid At:', data.paid_at);
  
  return true;
}

async function activateBoostForProduct(productId, durationHours) {
  console.log('\n🚀 Activating boost for product ID:', productId);
  
  const now = new Date();
  const featuredUntil = new Date(now.getTime() + (durationHours * 60 * 60 * 1000));
  
  console.log('   - Featured from:', now.toISOString());
  console.log('   - Featured until:', featuredUntil.toISOString());
  console.log('   - Duration:', durationHours, 'hours');
  
  // First, get the current product to show before/after
  const { data: currentProduct, error: getCurrentError } = await supabase
    .from('products')
    .select('id, name, brand, is_featured, status, featured_until')
    .eq('id', productId)
    .single();
    
  if (getCurrentError) {
    console.error('❌ Error getting current product:', getCurrentError.message);
    return false;
  }
  
  console.log('📦 Product before boost:');
  console.log('   - Name:', currentProduct.name);
  console.log('   - Brand:', currentProduct.brand);
  console.log('   - Featured:', currentProduct.is_featured);
  console.log('   - Status:', currentProduct.status);
  
  const updateData = {
    is_featured: true,
    status: 'featured',
    featured_at: now.toISOString(),
    featured_until: featuredUntil.toISOString(),
    featured_duration_hours: durationHours,
    boost_package_id: 27, // Premium boost package ID
    updated_at: now.toISOString()
  };
  
  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', productId)
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

async function verifyFeaturedProducts() {
  console.log('\n🔍 Verifying featured products API...');
  
  try {
    const response = await fetch('http://localhost:3000/api/products/featured');
    if (response.ok) {
      const products = await response.json();
      console.log(`✅ Featured products API returns ${products.length} products:`);
      products.forEach((product, index) => {
        console.log(`   ${index + 1}. "${product.name}" by ${product.brand} (ID: ${product.id})`);
      });
    } else {
      console.log('❌ Featured products API error:', response.status);
    }
  } catch (error) {
    console.log('❌ Error checking featured products:', error.message);
  }
}

async function runManualActivation() {
  console.log('🚀 Starting manual boost activation...\n');
  
  // Get payment and webhook details
  const result = await getPaymentDetails();
  if (!result) {
    console.log('❌ Failed to get payment details');
    return;
  }
  
  const { payment, webhookData } = result;
  
  if (payment.status === 'paid') {
    console.log('⚠️  Payment is already marked as paid. Checking if boost is activated...');
    
    const { data: product } = await supabase
      .from('products')
      .select('is_featured, status')
      .eq('id', payment.product_id)
      .single();
      
    if (product && product.is_featured && product.status === 'featured') {
      console.log('✅ Boost is already activated for this payment');
      await verifyFeaturedProducts();
      return;
    } else {
      console.log('⚠️  Payment is paid but boost not activated. Proceeding with activation...');
    }
  }
  
  // Update payment status to paid
  const paymentUpdated = await updatePaymentStatus();
  if (!paymentUpdated) {
    console.log('❌ Failed to update payment status');
    return;
  }
  
  // Get boost duration from webhook data or default to 36 hours (premium boost)
  const durationHours = webhookData.boost_package?.duration_hours || 36;
  
  // Activate boost for the product
  const boostActivated = await activateBoostForProduct(payment.product_id, durationHours);
  if (!boostActivated) {
    console.log('❌ Failed to activate boost');
    return;
  }
  
  // Verify the featured products API
  await verifyFeaturedProducts();
  
  console.log('\n🎉 MANUAL BOOST ACTIVATION COMPLETED!');
  console.log('====================================');
  console.log('✅ Payment status updated to "paid"');
  console.log('✅ Product activated as featured');
  console.log('✅ Boost will expire in', durationHours, 'hours');
  console.log('');
  console.log('🔍 Next Steps:');
  console.log('1. ✅ Check homepage Featured Products section');
  console.log('2. ✅ Check seller dashboard for boost status');
  console.log('3. ✅ Product should show "Featured" badge');
  console.log('');
  console.log('⚠️  IMPORTANT: Fix webhook URL for future payments');
  console.log('   Replace localhost:3000 with publicly accessible domain');
  console.log('   Current webhook URL points to localhost, which Billplz cannot reach');
}

runManualActivation().catch(console.error);