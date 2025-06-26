#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkAuctionStatus() {
  console.log('🔍 Checking recent auctions (including expired ones)...')
  
  const { data: auctions, error } = await supabase
    .from('auctions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
    
  if (error) {
    console.log('❌ Error:', error.message)
    return
  }
  
  if (!auctions || auctions.length === 0) {
    console.log('📭 No auctions found')
    return
  }
  
  const now = new Date()
  console.log('🕐 Current time:', now.toISOString())
  console.log('🕐 Local time:', now.toLocaleString())
  console.log('')
  
  console.log('📊 RECENT AUCTIONS (Including Expired):')
  auctions.forEach(auction => {
    const endTime = new Date(auction.ends_at)
    const createdTime = new Date(auction.created_at)
    const expired = now > endTime
    const actualDuration = endTime.getTime() - createdTime.getTime()
    const actualMinutes = Math.round(actualDuration / 60000)
    
    console.log(`   Auction ${auction.id}:`)
    console.log(`     Created: ${createdTime.toISOString()}`)
    console.log(`     Scheduled end: ${endTime.toISOString()}`)
    console.log(`     Actual duration: ${actualMinutes} minutes`)
    console.log(`     Status: ${auction.status}`)
    console.log(`     Expired: ${expired ? '✅ YES' : '❌ NO'}`)
    console.log(`     Reserve: RM ${auction.reserve_price}`)
    console.log(`     Current bid: RM ${auction.current_bid || 'No bids'}`)
    
    // Check if this was one of our timing test auctions
    if (actualMinutes === 5 || actualMinutes === 10) {
      console.log(`     🎯 TIMING TEST: This was a ${actualMinutes}-minute precision test!`)
      if (expired && auction.status === 'active') {
        console.log(`     ⚠️  STATUS ISSUE: Auction expired but status still 'active'`)
      }
    }
    console.log('')
  })
}

checkAuctionStatus().catch(console.error)