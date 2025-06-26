/**
 * Auction Health Monitor - Periodically checks for and fixes stuck auctions
 * This prevents issues like auction 56 where reserve logic failed
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
/**
 * Check for auctions that are incorrectly marked as "reserve_not_met"
 * when they actually have winning bids above the reserve price
 */
async function checkForStuckAuctions() {
    try {
        console.log('[HEALTH-MONITOR] Checking for stuck auctions...');
        // Find auctions with "reserve_not_met" status that might be incorrect
        const { data: potentiallyStuckAuctions, error } = await supabase
            .from('auctions')
            .select('id, reserve_price, current_bid, status, product_id, ends_at')
            .eq('status', 'reserve_not_met')
            .not('current_bid', 'is', null); // Only check auctions that have bids
        if (error) {
            console.error('[HEALTH-MONITOR] Error fetching potentially stuck auctions:', error);
            return;
        }
        if (!potentiallyStuckAuctions || potentiallyStuckAuctions.length === 0) {
            console.log('[HEALTH-MONITOR] No potentially stuck auctions found.');
            return;
        }
        console.log(`[HEALTH-MONITOR] Found ${potentiallyStuckAuctions.length} auctions to check`);
        let fixedCount = 0;
        for (const auction of potentiallyStuckAuctions) {
            const hasReservePrice = auction.reserve_price !== null && auction.reserve_price > 0;
            const hasBid = auction.current_bid !== null;
            if (hasReservePrice && hasBid) {
                const reservePriceNum = parseFloat(auction.reserve_price.toString());
                const currentBidNum = parseFloat(auction.current_bid.toString());
                // Check if the bid actually meets the reserve
                if (currentBidNum >= reservePriceNum) {
                    console.log(`[HEALTH-MONITOR] 🔧 FIXING Auction ${auction.id}: Bid ${currentBidNum} >= Reserve ${reservePriceNum}`);
                    // Fix the auction status
                    const { error: updateError } = await supabase
                        .from('auctions')
                        .update({
                        status: 'pending',
                        updated_at: new Date().toISOString()
                    })
                        .eq('id', auction.id);
                    if (updateError) {
                        console.error(`[HEALTH-MONITOR] ❌ Failed to fix auction ${auction.id}:`, updateError);
                    }
                    else {
                        console.log(`[HEALTH-MONITOR] ✅ Fixed auction ${auction.id}: status changed to 'pending'`);
                        fixedCount++;
                        // Also update the product status
                        const { error: productError } = await supabase
                            .from('products')
                            .update({ status: 'pending' })
                            .eq('id', auction.product_id);
                        if (productError) {
                            console.error(`[HEALTH-MONITOR] ⚠️ Warning: Could not update product ${auction.product_id} status:`, productError);
                        }
                    }
                }
            }
        }
        if (fixedCount > 0) {
            console.log(`[HEALTH-MONITOR] ✅ Fixed ${fixedCount} stuck auction(s)`);
        }
        else {
            console.log(`[HEALTH-MONITOR] ✅ No stuck auctions found to fix`);
        }
    }
    catch (error) {
        console.error('[HEALTH-MONITOR] Unexpected error during auction health check:', error);
    }
}
/**
 * Start the auction health monitoring service
 * Runs every 10 minutes to check for stuck auctions
 */
export function startAuctionHealthMonitor() {
    console.log('[HEALTH-MONITOR] Starting auction health monitoring service...');
    // Run immediately on startup
    checkForStuckAuctions();
    // Run every 10 minutes (600,000 ms)
    setInterval(checkForStuckAuctions, 10 * 60 * 1000);
    console.log('[HEALTH-MONITOR] Health monitoring service started (checks every 10 minutes)');
}
// Export for manual use
export { checkForStuckAuctions };
