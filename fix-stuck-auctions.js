#!/usr/bin/env node

/**
 * Fix for stuck auctions that were incorrectly marked as "reserve_not_met"
 * when they actually had winning bids above the reserve price
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixStuckAuctions() {
  console.log('=== FIXING STUCK AUCTIONS ===\n');
  
  // Find all auctions with "reserve_not_met" status
  const { data: stuckAuctions, error } = await supabase
    .from('auctions')
    .select('*')
    .eq('status', 'reserve_not_met');
    
  if (error) {
    console.error('Error fetching stuck auctions:', error);
    return;
  }
  
  if (!stuckAuctions || stuckAuctions.length === 0) {
    console.log('No stuck auctions found.');
    return;
  }
  
  console.log(`Found ${stuckAuctions.length} auctions with "reserve_not_met" status:`);
  
  for (const auction of stuckAuctions) {
    console.log(`\n--- ANALYZING AUCTION ${auction.id} ---`);
    console.log(`Reserve Price: RM ${auction.reserve_price}`);
    console.log(`Current Bid: RM ${auction.current_bid || 'none'}`);
    console.log(`Ends At: ${auction.ends_at}`);
    
    // Check if this auction should actually be marked as successful
    const hasReservePrice = auction.reserve_price !== null && auction.reserve_price > 0;
    const hasBid = auction.current_bid !== null;
    
    if (hasReservePrice && hasBid) {
      const reservePriceNum = parseFloat(auction.reserve_price.toString());
      const currentBidNum = parseFloat(auction.current_bid.toString());
      
      console.log(`Reserve (number): ${reservePriceNum}`);
      console.log(`Current Bid (number): ${currentBidNum}`);
      
      if (currentBidNum >= reservePriceNum) {
        console.log(`🔧 FIXING: Bid ${currentBidNum} >= Reserve ${reservePriceNum}`);
        
        // This auction should be marked as pending, not reserve_not_met
        const { error: updateError } = await supabase
          .from('auctions')
          .update({ 
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', auction.id);
          
        if (updateError) {
          console.error(`❌ Failed to fix auction ${auction.id}:`, updateError);
        } else {
          console.log(`✅ Fixed auction ${auction.id}: status changed to 'pending'`);
          
          // Also update the product status
          const { error: productError } = await supabase
            .from('products')
            .update({ status: 'pending' })
            .eq('id', auction.product_id);
            
          if (productError) {
            console.error(`⚠️  Warning: Could not update product ${auction.product_id} status:`, productError);
          } else {
            console.log(`✅ Updated product ${auction.product_id} status to 'pending'`);
          }
        }
      } else {
        console.log(`✅ CORRECT: Reserve not met (${currentBidNum} < ${reservePriceNum})`);
      }
    } else if (!hasReservePrice && hasBid) {
      console.log(`🔧 FIXING: No reserve price but has bid - should be 'pending'`);
      
      const { error: updateError } = await supabase
        .from('auctions')
        .update({ 
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', auction.id);
        
      if (updateError) {
        console.error(`❌ Failed to fix auction ${auction.id}:`, updateError);
      } else {
        console.log(`✅ Fixed auction ${auction.id}: status changed to 'pending'`);
      }
    } else {
      console.log(`✅ CORRECT: No bid or reserve not met`);
    }
  }
  
  console.log('\n=== FIX COMPLETE ===');
}

// Run the fix
fixStuckAuctions()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });