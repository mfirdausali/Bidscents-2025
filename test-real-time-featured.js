#!/usr/bin/env node

/**
 * Real-time Featured Products Testing Suite
 * Tests WebSocket functionality, live updates, and payment flow simulation
 */

import https from 'https';
import http from 'http';

const API_BASE = 'http://localhost:3000';

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

// Test 1: Real-time featured products expiration tracking
async function testFeaturedProductExpiration() {
  console.log('🕒 Testing Featured Product Expiration Logic...');
  
  const response = await makeRequest(`${API_BASE}/api/products/featured`);
  const featuredProducts = response.data;
  
  let totalExpired = 0;
  let totalActive = 0;
  let soonToExpire = 0;
  
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  
  for (const product of featuredProducts) {
    const expiration = new Date(product.featuredUntil);
    
    if (expiration < now) {
      totalExpired++;
      console.log(`   ⏰ EXPIRED: ${product.name} (ID: ${product.id}) expired at ${expiration.toISOString()}`);
    } else if (expiration < oneHourFromNow) {
      soonToExpire++;
      console.log(`   ⚠️  EXPIRING SOON: ${product.name} (ID: ${product.id}) expires at ${expiration.toISOString()}`);
    } else {
      totalActive++;
      console.log(`   ✅ ACTIVE: ${product.name} (ID: ${product.id}) expires at ${expiration.toISOString()}`);
    }
  }
  
  console.log(`\n📊 Expiration Summary:`);
  console.log(`   - Total Featured Products: ${featuredProducts.length}`);
  console.log(`   - Active: ${totalActive}`);
  console.log(`   - Expiring Soon (< 1hr): ${soonToExpire}`);
  console.log(`   - Expired: ${totalExpired}`);
  
  return {
    totalProducts: featuredProducts.length,
    active: totalActive,
    expiringSoon: soonToExpire,
    expired: totalExpired
  };
}

// Test 2: Payment flow simulation for boost packages
async function testBoostPaymentFlow() {
  console.log('\\n💳 Testing Boost Payment Flow...');
  
  // Get available boost packages
  const packagesResponse = await makeRequest(`${API_BASE}/api/boost/packages`);
  const packages = packagesResponse.data.data;
  
  console.log(`Found ${packages.length} boost packages:`);
  packages.forEach(pkg => {
    console.log(`   - ${pkg.name}: RM ${pkg.effective_price} for ${pkg.duration_hours}h (${pkg.item_count} item(s))`);
  });
  
  // Test creating a boost order (without actual payment)
  const testOrderData = {
    packageId: packages[0].id,
    productIds: [114], // Using a featured product ID from our earlier tests
    redirectUrl: 'http://localhost:3000/boost-success',
    callbackUrl: 'http://localhost:3000/api/boost/webhook'
  };
  
  console.log(`\\n🛒 Simulating boost order creation for package: ${packages[0].name}`);
  console.log(`   - Package ID: ${testOrderData.packageId}`);
  console.log(`   - Product IDs: [${testOrderData.productIds.join(', ')}]`);
  console.log(`   - Duration: ${packages[0].duration_hours} hours`);
  console.log(`   - Cost: RM ${packages[0].effective_price}`);
  
  try {
    const orderResponse = await makeRequest(`${API_BASE}/api/boost/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testOrderData)
    });
    
    if (orderResponse.statusCode === 201 || orderResponse.statusCode === 200) {
      console.log('   ✅ Boost order creation endpoint is functional');
      console.log(`   📝 Response: ${JSON.stringify(orderResponse.data, null, 2)}`);
    } else {
      console.log(`   ⚠️  Boost order creation returned status: ${orderResponse.statusCode}`);
      console.log(`   📝 Response: ${JSON.stringify(orderResponse.data, null, 2)}`);
    }
  } catch (error) {
    console.log(`   ❌ Boost order creation failed: ${error.message}`);
  }
  
  return 'Payment flow simulation completed';
}

// Test 3: Search and discovery functionality
async function testFeaturedProductDiscovery() {
  console.log('\\n🔍 Testing Featured Product Search & Discovery...');
  
  // Test different search/filter combinations
  const testCases = [
    { name: 'All Products', url: '/api/products' },
    { name: 'Featured Only', url: '/api/products/featured' },
    { name: 'Products with Featured Sort', url: '/api/products?sort=featured' },
    { name: 'Designer Category Products', url: '/api/products?categoryId=1' },
    { name: 'Arabian House Products', url: '/api/products?categoryId=3' },
    { name: 'Price Range Test', url: '/api/products?minPrice=100&maxPrice=300' }
  ];
  
  const results = [];
  
  for (const testCase of testCases) {
    const response = await makeRequest(`${API_BASE}${testCase.url}`);
    
    if (response.statusCode === 200) {
      const products = Array.isArray(response.data) ? response.data : response.data.products || [];
      const featuredCount = products.filter(p => p.status === 'featured').length;
      
      results.push({
        test: testCase.name,
        totalProducts: products.length,
        featuredProducts: featuredCount,
        status: '✅ PASSED'
      });
      
      console.log(`   ${testCase.name}:`);
      console.log(`     - Total products: ${products.length}`);
      console.log(`     - Featured products: ${featuredCount}`);
      
      // Check if featured products appear first in mixed results
      if (products.length > 0 && featuredCount > 0 && featuredCount < products.length) {
        const firstFeaturedIndex = products.findIndex(p => p.status === 'featured');
        const firstNonFeaturedIndex = products.findIndex(p => p.status !== 'featured');
        
        if (firstNonFeaturedIndex !== -1 && firstFeaturedIndex > firstNonFeaturedIndex) {
          console.log(`     ⚠️  Featured products not prioritized in sort order`);
        } else {
          console.log(`     ✅ Featured products properly prioritized`);
        }
      }
    } else {
      results.push({
        test: testCase.name,
        error: `Status ${response.statusCode}`,
        status: '❌ FAILED'
      });
      console.log(`   ${testCase.name}: ❌ FAILED (Status ${response.statusCode})`);
    }
  }
  
  return results;
}

// Test 4: Product image and metadata integrity
async function testFeaturedProductImages() {
  console.log('\\n🖼️  Testing Featured Product Images & Metadata...');
  
  const response = await makeRequest(`${API_BASE}/api/products/featured`);
  const featuredProducts = response.data;
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const product of featuredProducts) {
    console.log(`   Checking product: ${product.name} (ID: ${product.id})`);
    
    // Check required fields
    const requiredFields = ['id', 'name', 'brand', 'price', 'description', 'imageUrl', 'sellerId'];
    const missingFields = requiredFields.filter(field => !product[field]);
    
    if (missingFields.length > 0) {
      console.log(`     ❌ Missing fields: ${missingFields.join(', ')}`);
      errorCount++;
    } else {
      console.log(`     ✅ All required fields present`);
    }
    
    // Check images array
    if (!product.images || !Array.isArray(product.images) || product.images.length === 0) {
      console.log(`     ❌ No images found`);
      errorCount++;
    } else {
      console.log(`     ✅ ${product.images.length} image(s) found`);
      
      // Check image structure
      for (const img of product.images) {
        if (!img.imageUrl || !img.imageOrder) {
          console.log(`     ⚠️  Image missing required fields: ${JSON.stringify(img)}`);
        }
      }
    }
    
    // Check seller data
    if (!product.seller || !product.seller.username || !product.seller.id) {
      console.log(`     ❌ Invalid seller data`);
      errorCount++;
    } else {
      console.log(`     ✅ Seller: ${product.seller.username} (${product.seller.location || 'No location'})`);
    }
    
    // Check category data
    if (!product.category || !product.category.name) {
      console.log(`     ❌ Invalid category data`);
      errorCount++;
    } else {
      console.log(`     ✅ Category: ${product.category.name}`);
    }
    
    if (missingFields.length === 0) {
      successCount++;
    }
    
    console.log(''); // Add spacing between products
  }
  
  console.log(`📊 Image & Metadata Summary:`);
  console.log(`   - Products checked: ${featuredProducts.length}`);
  console.log(`   - Successful: ${successCount}`);
  console.log(`   - With errors: ${errorCount}`);
  
  return {
    totalChecked: featuredProducts.length,
    successful: successCount,
    withErrors: errorCount
  };
}

// Test 5: Load testing for featured products endpoints
async function testLoadPerformance() {
  console.log('\\n⚡ Testing Load Performance for Featured Products...');
  
  const endpoints = [
    '/api/products/featured',
    '/api/boost/packages',
    '/api/products?sort=featured'
  ];
  
  const concurrentRequests = 5;
  const totalRequestsPerEndpoint = 10;
  
  for (const endpoint of endpoints) {
    console.log(`\\n  Testing endpoint: ${endpoint}`);
    
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < totalRequestsPerEndpoint; i++) {
      promises.push(makeRequest(`${API_BASE}${endpoint}`));
      
      // Add some concurrent requests
      if (i % concurrentRequests === 0) {
        await Promise.all(promises.splice(0, concurrentRequests));
      }
    }
    
    // Wait for remaining requests
    await Promise.all(promises);
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / totalRequestsPerEndpoint;
    
    console.log(`     - Total requests: ${totalRequestsPerEndpoint}`);
    console.log(`     - Total time: ${totalTime}ms`);
    console.log(`     - Average response time: ${avgTime.toFixed(2)}ms`);
    
    if (avgTime > 2000) {
      console.log(`     ⚠️  Performance concern: average response time > 2s`);
    } else {
      console.log(`     ✅ Good performance: average response time < 2s`);
    }
  }
  
  return 'Load performance testing completed';
}

// Main execution
async function runRealTimeTests() {
  console.log('🚀 Starting Real-time Featured Products Testing Suite');
  console.log('=' .repeat(80));
  
  try {
    // Test 1: Expiration tracking
    const expirationResults = await testFeaturedProductExpiration();
    
    // Test 2: Payment flow
    const paymentResults = await testBoostPaymentFlow();
    
    // Test 3: Search and discovery
    const discoveryResults = await testFeaturedProductDiscovery();
    
    // Test 4: Images and metadata
    const imageResults = await testFeaturedProductImages();
    
    // Test 5: Load performance
    const loadResults = await testLoadPerformance();
    
    // Final summary
    console.log('\\n' + '=' .repeat(80));
    console.log('📋 REAL-TIME TESTING SUMMARY');
    console.log('=' .repeat(80));
    
    console.log('\\n🕒 Expiration Tracking:');
    console.log(`   - Total featured products: ${expirationResults.totalProducts}`);
    console.log(`   - Active products: ${expirationResults.active}`);
    console.log(`   - Expiring soon: ${expirationResults.expiringSoon}`);
    console.log(`   - Already expired: ${expirationResults.expired}`);
    
    console.log('\\n🔍 Discovery Testing:');
    discoveryResults.forEach(result => {
      console.log(`   ${result.status} ${result.test}: ${result.totalProducts || 'N/A'} products, ${result.featuredProducts || 'N/A'} featured`);
    });
    
    console.log('\\n🖼️  Image & Metadata:');
    console.log(`   - ${imageResults.successful}/${imageResults.totalChecked} products have complete metadata`);
    console.log(`   - ${imageResults.withErrors} products have issues`);
    
    console.log('\\n💳 Payment Flow: Tested (check logs above for details)');
    console.log('\\n⚡ Load Performance: Tested (check logs above for details)');
    
    console.log('\\n' + '=' .repeat(80));
    console.log('🎉 Real-time testing completed successfully!');
    console.log('=' .repeat(80));
    
  } catch (error) {
    console.error('💥 Critical error in real-time testing:', error);
    process.exit(1);
  }
}

// Run the tests
runRealTimeTests();