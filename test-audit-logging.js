/**
 * Test script for audit logging system
 * Run with: node test-audit-logging.js
 */

const fetch = require('node-fetch');

const API_URL = process.env.API_URL || 'http://localhost:5000';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'Test123!@#'
};

async function getCSRFToken() {
  const response = await fetch(`${API_URL}/api/csrf-token`);
  const data = await response.json();
  return data.token;
}

async function testLoginAudit() {
  console.log('\n🔍 Testing login audit logging...');
  
  const csrfToken = await getCSRFToken();
  
  // Test successful login (this would require actual Supabase auth)
  console.log('✅ Login audit test requires Supabase authentication setup');
  
  // Test failed login
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        supabaseToken: 'invalid-token'
      })
    });
    
    const data = await response.json();
    console.log(`❌ Failed login response (expected): ${response.status} - ${data.error}`);
    console.log('✅ Failed login should be audited');
  } catch (error) {
    console.error('Error testing failed login:', error);
  }
}

async function testRateLimitAudit() {
  console.log('\n🔍 Testing rate limit audit logging...');
  
  const csrfToken = await getCSRFToken();
  
  // Make multiple requests to trigger rate limit
  console.log('Making multiple requests to trigger rate limit...');
  
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch(`${API_URL}/api/v1/auth/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
          supabaseToken: 'test-token'
        })
      });
      
      if (response.status === 429) {
        const data = await response.json();
        console.log(`✅ Rate limit triggered after ${i + 1} requests`);
        console.log(`Rate limit response: ${data.error}`);
        console.log('✅ Rate limit violation should be audited');
        break;
      }
    } catch (error) {
      console.error(`Error on request ${i + 1}:`, error);
    }
  }
}

async function testCSRFAudit() {
  console.log('\n🔍 Testing CSRF audit logging...');
  
  // Test without CSRF token
  try {
    const response = await fetch(`${API_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Product',
        brand: 'Test Brand',
        price: 100
      })
    });
    
    const data = await response.json();
    console.log(`❌ CSRF validation failed (expected): ${response.status} - ${data.message}`);
    console.log('✅ CSRF violation should be audited');
  } catch (error) {
    console.error('Error testing CSRF:', error);
  }
}

async function testUnauthorizedAccessAudit() {
  console.log('\n🔍 Testing unauthorized access audit logging...');
  
  const csrfToken = await getCSRFToken();
  
  // Test accessing protected endpoint without auth
  try {
    const response = await fetch(`${API_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        name: 'Test Product',
        brand: 'Test Brand',
        price: 100
      })
    });
    
    const data = await response.json();
    console.log(`❌ Unauthorized access (expected): ${response.status} - ${data.message}`);
    console.log('✅ Unauthorized access should be audited');
  } catch (error) {
    console.error('Error testing unauthorized access:', error);
  }
}

async function queryAuditLogs() {
  console.log('\n📊 Querying audit logs from database...');
  
  // This would require database access
  console.log('To view audit logs, query the audit_logs table:');
  console.log(`
    SELECT 
      event_type,
      severity,
      user_email,
      ip_address,
      action,
      success,
      created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 20;
  `);
}

async function runTests() {
  console.log('🚀 Starting audit logging tests...');
  console.log(`API URL: ${API_URL}`);
  
  await testLoginAudit();
  await testRateLimitAudit();
  await testCSRFAudit();
  await testUnauthorizedAccessAudit();
  await queryAuditLogs();
  
  console.log('\n✅ Audit logging tests completed!');
  console.log('Check the audit_logs table in your database to verify the logs were created.');
}

// Run the tests
runTests().catch(console.error);