/**
 * Script to check auction products and their status
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function checkAuctionProducts() {
  console.log('=== Checking Auction Products ===');
  
  try {
    // Get all products with listing_type = 'auction'
    const { data: auctionProducts, error: productsError } = await supabase
      .from('products')
      .select('id, name, listing_type, status, seller_id, created_at')
      .eq('listing_type', 'auction')
      .order('created_at', { ascending: false });
    
    if (productsError) {
      console.error('Error fetching auction products:', productsError);
      return;
    }
    
    console.log(`\nFound ${auctionProducts?.length || 0} auction products:`);
    
    if (auctionProducts && auctionProducts.length > 0) {
      for (const product of auctionProducts) {
        console.log(`\n--- Product ID: ${product.id} ---`);
        console.log(`Name: ${product.name}`);
        console.log(`Status: ${product.status}`);
        console.log(`Seller ID: ${product.seller_id}`);
        console.log(`Created: ${product.created_at}`);
        
        // Get auction details for this product
        const { data: auction, error: auctionError } = await supabase
          .from('auctions')
          .select('*')
          .eq('product_id', product.id)
          .single();
        
        if (auctionError && auctionError.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error(`Error fetching auction for product ${product.id}:`, auctionError);
        } else if (auction) {
          console.log(`\nAuction details:`);
          console.log(`- Auction ID: ${auction.id}`);
          console.log(`- Status: ${auction.status}`);
          console.log(`- Starting price: ${auction.starting_price}`);
          console.log(`- Current bid: ${auction.current_bid}`);
          console.log(`- Reserve price: ${auction.reserve_price}`);
          console.log(`- Starts at: ${auction.starts_at}`);
          console.log(`- Ends at: ${auction.ends_at}`);
          
          const endsAt = new Date(auction.ends_at);
          const now = new Date();
          const hoursUntilEnd = (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60);
          
          if (hoursUntilEnd > 0) {
            console.log(`- Time remaining: ${hoursUntilEnd.toFixed(2)} hours`);
          } else {
            console.log(`- Ended: ${Math.abs(hoursUntilEnd).toFixed(2)} hours ago`);
          }
          
          // Check if product and auction status match
          if (product.status === 'active' && auction.status !== 'active') {
            console.log(`⚠️  WARNING: Product is active but auction is ${auction.status}`);
          }
          if (product.status !== 'active' && auction.status === 'active') {
            console.log(`⚠️  WARNING: Auction is active but product is ${product.status}`);
          }
        } else {
          console.log(`❌ NO AUCTION FOUND for this product!`);
        }
      }
      
      // Summary
      console.log('\n=== Summary ===');
      const activeAuctions = auctionProducts.filter(p => p.status === 'active').length;
      console.log(`Active auction products: ${activeAuctions}`);
      console.log(`Total auction products: ${auctionProducts.length}`);
      
      // Check for any auctions without products
      const { data: orphanAuctions, error: orphanError } = await supabase
        .from('auctions')
        .select('id, product_id, status')
        .eq('status', 'active');
      
      if (!orphanError && orphanAuctions) {
        console.log(`\nActive auctions in database: ${orphanAuctions.length}`);
        
        for (const orphan of orphanAuctions) {
          const hasProduct = auctionProducts.some(p => p.id === orphan.product_id);
          if (!hasProduct) {
            console.log(`⚠️  Auction ${orphan.id} has no matching product or product is not auction type!`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the check
checkAuctionProducts();