#!/usr/bin/env node

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3000';

async function testAuctionDisplay() {
  console.log('🔍 Testing auction product display...\n');
  
  try {
    // Fetch all products
    const response = await fetch(`${API_URL}/api/products`);
    const products = await response.json();
    
    console.log(`📦 Total products found: ${products.length}`);
    
    // Filter auction products
    const auctionProducts = products.filter(p => p.listingType === 'auction');
    console.log(`🎯 Auction products found: ${auctionProducts.length}\n`);
    
    if (auctionProducts.length === 0) {
      console.log('❌ No auction products found!');
      console.log('   Make sure you have products with listingType = "auction" in your database');
      return;
    }
    
    // Check each auction product
    console.log('📊 AUCTION PRODUCTS DETAILS:');
    auctionProducts.forEach((product, index) => {
      console.log(`\n${index + 1}. ${product.name} (ID: ${product.id})`);
      console.log(`   Brand: ${product.brand}`);
      console.log(`   Price: RM ${product.price}`);
      console.log(`   Status: ${product.status}`);
      console.log(`   Listing Type: ${product.listingType}`);
      
      if (product.auction) {
        console.log('   ✅ Auction data found:');
        console.log(`      - Auction ID: ${product.auction.id}`);
        console.log(`      - Starting Price: RM ${product.auction.startingPrice}`);
        console.log(`      - Current Bid: ${product.auction.currentBid ? `RM ${product.auction.currentBid}` : 'No bids yet'}`);
        console.log(`      - Status: ${product.auction.status}`);
        console.log(`      - Starts At: ${new Date(product.auction.startsAt).toLocaleString()}`);
        console.log(`      - Ends At: ${new Date(product.auction.endsAt).toLocaleString()}`);
        console.log(`      - Bid Count: ${product.auction.bidCount || 0}`);
        
        // Check if auction is active
        const now = new Date();
        const endsAt = new Date(product.auction.endsAt);
        const isActive = product.auction.status === 'active' && endsAt > now;
        console.log(`      - Currently Active: ${isActive ? '✅ YES' : '❌ NO'}`);
      } else {
        console.log('   ❌ No auction data attached!');
      }
    });
    
    // Check which auctions would appear on homepage
    const activeAuctions = auctionProducts.filter(product => 
      product.auction?.status === 'active' && 
      new Date(product.auction.endsAt) > new Date()
    );
    
    console.log(`\n📍 HOMEPAGE DISPLAY:`);
    console.log(`   Active auctions that should appear: ${activeAuctions.length}`);
    
    if (activeAuctions.length === 0) {
      console.log('   ⚠️  No active auctions will appear on the homepage!');
      console.log('   Possible reasons:');
      console.log('   - All auctions have expired (endsAt < current time)');
      console.log('   - Auction status is not "active"');
      console.log('   - No auction data is attached to auction products');
    } else {
      console.log('   These auctions should appear on the homepage:');
      activeAuctions.slice(0, 3).forEach((product, index) => {
        console.log(`   ${index + 1}. ${product.name} - ends ${new Date(product.auction.endsAt).toLocaleString()}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAuctionDisplay();