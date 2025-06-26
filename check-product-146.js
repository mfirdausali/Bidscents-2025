#!/usr/bin/env node

/**
 * Check specific product (ID: 146) for boost/payment history
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

async function checkProduct146() {
  console.log('🔍 Checking Product 146 Details...\n');
  
  try {
    // 1. Get product details
    const productResponse = await makeRequest(`${API_BASE}/api/products/146`);
    
    if (productResponse.statusCode !== 200) {
      console.error(`❌ Failed to fetch product 146: ${productResponse.statusCode}`);
      return;
    }
    
    const product = productResponse.data;
    console.log('📋 Product 146 Details:');
    console.log(`   Name: ${product.name}`);
    console.log(`   Brand: ${product.brand} `);
    console.log(`   Seller: ${product.seller.username} (ID: ${product.sellerId})`);
    console.log(`   Is Featured: ${product.isFeatured}`);
    console.log(`   Status: ${product.status}`);
    console.log(`   Featured Until: ${product.featuredUntil}`);
    console.log(`   Featured At: ${product.featuredAt || 'Not set'}`);
    console.log(`   Boost Package ID: ${product.boostPackageId || product.boost_package_id || 'Not set'}`);
    console.log(`   Boost Group ID: ${product.boostGroupId || product.boost_group_id || 'Not set'}`);
    
    // Check if it should still be featured
    const now = new Date();
    const featuredUntil = new Date(product.featuredUntil);
    const shouldBeFeatured = featuredUntil > now;
    
    console.log(`\n⏰ Time Analysis:`);
    console.log(`   Current Time: ${now.toISOString()}`);
    console.log(`   Featured Until: ${featuredUntil.toISOString()}`);
    console.log(`   Should be Featured: ${shouldBeFeatured ? '✅ YES' : '❌ NO (EXPIRED)'}`);
    console.log(`   Time Remaining: ${shouldBeFeatured ? Math.ceil((featuredUntil - now) / (1000 * 60)) + ' minutes' : 'EXPIRED'}`);
    
    // 2. Check if seller has other products
    console.log(`\n📋 Checking seller's other products...`);
    const allProductsResponse = await makeRequest(`${API_BASE}/api/products`);
    
    if (allProductsResponse.statusCode === 200) {
      const allProducts = allProductsResponse.data;
      const sellerProducts = allProducts.filter(p => p.sellerId === product.sellerId);
      const sellerFeaturedProducts = sellerProducts.filter(p => p.isFeatured || p.is_featured);
      
      console.log(`   Total seller products: ${sellerProducts.length}`);
      console.log(`   Seller featured products: ${sellerFeaturedProducts.length}`);
      
      if (sellerFeaturedProducts.length > 1) {
        console.log(`   Other featured products by same seller:`);
        sellerFeaturedProducts.forEach(p => {
          if (p.id !== 146) {
            console.log(`     - ${p.name} (ID: ${p.id}) - Featured until: ${p.featuredUntil || p.featured_until || 'Not set'}`);
          }
        });
      }
    }
    
    // 3. Summary and recommendations
    console.log(`\n📊 ANALYSIS SUMMARY:`);
    
    if (!shouldBeFeatured) {
      console.log(`   ⚠️  ISSUE: Product 146 is marked as featured but has expired`);
      console.log(`   🔧 RECOMMENDATION: Run the featured products expiration cleanup`);
      console.log(`       This should set isFeatured to false and clear boost data`);
    } else {
      console.log(`   ✅ Product is correctly featured and still within time limit`);
    }
    
    if (!product.featuredAt) {
      console.log(`   ⚠️  ISSUE: Missing featuredAt timestamp`);
      console.log(`   🔧 RECOMMENDATION: Set featuredAt when products are boosted`);
    }
    
    if (!product.boostPackageId && !product.boost_package_id) {
      console.log(`   ⚠️  ISSUE: Missing boost package information`);
      console.log(`   🔧 RECOMMENDATION: Ensure boost package ID is stored when products are boosted`);
    }
    
    console.log('\n✅ Product 146 Analysis Complete!');
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
  }
}

// Run the check
checkProduct146();