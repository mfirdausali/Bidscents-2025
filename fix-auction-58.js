/**
 * Script to fix auction 58 that was incorrectly marked as reserve_not_met
 * due to timezone offset issue
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function fixAuction58() {
  console.log('=== Fixing Auction 58 Status ===');
  console.log('Current time (UTC):', new Date().toISOString());
  
  try {
    // First, check the current status of auction 58
    const { data: auction, error: fetchError } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', 58)
      .single();
    
    if (fetchError) {
      console.error('Error fetching auction 58:', fetchError);
      return;
    }
    
    if (!auction) {
      console.error('Auction 58 not found');
      return;
    }
    
    console.log('\nCurrent auction 58 status:');
    console.log('- Status:', auction.status);
    console.log('- Ends at:', auction.ends_at);
    console.log('- Product ID:', auction.product_id);
    console.log('- Reserve price:', auction.reserve_price);
    console.log('- Current bid:', auction.current_bid);
    
    // Check if the auction end time is actually in the future
    const endsAt = new Date(auction.ends_at);
    const now = new Date();
    const hoursUntilEnd = (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    console.log('\nTime analysis:');
    console.log('- Ends at (UTC):', endsAt.toISOString());
    console.log('- Now (UTC):', now.toISOString());
    console.log('- Hours until end:', hoursUntilEnd.toFixed(2));
    
    if (hoursUntilEnd > 0) {
      console.log('\n✅ Auction has not actually expired yet!');
      
      // Fix auction status back to active
      const { error: updateAuctionError } = await supabase
        .from('auctions')
        .update({ status: 'active' })
        .eq('id', 58);
      
      if (updateAuctionError) {
        console.error('Error updating auction status:', updateAuctionError);
        return;
      }
      
      console.log('✅ Updated auction 58 status to "active"');
      
      // Fix product status back to active
      const { error: updateProductError } = await supabase
        .from('products')
        .update({ status: 'active' })
        .eq('id', auction.product_id);
      
      if (updateProductError) {
        console.error('Error updating product status:', updateProductError);
        return;
      }
      
      console.log('✅ Updated product', auction.product_id, 'status to "active"');
      
      // Delete the incorrect reserve_not_met message
      console.log('\nLooking for incorrect messages to delete...');
      
      const { data: messages, error: messageError } = await supabase
        .from('messages')
        .select('*')
        .eq('product_id', auction.product_id)
        .like('content', '%The auction for%has ended, but the reserve price%')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (messageError) {
        console.error('Error fetching messages:', messageError);
      } else if (messages && messages.length > 0) {
        console.log(`Found ${messages.length} reserve_not_met messages`);
        
        // Delete the most recent one (likely the incorrect one)
        const messageToDelete = messages[0];
        console.log('Deleting message ID:', messageToDelete.id);
        console.log('Message content:', messageToDelete.content.substring(0, 100) + '...');
        
        const { error: deleteError } = await supabase
          .from('messages')
          .delete()
          .eq('id', messageToDelete.id);
        
        if (deleteError) {
          console.error('Error deleting message:', deleteError);
        } else {
          console.log('✅ Deleted incorrect reserve_not_met message');
        }
      } else {
        console.log('No reserve_not_met messages found to delete');
      }
      
      console.log('\n✅ Auction 58 has been successfully restored!');
      console.log('The auction will now run until its proper end time.');
      
    } else {
      console.log('\n❌ Auction has actually expired (ends_at is in the past)');
      console.log('No changes made.');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the fix
fixAuction58();