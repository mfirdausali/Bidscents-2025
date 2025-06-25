#!/usr/bin/env node

/**
 * AUCTION AUTO-CLOSURE SERVICE
 * Monitors and automatically closes expired auctions
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force UTC timezone
process.env.TZ = 'UTC';

console.log('🚀 AUCTION AUTO-CLOSURE SERVICE STARTING...');
console.log(`🌍 Server timezone enforced to UTC. Current time: ${new Date().toISOString()}`);

// Read .env file manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim().replace(/"/g, '');
    }
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const serviceRoleKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('   Required: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase client initialized for auction monitoring');

async function closeExpiredAuctions() {
  const now = new Date().toISOString();
  console.log(`🔍 Checking for expired auctions at ${now}`);
  
  try {
    // Get all active auctions that have expired
    const { data: expiredAuctions, error } = await supabase
      .from('auctions')
      .select('id, ends_at, current_bid, current_bidder_id, product_id')
      .eq('status', 'active')
      .lt('ends_at', now);
    
    if (error) {
      console.error('❌ Error fetching expired auctions:', error.message);
      return;
    }
    
    if (!expiredAuctions || expiredAuctions.length === 0) {
      console.log('✅ No expired auctions found');
      return;
    }
    
    console.log(`📋 Found ${expiredAuctions.length} expired auctions to close`);
    
    for (const auction of expiredAuctions) {
      console.log(`🔨 Closing auction ${auction.id} (ended at ${auction.ends_at})`);
      
      // Update auction status to completed
      const { error: updateError } = await supabase
        .from('auctions')
        .update({ 
          status: 'completed',
          updated_at: now
        })
        .eq('id', auction.id);
      
      if (updateError) {
        console.error(`❌ Error closing auction ${auction.id}:`, updateError.message);
        continue;
      }
      
      // Log to audit trail
      const { error: auditError } = await supabase
        .from('bid_audit_trail')
        .insert({
          auction_id: auction.id,
          user_id: auction.current_bidder_id || 0,
          attempted_amount: auction.current_bid || 0,
          status: 'auction_closed',
          reason: 'Automatic closure - auction expired',
          ip_address: '127.0.0.1',
          user_agent: 'auction-auto-closure-service'
        });
      
      if (auditError) {
        console.warn(`⚠️  Could not log audit trail for auction ${auction.id}:`, auditError.message);
      }
      
      console.log(`✅ Auction ${auction.id} closed successfully`);
      
      // Log winner information
      if (auction.current_bidder_id && auction.current_bid) {
        console.log(`🎉 Winner: User ${auction.current_bidder_id}, Amount: ${auction.current_bid}`);
        
        // TODO: Send notification to winner
        // TODO: Trigger payment process
        // TODO: Notify seller of sale
      } else {
        console.log(`📝 No bids received - auction ${auction.id} expired without winner`);
      }
    }
    
    // Log summary statistics
    const { count: activeCount } = await supabase
      .from('auctions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');
    
    const { count: completedToday } = await supabase
      .from('auctions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('updated_at', new Date().toISOString().split('T')[0]);
    
    console.log(`📊 Auction Summary:`);
    console.log(`   Active auctions: ${activeCount || 0}`);
    console.log(`   Completed today: ${completedToday || 0}`);
    console.log(`   Just closed: ${expiredAuctions.length}`);
    
  } catch (error) {
    console.error('❌ Unexpected error in closeExpiredAuctions:', error.message);
  }
}

// Function to check auction health
async function checkAuctionHealth() {
  try {
    const { data: healthData, error } = await supabase
      .from('auctions')
      .select('status, ends_at, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      console.warn('⚠️  Could not fetch auction health data:', error.message);
      return;
    }
    
    const now = new Date();
    let activeCount = 0;
    let expiredActiveCount = 0;
    let completedCount = 0;
    let todayCount = 0;
    
    healthData.forEach(auction => {
      const auctionDate = new Date(auction.created_at);
      const isToday = auctionDate.toDateString() === now.toDateString();
      
      if (isToday) todayCount++;
      
      if (auction.status === 'active') {
        activeCount++;
        const endTime = new Date(auction.ends_at);
        if (now > endTime) {
          expiredActiveCount++;
        }
      } else if (auction.status === 'completed') {
        completedCount++;
      }
    });
    
    if (expiredActiveCount > 0) {
      console.warn(`⚠️  HEALTH WARNING: ${expiredActiveCount} active auctions are past their end time!`);
    }
    
    console.log(`💊 Health Check: ${activeCount} active, ${completedCount} completed, ${todayCount} created today`);
    
  } catch (error) {
    console.warn('⚠️  Health check failed:', error.message);
  }
}

// Graceful shutdown handling
let isShuttingDown = false;

process.on('SIGINT', () => {
  console.log('\\n🛑 Received SIGINT, shutting down gracefully...');
  isShuttingDown = true;
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\\n🛑 Received SIGTERM, shutting down gracefully...');
  isShuttingDown = true;
  process.exit(0);
});

// Main service loop
async function startService() {
  console.log('🎯 Auction auto-closure service started');
  console.log('   Checking for expired auctions every 60 seconds');
  console.log('   Health checks every 5 minutes');
  console.log('   Press Ctrl+C to stop\\n');
  
  // Run initial check
  await closeExpiredAuctions();
  await checkAuctionHealth();
  
  // Set up intervals
  const closureInterval = setInterval(async () => {
    if (!isShuttingDown) {
      await closeExpiredAuctions();
    }
  }, 60000); // Check every minute
  
  const healthInterval = setInterval(async () => {
    if (!isShuttingDown) {
      await checkAuctionHealth();
    }
  }, 300000); // Health check every 5 minutes
  
  // Cleanup on shutdown
  process.on('exit', () => {
    clearInterval(closureInterval);
    clearInterval(healthInterval);
    console.log('✅ Auction service stopped cleanly');
  });
}

// Start the service
startService().catch(error => {
  console.error('❌ Failed to start auction service:', error.message);
  process.exit(1);
});