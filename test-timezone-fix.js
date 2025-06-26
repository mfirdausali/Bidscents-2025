/**
 * Test script to verify timezone fixes are working correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

async function testTimezoneFix() {
  console.log('=== Testing Timezone Fix ===');
  console.log('Server timezone offset:', new Date().getTimezoneOffset(), 'minutes');
  console.log('Process TZ env:', process.env.TZ || 'not set');
  console.log('Current time (local):', new Date().toString());
  console.log('Current time (UTC):', new Date().toISOString());
  
  // Check auction 58 details to understand what happened
  console.log('\n=== Checking Auction 58 History ===');
  
  try {
    const { data: auction, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', 58)
      .single();
    
    if (error) {
      console.error('Error fetching auction:', error);
      return;
    }
    
    if (auction) {
      const createdAt = new Date(auction.created_at);
      const startsAt = new Date(auction.starts_at);
      const endsAt = new Date(auction.ends_at);
      
      console.log('\nAuction 58 timeline:');
      console.log('- Created at:', createdAt.toISOString());
      console.log('- Started at:', startsAt.toISOString());
      console.log('- Ended at:', endsAt.toISOString());
      console.log('- Status:', auction.status);
      
      const intendedDuration = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60);
      console.log('- Intended duration:', intendedDuration.toFixed(2), 'hours');
      
      // Check when it was marked as reserve_not_met
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('created_at, content')
        .eq('product_id', auction.product_id)
        .like('content', '%The auction for%has ended%')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (!msgError && messages && messages.length > 0) {
        const messageTime = new Date(messages[0].created_at);
        console.log('\n- Reserve not met message sent at:', messageTime.toISOString());
        
        const earlyByHours = (endsAt.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
        console.log('- Message sent', earlyByHours.toFixed(2), 'hours before actual end time');
        
        if (Math.abs(earlyByHours - 9) < 0.5) {
          console.log('\n❌ CONFIRMED: Auction expired exactly 9 hours early due to JST timezone issue!');
        }
      }
    }
    
    // Test with a future auction
    console.log('\n=== Creating Test Calculations ===');
    const testEndDate = new Date();
    testEndDate.setHours(testEndDate.getHours() + 24); // 24 hours from now
    
    console.log('\nTest auction (24 hours from now):');
    console.log('- Would end at (local):', testEndDate.toString());
    console.log('- Would end at (UTC):', testEndDate.toISOString());
    console.log('- Current offset:', new Date().getTimezoneOffset(), 'minutes from UTC');
    
    if (new Date().getTimezoneOffset() !== 0) {
      console.log('\n⚠️ WARNING: Server is not running in UTC!');
      console.log('Auctions will expire', Math.abs(new Date().getTimezoneOffset() / 60), 'hours off schedule!');
    } else {
      console.log('\n✅ Server is running in UTC - auctions will expire correctly!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testTimezoneFix();