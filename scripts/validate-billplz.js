#!/usr/bin/env node

/**
 * Validate Billplz credentials and configuration
 * Run this script to test if your Billplz setup is working
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

async function validateBillplz() {
  console.log('🔍 Billplz Credential Validation');
  console.log('================================');
  
  const requiredVars = [
    'BILLPLZ_BASE_URL',
    'BILLPLZ_SECRET_KEY', 
    'BILLPLZ_COLLECTION_ID',
    'BILLPLZ_XSIGN_KEY'
  ];
  
  // Check if all required variables are present
  console.log('\n📋 Environment Variables:');
  let allPresent = true;
  requiredVars.forEach(varName => {
    const value = envVars[varName];
    const status = value ? '✅' : '❌';
    const display = value ? (varName.includes('KEY') ? `${value.substring(0, 8)}...` : value) : 'MISSING';
    console.log(`  ${status} ${varName}: ${display}`);
    if (!value) allPresent = false;
  });
  
  if (!allPresent) {
    console.log('\n❌ Missing required environment variables');
    console.log('Please check your .env file and ensure all Billplz variables are set.');
    return false;
  }
  
  // Test API connectivity
  console.log('\n🌐 Testing API Connectivity:');
  
  const authHeader = `Basic ${Buffer.from(envVars.BILLPLZ_SECRET_KEY + ':').toString('base64')}`;
  
  try {
    const response = await fetch(`${envVars.BILLPLZ_BASE_URL}/v3/collections`, {
      headers: { 'Authorization': authHeader }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API accessible');
      
      // Check collections
      const collections = data.collections || [];
      console.log(`📊 Found ${collections.length} collections`);
      
      const ourCollection = collections.find(c => c.id === envVars.BILLPLZ_COLLECTION_ID);
      if (ourCollection) {
        console.log(`✅ Target collection found: "${ourCollection.title}"`);
        
        // Test bill creation
        console.log('\n💳 Testing Bill Creation:');
        
        const testBill = {
          collection_id: envVars.BILLPLZ_COLLECTION_ID,
          name: 'Test User',
          email: 'test@example.com',
          amount: 100, // RM 1.00
          description: 'Billplz Integration Test',
          callback_url: 'http://localhost:5000/api/test-callback',
          redirect_url: 'http://localhost:3000/test-result'
        };
        
        const formData = new URLSearchParams();
        Object.keys(testBill).forEach(key => {
          formData.append(key, testBill[key].toString());
        });
        
        const billResponse = await fetch(`${envVars.BILLPLZ_BASE_URL}/v3/bills`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData
        });
        
        if (billResponse.ok) {
          const billData = await billResponse.json();
          console.log('✅ Test bill created successfully');
          console.log(`🔗 Bill ID: ${billData.id}`);
          
          // Clean up test bill
          try {
            await fetch(`${envVars.BILLPLZ_BASE_URL}/v3/bills/${billData.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': authHeader }
            });
            console.log('🧹 Test bill cleaned up');
          } catch (deleteError) {
            console.log('⚠️ Could not delete test bill (this is OK)');
          }
          
          console.log('\n🎉 Billplz integration is working correctly!');
          console.log('💡 Your boost orders should now work properly.');
          return true;
          
        } else {
          const errorText = await billResponse.text();
          console.log('❌ Bill creation failed');
          console.log(`Status: ${billResponse.status} ${billResponse.statusText}`);
          console.log('Response:', errorText);
          return false;
        }
        
      } else {
        console.log('❌ Target collection not found');
        console.log('Available collections:');
        collections.forEach(c => {
          console.log(`  - ${c.id}: ${c.title}`);
        });
        return false;
      }
      
    } else {
      const errorText = await response.text();
      console.log('❌ API access failed');
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log('Response:', errorText);
      
      if (response.status === 401) {
        console.log('\n🔑 Authentication failed - your BILLPLZ_SECRET_KEY is invalid');
        console.log('💡 Get a valid API key from https://www.billplz-sandbox.com');
      }
      
      return false;
    }
    
  } catch (error) {
    console.log('❌ Network error:', error.message);
    return false;
  }
}

// Run validation
validateBillplz()
  .then((success) => {
    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('🎯 RESULT: Billplz integration is properly configured');
    } else {
      console.log('🚨 RESULT: Billplz integration needs to be fixed');
      console.log('📖 See BILLPLZ_INTEGRATION_FIX.md for detailed instructions');
    }
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('💥 Validation script failed:', error);
    process.exit(1);
  });