#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
)

async function createActiveAuction() {
  console.log('🎯 Creating an active auction for testing...\n');
  
  // First, find an auction product to update
  const { data: auctionProduct, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('listing_type', 'auction')
    .eq('status', 'pending')
    .limit(1)
    .single()
    
  if (productError || !auctionProduct) {
    console.log('❌ No auction product found to update');
    return;
  }
  
  console.log(`📦 Found auction product: ${auctionProduct.name} (ID: ${auctionProduct.id})`);
  
  // Find its auction
  const { data: auction, error: auctionError } = await supabase
    .from('auctions')
    .select('*')
    .eq('product_id', auctionProduct.id)
    .single()
    
  if (auctionError || !auction) {
    console.log('❌ No auction found for this product');
    return;
  }
  
  console.log(`🎯 Found auction ID: ${auction.id}`);
  console.log(`   Current status: ${auction.status}`);
  console.log(`   Current ends_at: ${auction.ends_at}`);
  
  // Update the auction to be active and end in the future
  const now = new Date();
  const futureEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
  
  const { data: updatedAuction, error: updateError } = await supabase
    .from('auctions')
    .update({
      status: 'active',
      starts_at: now.toISOString(),
      ends_at: futureEnd.toISOString()
    })
    .eq('id', auction.id)
    .select()
    .single()
    
  if (updateError) {
    console.log('❌ Error updating auction:', updateError.message);
    return;
  }
  
  console.log('\n✅ Auction updated successfully!');
  console.log(`   New status: ${updatedAuction.status}`);
  console.log(`   New ends_at: ${updatedAuction.ends_at}`);
  console.log(`   Will end in: 24 hours`);
  
  // Also update the product status to active
  const { error: productUpdateError } = await supabase
    .from('products')
    .update({ status: 'active' })
    .eq('id', auctionProduct.id)
    
  if (productUpdateError) {
    console.log('⚠️  Warning: Could not update product status:', productUpdateError.message);
  } else {
    console.log('✅ Product status updated to active');
  }
  
  console.log('\n🎉 You should now see this auction in the Live Auctions section!');
  console.log(`   Product: ${auctionProduct.name}`);
  console.log(`   Starting Price: RM ${auction.starting_price}`);
}

createActiveAuction();