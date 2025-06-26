#!/usr/bin/env node

/**
 * Test Payment Flow
 * 
 * This script tests the complete payment flow configuration
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

console.log('🧪 Payment Flow Configuration Test');
console.log('===================================');

// Check environment variables
console.log('\n📋 Environment Configuration:');
console.log(`✅ APP_URL: ${envVars.APP_URL || 'http://localhost:5000'}`);
console.log(`✅ CLIENT_URL: ${envVars.CLIENT_URL || 'http://localhost:3000'}`);
console.log(`✅ NODE_ENV: ${envVars.NODE_ENV || 'development'}`);

// Check URL configurations
const appUrl = envVars.APP_URL || 'http://localhost:5000';
const clientUrl = envVars.CLIENT_URL || 'http://localhost:3000';

console.log('\n🔗 Payment URLs:');
console.log(`📞 Webhook URL: ${appUrl}/api/payments/billplz/webhook`);
console.log(`🔄 Redirect URL: ${clientUrl}/boost/payment-result`);

// Check Billplz configuration
console.log('\n💳 Billplz Configuration:');
const billplzConfigured = envVars.BILLPLZ_SECRET_KEY && envVars.BILLPLZ_COLLECTION_ID && envVars.BILLPLZ_XSIGN_KEY;
console.log(`✅ Billplz Configured: ${billplzConfigured ? 'YES' : 'NO'}`);
console.log(`✅ Environment: ${envVars.BILLPLZ_BASE_URL?.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION'}`);

// Test payment flow simulation
console.log('\n🚀 Payment Flow Simulation:');
console.log('1. User initiates boost order → POST /api/boost/create-order');
console.log('2. Server creates Billplz bill with:');
console.log(`   - callback_url: ${appUrl}/api/payments/billplz/webhook`);
console.log(`   - redirect_url: ${clientUrl}/boost/payment-result`);
console.log('3. User completes payment on Billplz');
console.log('4. Billplz sends webhook → webhook processes payment');
console.log('5. User redirected to payment result page');

// Expected payment result URL format
const sampleBillId = '1234567890abcdef';
const sampleRedirectUrl = `${clientUrl}/boost/payment-result?billplz%5Bid%5D=${sampleBillId}&billplz%5Bpaid%5D=true&billplz%5Bpaid_at%5D=2025-06-26+18%3A00%3A00+%2B0800&billplz%5Bx_signature%5D=abc123def456`;

console.log('\n📱 Sample Payment Result URL:');
console.log(sampleRedirectUrl);

// Validation
console.log('\n✅ Configuration Validation:');
const issues = [];

if (!envVars.CLIENT_URL) {
  issues.push('❌ CLIENT_URL not set - will default to localhost:5173');
}

if (clientUrl.includes(':5173')) {
  issues.push('⚠️ CLIENT_URL points to Vite port 5173 instead of proxy port 3000');
}

if (!billplzConfigured) {
  issues.push('❌ Billplz credentials not fully configured');
}

if (issues.length === 0) {
  console.log('🎉 All configuration looks good!');
  console.log('\n💡 Test the flow:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Go to seller dashboard and create a boost order');
  console.log('3. Complete payment on Billplz sandbox');
  console.log('4. Verify redirect to payment result page');
} else {
  console.log('🚨 Issues found:');
  issues.forEach(issue => console.log(`   ${issue}`));
}

console.log('\n' + '='.repeat(50));