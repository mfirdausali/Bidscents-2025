#!/usr/bin/env node

/**
 * Test script to debug auction 56 reserve price logic
 * This will help us understand why auction 56 stayed "reserve_not_met" despite having a winning bid
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAuction56Debug() {
  console.log('=== AUCTION 56 DIAGNOSTIC TEST ===\n');
  
  // Get auction 56 details
  const { data: auction, error } = await supabase
    .from('auctions')
    .select(`
      *,
      products (
        id,
        name,
        status
      )
    `)
    .eq('id', 56)
    .single();
  
  if (error) {
    console.error('Error fetching auction 56:', error);
    return;
  }
  
  if (!auction) {
    console.log('Auction 56 not found');
    return;
  }
  
  console.log('AUCTION 56 CURRENT STATE:');
  console.log('- ID:', auction.id);
  console.log('- Status:', auction.status);
  console.log('- Reserve Price:', auction.reserve_price, '(type:', typeof auction.reserve_price, ')');
  console.log('- Current Bid:', auction.current_bid, '(type:', typeof auction.current_bid, ')');
  console.log('- Current Bidder ID:', auction.current_bidder_id);
  console.log('- Ends At:', auction.ends_at);
  console.log('- Product Name:', auction.products?.name);
  console.log('- Product Status:', auction.products?.status);
  
  // Get all bids for auction 56
  const { data: bids, error: bidsError } = await supabase
    .from('bids')
    .select('*')
    .eq('auction_id', 56)
    .order('placed_at', { ascending: false });
  
  if (bidsError) {
    console.error('Error fetching bids:', bidsError);
  } else {
    console.log('\nBIDS FOR AUCTION 56:');
    bids.forEach((bid, index) => {
      console.log(`  ${index + 1}. Amount: RM ${bid.amount} | Bidder: ${bid.bidder_id} | Is Winning: ${bid.is_winning} | Placed: ${bid.placed_at}`);
    });
  }
  
  // Manual reserve price logic check
  console.log('\n=== MANUAL RESERVE PRICE LOGIC CHECK ===');
  
  const hasReservePrice = auction.reserve_price !== null && auction.reserve_price > 0;
  console.log('Has Reserve Price:', hasReservePrice);
  
  if (hasReservePrice) {
    const reservePriceNum = parseFloat(auction.reserve_price.toString());
    const currentBidNum = auction.current_bid ? parseFloat(auction.current_bid.toString()) : 0;
    
    console.log('Reserve Price (number):', reservePriceNum);
    console.log('Current Bid (number):', currentBidNum);
    
    const reserveNotMet = auction.current_bid === null || currentBidNum < reservePriceNum;
    console.log('Reserve Not Met:', reserveNotMet);
    
    if (reserveNotMet) {
      console.log('❌ LOGIC SAYS: Reserve not met, should be "reserve_not_met"');
    } else {
      console.log('✅ LOGIC SAYS: Reserve met, should be "pending" or "completed"');
    }
    
    console.log('\nCOMPARISON DETAILS:');
    console.log('- Current bid null?', auction.current_bid === null);
    console.log('- Current bid < reserve?', currentBidNum < reservePriceNum);
    console.log('- String comparison:', auction.current_bid < auction.reserve_price);
    console.log('- Number comparison:', currentBidNum < reservePriceNum);
  }
  
  // Check if auction is expired
  const now = new Date();
  const endsAt = new Date(auction.ends_at);
  const isExpired = now > endsAt;
  
  console.log('\n=== TIMING CHECK ===');
  console.log('Current time:', now.toISOString());
  console.log('Auction ends at:', endsAt.toISOString());
  console.log('Is expired:', isExpired);
  console.log('Time difference (ms):', now.getTime() - endsAt.getTime());
}

// Run the test
testAuction56Debug()
  .then(() => {
    console.log('\n=== TEST COMPLETE ===');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });