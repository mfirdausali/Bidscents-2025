#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function monitorPrecisionAuctions() {
  console.log('🔍 PRECISION AUCTION MONITORING')
  console.log('=' .repeat(60))
  
  const now = new Date()
  console.log('🕐 Current time (UTC):', now.toISOString())
  console.log('🕐 Current time (Local):', now.toLocaleString())
  console.log('')
  
  // Get the most recent auctions (should be our test auctions)
  const { data: auctions, error } = await supabase
    .from('auctions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3)
    
  if (error) {
    console.log('❌ Error:', error.message)
    return
  }
  
  if (!auctions || auctions.length === 0) {
    console.log('📭 No auctions found')
    return
  }
  
  console.log('🎯 ACTIVE PRECISION TESTS:')
  console.log('-' .repeat(40))
  
  let precisionTests = 0
  auctions.forEach(auction => {
    const startTime = new Date(auction.starts_at)
    const endTime = new Date(auction.ends_at)
    const createdTime = new Date(auction.created_at)
    
    // Calculate the intended duration based on starts_at and ends_at
    const intendedDuration = endTime.getTime() - startTime.getTime()
    const intendedMinutes = Math.round(intendedDuration / 60000)
    
    // Calculate actual time since creation
    const timeSinceCreated = now.getTime() - createdTime.getTime()
    const minutesSinceCreated = Math.round(timeSinceCreated / 60000)
    
    // Check if this auction has ended
    const hasEnded = now > endTime
    const timeUntilEnd = endTime.getTime() - now.getTime()
    const minutesUntilEnd = Math.round(timeUntilEnd / 60000)
    const secondsUntilEnd = Math.round(timeUntilEnd / 1000)
    
    // Check if this looks like a precision test (5 or 10 minutes)
    if (intendedMinutes === 5 || intendedMinutes === 10) {
      precisionTests++
      console.log(`🎯 PRECISION TEST ${precisionTests}: Auction ${auction.id}`)
      console.log(`   Intended duration: ${intendedMinutes} minutes`)
      console.log(`   Created: ${createdTime.toISOString()}`)
      console.log(`   Starts: ${startTime.toISOString()}`)
      console.log(`   Ends: ${endTime.toISOString()}`)
      console.log(`   Status: ${auction.status}`)
      console.log(`   Reserve: RM ${auction.reserve_price}`)
      console.log(`   Current bid: RM ${auction.current_bid || 'No bids'}`)
      
      if (hasEnded) {
        console.log(`   🚨 RESULT: EXPIRED (${Math.abs(minutesUntilEnd)} minutes ago)`)
        if (auction.status === 'active') {
          console.log(`   ⚠️  WARNING: Status still 'active' but should be expired!`)
        }
      } else {
        console.log(`   ⏰ Time until end: ${minutesUntilEnd}m ${Math.abs(secondsUntilEnd % 60)}s`)
        if (minutesUntilEnd <= 1) {
          console.log(`   🔥 ENDING VERY SOON! Monitor closely...`)
        }
      }
      
      console.log('')
    }
  })
  
  if (precisionTests === 0) {
    console.log('⚠️  No precision timing tests found in recent auctions')
    console.log('   Looking for auctions with 5 or 10 minute durations...')
    
    // Show all recent auctions for debugging
    console.log('')
    console.log('📊 RECENT AUCTIONS DEBUG:')
    auctions.forEach(auction => {
      const startTime = new Date(auction.starts_at)
      const endTime = new Date(auction.ends_at)
      const intendedDuration = endTime.getTime() - startTime.getTime()
      const intendedMinutes = Math.round(intendedDuration / 60000)
      
      console.log(`   Auction ${auction.id}: ${intendedMinutes} minutes (${auction.status})`)
    })
  }
  
  return precisionTests
}

// Main monitoring loop
async function startMonitoring() {
  console.log('🚀 Starting continuous precision auction monitoring...')
  console.log('   Checking every 15 seconds for timing accuracy')
  console.log('   Press Ctrl+C to stop')
  console.log('')
  
  let checkCount = 0
  
  const monitorInterval = setInterval(async () => {
    checkCount++
    console.log(`📊 Check #${checkCount} at ${new Date().toLocaleTimeString()}`)
    
    try {
      const foundTests = await monitorPrecisionAuctions()
      
      if (foundTests === 0) {
        console.log('🔄 No active precision tests found, continuing to monitor...')
      }
      
    } catch (error) {
      console.log('❌ Monitoring error:', error.message)
    }
    
    console.log('─' .repeat(60))
  }, 15000) // Check every 15 seconds
  
  // Stop after 20 minutes
  setTimeout(() => {
    clearInterval(monitorInterval)
    console.log('🏁 Monitoring session completed')
  }, 20 * 60 * 1000)
}

// Run initial check then start monitoring
monitorPrecisionAuctions().then(foundTests => {
  if (foundTests > 0) {
    startMonitoring()
  } else {
    console.log('❌ No precision tests found to monitor')
  }
}).catch(console.error)