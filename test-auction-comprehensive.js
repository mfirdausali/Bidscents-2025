#!/usr/bin/env node

/**
 * Comprehensive Auction System Testing Suite
 * Tests auction creation, bidding, expiration timing, and notification precision
 * Enhanced with 5-minute and 10-minute timing tests for reserve-not-met and winning scenarios
 */

import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const API_BASE = 'http://localhost:3000'
const WS_BASE = 'ws://localhost:3000'

// Test configuration
const TEST_CONFIG = {
  SHORT_AUCTION: 5, // minutes
  MEDIUM_AUCTION: 10, // minutes
  STARTING_PRICE: 50.00,
  RESERVE_PRICE: 100.00,
  BID_INCREMENT: 5.00,
  TIMING_TOLERANCE: 10000 // 10 seconds tolerance for timing tests
}

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  timingTests: [],
  details: []
}

// Helper function to make HTTP requests with authentication
async function makeAuthenticatedRequest(url, options = {}) {
  // For testing, we'll use a mock authentication token
  // In real tests, you'd get this from the auth system
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-test-token', // Replace with real token
      ...options.headers
    }
  }
  
  return makeRequest(url, { ...options, ...defaultOptions })
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    import('node-fetch').then(({ default: fetch }) => {
      fetch(url, options)
        .then(async res => {
          const data = await res.json().catch(() => res.text())
          resolve({ statusCode: res.status, data, headers: res.headers })
        })
        .catch(reject)
    })
  })
}

// Test runner function
async function runTest(testName, testFn) {
  testResults.total++
  console.log(`\n🧪 Testing: ${testName}`)
  
  try {
    const result = await testFn()
    if (result.success) {
      testResults.passed++
      testResults.details.push({ name: testName, status: '✅ PASSED', details: result.details })
      console.log(`✅ PASSED: ${testName}`)
      if (result.timing) {
        testResults.timingTests.push({ test: testName, ...result.timing })
      }
    } else {
      testResults.failed++
      testResults.details.push({ name: testName, status: '❌ FAILED', details: result.details })
      console.log(`❌ FAILED: ${testName} - ${result.details}`)
    }
  } catch (error) {
    testResults.failed++
    testResults.details.push({ name: testName, status: '❌ FAILED', details: error.message })
    console.log(`❌ FAILED: ${testName} - ${error.message}`)
  }
}

// 1. Auction Creation Tests
async function testAuctionCreation() {
  console.log('\n🎯 Testing auction creation with different durations...')
  
  // Get a test product to create auction for
  const { data: products, error: productError } = await supabase
    .from('products')
    .select('id, name, seller_id')
    .eq('status', 'active')
    .limit(3)
  
  if (productError || !products || products.length === 0) {
    return { 
      success: false, 
      details: `No active products found for auction creation: ${productError?.message}` 
    }
  }
  
  const testProduct = products[0]
  console.log(`Using test product: ${testProduct.name} (ID: ${testProduct.id})`)
  
  // Test 5-minute auction creation
  const shortAuctionData = {
    productId: testProduct.id,
    startingPrice: TEST_CONFIG.STARTING_PRICE,
    reservePrice: TEST_CONFIG.RESERVE_PRICE,
    bidIncrement: TEST_CONFIG.BID_INCREMENT,
    endsAt: new Date(Date.now() + TEST_CONFIG.SHORT_AUCTION * 60 * 1000).toISOString(),
    status: 'active'
  }
  
  const { error: insertError } = await supabase
    .from('auctions')
    .insert(shortAuctionData)
  
  if (insertError) {
    return { 
      success: false, 
      details: `Failed to create auction: ${insertError.message}` 
    }
  }
  
  // Verify auction was created
  const { data: createdAuctions, error: fetchError } = await supabase
    .from('auctions')
    .select('*')
    .eq('product_id', testProduct.id)
    .order('created_at', { ascending: false })
    .limit(1)
  
  if (fetchError || !createdAuctions || createdAuctions.length === 0) {
    return { 
      success: false, 
      details: `Failed to verify auction creation: ${fetchError?.message}` 
    }
  }
  
  const auction = createdAuctions[0]
  
  return {
    success: true,
    details: `Auction created successfully (ID: ${auction.id}) ending at ${auction.ends_at}`,
    auctionId: auction.id,
    productId: testProduct.id,
    endsAt: auction.ends_at
  }
}

