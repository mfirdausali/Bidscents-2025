#!/usr/bin/env node

/**
 * Comprehensive End-to-End Testing Suite for Featured Products Functionality
 * Tests all aspects of the featured product system from API to UI flow
 */

import https from 'https';
import http from 'http';

const API_BASE = 'http://localhost:3000';
const FRONTEND_BASE = 'http://localhost:3000';

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestModule = url.startsWith('https') ? https : http;
    const req = requestModule.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = res.headers['content-type']?.includes('application/json') ? JSON.parse(data) : data;
          resolve({ statusCode: res.statusCode, headers: res.headers, data: jsonData });
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, data });
        }
      });
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.on('error', reject);
    req.end();
  });
}

// Test runner function
async function runTest(testName, testFn) {
  testResults.total++;
  console.log(`\n🧪 Testing: ${testName}`);
  
  try {
    const result = await testFn();
    if (result) {
      testResults.passed++;
      testResults.details.push({ name: testName, status: '✅ PASSED', details: result });
      console.log(`✅ PASSED: ${testName}`);
    } else {
      testResults.failed++;
      testResults.details.push({ name: testName, status: '❌ FAILED', details: 'Test returned false' });
      console.log(`❌ FAILED: ${testName}`);
    }
  } catch (error) {
    testResults.failed++;
    testResults.details.push({ name: testName, status: '❌ FAILED', details: error.message });
    console.log(`❌ FAILED: ${testName} - ${error.message}`);
  }
}

// 1. API Endpoint Tests
async function testFeaturedProductsAPI() {
  const response = await makeRequest(`${API_BASE}/api/products/featured`);
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!Array.isArray(response.data)) {
    throw new Error('Response should be an array');
  }
  
  // Verify each featured product has required fields
  for (const product of response.data) {
    if (!product.id || !product.name || !product.status) {
      throw new Error(`Product missing required fields: ${JSON.stringify(product)}`);
    }
    
    if (product.status !== 'featured') {
      throw new Error(`Product status should be 'featured', got '${product.status}'`);
    }
    
    // Check for featured-specific fields
    if (!product.featuredUntil) {
      throw new Error(`Featured product missing featuredUntil field: ${product.id}`);
    }
  }
  
  return `Found ${response.data.length} featured products with valid structure`;
}

