#!/usr/bin/env node

/**
 * Featured Products Status Checker
 * 
 * This script analyzes the current status of featured products in the BidScents database.
 * It checks for active featured products, expired ones, recent boost purchases, and provides
 * a comprehensive summary of the boost system status.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

// Database connection setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    console.error('Required environment variables: SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Utility functions
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatPrice(amount) {
    if (typeof amount === 'string') {
        return `RM ${parseFloat(amount).toFixed(2)}`;
    }
    if (typeof amount === 'number') {
        // Handle prices in sen (cents)
        if (amount > 1000) {
            return `RM ${(amount / 100).toFixed(2)}`;
        }
        return `RM ${amount.toFixed(2)}`;
    }
    return 'N/A';
}

function getTimeDifference(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    
    if (diffHours > 0) {
        return `${diffHours} hours remaining`;
    } else if (diffHours === 0) {
        return 'Expires within the hour';
    } else {
        return `Expired ${Math.abs(diffHours)} hours ago`;
    }
}

async function checkDatabaseConnection() {
    try {
        console.log('🔍 Testing database connection...');
        const { data, error } = await supabase.from('users').select('count').limit(1);
        
        if (error) {
            console.error('❌ Database connection failed:', error.message);
            return false;
        }
        
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        return false;
    }
}

async function getFeaturedProducts() {
    try {
        console.log('\n📊 Fetching featured products...');
        
        const { data: products, error } = await supabase
            .from('products')
            .select(`
                id,
                name,
                brand,
                price,
                is_featured,
                featured_at,
                featured_until,
                featured_duration_hours,
                boost_package_id,
                boost_group_id,
                seller_id,
                created_at,
                status,
                users:seller_id (
                    id,
                    username,
                    email
                )
            `)
            .eq('is_featured', true)
            .order('featured_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching featured products:', error.message);
            return [];
        }

        console.log(`✅ Found ${products?.length || 0} featured products`);
        return products || [];
    } catch (error) {
        console.error('❌ Exception fetching featured products:', error.message);
        return [];
    }
}

async function getRecentBoostPurchases() {
    try {
        console.log('\n💳 Fetching recent boost purchases...');
        
        // Get payments from the last 30 days (extended to show more data)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: payments, error } = await supabase
            .from('payments')
            .select(`
                id,
                user_id,
                order_id,
                amount,
                status,
                boost_option_id,
                product_id,
                paid_at,
                created_at,
                webhook_payload
            `)
            .gte('created_at', thirtyDaysAgo.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ Error fetching boost purchases:', error.message);
            return [];
        }

        // Filter boost-related payments by checking webhook payload
        const boostPayments = (payments || []).filter(payment => {
            if (!payment.webhook_payload) return false;
            try {
                const payload = JSON.parse(payment.webhook_payload);
                return payload.paymentType === 'boost' || payload.boostOption;
            } catch (e) {
                return false;
            }
        });
        
        console.log(`✅ Found ${boostPayments.length} boost purchases in the last 30 days`);
        return boostPayments;
    } catch (error) {
        console.error('❌ Exception fetching boost purchases:', error.message);
        return [];
    }
}

async function getBoostPackages() {
    try {
        console.log('\n📦 Fetching boost packages...');
        
        const { data: packages, error } = await supabase
            .from('boost_packages')
            .select('*')
            .eq('is_active', true)
            .order('package_type', { ascending: true })
            .order('item_count', { ascending: true });

        if (error) {
            console.error('❌ Error fetching boost packages:', error.message);
            return [];
        }

        console.log(`✅ Found ${packages?.length || 0} active boost packages`);
        return packages || [];
    } catch (error) {
        console.error('❌ Exception fetching boost packages:', error.message);
        return [];
    }
}

async function getExpiredFeaturedProducts() {
    try {
        console.log('\n⏰ Fetching expired featured products...');
        
        const now = new Date().toISOString();
        
        const { data: products, error } = await supabase
            .from('products')
            .select(`
                id,
                name,
                brand,
                price,
                is_featured,
                featured_at,
                featured_until,
                featured_duration_hours,
                boost_package_id,
                boost_group_id,
                seller_id,
                users:seller_id (
                    id,
                    username,
                    email
                )
            `)
            .eq('is_featured', true)
            .lt('featured_until', now)
            .order('featured_until', { ascending: false });

        if (error) {
            console.error('❌ Error fetching expired featured products:', error.message);
            return [];
        }

        console.log(`✅ Found ${products?.length || 0} expired featured products that are still marked as featured`);
        return products || [];
    } catch (error) {
        console.error('❌ Exception fetching expired featured products:', error.message);
        return [];
    }
}

async function getProductsAboutToExpire() {
    try {
        console.log('\n⚠️ Fetching products about to expire (next 24 hours)...');
        
        const now = new Date();
        const next24Hours = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        
        const { data: products, error } = await supabase
            .from('products')
            .select(`
                id,
                name,
                brand,
                price,
                is_featured,
                featured_at,
                featured_until,
                featured_duration_hours,
                boost_package_id,
                boost_group_id,
                seller_id,
                users:seller_id (
                    id,
                    username,
                    email
                )
            `)
            .eq('is_featured', true)
            .gt('featured_until', now.toISOString())
            .lt('featured_until', next24Hours.toISOString())
            .order('featured_until', { ascending: true });

        if (error) {
            console.error('❌ Error fetching products about to expire:', error.message);
            return [];
        }

        console.log(`✅ Found ${products?.length || 0} featured products expiring in the next 24 hours`);
        return products || [];
    } catch (error) {
        console.error('❌ Exception fetching products about to expire:', error.message);
        return [];
    }
}

function printSectionHeader(title) {
    console.log('\n' + '='.repeat(80));
    console.log(`📋 ${title}`);
    console.log('='.repeat(80));
}

function printFeaturedProductsTable(products, title) {
    if (!products || products.length === 0) {
        console.log(`\n📭 No ${title.toLowerCase()} found.`);
        return;
    }

    console.log(`\n📊 ${title} (${products.length} items):`);
    console.log('-'.repeat(120));
    console.log(
        'ID'.padEnd(6) +
        'Product'.padEnd(30) +
        'Brand'.padEnd(15) +
        'Price'.padEnd(12) +
        'Seller'.padEnd(20) +
        'Featured Until'.padEnd(22) +
        'Status'.padEnd(15)
    );
    console.log('-'.repeat(120));

    products.forEach(product => {
        const productName = (product.name || 'Unnamed Product').substring(0, 28);
        const brand = (product.brand || 'Unknown').substring(0, 13);
        const seller = product.users?.username || `ID:${product.seller_id}`;
        const sellerDisplay = seller.substring(0, 18);
        const timeStatus = getTimeDifference(product.featured_until);
        
        console.log(
            String(product.id).padEnd(6) +
            productName.padEnd(30) +
            brand.padEnd(15) +
            formatPrice(product.price).padEnd(12) +
            sellerDisplay.padEnd(20) +
            formatDateTime(product.featured_until).padEnd(22) +
            timeStatus.padEnd(15)
        );
    });
}

function printBoostPurchasesTable(payments) {
    if (!payments || payments.length === 0) {
        console.log('\n📭 No recent boost purchases found.');
        return;
    }

    console.log(`\n💳 Recent Boost Purchases (${payments.length} items):`);
    console.log('-'.repeat(100));
    console.log(
        'Order ID'.padEnd(25) +
        'User'.padEnd(20) +
        'Amount'.padEnd(12) +
        'Status'.padEnd(12) +
        'Products'.padEnd(15) +
        'Date'.padEnd(20)
    );
    console.log('-'.repeat(100));

    payments.forEach(payment => {
        const orderId = (payment.order_id || 'N/A').substring(0, 23);
        const userDisplay = `ID:${payment.user_id}`.substring(0, 18);
        
        // Extract product count from webhook payload or use product_id
        let productCount = 1; // Default
        if (payment.webhook_payload) {
            try {
                const payload = JSON.parse(payment.webhook_payload);
                if (payload.productCount) {
                    productCount = payload.productCount;
                } else if (payload.productIds && Array.isArray(payload.productIds)) {
                    productCount = payload.productIds.length;
                } else if (payload.product_ids) {
                    // Handle both string and array formats
                    if (typeof payload.product_ids === 'string') {
                        productCount = payload.product_ids.split(',').length;
                    } else if (Array.isArray(payload.product_ids)) {
                        productCount = payload.product_ids.length;
                    }
                }
            } catch (e) {
                // Fallback to 1 if parsing fails
                productCount = payment.product_id ? 1 : 0;
            }
        } else if (payment.product_id) {
            productCount = 1;
        }
        
        const date = formatDateTime(payment.paid_at || payment.created_at);
        
        console.log(
            orderId.padEnd(25) +
            userDisplay.padEnd(20) +
            formatPrice(payment.amount).padEnd(12) +
            (payment.status || 'unknown').padEnd(12) +
            `${productCount} items`.padEnd(15) +
            date.padEnd(20)
        );
    });
}

function printBoostPackagesTable(packages) {
    if (!packages || packages.length === 0) {
        console.log('\n📦 No boost packages found.');
        return;
    }

    console.log(`\n📦 Available Boost Packages (${packages.length} items):`);
    console.log('-'.repeat(90));
    console.log(
        'ID'.padEnd(4) +
        'Name'.padEnd(25) +
        'Type'.padEnd(12) +
        'Items'.padEnd(8) +
        'Price'.padEnd(12) +
        'Duration'.padEnd(12) +
        'Per Item'.padEnd(12)
    );
    console.log('-'.repeat(90));

    packages.forEach(pkg => {
        const name = (pkg.name || 'Unnamed Package').substring(0, 23);
        const type = (pkg.package_type || 'unknown').substring(0, 10);
        const duration = `${pkg.duration_hours || 0}h`;
        const effectivePrice = pkg.effective_price ? formatPrice(pkg.effective_price) : 'N/A';
        
        console.log(
            String(pkg.id).padEnd(4) +
            name.padEnd(25) +
            type.padEnd(12) +
            String(pkg.item_count || 0).padEnd(8) +
            formatPrice(pkg.price).padEnd(12) +
            duration.padEnd(12) +
            effectivePrice.padEnd(12)
        );
    });
}

function printSummaryStats(featuredProducts, expiredProducts, soonToExpire, recentPurchases, packages) {
    printSectionHeader('SUMMARY STATISTICS');
    
    const now = new Date();
    const activeProducts = featuredProducts.filter(p => {
        if (!p.featured_until) return false;
        return new Date(p.featured_until) > now;
    });
    
    console.log(`📊 Total featured products: ${featuredProducts.length}`);
    console.log(`✅ Currently active: ${activeProducts.length}`);
    console.log(`❌ Expired but still marked featured: ${expiredProducts.length}`);
    console.log(`⚠️ Expiring in next 24 hours: ${soonToExpire.length}`);
    console.log(`💳 Boost purchases (last 30 days): ${recentPurchases.length}`);
    console.log(`📦 Available boost packages: ${packages.length}`);
    
    // Calculate revenue from recent purchases
    const totalRevenue = recentPurchases
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    console.log(`💰 Revenue from boosts (last 30 days): ${formatPrice(totalRevenue)}`);
    
    // Group by boost packages - check both boost_option_id and webhook payload
    const packageUsage = {};
    recentPurchases
        .filter(p => p.status === 'paid')
        .forEach(p => {
            let boostOptionId = p.boost_option_id;
            
            // If no direct boost_option_id, try to extract from webhook payload
            if (!boostOptionId && p.webhook_payload) {
                try {
                    const payload = JSON.parse(p.webhook_payload);
                    if (payload.boostOption && payload.boostOption.id) {
                        boostOptionId = payload.boostOption.id;
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }
            
            if (boostOptionId) {
                packageUsage[boostOptionId] = (packageUsage[boostOptionId] || 0) + 1;
            }
        });
    
    if (Object.keys(packageUsage).length > 0) {
        console.log('\n📈 Popular boost packages (last 30 days):');
        Object.entries(packageUsage)
            .sort(([,a], [,b]) => b - a)
            .forEach(([packageId, count]) => {
                const pkg = packages.find(p => p.id === parseInt(packageId));
                const packageName = pkg ? pkg.name : `Package ID ${packageId}`;
                console.log(`   • ${packageName}: ${count} purchases`);
            });
    }
}

function printIssuesAndRecommendations(expiredProducts, soonToExpire) {
    printSectionHeader('ISSUES & RECOMMENDATIONS');
    
    if (expiredProducts.length > 0) {
        console.log(`🚨 ISSUE: ${expiredProducts.length} products are marked as featured but have expired`);
        console.log('   Recommendation: Run a cleanup job to set is_featured=false for expired products');
        console.log('   SQL: UPDATE products SET is_featured = false WHERE featured_until < NOW() AND is_featured = true;');
    }
    
    if (soonToExpire.length > 0) {
        console.log(`⚠️ NOTICE: ${soonToExpire.length} products will expire in the next 24 hours`);
        console.log('   Recommendation: Notify sellers about upcoming expiration');
    }
    
    console.log('\n💡 System Health Checks:');
    console.log('   • Ensure a cron job runs to automatically unfeat expired products');
    console.log('   • Monitor boost purchase success rates');
    console.log('   • Consider sending expiration reminder notifications');
    console.log('   • Verify Billplz webhook is working correctly');
}

async function main() {
    console.log('🚀 BidScents Featured Products Status Checker');
    console.log('============================================');
    console.log(`📅 Report generated: ${formatDateTime(new Date().toISOString())}\n`);
    
    // Check database connection
    const connectionOk = await checkDatabaseConnection();
    if (!connectionOk) {
        console.error('❌ Cannot proceed without database connection');
        process.exit(1);
    }
    
    // Fetch all data
    const [
        featuredProducts,
        expiredProducts,
        soonToExpire,
        recentPurchases,
        packages
    ] = await Promise.all([
        getFeaturedProducts(),
        getExpiredFeaturedProducts(),
        getProductsAboutToExpire(),
        getRecentBoostPurchases(),
        getBoostPackages()
    ]);
    
    // Print detailed tables
    printSectionHeader('CURRENT FEATURED PRODUCTS');
    printFeaturedProductsTable(featuredProducts, 'Currently Featured Products');
    
    printSectionHeader('EXPIRED FEATURED PRODUCTS');
    printFeaturedProductsTable(expiredProducts, 'Expired Featured Products (Cleanup Needed)');
    
    printSectionHeader('PRODUCTS EXPIRING SOON');
    printFeaturedProductsTable(soonToExpire, 'Products Expiring in Next 24 Hours');
    
    printSectionHeader('RECENT BOOST PURCHASES');
    printBoostPurchasesTable(recentPurchases);
    
    printSectionHeader('BOOST PACKAGES');
    printBoostPackagesTable(packages);
    
    // Print summary and recommendations
    printSummaryStats(featuredProducts, expiredProducts, soonToExpire, recentPurchases, packages);
    printIssuesAndRecommendations(expiredProducts, soonToExpire);
    
    console.log('\n✅ Featured products status check completed!');
    console.log('📋 Report saved to console output - consider redirecting to a file for permanent record');
}

// Run the script
main().catch(error => {
    console.error('💥 Script failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
});