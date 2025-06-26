#!/usr/bin/env node

/**
 * Featured Products Analysis Script (API-based)
 * 
 * This script analyzes the featured products system using API calls:
 * 1. Fetches featured products from the API
 * 2. Analyzes the data for potential issues
 * 3. Compares with expected behavior
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

async function analyzeFeaturedProducts() {
  console.log('🔍 Starting Featured Products Analysis (API-based)...\n');
  
  try {
    // 1. Fetch featured products from the API
    console.log('📋 1. Fetching featured products from API...');
    const featuredResponse = await makeRequest(`${API_BASE}/api/products/featured`);
    
    if (featuredResponse.statusCode !== 200) {
      console.error(`❌ Failed to fetch featured products: ${featuredResponse.statusCode}`);
      return;
    }
    
    const featuredProducts = featuredResponse.data;
    console.log(`   Found ${featuredProducts.length} featured products\n`);
    
    if (featuredProducts.length === 0) {
      console.log('   ⚠️  No featured products found!');
      return;
    }
    
    // 2. Analyze each featured product
    console.log('📋 2. Analyzing featured products details...');
    
    const issues = [];
    const now = new Date();
    
    for (let i = 0; i < featuredProducts.length; i++) {
      const product = featuredProducts[i];
      console.log(`   Analyzing product ${i + 1}/${featuredProducts.length}: ${product.name} (ID: ${product.id})`);
      
      // Check if product has required featured fields
      if (!product.isFeatured && !product.is_featured) {
        issues.push({
          productId: product.id,
          productName: product.name,
          issue: 'Featured product API returned product that is not marked as featured',
          severity: 'high',
          details: `isFeatured: ${product.isFeatured}, is_featured: ${product.is_featured}`
        });
      }
      
      // Check if featured_until is set and not expired
      const featuredUntil = product.featuredUntil || product.featured_until;
      if (featuredUntil) {
        const featuredUntilDate = new Date(featuredUntil);
        if (featuredUntilDate < now) {
          issues.push({
            productId: product.id,
            productName: product.name,
            issue: 'Featured product has expired featured_until date',
            severity: 'high',
            details: `Featured until: ${featuredUntil}, Current time: ${now.toISOString()}`
          });
        }
      } else {
        issues.push({
          productId: product.id,
          productName: product.name,
          issue: 'Featured product missing featured_until timestamp',
          severity: 'medium',
          details: 'Product is featured but has no expiration date set'
        });
      }
      
      // Check if featured_at is set
      const featuredAt = product.featuredAt || product.featured_at;
      if (!featuredAt) {
        issues.push({
          productId: product.id,
          productName: product.name,
          issue: 'Featured product missing featured_at timestamp',
          severity: 'medium',
          details: 'Product is featured but has no start date set'
        });
      }
      
      // Check boost package information
      const boostPackageId = product.boostPackageId || product.boost_package_id;
      const boostGroupId = product.boostGroupId || product.boost_group_id;
      
      if (!boostPackageId && !boostGroupId) {
        issues.push({
          productId: product.id,
          productName: product.name,
          issue: 'Featured product missing boost package information',
          severity: 'low',
          details: 'Product is featured but has no boost package or group ID'
        });
      }
    }
    
    // 3. Fetch all products to compare
    console.log('\n📋 3. Fetching all products for comparison...');
    const allProductsResponse = await makeRequest(`${API_BASE}/api/products`);
    
    if (allProductsResponse.statusCode !== 200) {
      console.log(`   ⚠️  Could not fetch all products for comparison: ${allProductsResponse.statusCode}`);
    } else {
      const allProducts = allProductsResponse.data;
      console.log(`   Found ${allProducts.length} total products`);
      
      // Check if any non-featured products have boost package data
      const nonFeaturedWithBoost = allProducts.filter(product => {
        const isFeatured = product.isFeatured || product.is_featured;
        const boostPackageId = product.boostPackageId || product.boost_package_id;
        const boostGroupId = product.boostGroupId || product.boost_group_id;
        
        return !isFeatured && (boostPackageId || boostGroupId);
      });
      
      if (nonFeaturedWithBoost.length > 0) {
        console.log(`   ⚠️  Found ${nonFeaturedWithBoost.length} non-featured products with boost data:`);
        nonFeaturedWithBoost.forEach(product => {
          issues.push({
            productId: product.id,
            productName: product.name,
            issue: 'Non-featured product has boost package data',
            severity: 'medium',
            details: `boost_package_id: ${product.boostPackageId || product.boost_package_id}, boost_group_id: ${product.boostGroupId || product.boost_group_id}`
          });
        });
      }
    }
    
    // 4. Check boost packages endpoint
    console.log('\n📋 4. Checking boost packages...');
    const boostPackagesResponse = await makeRequest(`${API_BASE}/api/boost/packages`);
    
    if (boostPackagesResponse.statusCode !== 200) {
      console.log(`   ⚠️  Could not fetch boost packages: ${boostPackagesResponse.statusCode}`);
    } else {
      const boostPackagesData = boostPackagesResponse.data;
      const boostPackages = boostPackagesData.success ? boostPackagesData.data : boostPackagesData;
      console.log(`   Found ${boostPackages ? boostPackages.length : 0} boost packages`);
      
      if (boostPackages && boostPackages.length > 0) {
        boostPackages.forEach(pkg => {
          console.log(`   - ${pkg.name}: ${pkg.package_type || pkg.packageType}, ${pkg.item_count || pkg.itemCount} items, RM${(pkg.price / 100).toFixed(2)}, ${pkg.duration_hours || pkg.durationHours}h`);
        });
      }
      
      // Check if featured products reference valid boost packages
      if (boostPackages && boostPackages.length > 0) {
        const validBoostPackageIds = boostPackages.map(pkg => pkg.id);
        
        featuredProducts.forEach(product => {
          const boostPackageId = product.boostPackageId || product.boost_package_id;
          if (boostPackageId && !validBoostPackageIds.includes(boostPackageId)) {
            issues.push({
              productId: product.id,
              productName: product.name,
              issue: 'Featured product references invalid boost package',
              severity: 'high',
              details: `boost_package_id: ${boostPackageId}, valid IDs: ${validBoostPackageIds.join(', ')}`
            });
          }
        });
      }
    }
    
    // 5. Summary and results
    console.log('\n📊 ANALYSIS RESULTS:');
    console.log(`   Total featured products: ${featuredProducts.length}`);
    console.log(`   Total issues found: ${issues.length}`);
    
    const highSeverityIssues = issues.filter(issue => issue.severity === 'high');
    const mediumSeverityIssues = issues.filter(issue => issue.severity === 'medium');
    const lowSeverityIssues = issues.filter(issue => issue.severity === 'low');
    
    if (issues.length > 0) {
      console.log('\n⚠️  ISSUES FOUND:');
      
      console.log(`   High severity issues: ${highSeverityIssues.length}`);
      console.log(`   Medium severity issues: ${mediumSeverityIssues.length}`);
      console.log(`   Low severity issues: ${lowSeverityIssues.length}`);
      
      console.log('\n   HIGH SEVERITY ISSUES:');
      highSeverityIssues.forEach(issue => {
        console.log(`   🔴 Product ${issue.productId} (${issue.productName})`);
        console.log(`      Issue: ${issue.issue}`);
        console.log(`      Details: ${issue.details}`);
        console.log('');
      });
      
      console.log('\n   MEDIUM SEVERITY ISSUES:');
      mediumSeverityIssues.forEach(issue => {
        console.log(`   🟡 Product ${issue.productId} (${issue.productName})`);
        console.log(`      Issue: ${issue.issue}`);
        console.log(`      Details: ${issue.details}`);
        console.log('');
      });
      
      console.log('\n   LOW SEVERITY ISSUES:');
      lowSeverityIssues.forEach(issue => {
        console.log(`   🟢 Product ${issue.productId} (${issue.productName})`);
        console.log(`      Issue: ${issue.issue}`);
        console.log(`      Details: ${issue.details}`);
        console.log('');
      });
    } else {
      console.log('\n✅ No issues found! Featured products system appears to be working correctly.');
    }
    
    // 6. Recommendations
    if (issues.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      
      if (highSeverityIssues.length > 0) {
        console.log('   - Address high severity issues immediately:');
        console.log('     • Run expired featured products cleanup');
        console.log('     • Verify boost package references');
        console.log('     • Check featured product marking logic');
      }
      
      if (mediumSeverityIssues.length > 0) {
        console.log('   - Address medium severity issues:');
        console.log('     • Set proper timestamps for featured products');
        console.log('     • Clean up orphaned boost data');
        console.log('     • Implement proper featured product lifecycle');
      }
      
      if (lowSeverityIssues.length > 0) {
        console.log('   - Address low severity issues:');
        console.log('     • Ensure consistent boost package association');
        console.log('     • Add validation for featured product data');
      }
    }
    
    console.log('\n✅ Featured Products Analysis Complete!');
    
    // Exit with appropriate code
    if (highSeverityIssues.length > 0) {
      process.exit(2); // High severity issues
    } else if (mediumSeverityIssues.length > 0) {
      process.exit(1); // Medium severity issues
    } else {
      process.exit(0); // No issues
    }
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  }
}

// Run the analysis
analyzeFeaturedProducts();