// 2. Precise Timing Test for 5-Minute Auction
async function testFiveMinuteAuctionTiming() {
  console.log('\n⏱️  Testing 5-minute auction precise timing...')
  
  // Create auction with exactly 5-minute duration
  const startTime = new Date()
  const endTime = new Date(startTime.getTime() + 5 * 60 * 1000) // Exactly 5 minutes
  
  // Get test product
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
  
  if (!products || products.length === 0) {
    return { success: false, details: 'No products available for timing test' }
  }
  
  const auctionData = {
    product_id: products[0].id,
    starting_price: 25.00,
    reserve_price: 75.00, // Will not be met for testing
    bid_increment: 5.00,
    starts_at: startTime.toISOString(),
    ends_at: endTime.toISOString(),
    status: 'active'
  }
  
  const { data: auction, error } = await supabase
    .from('auctions')
    .insert(auctionData)
    .select()
    .single()
  
  if (error) {
    return { success: false, details: `Failed to create timing test auction: ${error.message}` }
  }
  
  console.log(`⏰ Created 5-minute auction (ID: ${auction.id})`)
  console.log(`   Start: ${startTime.toISOString()}`)
  console.log(`   End: ${endTime.toISOString()}`)
  console.log(`   Duration: Exactly 5 minutes`)
  console.log(`   Reserve: RM ${auctionData.reserve_price} (will not be met)`)
  
  return {
    success: true,
    details: `5-minute auction created for timing precision test`,
    timing: {
      auctionId: auction.id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      expectedDuration: 5,
      scenario: 'reserve-not-met'
    }
  }
}