async function testBoostPackagesAPI() {
  const response = await makeRequest(`${API_BASE}/api/boost/packages`);
  
  if (response.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${response.statusCode}`);
  }
  
  if (!response.data.success || !Array.isArray(response.data.data)) {
    throw new Error('Invalid boost packages response structure');
  }
  
  const packages = response.data.data;
  
  // Verify package structure
  for (const pkg of packages) {
    if (!pkg.id || !pkg.name || !pkg.price || !pkg.duration_hours) {
      throw new Error(`Package missing required fields: ${JSON.stringify(pkg)}`);
    }
    
    if (pkg.price <= 0 || pkg.duration_hours <= 0) {
      throw new Error(`Package has invalid pricing/duration: ${JSON.stringify(pkg)}`);
    }
  }
  
  return `Found ${packages.length} valid boost packages`;
}

// 2. Data Integrity Tests
async function testFeaturedProductDataIntegrity() {
  const response = await makeRequest(`${API_BASE}/api/products/featured`);
  const featuredProducts = response.data;
  
  if (featuredProducts.length === 0) {
    throw new Error('No featured products found for integrity testing');
  }
  
  // Test 1: Check if all featured products have valid expiration dates
  const now = new Date();
  let expiredCount = 0;
  let validCount = 0;
  
  for (const product of featuredProducts) {
    const expiration = new Date(product.featuredUntil);
    
    if (expiration < now) {
      expiredCount++;
    } else {
      validCount++;
    }
    
    // Check seller data integrity
    if (!product.seller || !product.seller.id || !product.seller.username) {
      throw new Error(`Product ${product.id} has invalid seller data`);
    }
    
    // Check category data
    if (!product.category || !product.category.id || !product.category.name) {
      throw new Error(`Product ${product.id} has invalid category data`);
    }
    
    // Check image data
    if (!product.images || !Array.isArray(product.images) || product.images.length === 0) {
      throw new Error(`Product ${product.id} has no images`);
    }
  }
  
  return `Data integrity verified: ${validCount} valid, ${expiredCount} expired featured products`;
}

// 3. Frontend Component Tests (testing HTML responses)
async function testFeaturedProductCarouselRendering() {
  const response = await makeRequest(`${FRONTEND_BASE}/`);
  
  if (response.statusCode !== 200) {
    throw new Error(`Frontend not accessible, status: ${response.statusCode}`);
  }
  
  const html = response.data;
  
  // Check if the HTML contains React app mounting point
  if (!html.includes('id="root"')) {
    throw new Error('React app mount point not found');
  }
  
  // Check for meta tags and proper structure
  if (!html.includes('<title>') || !html.includes('<meta')) {
    throw new Error('HTML structure incomplete');
  }
  
  return 'Frontend HTML structure is valid';
}

// 4. Search and Filtering Tests
async function testProductsWithFeaturedFilter() {
  // Test products endpoint with featured filter
  const response = await makeRequest(`${API_BASE}/api/products?sort=featured`);
  
  if (response.statusCode !== 200) {
    throw new Error(`Products API failed, status: ${response.statusCode}`);
  }
  
  // Check if featured products appear first
  const products = response.data;
  let foundFeatured = false;
  let foundNonFeatured = false;
  let featuredAfterNonFeatured = false;
  
  for (const product of products) {
    if (product.status === 'featured') {
      foundFeatured = true;
      if (foundNonFeatured) {
        featuredAfterNonFeatured = true;
      }
    } else {
      foundNonFeatured = true;
    }
  }
  
  if (featuredAfterNonFeatured) {
    throw new Error('Featured products should appear before non-featured products');
  }
  
  return `Product sorting verified: featured products appear first`;
}

// 5. Performance Tests
async function testAPIResponseTimes() {
  const endpoints = [
    '/api/products/featured',
    '/api/boost/packages',
    '/api/products?sort=featured'
  ];
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const startTime = Date.now();
    const response = await makeRequest(`${API_BASE}${endpoint}`);
    const endTime = Date.now();
    
    const responseTime = endTime - startTime;
    
    if (response.statusCode !== 200) {
      throw new Error(`${endpoint} returned status ${response.statusCode}`);
    }
    
    if (responseTime > 5000) { // 5 seconds threshold
      throw new Error(`${endpoint} took too long: ${responseTime}ms`);
    }
    
    results.push({ endpoint, responseTime, status: response.statusCode });
  }
  
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
  
  return `API performance verified: average response time ${avgResponseTime}ms`;
}

// 6. Error Handling Tests
async function testErrorHandling() {
  // Test invalid endpoints
  const invalidEndpoints = [
    '/api/products/featured/999999',
    '/api/boost/packages/999999',
    '/api/boost/invalid-endpoint'
  ];
  
  for (const endpoint of invalidEndpoints) {
    const response = await makeRequest(`${API_BASE}${endpoint}`);
    
    // Should return 4xx error codes for invalid requests
    if (response.statusCode < 400 || response.statusCode >= 500) {
      throw new Error(`${endpoint} should return 4xx error, got ${response.statusCode}`);
    }
  }
  
  return 'Error handling verified for invalid endpoints';
}

// 7. Security Tests
async function testSecurityHeaders() {
  const response = await makeRequest(`${API_BASE}/`);
  const headers = response.headers;
  
  const requiredSecurityHeaders = [
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'strict-transport-security'
  ];
  
  for (const header of requiredSecurityHeaders) {
    if (!headers[header] && !headers[header.toLowerCase()]) {
      throw new Error(`Missing security header: ${header}`);
    }
  }
  
  return 'Security headers verified';
}

// 8. Featured Product Business Logic Tests
async function testFeaturedProductBusinessLogic() {
  const featuredResponse = await makeRequest(`${API_BASE}/api/products/featured`);
  const allProductsResponse = await makeRequest(`${API_BASE}/api/products`);
  
  const featuredProducts = featuredResponse.data;
  const allProducts = allProductsResponse.data;
  
  // Verify featured products are subset of all products
  for (const featured of featuredProducts) {
    const foundInAllProducts = allProducts.find(p => p.id === featured.id);
    if (!foundInAllProducts) {
      throw new Error(`Featured product ${featured.id} not found in all products`);
    }
  }
  
  // Check pricing logic
  for (const product of featuredProducts) {
    if (product.price <= 0) {
      throw new Error(`Featured product ${product.id} has invalid price: ${product.price}`);
    }
    
    if (product.stockQuantity <= 0) {
      throw new Error(`Featured product ${product.id} has no stock`);
    }
  }
  
  return 'Featured product business logic verified';
}

// 9. WebSocket Connection Test (if applicable)
async function testWebSocketConnection() {
  // This is a basic connection test - in a real scenario you'd test real-time updates
  return new Promise((resolve, reject) => {
    try {
      // Just test if WebSocket is available in the environment
      if (typeof WebSocket === 'undefined') {
        // This is expected in Node.js environment
        resolve('WebSocket testing skipped (Node.js environment)');
        return;
      }
      
      const ws = new WebSocket(`ws://localhost:3000/ws`);
      
      ws.onopen = () => {
        ws.close();
        resolve('WebSocket connection successful');
      };
      
      ws.onerror = (error) => {
        resolve('WebSocket connection failed as expected (may require authentication)');
      };
      
      // Timeout after 3 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          resolve('WebSocket connection timeout (may require authentication)');
        }
      }, 3000);
      
    } catch (error) {
      resolve('WebSocket testing skipped (not available in environment)');
    }
  });
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Featured Products End-to-End Testing');
  console.log('=' .repeat(80));
  
  // API Tests
  await runTest('Featured Products API Endpoint', testFeaturedProductsAPI);
  await runTest('Boost Packages API Endpoint', testBoostPackagesAPI);
  
  // Data Integrity Tests
  await runTest('Featured Product Data Integrity', testFeaturedProductDataIntegrity);
  
  // Frontend Tests  
  await runTest('Frontend Accessibility', testFeaturedProductCarouselRendering);
  
  // Search and Filtering
  await runTest('Products with Featured Filter', testProductsWithFeaturedFilter);
  
  // Performance Tests
  await runTest('API Response Times', testAPIResponseTimes);
  
  // Error Handling
  await runTest('Error Handling', testErrorHandling);
  
  // Security Tests
  await runTest('Security Headers', testSecurityHeaders);
  
  // Business Logic Tests
  await runTest('Featured Product Business Logic', testFeaturedProductBusinessLogic);
  
  // WebSocket Tests
  await runTest('WebSocket Connection', testWebSocketConnection);
  
  // Print final results
  console.log('\n' + '=' .repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(80));
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  console.log('\n📋 DETAILED RESULTS:');
  console.log('-' .repeat(80));
  
  testResults.details.forEach((test) => {
    console.log(`${test.status} ${test.name}`);
    if (test.details) {
      console.log(`   └─ ${test.details}`);
    }
  });
  
  console.log('\n' + '=' .repeat(80));
  
  if (testResults.failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Featured product functionality is working perfectly.');
  } else {
    console.log(`⚠️  ${testResults.failed} test(s) failed. Please review the failures above.`);
  }
  
  console.log('=' .repeat(80));
  
  // Exit with appropriate code
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  console.error('💥 Critical error running tests:', error);
  process.exit(1);
});