#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createPrecisionTimingAuctions() {
  console.log('🎯 Creating Precision Timing Auctions...')
  console.log('=' .repeat(60))
  
  // Get test products
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('id, name')
    .eq('status', 'active')
    .limit(3)
    
  if (productError || !products || products.length < 2) {
    console.log('❌ Error: Need at least 2 active products for testing')
    return
  }
  
  const now = new Date()
  console.log('⏰ Current time:', now.toISOString())
  console.log('⏰ Local time:', now.toLocaleString())
  console.log('')
  
  // Create 5-minute auction (reserve not met scenario)
  console.log('🔥 Creating 5-minute auction (reserve not met scenario)...')
  const fiveMinStart = new Date(now.getTime() + 10000) // Start in 10 seconds
  const fiveMinEnd = new Date(fiveMinStart.getTime() + 5 * 60 * 1000) // End 5 minutes after start
  
  const fiveMinAuction = {
    product_id: products[0].id,
    starting_price: 25.00,
    reserve_price: 200.00, // High reserve that won't be met
    bid_increment: 5.00,
    starts_at: fiveMinStart.toISOString(),
    ends_at: fiveMinEnd.toISOString(),
    status: 'active'
  }
  
  const { data: auction5min, error: error5min } = await supabase
    .from('auctions')
    .insert(fiveMinAuction)
    .select()
    .single()
    
  if (error5min) {
    console.log('❌ Error creating 5-minute auction:', error5min.message)
  } else {
    console.log('✅ 5-minute auction created successfully!')
    console.log(`   ID: ${auction5min.id}`)
    console.log(`   Product: ${products[0].name} (ID: ${products[0].id})`)
    console.log(`   Starts: ${fiveMinStart.toISOString()}`)
    console.log(`   Ends: ${fiveMinEnd.toISOString()}`)
    console.log(`   Duration: Exactly 5 minutes`)
    console.log(`   Reserve: RM ${fiveMinAuction.reserve_price} (will NOT be met)`)
    console.log(`   Expected outcome: Reserve not met`)
  }
  
  console.log('')
  
  // Create 10-minute auction (winning scenario)
  console.log('🔥 Creating 10-minute auction (winning scenario)...')
  const tenMinStart = new Date(now.getTime() + 15000) // Start in 15 seconds
  const tenMinEnd = new Date(tenMinStart.getTime() + 10 * 60 * 1000) // End 10 minutes after start
  
  const tenMinAuction = {
    product_id: products[1].id,
    starting_price: 30.00,
    reserve_price: 50.00, // Low reserve that will be met
    bid_increment: 10.00,
    starts_at: tenMinStart.toISOString(),
    ends_at: tenMinEnd.toISOString(),
    status: 'active'
  }
  
  const { data: auction10min, error: error10min } = await supabase
    .from('auctions')
    .insert(tenMinAuction)
    .select()
    .single()
    
  if (error10min) {
    console.log('❌ Error creating 10-minute auction:', error10min.message)
  } else {
    console.log('✅ 10-minute auction created successfully!')
    console.log(`   ID: ${auction10min.id}`)
    console.log(`   Product: ${products[1].name} (ID: ${products[1].id})`)
    console.log(`   Starts: ${tenMinStart.toISOString()}`)
    console.log(`   Ends: ${tenMinEnd.toISOString()}`)
    console.log(`   Duration: Exactly 10 minutes`)
    console.log(`   Reserve: RM ${tenMinAuction.reserve_price} (will be met)`)
    console.log(`   Expected outcome: Winning scenario`)
    
    // Schedule a test bid to meet the reserve
    console.log('📅 Scheduling test bid to meet reserve...')
    setTimeout(async () => {
      try {
        const { error: bidError } = await supabase
          .from('bids')
          .insert({
            auction_id: auction10min.id,
            bidder_id: 34, // Test user ID
            amount: 60.00, // Above reserve price
            placed_at: new Date().toISOString(),
            is_winning: true
          })
        
        if (!bidError) {
          console.log(`💰 Test bid placed: RM 60.00 (above reserve) at ${new Date().toISOString()}`)
          
          // Update auction with current bid
          await supabase
            .from('auctions')
            .update({
              current_bid: 60.00,
              current_bidder_id: 34
            })
            .eq('id', auction10min.id)
        } else {
          console.log(`⚠️  Error placing test bid: ${bidError.message}`)
        }
      } catch (error) {
        console.log(`⚠️  Error placing test bid: ${error.message}`)
      }
    }, 3 * 60 * 1000) // Place bid after 3 minutes
  }
  
  console.log('')
  console.log('🎯 PRECISION TIMING TEST SUMMARY:')
  console.log('=' .repeat(60))
  console.log('📊 Two auctions created for precision timing validation:')
  
  if (auction5min) {
    console.log(`   • 5-minute auction (ID: ${auction5min.id}) - Reserve not met scenario`)
    console.log(`     Expected to expire at: ${fiveMinEnd.toLocaleTimeString()}`)
  }
  
  if (auction10min) {
    console.log(`   • 10-minute auction (ID: ${auction10min.id}) - Winning scenario`)
    console.log(`     Expected to expire at: ${tenMinEnd.toLocaleTimeString()}`)
  }
  
  console.log('')
  console.log('⏰ MONITORING RECOMMENDATIONS:')
  console.log('• Watch server logs for auction expiration events')
  console.log('• Verify timing accuracy (within 10-second tolerance)')
  console.log('• Check notification delivery for both scenarios')
  console.log('• Validate proper handling of reserve-not-met vs winning cases')
  
  console.log('')
  console.log('🚀 Use the monitoring script to track these auctions:')
  console.log('   node check-auction-status.js')
}

createPrecisionTimingAuctions().catch(console.error)