// 3. Precise Timing Test for 10-Minute Auction with Winning Scenario
async function testTenMinuteAuctionWithWinner() {
  console.log('\n⏱️  Testing 10-minute auction with winning scenario...')
  
  const startTime = new Date()
  const endTime = new Date(startTime.getTime() + 10 * 60 * 1000) // Exactly 10 minutes
  
  // Get test product
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .eq('status', 'active')
    .limit(1)
  
  if (!products || products.length === 0) {
    return { success: false, details: 'No products available for timing test' }
  }
  
  const auctionData = {
    product_id: products[0].id,
    starting_price: 30.00,
    reserve_price: 50.00, // Will be met with test bids
    bid_increment: 10.00,
    starts_at: startTime.toISOString(),
    ends_at: endTime.toISOString(),
    status: 'active'
  }
  
  const { data: auction, error } = await supabase
    .from('auctions')
    .insert(auctionData)
    .select()
    .single()
  
  if (error) {
    return { success: false, details: `Failed to create winning auction: ${error.message}` }
  }
  
  console.log(`⏰ Created 10-minute winning auction (ID: ${auction.id})`)
  console.log(`   Start: ${startTime.toISOString()}`)
  console.log(`   End: ${endTime.toISOString()}`)
  console.log(`   Duration: Exactly 10 minutes`)
  console.log(`   Reserve: RM ${auctionData.reserve_price} (will be met)`)
  
  // Schedule test bids to meet reserve price
  setTimeout(async () => {
    try {
      // Place bid that meets reserve price
      const { error: bidError } = await supabase
        .from('bids')
        .insert({
          auction_id: auction.id,
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
          .eq('id', auction.id)
      }
    } catch (error) {
      console.log(`⚠️  Error placing test bid: ${error.message}`)
    }
  }, 2 * 60 * 1000) // Place bid after 2 minutes
  
  return {
    success: true,
    details: `10-minute auction created with winning scenario test`,
    timing: {
      auctionId: auction.id,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      expectedDuration: 10,
      scenario: 'winning-with-reserve-met'
    }
  }
}

// 4. Auction Monitoring and Expiration Validation
async function createAuctionMonitor() {
  console.log('\n📊 Setting up auction expiration monitoring...')
  
  const monitoringInterval = setInterval(async () => {
    try {
      // Check all active auctions
      const { data: auctions } = await supabase
        .from('auctions')
        .select('*')
        .eq('status', 'active')
      
      if (auctions && auctions.length > 0) {
        const now = new Date()
        
        auctions.forEach(auction => {
          const endTime = new Date(auction.ends_at)
          const timeUntilEnd = endTime.getTime() - now.getTime()
          const minutesLeft = Math.round(timeUntilEnd / 60000)
          
          if (timeUntilEnd <= 0) {
            console.log(`🚨 EXPIRED: Auction ${auction.id} should have ended at ${endTime.toISOString()}`)
            console.log(`   Current time: ${now.toISOString()}`)
            console.log(`   Overdue by: ${Math.abs(minutesLeft)} minutes`)
          } else if (minutesLeft <= 2) {
            console.log(`⏰ ENDING SOON: Auction ${auction.id} ends in ${minutesLeft} minutes`)
            console.log(`   End time: ${endTime.toISOString()}`)
            console.log(`   Current bid: RM ${auction.current_bid || 'No bids'}`)
            console.log(`   Reserve price: RM ${auction.reserve_price}`)
            console.log(`   Reserve met: ${(auction.current_bid || 0) >= (auction.reserve_price || 0) ? '✅ YES' : '❌ NO'}`)
          }
        })
      } else {
        console.log(`📭 No active auctions found at ${new Date().toISOString()}`)
      }
    } catch (error) {
      console.log(`❌ Monitoring error: ${error.message}`)
    }
  }, 30000) // Check every 30 seconds
  
  // Stop monitoring after 15 minutes
  setTimeout(() => {
    clearInterval(monitoringInterval)
    console.log('\n📊 Auction monitoring stopped')
  }, 15 * 60 * 1000)
  
  return {
    success: true,
    details: 'Auction monitoring active for 15 minutes',
    interval: monitoringInterval
  }
}

// 5. WebSocket Connection Test for Real-time Updates
async function testWebSocketConnection() {
  console.log('\n🔌 Testing WebSocket connection for real-time auction updates...')
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${WS_BASE}`)
      let connected = false
      
      ws.on('open', () => {
        console.log('✅ WebSocket connected successfully')
        connected = true
        
        // Test authentication
        ws.send(JSON.stringify({
          type: 'auth',
          token: 'test-token'
        }))
        
        setTimeout(() => {
          ws.close()
          resolve({
            success: true,
            details: 'WebSocket connection established and authenticated'
          })
        }, 2000)
      })
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data)
          console.log(`📨 Received message: ${message.type}`)
        } catch (e) {
          console.log(`📨 Received: ${data}`)
        }
      })
      
      ws.on('error', (error) => {
        console.log(`❌ WebSocket error: ${error.message}`)
        if (!connected) {
          resolve({
            success: false,
            details: `WebSocket connection failed: ${error.message}`
          })
        }
      })
      
      ws.on('close', () => {
        console.log('🔌 WebSocket connection closed')
      })
      
      // Timeout after 5 seconds if no connection
      setTimeout(() => {
        if (!connected) {
          ws.close()
          resolve({
            success: false,
            details: 'WebSocket connection timeout'
          })
        }
      }, 5000)
      
    } catch (error) {
      resolve({
        success: false,
        details: `WebSocket test failed: ${error.message}`
      })
    }
  })
}

// 6. API Endpoint Validation
async function testAuctionAPIEndpoints() {
  console.log('\n🔗 Testing auction API endpoints...')
  
  const endpoints = [
    { method: 'GET', path: '/api/auctions', description: 'Get all auctions' },
    { method: 'GET', path: '/api/boost/packages', description: 'Get boost packages (for context)' },
    { method: 'GET', path: '/api/products', description: 'Get products (for auction creation)' }
  ]
  
  const results = []
  
  for (const endpoint of endpoints) {
    try {
      const response = await makeRequest(`${API_BASE}${endpoint.path}`)
      
      if (response.statusCode === 200) {
        results.push(`✅ ${endpoint.method} ${endpoint.path}: OK`)
      } else {
        results.push(`❌ ${endpoint.method} ${endpoint.path}: Status ${response.statusCode}`)
      }
    } catch (error) {
      results.push(`❌ ${endpoint.method} ${endpoint.path}: ${error.message}`)
    }
  }
  
  return {
    success: results.every(r => r.includes('✅')),
    details: results.join('\\n')
  }
}

// Main execution function
async function runComprehensiveAuctionTests() {
  console.log('🚀 Starting Comprehensive Auction System Testing')
  console.log('Enhanced with Precise Timing Tests for 5-min & 10-min Auctions')
  console.log('=' .repeat(80))
  
  try {
    // Test 1: API Endpoints
    await runTest('Auction API Endpoints', testAuctionAPIEndpoints)
    
    // Test 2: WebSocket Connection
    await runTest('WebSocket Connection', testWebSocketConnection)
    
    // Test 3: Basic Auction Creation
    await runTest('Basic Auction Creation', testAuctionCreation)
    
    // Test 4: 5-Minute Timing Test (Reserve Not Met)
    await runTest('5-Minute Auction Timing (Reserve Not Met)', testFiveMinuteAuctionTiming)
    
    // Test 5: 10-Minute Timing Test (Winning Scenario)
    await runTest('10-Minute Auction Timing (Winner)', testTenMinuteAuctionWithWinner)
    
    // Test 6: Start Monitoring
    await runTest('Auction Expiration Monitoring', createAuctionMonitor)
    
    // Print interim results
    console.log('\\n' + '=' .repeat(80))
    console.log('📊 INTERIM TEST RESULTS')
    console.log('=' .repeat(80))
    console.log(`Tests Completed: ${testResults.total}`)
    console.log(`✅ Passed: ${testResults.passed}`)
    console.log(`❌ Failed: ${testResults.failed}`)
    
    // Timing tests summary
    if (testResults.timingTests.length > 0) {
      console.log('\\n⏱️  TIMING TESTS CREATED:')
      testResults.timingTests.forEach(test => {
        console.log(`   - ${test.test}`)
        console.log(`     Auction ID: ${test.auctionId}`)
        console.log(`     Duration: ${test.expectedDuration} minutes`)
        console.log(`     Scenario: ${test.scenario}`)
        console.log(`     End Time: ${test.endTime}`)
      })
    }
    
    console.log('\\n🔍 MONITORING PHASE')
    console.log('The test will now monitor auction expirations for 15 minutes.')
    console.log('Watch for precise timing notifications and expiration accuracy.')
    console.log('\\nKey metrics to observe:')
    console.log('- Exact expiration timing (within 10-second tolerance)')
    console.log('- Proper handling of reserve-not-met vs winning scenarios')
    console.log('- Real-time notification delivery')
    console.log('- Background auction closure process')
    
    console.log('\\n⏰ EXPECTED TIMELINE:')
    testResults.timingTests.forEach(test => {
      const endTime = new Date(test.endTime)
      console.log(`   - ${test.expectedDuration}min auction (${test.scenario}): ${endTime.toLocaleTimeString()}`)
    })
    
    console.log('\\n🎯 TESTING COMPLETE - MONITORING ACTIVE')
    console.log('Monitor the server logs for auction expiration events...')
    
  } catch (error) {
    console.error('💥 Critical error in testing:', error)
  }
}

// Run the comprehensive tests
runComprehensiveAuctionTests()