#!/usr/bin/env node

/**
 * Featured Products Analysis Script
 * 
 * This script analyzes the database to find discrepancies in the featured products system:
 * 1. Products where isFeatured=true or status='featured'
 * 2. Products with boostPackageId but not currently featured
 * 3. Products with expired featured status but still showing boost data
 * 4. Successful boost payments with products not featured correctly
 * 5. General discrepancies between expected and actual featured status
 */

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function analyzeFeatureProducts() {
  console.log('🔍 Starting Featured Products Analysis...\n');
  
  try {
    // 1. Query all products that should be featured (isFeatured=true or status='featured')
    console.log('📋 1. Checking products marked as featured...');
    const featuredQuery = `
      SELECT 
        p.id,
        p.name,
        p.brand,
        p.seller_id,
        p.is_featured,
        p.status,
        p.featured_at,
        p.featured_until,
        p.featured_duration_hours,
        p.boost_package_id,
        p.boost_group_id,
        p.created_at,
        p.updated_at,
        u.username as seller_username,
        bp.name as boost_package_name,
        bp.package_type,
        bp.duration_hours
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      LEFT JOIN boost_packages bp ON p.boost_package_id = bp.id
      WHERE p.is_featured = true OR p.status = 'featured'
      ORDER BY p.featured_at DESC NULLS LAST;
    `;
    
    const featuredResult = await pool.query(featuredQuery);
    console.log(`   Found ${featuredResult.rows.length} products marked as featured\n`);
    
    if (featuredResult.rows.length > 0) {
      console.log('   Featured Products Details:');
      featuredResult.rows.forEach(product => {
        const now = new Date();
        const featuredUntil = product.featured_until ? new Date(product.featured_until) : null;
        const isExpired = featuredUntil && featuredUntil < now;
        
        console.log(`   - ID: ${product.id} | ${product.name} by ${product.seller_username}`);
        console.log(`     Status: ${product.status} | Featured: ${product.is_featured}`);
        console.log(`     Featured Until: ${product.featured_until || 'Not set'} ${isExpired ? '(EXPIRED)' : ''}`);
        console.log(`     Boost Package: ${product.boost_package_name || 'None'} (ID: ${product.boost_package_id || 'None'})`);
        console.log(`     Boost Group: ${product.boost_group_id || 'None'}`);
        console.log('   ---');
      });
    }

    // 2. Check products with boostPackageId but not currently featured
    console.log('\n📋 2. Checking products with boost package but not featured...');
    const boostNotFeaturedQuery = `
      SELECT 
        p.id,
        p.name,
        p.brand,
        p.seller_id,
        p.is_featured,
        p.status,
        p.featured_at,
        p.featured_until,
        p.boost_package_id,
        p.boost_group_id,
        u.username as seller_username,
        bp.name as boost_package_name,
        bp.package_type,
        bp.duration_hours
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      LEFT JOIN boost_packages bp ON p.boost_package_id = bp.id
      WHERE p.boost_package_id IS NOT NULL 
        AND (p.is_featured = false OR p.is_featured IS NULL)
        AND p.status != 'featured'
      ORDER BY p.updated_at DESC;
    `;
    
    const boostNotFeaturedResult = await pool.query(boostNotFeaturedQuery);
    console.log(`   Found ${boostNotFeaturedResult.rows.length} products with boost package but not featured\n`);
    
    if (boostNotFeaturedResult.rows.length > 0) {
      console.log('   ⚠️  DISCREPANCY FOUND: Products with boost package but not featured:');
      boostNotFeaturedResult.rows.forEach(product => {
        console.log(`   - ID: ${product.id} | ${product.name} by ${product.seller_username}`);
        console.log(`     Status: ${product.status} | Featured: ${product.is_featured}`);
        console.log(`     Boost Package: ${product.boost_package_name} (ID: ${product.boost_package_id})`);
        console.log(`     Boost Group: ${product.boost_group_id}`);
        console.log('   ---');
      });
    }

    // 3. Check products with expired featured status but still showing boost data
    console.log('\n📋 3. Checking products with expired featured status but still have boost data...');
    const expiredFeaturedQuery = `
      SELECT 
        p.id,
        p.name,
        p.brand,
        p.seller_id,
        p.is_featured,
        p.status,
        p.featured_at,
        p.featured_until,
        p.boost_package_id,
        p.boost_group_id,
        u.username as seller_username,
        bp.name as boost_package_name,
        bp.package_type,
        bp.duration_hours
      FROM products p
      LEFT JOIN users u ON p.seller_id = u.id
      LEFT JOIN boost_packages bp ON p.boost_package_id = bp.id
      WHERE p.featured_until < NOW()
        AND (p.boost_package_id IS NOT NULL OR p.boost_group_id IS NOT NULL)
      ORDER BY p.featured_until DESC;
    `;
    
    const expiredFeaturedResult = await pool.query(expiredFeaturedQuery);
    console.log(`   Found ${expiredFeaturedResult.rows.length} products with expired featured status but boost data\n`);
    
    if (expiredFeaturedResult.rows.length > 0) {
      console.log('   ⚠️  DISCREPANCY FOUND: Products with expired featured status but still have boost data:');
      expiredFeaturedResult.rows.forEach(product => {
        console.log(`   - ID: ${product.id} | ${product.name} by ${product.seller_username}`);
        console.log(`     Status: ${product.status} | Featured: ${product.is_featured}`);
        console.log(`     Featured Until: ${product.featured_until} (EXPIRED)`);
        console.log(`     Boost Package: ${product.boost_package_name} (ID: ${product.boost_package_id})`);
        console.log(`     Boost Group: ${product.boost_group_id}`);
        console.log('   ---');
      });
    }

    // 4. Check successful boost payments and verify associated products are featured
    console.log('\n📋 4. Checking successful boost payments and their associated products...');
    const boostPaymentsQuery = `
      SELECT 
        pay.id as payment_id,
        pay.order_id,
        pay.amount,
        pay.status as payment_status,
        pay.product_ids,
        pay.boost_option_id,
        pay.paid_at,
        pay.created_at,
        u.username as buyer_username,
        bp.name as boost_package_name,
        bp.package_type,
        bp.duration_hours
      FROM payments pay
      LEFT JOIN users u ON pay.user_id = u.id
      LEFT JOIN boost_packages bp ON pay.boost_option_id = bp.id
      WHERE pay.payment_type = 'boost' 
        AND pay.status = 'paid'
        AND pay.paid_at IS NOT NULL
      ORDER BY pay.paid_at DESC
      LIMIT 20;
    `;
    
    const boostPaymentsResult = await pool.query(boostPaymentsQuery);
    console.log(`   Found ${boostPaymentsResult.rows.length} successful boost payments\n`);
    
    const paymentDiscrepancies = [];
    
    for (const payment of boostPaymentsResult.rows) {
      if (payment.product_ids && payment.product_ids.length > 0) {
        // Check each product in the payment
        for (const productId of payment.product_ids) {
          const productQuery = `
            SELECT 
              p.id,
              p.name,
              p.is_featured,
              p.status,
              p.featured_at,
              p.featured_until,
              p.boost_package_id,
              p.boost_group_id
            FROM products p
            WHERE p.id = $1;
          `;
          
          const productResult = await pool.query(productQuery, [productId]);
          
          if (productResult.rows.length > 0) {
            const product = productResult.rows[0];
            
            // Check if product should be featured based on payment
            const paymentDate = new Date(payment.paid_at);
            const expectedFeaturedUntil = new Date(paymentDate.getTime() + (payment.duration_hours * 60 * 60 * 1000));
            const now = new Date();
            
            const shouldBeFeatured = now < expectedFeaturedUntil;
            const actuallyFeatured = product.is_featured === true || product.status === 'featured';
            
            if (shouldBeFeatured && !actuallyFeatured) {
              paymentDiscrepancies.push({
                payment,
                product,
                issue: 'Should be featured but is not',
                expectedFeaturedUntil,
                actuallyFeatured
              });
            } else if (!shouldBeFeatured && actuallyFeatured) {
              paymentDiscrepancies.push({
                payment,
                product,
                issue: 'Should not be featured but is',
                expectedFeaturedUntil,
                actuallyFeatured
              });
            }
          }
        }
      }
    }
    
    if (paymentDiscrepancies.length > 0) {
      console.log('   ⚠️  DISCREPANCY FOUND: Payment-Product Featured Status Mismatches:');
      paymentDiscrepancies.forEach(disc => {
        console.log(`   - Payment ID: ${disc.payment.payment_id} | Product ID: ${disc.product.id}`);
        console.log(`     Issue: ${disc.issue}`);
        console.log(`     Product Name: ${disc.product.name}`);
        console.log(`     Payment Date: ${disc.payment.paid_at}`);
        console.log(`     Expected Featured Until: ${disc.expectedFeaturedUntil}`);
        console.log(`     Actual Featured Until: ${disc.product.featured_until || 'Not set'}`);
        console.log(`     Boost Package: ${disc.payment.boost_package_name}`);
        console.log('   ---');
      });
    } else {
      console.log('   ✅ No discrepancies found between payments and featured status');
    }

    // 5. General analysis: Check API response vs database
    console.log('\n📋 5. Comparing API response with database query...');
    
    // Simulate what the API returns
    const apiQuery = `
      SELECT 
        p.id,
        p.name,
        p.brand,
        p.is_featured,
        p.status,
        p.featured_at,
        p.featured_until
      FROM products p
      WHERE p.is_featured = true
      ORDER BY p.featured_at DESC NULLS LAST;
    `;
    
    const apiResult = await pool.query(apiQuery);
    console.log(`   API would return ${apiResult.rows.length} featured products`);
    
    // Check for any inconsistencies
    const inconsistencies = [];
    
    for (const product of apiResult.rows) {
      const now = new Date();
      
      // Check if featured_until is in the past
      if (product.featured_until && new Date(product.featured_until) < now) {
        inconsistencies.push({
          product,
          issue: 'Featured until date is in the past',
          details: `Featured until: ${product.featured_until}, but still marked as featured`
        });
      }
      
      // Check if featured_at is missing
      if (product.is_featured && !product.featured_at) {
        inconsistencies.push({
          product,
          issue: 'Featured but no featured_at timestamp',
          details: 'Product is marked as featured but has no featured_at timestamp'
        });
      }
    }
    
    if (inconsistencies.length > 0) {
      console.log('\n   ⚠️  INCONSISTENCIES FOUND:');
      inconsistencies.forEach(inc => {
        console.log(`   - Product ID: ${inc.product.id} | ${inc.product.name}`);
        console.log(`     Issue: ${inc.issue}`);
        console.log(`     Details: ${inc.details}`);
        console.log('   ---');
      });
    } else {
      console.log('   ✅ No inconsistencies found in API response data');
    }

    // 6. Summary statistics
    console.log('\n📊 SUMMARY STATISTICS:');
    console.log(`   - Total products marked as featured: ${featuredResult.rows.length}`);
    console.log(`   - Products with boost package but not featured: ${boostNotFeaturedResult.rows.length}`);
    console.log(`   - Products with expired featured status but boost data: ${expiredFeaturedResult.rows.length}`);
    console.log(`   - Recent successful boost payments: ${boostPaymentsResult.rows.length}`);
    console.log(`   - Payment-product discrepancies: ${paymentDiscrepancies.length}`);
    console.log(`   - API response inconsistencies: ${inconsistencies.length}`);

    // 7. Check boost packages
    console.log('\n📋 6. Checking boost packages configuration...');
    const boostPackagesQuery = `
      SELECT 
        bp.id,
        bp.name,
        bp.package_type,
        bp.item_count,
        bp.price,
        bp.duration_hours,
        bp.is_active,
        COUNT(p.id) as products_using_package
      FROM boost_packages bp
      LEFT JOIN products p ON bp.id = p.boost_package_id
      GROUP BY bp.id, bp.name, bp.package_type, bp.item_count, bp.price, bp.duration_hours, bp.is_active
      ORDER BY bp.package_type, bp.item_count;
    `;
    
    const boostPackagesResult = await pool.query(boostPackagesQuery);
    console.log(`   Found ${boostPackagesResult.rows.length} boost packages\n`);
    
    if (boostPackagesResult.rows.length > 0) {
      console.log('   Boost Packages:');
      boostPackagesResult.rows.forEach(pkg => {
        console.log(`   - ${pkg.name} (${pkg.package_type})`);
        console.log(`     Item Count: ${pkg.item_count} | Price: RM${(pkg.price / 100).toFixed(2)} | Duration: ${pkg.duration_hours}h`);
        console.log(`     Active: ${pkg.is_active} | Products Using: ${pkg.products_using_package}`);
        console.log('   ---');
      });
    }

    console.log('\n✅ Featured Products Analysis Complete!');
    
    // Exit code based on findings
    const totalIssues = boostNotFeaturedResult.rows.length + 
                       expiredFeaturedResult.rows.length + 
                       paymentDiscrepancies.length + 
                       inconsistencies.length;
    
    if (totalIssues > 0) {
      console.log(`\n⚠️  Found ${totalIssues} issues that need attention!`);
      process.exit(1);
    } else {
      console.log('\n🎉 No issues found! Featured products system is working correctly.');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the analysis
analyzeFeatureProducts();