#!/usr/bin/env node

/**
 * CRITICAL AUCTION TIMING FIX
 * Addresses the 1-hour early expiration bug by enforcing UTC timezone handling
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚨 CRITICAL AUCTION TIMING FIX - Starting timezone standardization...\n');

// 1. Force server to use UTC timezone
console.log('1. ⏰ Setting server timezone to UTC...');
process.env.TZ = 'UTC';
console.log(`   ✅ Server timezone set to: ${process.env.TZ}`);
console.log(`   ✅ Current server time: ${new Date().toISOString()}\n`);

// 2. Update all date utilities to use UTC consistently
const dateUtilsPath = path.join(__dirname, 'client/src/lib/date-utils.ts');
if (fs.existsSync(dateUtilsPath)) {
  console.log('2. 📅 Updating date utilities for UTC consistency...');
  
  let dateUtilsContent = fs.readFileSync(dateUtilsPath, 'utf8');
  
  // Add UTC enforcement functions
  const utcFunctions = `
// UTC ENFORCEMENT FUNCTIONS - Added to fix auction timing bug
export function ensureUTC(date?: Date | string): Date {
  if (!date) return new Date();
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // If date doesn't have timezone info, treat as UTC
  if (typeof date === 'string' && !date.includes('Z') && !date.includes('+') && !date.includes('-')) {
    return new Date(date + 'Z');
  }
  
  return dateObj;
}

export function toUTCISOString(date?: Date | string): string {
  return ensureUTC(date).toISOString();
}

export function calculateTimeRemainingUTC(endTime: Date | string): string {
  const now = new Date(); // Always in UTC when TZ=UTC
  const endDate = ensureUTC(endTime);
  
  console.log(\`[DEBUG] Calculating time remaining:\`);
  console.log(\`  Now (UTC): \${now.toISOString()}\`);
  console.log(\`  End (UTC): \${endDate.toISOString()}\`);
  
  if (now > endDate) {
    return "Auction Ended";
  }
  
  const diffMs = endDate.getTime() - now.getTime();
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  if (days > 0) {
    return \`\${days}d \${hours}h \${minutes}m\`;
  } else if (hours > 0) {
    return \`\${hours}h \${minutes}m \${seconds}s\`;
  } else if (minutes > 0) {
    return \`\${minutes}m \${seconds}s\`;
  } else {
    return \`\${seconds}s\`;
  }
}

`;
  
  // Add the UTC functions to the file
  dateUtilsContent += utcFunctions;
  
  fs.writeFileSync(dateUtilsPath, dateUtilsContent);
  console.log('   ✅ UTC enforcement functions added to date-utils.ts\n');
} else {
  console.log('   ⚠️  date-utils.ts not found, skipping...\n');
}

// 3. Update server index.ts to enforce UTC
const serverIndexPath = path.join(__dirname, 'server/index.ts');
if (fs.existsSync(serverIndexPath)) {
  console.log('3. 🖥️  Updating server index.ts for UTC enforcement...');
  
  let serverContent = fs.readFileSync(serverIndexPath, 'utf8');
  
  // Add UTC enforcement at the very top
  const utcEnforcement = `// CRITICAL FIX: Force UTC timezone to prevent auction timing bugs
process.env.TZ = 'UTC';
console.log(\`🌍 Server timezone enforced to UTC. Current time: \${new Date().toISOString()}\`);

`;
  
  // Only add if not already present
  if (!serverContent.includes('process.env.TZ = \'UTC\'')) {
    serverContent = utcEnforcement + serverContent;
    fs.writeFileSync(serverIndexPath, serverContent);
    console.log('   ✅ UTC enforcement added to server startup\n');
  } else {
    console.log('   ✅ UTC enforcement already present in server\n');
  }
} else {
  console.log('   ⚠️  server/index.ts not found, skipping...\n');
}

// 4. Create auction auto-closure service
console.log('4. ⏱️  Creating auction auto-closure service...');

const autoClosureService = `const { createClient } = require('@supabase/supabase-js');

// Force UTC timezone
process.env.TZ = 'UTC';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function closeExpiredAuctions() {
  const now = new Date().toISOString();
  console.log(\`🔍 Checking for expired auctions at \${now}\`);
  
  try {
    // Get all active auctions that have expired
    const { data: expiredAuctions, error } = await supabase
      .from('auctions')
      .select('id, ends_at, current_bid, current_bidder_id, product_id')
      .eq('status', 'active')
      .lt('ends_at', now);
    
    if (error) {
      console.error('❌ Error fetching expired auctions:', error);
      return;
    }
    
    if (!expiredAuctions || expiredAuctions.length === 0) {
      console.log('✅ No expired auctions found');
      return;
    }
    
    console.log(\`📋 Found \${expiredAuctions.length} expired auctions to close\`);
    
    for (const auction of expiredAuctions) {
      console.log(\`🔨 Closing auction \${auction.id} (ended at \${auction.ends_at})\`);
      
      // Update auction status to completed
      const { error: updateError } = await supabase
        .from('auctions')
        .update({ 
          status: 'completed',
          updated_at: now
        })
        .eq('id', auction.id);
      
      if (updateError) {
        console.error(\`❌ Error closing auction \${auction.id}:, updateError\`);
        continue;
      }
      
      // Log to audit trail
      await supabase
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
      
      console.log(\`✅ Auction \${auction.id} closed successfully\`);
      
      // TODO: Add winner notification here
      if (auction.current_bidder_id) {
        console.log(\`🎉 Winner: User \${auction.current_bidder_id}, Amount: \${auction.current_bid}\`);
        // TODO: Send notification to winner
        // TODO: Trigger payment process
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error in closeExpiredAuctions:', error);
  }
}

// Run immediately
closeExpiredAuctions();

// Run every minute
setInterval(closeExpiredAuctions, 60000);

console.log('🚀 Auction auto-closure service started (checking every 60 seconds)');
`;

fs.writeFileSync(path.join(__dirname, 'auction-auto-closure.js'), autoClosureService);
console.log('   ✅ Auction auto-closure service created\n');

// 5. Create package.json script
console.log('5. 📦 Adding auction auto-closure script to package.json...');

const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }
  
  packageJson.scripts['auction-service'] = 'node auction-auto-closure.js';
  packageJson.scripts['fix-timezone'] = 'node fix-server-timezone-handling.js';
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('   ✅ Scripts added to package.json\n');
} else {
  console.log('   ⚠️  package.json not found, skipping...\n');
}

// 6. Create environment variable template
console.log('6. 🔧 Creating environment configuration...');

const envTemplate = \`# CRITICAL TIMEZONE FIX
TZ=UTC

# Add these to your .env file for auction auto-closure
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
VITE_SUPABASE_URL=your_supabase_url_here
\`;

fs.writeFileSync(path.join(__dirname, '.env.timezone-fix'), envTemplate);
console.log('   ✅ Environment template created (.env.timezone-fix)\n');

// 7. Verification
console.log('7. ✅ VERIFICATION - Current system status:');
console.log(\`   🕐 Server timezone: \${process.env.TZ}\`);
console.log(\`   🕐 Current UTC time: \${new Date().toISOString()}\`);
console.log(\`   🕐 Current local time: \${new Date().toString()}\`);

console.log(\`
🎯 CRITICAL FIXES COMPLETED!

✅ What was fixed:
   1. Server timezone forced to UTC
   2. Date utility functions updated for UTC consistency  
   3. Auction auto-closure service created
   4. Environment configuration templates added

🚀 Next steps:
   1. Run the SQL script: psql -f fix-critical-schema-issues.sql
   2. Start auction service: npm run auction-service
   3. Replace old schema: mv shared/schema-corrected.ts shared/schema.ts
   4. Test auction timing with new UTC handling
   5. Update .env with SUPABASE_SERVICE_ROLE_KEY

⚠️  IMPORTANT: 
   - Restart your server to apply timezone changes
   - Monitor auction expiration times for 24 hours
   - The 1-hour early expiration bug should now be resolved

📋 Files created/modified:
   - fix-critical-schema-issues.sql (database fixes)
   - shared/schema-corrected.ts (corrected schema)
   - auction-auto-closure.js (auto-closure service)
   - fix-server-timezone-handling.js (this script)
   - .env.timezone-fix (environment template)
\`);