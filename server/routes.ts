import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
// Removed complex Passport.js authentication
import { storage } from "./storage";
import { 
  insertProductSchema, 
  insertReviewSchema, 
  insertProductImageSchema, 
  insertMessageSchema, 
  insertPaymentSchema,
  insertBoostPackageSchema,
  boostPackages
} from "@shared/schema";
import { productImages } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import multer from "multer";
import * as supabaseFileStorage from "./supabase-file-storage"; // Import Supabase storage implementation
import { IMAGE_TYPES } from "./types/index.js";
import path from "path"; // Added import for path
import { supabase } from "./supabase"; // Import Supabase for server-side operations
import { createClient } from '@supabase/supabase-js';
import { users } from "@shared/schema"; // Import the users schema for database updates
import { WebSocketServer, WebSocket } from 'ws';
import { encryptMessage, decryptMessage, isEncrypted } from './encryption';
import { generateSellerPreview } from './social-preview';
import * as billplz from './billplz';
import crypto from 'crypto';
import { requireAuth, getUserFromToken, authRoutes, AuthenticatedRequest } from './app-auth';
import { authLimiter, passwordResetLimiter, apiLimiter, userLookupLimiter, adminLimiter } from './rate-limiter';
import { validateCSRF, provideCSRFToken, getCSRFTokenEndpoint } from './csrf-protection';

/**
 * Helper function to determine if we're in a sandbox environment
 * This is used throughout the payment processing system
 */
function isBillplzSandbox(): boolean {
  return process.env.BILLPLZ_BASE_URL?.includes('sandbox') ?? true;
}

/**
 * Helper function to get authenticated user from request
 * Uses the new Supabase-only authentication system
 * @deprecated Use requireAuth middleware instead for new endpoints
 */
async function getAuthenticatedUser(req: Request): Promise<any | null> {
  const tokenUser = getUserFromToken(req);
  if (!tokenUser) return null;
  
  // Get full user details from storage
  try {
    const fullUser = await storage.getUser(tokenUser.id);
    return fullUser;
  } catch (error) {
    console.error('Error fetching full user details:', error);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Version endpoint to check deployed commit hash
  app.get("/api/version", (req, res) => {
    try {
      const { execSync } = require('child_process');
      const commitHash = execSync('git rev-parse HEAD').toString().trim();
      const shortHash = execSync('git rev-parse --short HEAD').toString().trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
      const timestamp = new Date().toISOString();
      
      res.json({
        commitHash,
        shortHash,
        branch,
        timestamp,
        version: "1.0.0"
      });
    } catch (error) {
      res.json({
        error: "Could not retrieve version info",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      });
    }
  });

  // Create HTTP server for both Express and WebSocket
  const httpServer = createServer(app);
  
  // Initialize WebSocket server on a different path than Vite's HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Connected clients map with user information
  const clients = new Map<WebSocket, { userId: number; username: string }>();
  
  // Rate limiting for bid submissions
  const bidRateLimiter = new Map<number, { count: number; resetTime: number }>();
  const BID_RATE_LIMIT = 5; // Maximum bids per window
  const BID_RATE_WINDOW = 60000; // 1 minute window
  
  // Auction rooms for real-time updates
  const auctionRooms = new Map<number, Set<WebSocket>>();
  
  // Connected users for notifications
  const connectedUsers = new Map<number, WebSocket>();
  
  // Extend WebSocket type to include joinedAuctions
  interface ExtendedWebSocket extends WebSocket {
    joinedAuctions?: Set<number>;
  }
  
  // WebSocket connection handler
  wss.on('connection', (ws: ExtendedWebSocket) => {
    console.log('WebSocket client connected');
    
    // Handle messages from client
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('[HANDLER 1] Received WebSocket message:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'auth':
            // Secure JWT-based authentication
            if (data.token) {
              try {
                const { verifyWebSocketAuth } = await import('./auth-security');
                const decoded = verifyWebSocketAuth(data.token);
                
                if (decoded) {
                  // Get user details from database to ensure we have complete profile
                  const user = await storage.getUser(decoded.userId);
                  if (user) {
                    clients.set(ws, { 
                      userId: decoded.userId, 
                      username: user.username
                    });
                    
                    // Add to connectedUsers map for notifications
                    connectedUsers.set(decoded.userId, ws);
                    
                    console.log(`User authenticated via JWT: ${user.username} (ID: ${decoded.userId})`);
                    ws.send(JSON.stringify({ 
                      type: 'auth_success',
                      userId: decoded.userId,
                      username: user.username 
                    }));
                  } else {
                    console.log('WebSocket authentication failed: user not found in database');
                    ws.send(JSON.stringify({ type: 'auth_failed', message: 'User profile not found' }));
                    ws.close();
                  }
                } else {
                  console.log('WebSocket authentication failed: invalid token');
                  ws.send(JSON.stringify({ type: 'auth_failed', message: 'Invalid authentication token' }));
                  ws.close();
                }
              } catch (error) {
                console.error('WebSocket authentication error:', error);
                ws.send(JSON.stringify({ type: 'auth_failed', message: 'Authentication failed' }));
                ws.close();
              }
            } else {
              console.log('WebSocket authentication failed: no token provided');
              ws.send(JSON.stringify({ type: 'auth_failed', message: 'Authentication token required' }));
              ws.close();
            }
            break;
            
          case 'send_message':
            // Handle modern send_message format from frontend
            console.log('🔥 SERVER: Processing send_message request');
            console.log('📥 Message data:', {
              type: data.type,
              receiverId: data.receiverId,
              content: data.content?.substring(0, 50) + '...',
              productId: data.productId
            });
            
            // Get authenticated user from WebSocket client
            const clientInfo = clients.get(ws);
            if (!clientInfo) {
              console.error('❌ SERVER: User not authenticated for send_message');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated'
              }));
              break;
            }
            
            if (!data.receiverId || !data.content) {
              console.error('❌ SERVER: Missing required fields for send_message');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Missing receiverId or content'
              }));
              break;
            }
            
            try {
              console.log('💾 SERVER: Encrypting and saving message to database');
              
              // Encrypt the message content
              const encryptedContent = encryptMessage(data.content);
              
              // Create message data
              const messageData = {
                senderId: clientInfo.userId,
                receiverId: data.receiverId,
                content: encryptedContent,
                productId: data.productId || null,
                isRead: false,
              };
              
              console.log('📝 SERVER: Creating message with data:', {
                senderId: messageData.senderId,
                receiverId: messageData.receiverId,
                hasContent: !!messageData.content,
                productId: messageData.productId
              });
              
              // Save message to database
              const savedMessage = await storage.sendMessage(messageData);
              console.log('✅ SERVER: Message saved with ID:', savedMessage.id);
              
              // Get user details for response
              const sender = await storage.getUser(clientInfo.userId);
              const receiver = await storage.getUser(data.receiverId);
              
              // Get product details if productId provided
              let product = null;
              if (data.productId) {
                try {
                  product = await storage.getProductById(data.productId);
                } catch (err) {
                  console.warn('SERVER: Could not fetch product details:', err);
                }
              }
              
              // Create detailed message response
              const messageResponse = {
                id: savedMessage.id,
                senderId: savedMessage.senderId,
                receiverId: savedMessage.receiverId,
                content: data.content, // Send original content (not encrypted)
                productId: savedMessage.productId,
                isRead: savedMessage.isRead,
                createdAt: savedMessage.createdAt,
                sender: sender ? {
                  id: sender.id,
                  username: sender.username,
                  profileImage: sender.profileImage
                } : undefined,
                receiver: receiver ? {
                  id: receiver.id,
                  username: receiver.username,
                  profileImage: receiver.profileImage
                } : undefined,
                product: product ? {
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  imageUrl: product.imageUrl
                } : undefined
              };
              
              console.log('📤 SERVER: Sending confirmation to sender');
              // Send confirmation to sender
              ws.send(JSON.stringify({
                type: 'message_sent',
                message: messageResponse
              }));
              
              // Send message to receiver if they're connected
              let receiverNotified = false;
              clients.forEach((receiverInfo, receiverWs) => {
                if (receiverWs.readyState === WebSocket.OPEN && receiverInfo.userId === data.receiverId) {
                  console.log('📨 SERVER: Sending message to receiver');
                  receiverWs.send(JSON.stringify({
                    type: 'new_message',
                    message: messageResponse
                  }));
                  receiverNotified = true;
                }
              });
              
              if (!receiverNotified) {
                console.log('⚠️ SERVER: Receiver not connected, message saved for later');
              }
              
              console.log('✅ SERVER: send_message processing complete');
              
            } catch (error) {
              console.error('❌ SERVER: Error processing send_message:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to send message: ' + errorMessage
              }));
            }
            break;
            
          case 'chat_message':
            // Handle, store, and broadcast chat messages
            if (data.senderId && data.receiverId && data.content) {
              // Store message in database with encryption
              const encryptedContent = encryptMessage(data.content);
              const messageData = {
                senderId: data.senderId,
                receiverId: data.receiverId,
                content: encryptedContent,
                read: false,
                sentAt: new Date().toISOString(),
              };
              
              // Save message to database
              const savedMessage = await storage.addMessage(messageData);
              
              // Broadcast to receiver if they're online
              clients.forEach((clientInfo, client) => {
                if (client.readyState === WebSocket.OPEN && clientInfo.userId === data.receiverId) {
                  // Send message to the recipient
                  client.send(JSON.stringify({
                    type: 'new_message',
                    message: {
                      ...savedMessage,
                      content: data.content // Send decrypted content to client
                    }
                  }));
                }
              });
              
              // Confirm message delivery to sender
              ws.send(JSON.stringify({
                type: 'message_sent',
                messageId: savedMessage.id
              }));
            }
            break;
            
          case 'status_update':
            // Handle transaction status updates and broadcast to relevant users
            if (data.transactionId && data.status) {
              // Update transaction status in database
              try {
                await storage.updateTransactionStatus(
                  data.transactionId, 
                  data.status
                );
                
                // Successfully updated, notify connected clients
                console.log(`Transaction ${data.transactionId} status updated to ${data.status}`);
              } catch (error) {
                console.error('Error updating transaction status:', error);
              }
            }
            break;
            
          case 'joinAuction':
            try {
              // Validate auction ID
              const auctionId = parseInt(data.auctionId);
              if (isNaN(auctionId)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid auction ID' }));
                return;
              }
              
              // Get the auction room, create if it doesn't exist
              let room = auctionRooms.get(auctionId);
              if (!room) {
                room = new Set<WebSocket>();
                auctionRooms.set(auctionId, room);
              }
              
              // Add this connection to the room
              room.add(ws);
              
              // Track which auctions this connection has joined
              if (!ws.joinedAuctions) {
                ws.joinedAuctions = new Set<number>();
              }
              ws.joinedAuctions.add(auctionId);
              
              // Get user info for logging
              const userInfo = clients.get(ws);
              const userId = userInfo?.userId || 'guest';
              
              console.log(`User ${userId} joined auction room ${auctionId}`);
              ws.send(JSON.stringify({ 
                type: 'joinedAuction', 
                auctionId, 
                message: `Joined auction room ${auctionId}` 
              }));
              
              // Notify about active viewers
              const viewerCount = room.size;
              Array.from(room).forEach(connection => {
                if (connection.readyState === WebSocket.OPEN) {
                  connection.send(JSON.stringify({
                    type: 'auctionViewers',
                    auctionId,
                    count: viewerCount
                  }));
                }
              });
              
            } catch (error: any) {
              console.error('Error joining auction room:', error);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Failed to join auction room: ' + (error.message || 'Unknown error')
              }));
            }
            break;
            
          case 'leaveAuction':
            try {
              const auctionId = parseInt(data.auctionId);
              if (isNaN(auctionId)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid auction ID' }));
                return;
              }
              
              // Remove connection from the room
              const room = auctionRooms.get(auctionId);
              if (room) {
                room.delete(ws);
                
                // Remove from tracked auctions
                if (ws.joinedAuctions) {
                  ws.joinedAuctions.delete(auctionId);
                }
                
                // If room is empty, delete it
                if (room.size === 0) {
                  auctionRooms.delete(auctionId);
                } else {
                  // Notify remaining users about viewer count
                  Array.from(room).forEach(connection => {
                    if (connection.readyState === WebSocket.OPEN) {
                      connection.send(JSON.stringify({
                        type: 'auctionViewers',
                        auctionId,
                        count: room.size
                      }));
                    }
                  });
                }
                
                const userInfo = clients.get(ws);
                const userId = userInfo?.userId || 'guest';
                console.log(`User ${userId} left auction room ${auctionId}`);
                ws.send(JSON.stringify({ 
                  type: 'leftAuction', 
                  auctionId,
                  message: `Left auction room ${auctionId}` 
                }));
              }
              
            } catch (error: any) {
              console.error('Error leaving auction room:', error);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Failed to leave auction room: ' + (error.message || 'Unknown error')
              }));
            }
            break;
            
          case 'placeBid':
            try {
              // Get authenticated user from WebSocket client
              const bidderInfo = clients.get(ws);
              let userId = bidderInfo?.userId;
              
              // For placing bids, we need to verify the user is actually logged in
              if (!userId) {
                console.log('Bid attempt rejected: WebSocket not authenticated');
                
                // Try to get the user ID from the message data
                if (data.userId) {
                  // Check if this user exists in our database
                  try {
                    console.log(`Verifying user ${data.userId} for bid...`);
                    const user = await storage.getUser(data.userId);
                    
                    if (user) {
                      console.log(`User ${data.userId} verified for bid through lookup`);
                      // Use the verified user ID
                      userId = data.userId;
                    } else {
                      console.log(`User ${data.userId} not found in database`);
                      ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: 'You must be logged in to place a bid' 
                      }));
                      // Log failed attempt
                      await storage.createBidAuditEntry({
                        auctionId: parseInt(data.auctionId),
                        userId: data.userId || 0,
                        attemptedAmount: parseFloat(data.amount) || 0,
                        status: 'failed',
                        reason: 'User not authenticated'
                      });
                      return;
                    }
                  } catch (err) {
                    console.error(`Error verifying user ${data.userId}:`, err);
                    ws.send(JSON.stringify({ 
                      type: 'error', 
                      message: 'Authentication error. Please try logging in again.' 
                    }));
                    return;
                  }
                } else {
                  console.log('Bid attempt rejected: No user ID provided');
                  ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'You must be logged in to place a bid' 
                  }));
                  return;
                }
              }
              
              console.log(`Processing bid from user ${userId}...`);
              const { auctionId, amount } = data;
              
              // Check rate limit for this user
              const now = Date.now();
              const userRateLimit = bidRateLimiter.get(userId);
              
              if (userRateLimit) {
                // Check if rate limit window has expired
                if (now > userRateLimit.resetTime) {
                  // Reset the rate limit
                  bidRateLimiter.set(userId, { count: 1, resetTime: now + BID_RATE_WINDOW });
                } else if (userRateLimit.count >= BID_RATE_LIMIT) {
                  // User has exceeded rate limit
                  const timeRemaining = Math.ceil((userRateLimit.resetTime - now) / 1000);
                  console.log(`Rate limit exceeded for user ${userId}. ${timeRemaining}s remaining.`);
                  ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: `Too many bid attempts. Please wait ${timeRemaining} seconds before trying again.` 
                  }));
                  // Log rate limited attempt
                  await storage.createBidAuditEntry({
                    auctionId: parseInt(auctionId),
                    userId: userId,
                    attemptedAmount: parseFloat(amount),
                    status: 'rate_limited',
                    reason: `Rate limit exceeded. ${BID_RATE_LIMIT} bids per ${BID_RATE_WINDOW/1000}s`
                  });
                  return;
                } else {
                  // Increment bid count
                  userRateLimit.count++;
                }
              } else {
                // First bid from this user
                bidRateLimiter.set(userId, { count: 1, resetTime: now + BID_RATE_WINDOW });
              }
              
              // Validate auction ID and bid amount
              if (isNaN(parseInt(auctionId)) || isNaN(parseFloat(amount))) {
                console.log(`Bid validation failed: Invalid auction ID ${auctionId} or amount ${amount}`);
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Invalid auction ID or bid amount' 
                }));
                return;
              }
              
              console.log(`Fetching auction ${auctionId} for bid validation...`);
              // Get the auction
              const auction = await storage.getAuctionById(parseInt(auctionId));
              if (!auction) {
                console.log(`Bid rejected: Auction ${auctionId} not found`);
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Auction not found' 
                }));
                return;
              }
              console.log(`Found auction ${auctionId} for product ${auction.productId}`);
              
              // Check if auction is active
              const currentTime = new Date();
              const endsAt = new Date(auction.endsAt);
              if (currentTime > endsAt) {
                console.log(`Bid rejected: Auction ${auctionId} has ended at ${endsAt}, current time is ${currentTime}`);
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Auction has ended' 
                }));
                // Log auction ended attempt
                await storage.createBidAuditEntry({
                  auctionId: parseInt(auctionId),
                  userId: userId,
                  attemptedAmount: parseFloat(amount),
                  status: 'auction_ended',
                  reason: `Auction ended at ${endsAt.toISOString()}`
                });
                return;
              }
              
              // Check if the bid is high enough
              const minBid = (auction.currentBid || auction.startingPrice) + auction.bidIncrement;
              if (parseFloat(amount) < minBid) {
                console.log(`Bid rejected: Amount ${amount} is less than minimum bid ${minBid}`);
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: `Bid must be at least ${minBid}` 
                }));
                // Log invalid amount attempt
                await storage.createBidAuditEntry({
                  auctionId: parseInt(auctionId),
                  userId: userId,
                  attemptedAmount: parseFloat(amount),
                  status: 'invalid_amount',
                  reason: `Bid ${amount} below minimum ${minBid}`
                });
                return;
              }
              
              // Anti-fraud validation
              const bidAmount = parseFloat(amount);
              
              // Check for suspiciously high bids (more than 10x current bid)
              if (auction.currentBid && bidAmount > auction.currentBid * 10) {
                console.log(`Suspicious bid detected: ${bidAmount} is more than 10x current bid ${auction.currentBid}`);
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Your bid appears unusually high. Please confirm the amount and try again.' 
                }));
                // Log suspicious bid
                await storage.createBidAuditEntry({
                  auctionId: parseInt(auctionId),
                  userId: userId,
                  attemptedAmount: bidAmount,
                  status: 'suspicious_amount',
                  reason: `Bid ${bidAmount} is ${(bidAmount/auction.currentBid).toFixed(1)}x current bid`
                });
                return;
              }
              
              // Check for rapid successive bids from same user (potential bot)
              const recentBids = await storage.getBidsForAuction(parseInt(auctionId));
              const userRecentBids = recentBids
                .filter(b => b.bidderId === userId)
                .filter(b => new Date(b.placedAt).getTime() > Date.now() - 60000); // Last minute
              
              if (userRecentBids.length >= 3) {
                console.log(`Rapid bidding detected: User ${userId} has placed ${userRecentBids.length} bids in last minute`);
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'Too many rapid bids. Please wait a moment before bidding again.' 
                }));
                // Log rapid bidding
                await storage.createBidAuditEntry({
                  auctionId: parseInt(auctionId),
                  userId: userId,
                  attemptedAmount: bidAmount,
                  status: 'rapid_bidding',
                  reason: `${userRecentBids.length} bids in last 60 seconds`
                });
                return;
              }
              
              console.log(`Bid validation successful. Processing bid of ${amount} on auction ${auctionId} by user ${userId}...`);
              
              // Step 2: Set any previous winning bids to not winning
              try {
                console.log(`Resetting previous winning bids for auction ${auctionId}...`);
                // This needs to be a direct database call since our storage interface doesn't have this method
                const { error: updateError } = await supabase
                  .from('bids')
                  .update({ is_winning: false })
                  .eq('auction_id', auctionId)
                  .eq('is_winning', true);
                  
                if (updateError) {
                  console.error('Error updating previous bids:', updateError);
                  // Continue with new bid placement anyway
                } else {
                  console.log(`Successfully reset previous winning bids for auction ${auctionId}`);
                }
              } catch (err) {
                console.error('Exception updating previous bids:', err);
                // Continue with new bid placement anyway
              }
              
              // Step 3: Create the bid in the database
              console.log(`Creating new bid record for auction ${auctionId} by user ${userId} with amount ${amount}...`);
              
              try {
                // Create the new bid
                const bid = await storage.createBid({
                  auctionId: parseInt(auctionId),
                  bidderId: userId,
                  amount: parseFloat(amount),
                  isWinning: true // This new bid becomes the winning bid
                });
                console.log(`Successfully created bid with ID ${bid.id}`);
                
                // Step 4: Check if bid is in last 5 minutes and extend auction
                const timeUntilEnd = endsAt.getTime() - now;
                const EXTENSION_THRESHOLD = 5 * 60 * 1000; // 5 minutes
                const EXTENSION_TIME = 5 * 60 * 1000; // Extend by 5 minutes
                
                let auctionExtended = false;
                let newEndsAt = auction.endsAt;
                
                if (timeUntilEnd < EXTENSION_THRESHOLD && timeUntilEnd > 0) {
                  // Bid placed in last 5 minutes, extend auction
                  newEndsAt = new Date(endsAt.getTime() + EXTENSION_TIME).toISOString();
                  auctionExtended = true;
                  console.log(`Extending auction ${auctionId} by 5 minutes due to last-minute bid`);
                }
                
                // Step 5: Update the auction's current bid and bidder
                console.log(`Updating auction ${auctionId} with new current bid ${amount} and bidder ${userId}...`);
                const updateData: any = {
                  currentBid: parseFloat(amount),
                  currentBidderId: userId
                };
                
                if (auctionExtended) {
                  updateData.endsAt = newEndsAt;
                }
                
                await storage.updateAuction(parseInt(auctionId), updateData);
                console.log(`Successfully updated auction ${auctionId}`);
                
                // Store the previous highest bidder for outbid notification
                const previousHighestBidderId = auction.currentBidderId;
                
                // Get bidder information
                console.log(`Fetching bidder details for user ${userId}...`);
                const bidder = await storage.getUser(userId);
                console.log(`Bidder details: ${bidder ? 'Found' : 'Not found'}`);
                
                // Add bidder name to bid
                const bidWithDetails = {
                  ...bid,
                  bidder: bidder?.username || `User #${userId}`
                };
                console.log(`Enhanced bid with bidder name: ${bidWithDetails.bidder}`);
                
                // Step 5: Notify all users in the auction room
                console.log(`Preparing to notify all users in auction room ${auctionId} about the new bid...`);
                const room = auctionRooms.get(parseInt(auctionId));
                
                if (room) {
                  // Get updated auction data to include in the notification
                  console.log(`Fetching updated auction data for notification...`);
                  const updatedAuction = await storage.getAuctionById(parseInt(auctionId));
                  
                  if (!updatedAuction) {
                    console.error(`Could not fetch updated auction data for ID ${auctionId}`);
                    // Continue with notification using just the bid information
                  } else {
                    console.log(`Updated auction data retrieved. Current bid: ${updatedAuction.currentBid}, current bidder: ${updatedAuction.currentBidderId}`);
                  }
                  
                  console.log(`Broadcasting bid update to ${room.size} connected clients in room...`);
                  let notifiedCount = 0;
                  
                  Array.from(room).forEach(connection => {
                    if (connection.readyState === WebSocket.OPEN) {
                      // Create the message payload
                      const payload: any = {
                        type: 'newBid',
                        auctionId: parseInt(auctionId),
                        bid: bidWithDetails,
                        auctionExtended: auctionExtended
                      };
                      
                      // Only include auction data if we successfully retrieved it
                      if (updatedAuction) {
                        payload.auction = updatedAuction;
                      }
                      
                      // Add extension notification if auction was extended
                      if (auctionExtended) {
                        payload.extensionMessage = 'Auction extended by 5 minutes due to last-minute bid!';
                        payload.newEndsAt = newEndsAt;
                      }
                      
                      connection.send(JSON.stringify(payload));
                      notifiedCount++;
                    }
                  });
                  
                  console.log(`Successfully notified ${notifiedCount} clients about the new bid`);
                } else {
                  console.log(`No auction room found for auctionId ${auctionId}, skipping notification`);
                }
                
                // Send success response to the bidder
                console.log(`Sending bid acceptance confirmation to bidder...`);
                ws.send(JSON.stringify({
                  type: 'bidAccepted',
                  bid: bidWithDetails,
                  message: `Your bid of $${parseFloat(amount).toFixed(2)} was accepted`
                }));
                
                console.log(`✅ Successfully completed bid process: User ${userId} placed bid of ${amount} on auction ${auctionId}`);
                
                // Log successful bid
                await storage.createBidAuditEntry({
                  auctionId: parseInt(auctionId),
                  userId: userId,
                  attemptedAmount: parseFloat(amount),
                  status: 'success',
                  reason: auctionExtended ? 'Bid placed, auction extended' : 'Bid placed successfully'
                });
                
                // Send outbid notification to previous highest bidder
                if (previousHighestBidderId && previousHighestBidderId !== userId) {
                  const outbidConnection = connectedUsers.get(previousHighestBidderId);
                  if (outbidConnection && outbidConnection.readyState === WebSocket.OPEN) {
                    console.log(`Sending outbid notification to user ${previousHighestBidderId}`);
                    outbidConnection.send(JSON.stringify({
                      type: 'outbid',
                      auctionId: parseInt(auctionId),
                      newBid: bidWithDetails,
                      message: `You've been outbid on an auction! New bid: RM${parseFloat(amount).toFixed(2)}`
                    }));
                  }
                }
              } catch (err) {
                console.error(`Error in bid creation process:`, err);
                throw err;
              }
              return;
            } catch (error: any) {
              console.error('Error placing bid:', error);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Failed to place bid: ' + (error.message || 'Unknown error')
              }));
              return;
            }
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      
      // Get user info before removing from clients map
      const userInfo = clients.get(ws);
      const userId = userInfo?.userId;
      
      // Remove client from connected clients map
      clients.delete(ws);
      
      // Clean up user connection in connectedUsers map
      if (userId) {
        console.log(`User ${userId} disconnected from WebSocket`);
        connectedUsers.delete(userId);
      }
      
      // Clean up auction room memberships
      if (ws.joinedAuctions) {
        ws.joinedAuctions.forEach(auctionId => {
          const room = auctionRooms.get(auctionId);
          if (room) {
            room.delete(ws);
            if (room.size === 0) {
              auctionRooms.delete(auctionId);
            } else {
              // Notify remaining users about viewer count
              Array.from(room).forEach(connection => {
                if (connection.readyState === WebSocket.OPEN) {
                  connection.send(JSON.stringify({
                    type: 'auctionViewers',
                    auctionId,
                    count: room.size
                  }));
                }
              });
            }
          }
        });
      }
    });
  });
  
  // SECURITY: Email lookup endpoint now requires authentication AND rate limiting
  // This endpoint was previously exposing user emails without authentication
  app.get("/api/v1/auth/lookup-email", userLookupLimiter, requireAuth, async (req, res) => {
    try {
      const { email } = req.query;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email parameter is required" });
      }
      
      // Only allow authenticated users to check if emails exist
      // This prevents user enumeration attacks
      const user = await storage.getUserByEmail(email);
      
      if (user) {
        // Only return minimal information, no sensitive data
        return res.json({ 
          exists: true
          // REMOVED: userId and username to prevent information disclosure
        });
      } else {
        return res.json({ exists: false });
      }
    } catch (error) {
      // Don't log full error details in production
      console.error('Email lookup error');
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Set up streamlined Supabase authentication system with rate limiting
  // SECURITY: All auth endpoints now have rate limiting to prevent brute force attacks
  app.post('/api/v1/auth/session', authLimiter, authRoutes.session);
  app.post('/api/v1/auth/lookup-email', userLookupLimiter, authRoutes.lookupEmail);
  app.get('/api/v1/auth/me', requireAuth, authRoutes.me);
  app.post('/api/v1/auth/logout', authRoutes.logout);
  app.post('/api/v1/auth/recover-profile', passwordResetLimiter, authRoutes.recoverProfile);
  app.get('/api/v1/auth/check-orphaned', requireAuth, authRoutes.checkOrphanedUsers);
  app.post('/api/v1/auth/repair-orphaned', requireAuth, authRoutes.repairOrphanedUsers);
  
  // Email verification endpoint for handling Supabase email confirmation links
  app.get('/api/verify-email', authRoutes.verifyEmail);
  
  // SECURITY: CSRF protection endpoints
  app.get('/api/csrf-token', getCSRFTokenEndpoint);
  
  // Raw query middleware specifically for Billplz redirect
  // This captures the original query string before Express parses it
  app.use('/api/payments/process-redirect', (req: Request & { rawQuery?: string }, res: Response, next: NextFunction) => {
    // Extract the raw query string from the original URL
    req.rawQuery = req.originalUrl.split('?')[1] || '';
    console.log('🔍 RAW QUERY CAPTURED:', req.rawQuery);
    
    // Debug info about the request
    console.log('🔍 REDIRECT REQUEST DETAILS:');
    console.log('> Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    console.log('> Host:', req.get('host'));
    console.log('> Original URL:', req.originalUrl);
    console.log('> Path:', req.path);
    console.log('> Headers:', JSON.stringify(req.headers, null, 2));
    
    next();
  });
  
  // Social preview routes for better WhatsApp/Facebook sharing
  app.get("/social/seller/:id", generateSellerPreview);

  // User profile update endpoint
  app.patch("/api/user/:id", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: Please log in to update your profile" });
      }

      const id = parseInt(req.params.id);
      
      // Users can only update their own profiles
      if (user.id !== id) {
        return res.status(403).json({ message: "Forbidden: You can only update your own profile" });
      }

      // Create a schema for profile update validation
      const updateSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        address: z.string().optional(),
        profileImage: z.string().optional(),
        shopName: z.string().optional(),
        location: z.string().optional(),
        bio: z.string().optional(),
      });
      
      // Validate and extract the update data
      const updateData = updateSchema.parse(req.body);
      
      // Update the user profile
      const updatedUser = await storage.updateUser(id, updateData);
      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  });



  // Password reset endpoint - server-side fallback for when client-side methods fail
  app.post("/api/update-password", async (req, res) => {
    try {
      console.log('SERVER API: Password reset request received');
      
      // Validate the request body
      const resetSchema = z.object({
        token: z.string().min(1, "Token is required"),
        password: z.string().min(6, "Password must be at least 6 characters")
      });
      
      const { token, password } = resetSchema.parse(req.body);
      
      // Log the request for debugging (not including the password)
      console.log(`SERVER API: Token type: ${token.startsWith('ey') ? 'JWT Token' : 'Custom Token'}`);
      console.log(`SERVER API: Token length: ${token.length} characters`);
      
      // Try multiple approaches to update the password
      let approachResults = [];
      
      // APPROACH 1: Direct updateUser with token
      try {
        console.log('SERVER API: Approach 1 - Setting session with token');
        
        // First try setting the session with the token
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: ''
        });
        
        if (sessionError) {
          console.error('SERVER API: Session error:', sessionError.message);
          approachResults.push(`Approach 1 failed: ${sessionError.message}`);
        } else {
          console.log('SERVER API: Session set successfully', !!sessionData.session);
          
          // Now try to update the password
          const { error: updateError } = await supabase.auth.updateUser({
            password: password
          });
          
          if (!updateError) {
            console.log('SERVER API: Password updated successfully');
            return res.status(200).json({ message: "Password updated successfully" });
          } else {
            console.error('SERVER API: Update error after session:', updateError.message);
            approachResults.push(`Update failed after session: ${updateError.message}`);
          }
        }
      } catch (err: any) {
        console.error('SERVER API: Approach 1 exception:', err.message);
        approachResults.push(`Approach 1 exception: ${err.message}`);
      }
      
      // APPROACH 2: Attempt to decode JWT and use admin capabilities if available
      try {
        console.log('SERVER API: Approach 2 - Trying to extract user ID from token');
        
        // Basic JWT parsing - this is a simplified approach
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            const userId = payload.sub;
            
            if (userId) {
              console.log('SERVER API: Extracted user ID from token:', userId);
              approachResults.push(`Found user ID: ${userId}`);
              
              // APPROACH 2B: Use the admin API with the user ID
              try {
                console.log('SERVER API: Attempting admin update with extracted user ID');
                
                // Create a new admin client with admin key
                const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
                if (adminKey && adminKey.startsWith('ey')) {
                  const adminClient = createClient(
                    process.env.SUPABASE_URL || '',
                    adminKey,
                    {
                      auth: {
                        autoRefreshToken: false,
                        persistSession: false
                      }
                    }
                  );
                  
                  // First get the user from auth to retrieve their email
                  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
                  
                  if (userError) {
                    console.error('SERVER API: Failed to get user data:', userError.message);
                    approachResults.push(`Failed to get user data: ${userError.message}`);
                  } else if (userData?.user) {
                    console.log('SERVER API: Retrieved user data for:', userData.user.email);
                    
                    // Now update the password in auth.users
                    const { error } = await adminClient.auth.admin.updateUserById(
                      userId,
                      { password: password }
                    );
                    
                    if (error) {
                      console.error('SERVER API: Admin update failed:', error.message);
                      approachResults.push(`Admin update failed: ${error.message}`);
                    } else {
                      console.log('SERVER API: Password updated successfully in auth.users');
                      return res.status(200).json({ message: "Password updated successfully" });
                    }
                  }
                } else {
                  console.log('SERVER API: No valid admin key available');
                  approachResults.push('No valid admin key available');
                }
              } catch (adminErr: any) {
                console.error('SERVER API: Admin update exception:', adminErr.message);
                approachResults.push(`Admin update exception: ${adminErr.message}`);
              }
            } else {
              approachResults.push(`No user ID in token`);
            }
          } catch (err: any) {
            console.error('SERVER API: Failed to parse token payload');
            approachResults.push(`Token payload parsing failed: ${err.message}`);
          }
        } else {
          approachResults.push(`Token does not appear to be a valid JWT format`);
        }
      } catch (err: any) {
        console.error('SERVER API: Approach 2 exception:', err.message);
        approachResults.push(`Approach 2 exception: ${err.message}`);
      }
      
      // APPROACH 3: Last resort - try the original Supabase auth flow with a fresh client
      try {
        console.log('SERVER API: Approach 3 - Last resort direct method');
        
        // Create a separate client for this attempt
        const resetClient = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        );
        
        // First try setting a session with this new client
        const { error: sessionError } = await resetClient.auth.setSession({
          access_token: token,
          refresh_token: ''
        });
        
        if (sessionError) {
          console.error('SERVER API: Approach 3 session error:', sessionError.message);
          approachResults.push(`Approach 3 session error: ${sessionError.message}`);
        } else {
          // Try with a direct approach
          const { error } = await resetClient.auth.updateUser({ password });
          
          if (!error) {
            console.log('SERVER API: Password updated successfully with approach 3');
            return res.status(200).json({ message: "Password updated successfully" });
          } else {
            console.error('SERVER API: Update error with approach 3:', error.message);
            approachResults.push(`Approach 3 update error: ${error.message}`);
          }
        }
      } catch (err: any) {
        console.error('SERVER API: Approach 3 exception:', err.message);
        approachResults.push(`Approach 3 exception: ${err.message}`);
      }
      
      // If we got this far, all approaches failed - return detailed information
      console.error('SERVER API: All password reset approaches failed');
      return res.status(400).json({ 
        message: "Invalid or expired password reset token. Please request a new password reset link.",
        details: approachResults
      });
    } catch (error: any) {
      console.error('SERVER API: Password reset error:', error);
      
      // Handle different types of errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid request data", 
          details: error.errors 
        });
      }
      
      return res.status(400).json({ // Changed from 500 to 400 to ensure client can handle it consistently
        message: "Failed to reset password: " + (error.message || "Unknown error") 
      });
    }
  });

  // Configure multer for image uploads
  const imageUpload = multer({
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max file size
    },
    fileFilter: (_req, file, cb) => {
      // Accept only image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });
  
  // Configure multer for message file uploads (images, pdfs, etc.)
  const messageFileUpload = multer({
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    fileFilter: (_req, file, cb) => {
      // Accept image files, PDFs, and other common document types
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only images, PDFs, and common document types are allowed'));
      }
    }
  });

  // Serve social media preview image
  app.get('/social-preview.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/public/social-preview.jpg'));
  });
  
  // Profile image upload endpoint
  app.post("/api/user/avatar", imageUpload.single('image'), async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: Please log in to upload a profile image" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Validate the image
      try {
        await supabaseFileStorage.validateFileSize(req.file.buffer, 2 * 1024 * 1024);
        await supabaseFileStorage.validateImageDimensions(req.file.buffer, 800, 800);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }

      // Upload the profile image
      const fileId = await supabaseFileStorage.uploadFile(
        req.file.buffer,
        IMAGE_TYPES.PROFILE,
        req.file.mimetype
      );

      // Update the user record in the database with the new avatar URL
      const updatedUser = await storage.updateUser(user.id, {
        avatarUrl: fileId
      });

      return res.json({
        message: "Profile image uploaded successfully",
        imageUrl: await supabaseFileStorage.getPublicUrl(fileId),
        user: updatedUser
      });
    } catch (error) {
      console.error("Error in profile image upload:", error);
      next(error);
    }
  });

  // Cover photo upload endpoint
  app.post("/api/user/cover", imageUpload.single('image'), async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized: Please log in to upload a cover photo" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Validate the image - cover photos can be larger
      try {
        await supabaseFileStorage.validateFileSize(req.file.buffer, 5 * 1024 * 1024);
        await supabaseFileStorage.validateImageDimensions(req.file.buffer, 2048, 1024);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }

      // Upload the cover photo
      const fileId = await supabaseFileStorage.uploadFile(
        req.file.buffer,
        IMAGE_TYPES.COVER,
        req.file.mimetype
      );

      // Update the user record in the database with the new cover photo URL
      const updatedUser = await storage.updateUser(user.id, {
        coverPhoto: fileId
      });

      return res.json({
        message: "Cover photo uploaded successfully",
        imageUrl: await supabaseFileStorage.getPublicUrl(fileId),
        user: updatedUser
      });
    } catch (error) {
      console.error("Error in cover photo upload:", error);
      next(error);
    }
  });

  // Categories endpoints
  app.get("/api/categories", async (_req, res, next) => {
    try {
      const categories = await storage.getAllCategories();
      res.json(categories);
    } catch (error) {
      next(error);
    }
  });
  
  // Get all boost packages
  app.get("/api/boost/packages", async (req, res) => {
    try {
      console.log("Fetching boost packages");
      const { data, error } = await supabase
        .from('boost_packages')
        .select('*')
        .eq('is_active', true)
        .order('package_type', { ascending: true })
        .order('item_count', { ascending: true });
        
      if (error) {
        console.error('Error fetching boost packages:', error);
        return res.status(500).json({ message: 'Error fetching boost packages', error });
      }
      
      return res.json(data);
    } catch (err) {
      console.error('Error fetching boost packages:', err);
      return res.status(500).json({ message: 'Server error fetching boost packages' });
    }
  });

  // Products endpoints
  app.get("/api/products", async (req, res, next) => {
    try {
      const { category, brand, minPrice, maxPrice, search } = req.query;
      const products = await storage.getProducts({
        categoryId: category ? Number(category) : undefined,
        brand: brand as string | undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        search: search as string | undefined,
      });
      res.json(products);
    } catch (error) {
      next(error);
    }
  });
  
  // Get all products (for admin dashboard)
  app.get("/api/products/all", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user || !user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }
      
      // Get all products with seller information
      const products = await storage.getAllProductsWithDetails();
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/products/featured", async (_req, res, next) => {
    try {
      const products = await storage.getFeaturedProducts();
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/products/:id", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/products", validateCSRF, async (req, res, next) => {
    try {
      // SECURITY FIX: Require proper authentication - no bypass allowed
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ 
          message: "Authentication required", 
          code: "AUTH_REQUIRED" 
        });
      }
      
      // SECURITY FIX: Verify user is a seller
      if (!user.isSeller) {
        return res.status(403).json({ 
          message: "Seller account required", 
          code: "SELLER_REQUIRED" 
        });
      }
      
      // SECURITY FIX: Always use authenticated user's ID, ignore any sellerId in request body
      const productData = {
        ...insertProductSchema.parse(req.body),
        sellerId: user.id // Force seller ID to authenticated user
      };
      
      console.log(`[SECURITY] Product creation by authenticated seller ID: ${user.id}`);
      const product = await storage.createProduct(productData);
      return res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/products/:id", async (req, res, next) => {
    try {
      // First check if the user is authenticated via session
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the request body
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only edit your own products" });
      }

      const validatedData = insertProductSchema.parse({
        ...req.body,
        sellerId: sellerId, // Use the determined sellerId
      });

      const updatedProduct = await storage.updateProduct(id, validatedData);
      res.json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint to update an auction
  app.put("/api/auctions/:id", async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the body
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const auctionId = parseInt(req.params.id);
      
      // Get the auction to verify ownership
      const auction = await storage.getAuctionById(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      
      // Get the associated product
      const product = await storage.getProductById(auction.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Verify the product belongs to this seller
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only edit your own auctions" });
      }
      
      // Update both the product and auction data
      // First, update the product information
      if (req.body.product) {
        const productData = {
          ...req.body.product,
          sellerId: sellerId // Ensure the seller ID is set correctly
        };
        
        const validatedProductData = insertProductSchema.parse(productData);
        await storage.updateProduct(product.id, validatedProductData);
      }
      
      // Then update the auction information
      if (req.body.auction) {
        const auctionData = req.body.auction;
        
        // Only update certain fields if there are no bids yet
        if (auction.currentBid) {
          // If there are bids, only allow updating certain fields
          const safeAuctionData = {
            buyNowPrice: auctionData.buyNowPrice,
            // Add other safe-to-update fields here
          };
          await storage.updateAuction(auctionId, safeAuctionData);
        } else {
          // If no bids yet, can update all fields
          await storage.updateAuction(auctionId, auctionData);
        }
      }
      
      // Return the updated auction with product details
      const updatedAuction = await storage.getAuctionById(auctionId);
      const updatedProduct = await storage.getProductById(auction.productId);
      
      res.json({
        auction: updatedAuction,
        product: updatedProduct
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Auction endpoints
  app.post("/api/auctions", validateCSRF, async (req, res, next) => {
    try {
      console.log("POST /api/auctions called with body:", req.body);
      
      // Check authentication
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          console.log("User is not a seller:", user);
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
        console.log("Authenticated seller ID:", sellerId);
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the body
        sellerId = parseInt(req.body.sellerId.toString());
        console.log("Using sellerId from request body:", sellerId);
        
        // Verify this user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          console.log("User not found with ID:", sellerId);
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          console.log("User is not a seller:", userCheck);
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        console.log("No authentication or sellerId provided");
        return res.status(403).json({ message: "Unauthorized: Must be a seller to create auctions" });
      }
      
      // Get the product ID from the request body
      const productId = parseInt(req.body.productId?.toString() || "0");
      console.log("Product ID for auction:", productId);
      
      if (productId <= 0) {
        console.log("Invalid product ID:", productId);
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      // Verify the product exists and belongs to this seller
      const product = await storage.getProductById(productId);
      if (!product) {
        console.log("Product not found with ID:", productId);
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        console.log(`Product seller ID (${product.sellerId}) doesn't match the authenticated seller ID (${sellerId})`);
        return res.status(403).json({ message: "Unauthorized: You can only create auctions for your own products" });
      }
      
      console.log("[AUCTION-CREATE] ===== Creating New Auction =====");
      console.log("[AUCTION-CREATE] Server timezone offset:", new Date().getTimezoneOffset(), "minutes");
      console.log("[AUCTION-CREATE] Server local time:", new Date().toString());
      console.log("[AUCTION-CREATE] Server UTC time:", new Date().toISOString());
      console.log("[AUCTION-CREATE] Process TZ env:", process.env.TZ || 'not set');
      console.log("[AUCTION-CREATE] Received auction data:", req.body);
      console.log("[AUCTION-CREATE] End date received:", req.body.endsAt);
      
      // CRITICAL: Check for timezone offset warning
      const serverTzOffset = new Date().getTimezoneOffset();
      if (serverTzOffset !== 0) {
        console.warn(`[AUCTION-CREATE] WARNING: Server has ${serverTzOffset} minute offset from UTC!`);
        console.warn(`[AUCTION-CREATE] This may cause auctions to expire ${Math.abs(serverTzOffset / 60)} hours early/late!`);
      }
      
      // Parse and analyze the end date
      const receivedEndDate = new Date(req.body.endsAt);
      const msUntilEnd = receivedEndDate.getTime() - new Date().getTime();
      const hoursUntilEnd = msUntilEnd / (1000 * 60 * 60);
      
      console.log("[AUCTION-CREATE] End date analysis:");
      console.log("  - Parsed end date (UTC):", receivedEndDate.toISOString());
      console.log("  - Parsed end date (local):", receivedEndDate.toString());
      console.log("  - MS until auction ends:", msUntilEnd);
      console.log("  - Hours until auction ends:", hoursUntilEnd.toFixed(2));
      
      // Set starts_at to current date if not specified
      if (!req.body.startsAt) {
        req.body.startsAt = new Date().toISOString();
        console.log("[AUCTION-CREATE] Setting starts_at to current time:", req.body.startsAt);
      }
      
      // Parse the auction data
      try {
        // Create the auction
        console.log("Creating auction in database...");
        const auction = await storage.createAuction(req.body);
        console.log("Auction created successfully:", auction);
        return res.status(200).json(auction);
      } catch (createError) {
        console.error("Error creating auction:", createError);
        throw createError;
      }
    } catch (error) {
      console.error("Error processing auction creation:", error);
      next(error);
    }
  });
  
  // Get all auctions
  app.get("/api/auctions", async (req, res, next) => {
    try {
      console.log("Getting all auctions");
      const auctions = await storage.getAuctions();
      console.log(`Retrieved ${auctions?.length || 0} auctions`);
      res.json(auctions || []);
    } catch (error) {
      console.error("Error fetching auctions:", error);
      next(error);
    }
  });
  
  // Get auction by product ID
  app.get("/api/auctions/product/:productId", async (req, res, next) => {
    try {
      const productId = parseInt(req.params.productId);
      console.log(`Getting auction for product ID: ${productId}`);
      
      // Find the auction by product ID
      const { data, error } = await supabase
        .from('auctions')
        .select('*')
        .eq('product_id', productId)
        .single();
      
      if (error) {
        console.error(`Error getting auction for product ${productId}:`, error);
        return res.status(404).json({ message: "Auction not found" });
      }
      
      // Map snake_case to camelCase
      const auction = {
        id: data.id,
        productId: data.product_id,
        startingPrice: data.starting_price,
        reservePrice: data.reserve_price,
        buyNowPrice: data.buy_now_price,
        currentBid: data.current_bid,
        currentBidderId: data.current_bidder_id,
        bidIncrement: data.bid_increment,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      };
      
      console.log(`Found auction ${auction.id} for product ${productId}`);
      res.json(auction);
    } catch (error) {
      console.error("Error fetching auction by product ID:", error);
      next(error);
    }
  });
  
  // Basic auction details (deprecated, use the complete route below instead)
  // This route is kept for backward compatibility
  app.get("/api/auctions/:id/basic", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`Getting basic auction with ID: ${id}`);
      
      const auction = await storage.getAuctionById(id);
      if (!auction) {
        console.log(`Auction not found with ID: ${id}`);
        return res.status(404).json({ message: "Auction not found" });
      }
      
      console.log("Retrieved basic auction:", auction);
      res.json(auction);
    } catch (error) {
      console.error(`Error getting basic auction: ${error}`);
      next(error);
    }
  });

  app.delete("/api/products/:id", async (req, res, next) => {
    try {
      // First check if the user is authenticated via session
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.query.sellerId) {
        // If not via session, check if sellerId was provided in the query parameter
        sellerId = parseInt(req.query.sellerId as string);
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only delete your own products" });
      }

      // Delete all associated images first
      try {
        const productImages = await storage.getProductImages(id);
        console.log(`Deleting ${productImages.length} images for product ${id}`);
        
        for (const image of productImages) {
          // Always try to delete from object storage if we have an imageUrl
          if (image.imageUrl) {
            await supabaseFileStorage.deleteFile(image.imageUrl);
            console.log(`Deleted image ${image.imageUrl} from storage: ${deleteResult ? 'success' : 'failed'}`);
          }
          // Also remove from database
          await storage.deleteProductImage(image.id);
        }
      } catch (err) {
        console.error("Error deleting product images:", err);
        // Continue with product deletion even if image deletion fails
      }

      await storage.deleteProduct(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Get all images for a product
  app.get("/api/products/:id/images", async (req, res, next) => {
    try {
      const productId = parseInt(req.params.id);
      const images = await storage.getProductImages(productId);
      res.json(images);
    } catch (error) {
      next(error);
    }
  });

  // Image upload endpoint - creates a product image and uploads the file
  app.post("/api/products/:id/images", imageUpload.single('image'), async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.query.sellerId) {
        // If not via session, check if sellerId was provided in query
        sellerId = parseInt(req.query.sellerId as string);
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      // Get product ID from URL
      const productId = parseInt(req.params.id);
      
      // Verify the product exists and belongs to the seller
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only add images to your own products" });
      }
      
      // Make sure we have a file
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Upload the file to storage first
      const fileId = await supabaseFileStorage.uploadFile(
        req.file.buffer,
        IMAGE_TYPES.PRODUCT,
        req.file.mimetype
      );
      
      // Create image record in database with the file ID
      const productImage = await storage.createProductImage({
        productId,
        imageUrl: fileId,
        imageOrder: req.body.imageOrder ? parseInt(req.body.imageOrder) : 0,
        imageName: req.file.originalname || 'unnamed'
      });
      
      // Return success response
      res.status(201).json({
        ...productImage,
        url: await supabaseFileStorage.getPublicUrl(fileId),
        message: "Image uploaded successfully"
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/products/:productId/images/:imageId", async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.query.sellerId) {
        // If not via session, check if sellerId was provided in query
        sellerId = parseInt(req.query.sellerId as string);
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const productId = parseInt(req.params.productId);
      const imageId = parseInt(req.params.imageId);
      
      // Verify the product exists and belongs to the seller
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only delete images from your own products" });
      }
      
      // Get the image record
      const images = await storage.getProductImages(productId);
      const image = images.find(img => img.id === imageId);
      
      if (!image) {
        return res.status(404).json({ message: "Image not found" });
      }
      
      // Delete the image from object storage
      if (image.imageUrl) {
        await supabaseFileStorage.deleteFile(image.imageUrl);
        console.log(`Deleted individual image ${image.imageUrl} from storage: ${deleteResult ? 'success' : 'failed'}`);
      }
      
      // Delete from database
      await storage.deleteProductImage(imageId);
      
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Cart endpoints
  app.get("/api/cart", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const cartItems = await storage.getCartItems(user.id);
      res.json(cartItems);
    } catch (error) {
      next(error);
    }
  });


  // Reviews endpoints
  app.get("/api/products/:id/reviews", async (req, res, next) => {
    try {
      const productId = parseInt(req.params.id);
      const reviews = await storage.getProductReviews(productId);
      res.json(reviews);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reviews", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = insertReviewSchema.parse({
        ...req.body,
        userId: user.id,
      });

      // Check if the product exists
      const product = await storage.getProductById(validatedData.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if user already reviewed this product
      const existingReview = await storage.getUserProductReview(user.id, validatedData.productId);
      if (existingReview) {
        return res.status(400).json({ message: "You have already reviewed this product" });
      }

      const review = await storage.createReview(validatedData);
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  });

  // Seller-specific endpoints
  app.get("/api/seller/products", async (req, res, next) => {
    try {
      // Check if user is authenticated via session
      const user = await getAuthenticatedUser(req);
      if (user && user.isSeller) {
        const products = await storage.getSellerProducts(user.id);
        return res.json(products);
      }
      
      // If not authenticated via session, check for sellerId in query parameter
      const sellerId = req.query.sellerId ? parseInt(req.query.sellerId as string) : null;
      if (!sellerId) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }
      
      // Verify user exists and is a seller
      const userCheck = await storage.getUser(sellerId);
      if (!userCheck) {
        return res.status(403).json({ message: "Unauthorized: User not found" });
      }
      
      if (!userCheck.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }
      
      // User is verified as a seller, get their products
      const products = await storage.getSellerProducts(sellerId);
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  // Public seller profile endpoints
  app.get("/api/sellers/:id", async (req, res, next) => {
    try {
      const sellerId = parseInt(req.params.id);
      const seller = await storage.getUser(sellerId);

      if (!seller) {
        return res.status(404).json({ message: "Seller not found" });
      }

      if (!seller.isSeller) {
        return res.status(404).json({ message: "User is not a seller" });
      }

      // Return seller profile directly since password is no longer in the schema
      res.json(seller);
    } catch (error) {
      next(error);
    }
  });

  // Get seller reviews
  app.get("/api/sellers/:id/reviews", async (req, res, next) => {
    try {
      const sellerId = parseInt(req.params.id);
      
      console.log(`Fetching reviews for seller ID: ${sellerId}`);
      
      // Get reviews where seller_id matches
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id, 
          user_id, 
          product_id, 
          seller_id,
          rating, 
          comment, 
          created_at,
          users:user_id (username, profile_image),
          products:product_id (name)
        `)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });
        
      if (reviewsError) {
        console.error('Error fetching seller reviews:', reviewsError);
        return res.status(500).json({ error: 'Failed to fetch seller reviews' });
      }
      
      // Map the reviews to the expected format
      const reviews = reviewsData.map((review: any) => ({
        id: review.id,
        userId: review.user_id,
        productId: review.product_id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.created_at,
        user: {
          username: review.users?.username,
          profileImage: review.users?.profile_image
        },
        product: {
          name: review.products?.name
        }
      }));
      
      // Calculate average rating
      let averageRating = 0;
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum: number, review: any) => sum + review.rating, 0);
        averageRating = totalRating / reviews.length;
      }
      
      return res.json({
        reviews,
        averageRating
      });
    } catch (error) {
      console.error('Error fetching seller reviews:', error);
      return res.status(500).json({ error: 'Failed to fetch seller reviews' });
    }
  });

  app.get("/api/sellers/:id/products", async (req, res, next) => {
    try {
      const sellerId = parseInt(req.params.id);
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const category = req.query.category as string | undefined;
      const sort = req.query.sort as string | undefined;

      // Verify the seller exists
      const seller = await storage.getUser(sellerId);
      if (!seller || !seller.isSeller) {
        return res.status(404).json({ message: "Seller not found" });
      }

      // Get all products for this seller
      const products = await storage.getSellerProducts(sellerId);
      
      // Filter by status if provided (active, pending, sold, etc.)
      const status = req.query.status as string | undefined;
      
      // Filter by category and status if provided
      let filteredProducts = products;
      
      if (status) {
        filteredProducts = filteredProducts.filter(p => {
          return p.status?.toLowerCase() === status.toLowerCase();
        });
      }
      
      if (category && category !== "all") {
        filteredProducts = filteredProducts.filter(p => {
          return p.category?.name.toLowerCase() === category.toLowerCase();
        });
      }

      // Sort products based on sort option
      if (sort) {
        filteredProducts = [...filteredProducts].sort((a, b) => {
          if (sort === "price-low") return a.price - b.price;
          if (sort === "price-high") return b.price - a.price;
          if (sort === "rating") {
            const aRating = a.averageRating || 0;
            const bRating = b.averageRating || 0;
            return bRating - aRating;
          }
          // Default: newest first (by ID as a proxy for creation time)
          return b.id - a.id;
        });
      }

      // Calculate pagination
      const totalProducts = filteredProducts.length;
      const totalPages = Math.ceil(totalProducts / limit);
      const offset = (page - 1) * limit;
      const paginatedProducts = filteredProducts.slice(offset, offset + limit);

      res.json({
        products: paginatedProducts,
        pagination: {
          page,
          limit,
          totalProducts,
          totalPages
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Admin-specific endpoints with rate limiting
  app.get("/api/admin/users", adminLimiter, async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user || !user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const users = await storage.getAllUsers();
      
      // SECURITY: Sanitize user data before sending to client
      // Never send passwords or other sensitive data to the frontend
      const sanitizedUsers = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email, // Only admins can see emails
        firstName: u.firstName,
        lastName: u.lastName,
        displayName: u.displayName,
        isAdmin: u.isAdmin,
        isBanned: u.isBanned,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
        // REMOVED: password, wallet, bankAccount, and other sensitive fields
      }));
      
      res.json(sanitizedUsers);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/users/:id/ban", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user || !user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const id = parseInt(req.params.id);
      const { isBanned } = z.object({ isBanned: z.boolean() }).parse(req.body);

      // Prevent admins from banning themselves or other admins
      const userToBan = await storage.getUser(id);
      if (!userToBan) {
        return res.status(404).json({ message: "User not found" });
      }

      if (userToBan.isAdmin) {
        return res.status(403).json({ message: "Cannot ban administrator accounts" });
      }

      const updatedUser = await storage.banUser(id, isBanned);
      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/orders", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user || !user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/orders/:id/status", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user || !user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const id = parseInt(req.params.id);
      const { status } = z.object({ 
        status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"])
      }).parse(req.body);

      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  });
  
  // Admin route to remove a product listing and notify the seller
  app.post("/api/admin/products/:id/remove", async (req, res, next) => {
    try {
      const user = await getAuthenticatedUser(req); if (!user || !user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }
      
      const id = parseInt(req.params.id);
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      
      // Fetch the product to get seller information
      const product = await storage.getProductById(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Get seller information
      const seller = await storage.getUser(product.sellerId);
      if (!seller) {
        return res.status(404).json({ message: "Seller not found" });
      }
      
      // Send notification to seller before deleting the product
      const messageContent = `Your listing "${product.name}" has been removed by an administrator for the following reason: ${reason}. If you believe this was done in error, please contact support.`;
      
      const ADMIN_USER_ID = 32; // The ID of the admin account used for system messages
      
      await storage.sendMessage({
        senderId: ADMIN_USER_ID,
        receiverId: seller.id,
        content: messageContent,
        productId: product.id,
        isRead: false
      });
      
      // Check if product has an associated auction and delete it
      try {
        const auctions = await storage.getProductAuctions(id);
        if (auctions && auctions.length > 0) {
          console.log(`Admin deleting ${auctions.length} auctions for product #${id}`);
          for (const auction of auctions) {
            await storage.deleteAuction(auction.id);
          }
        }
      } catch (err) {
        console.error(`Error deleting associated auctions for product #${id}:`, err);
        // Continue with product deletion even if auction deletion fails
      }
      
      // Now delete product images from object storage and database
      try {
        const productImages = await storage.getProductImages(id);
        console.log(`Admin deleting ${productImages.length} images for product #${id}`);
        
        for (const image of productImages) {
          // Delete from object storage
          if (image.imageUrl) {
            await supabaseFileStorage.deleteFile(image.imageUrl);
            console.log(`Deleted image ${image.imageUrl} from storage: ${deleteResult ? 'success' : 'failed'}`);
          }
          // Delete from database
          await storage.deleteProductImage(image.id);
        }
      } catch (err) {
        console.error(`Error deleting product images for product #${id}:`, err);
        // Continue with product deletion even if image deletion fails
      }
      
      // Finally, delete the product itself
      await storage.deleteProduct(id);
      
      console.log(`Admin completely deleted product #${id}, message sent to seller #${seller.id}`);
      
      res.json({ 
        message: "Product listing completely removed and seller notified",
        productId: id
      });
    } catch (error) {
      next(error);
    }
  });

  // Message file upload endpoint
  app.post("/api/messages/upload-file", validateCSRF, requireAuth, messageFileUpload.single('file'), async (req: AuthenticatedRequest, res, next) => {
    try {
      console.log("File upload request received");

      if (!req.file) {
        console.log("No file found in request");
        return res.status(400).json({ message: "No file provided" });
      }
      console.log(`File received: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);
      
      if (!req.body.receiverId) {
        console.log("No receiver ID found in request");
        return res.status(400).json({ message: "Receiver ID is required" });
      }
      console.log(`Receiver ID: ${req.body.receiverId}`);
      
      if (req.body.productId) {
        console.log(`Product ID: ${req.body.productId}`);
      }
      
      // Set proper content type header for JSON response
      res.setHeader('Content-Type', 'application/json');
      
      // Upload the file to the message files bucket
      console.log("Uploading file to object storage...");
      const fileId = await supabaseFileStorage.uploadFile(
        req.file.buffer,
        IMAGE_TYPES.MESSAGE_FILE,
        req.file.mimetype
      );
      console.log(`File uploaded successfully with ID: ${fileId}`);
      
      // Create a new message with type FILE
      console.log("Creating message record in database...");
      
      // Check table columns before inserting
      console.log("Checking messages table columns...");
      const { data: tableInfo, error: tableError } = await supabase
        .from('messages')
        .select('*')
        .limit(1);
        
      console.log("Table columns:", tableInfo ? Object.keys(tableInfo[0]) : "No records found");
      if (tableError) {
        console.error("Error checking table structure:", tableError);
      }
      
      // Prepare message data
      const messagePayload = {
        sender_id: req.user.id,
        receiver_id: parseInt(req.body.receiverId),
        content: null, // Content is null for FILE type messages
        product_id: req.body.productId ? parseInt(req.body.productId) : null,
        message_type: 'FILE', // Set message type to FILE
        file_url: fileId
      };
      
      console.log("Inserting message with payload:", messagePayload);
      
      // Using Supabase direct insert for messages
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert(messagePayload)
        .select()
        .single();
      
      if (messageError) {
        console.error("Database error while creating message:", messageError);
        return res.status(500).json({ 
          message: "Error saving message to database",
          error: messageError.message
        });
      }
      
      if (!messageData) {
        console.log("No data returned from message insert");
        return res.status(500).json({ message: "No data returned from database" });
      }

      console.log("Message created successfully:", messageData);
      
      // Return the created message with the file URL
      // Log the actual message data returned from the database
      console.log("Raw message data from database:", messageData);
      
      const responseData = {
        id: messageData.id,
        senderId: messageData.sender_id,
        receiverId: messageData.receiver_id,
        productId: messageData.product_id,
        messageType: messageData.message_type,
        fileUrl: await supabaseFileStorage.getPublicUrl(fileId),
        createdAt: messageData.created_at
      };
      
      console.log("Formatted response data:", responseData);
      
      // Send a simple, clean JSON response 
      return res.status(200).json(responseData);
    } catch (error) {
      console.error("Error in message file upload handler:", error);
      // Ensure consistent JSON response even for errors
      return res.status(500).json({ 
        success: false,
        message: typeof error === 'object' && error !== null && 'message' in error 
          ? (error as Error).message 
          : "An unexpected error occurred" 
      });
    }
  });
  
  // Endpoint to serve message files
  app.get('/api/message-files/:fileId', async (req, res, next) => {
    try {
      const { fileId } = req.params;
      
      // Check if we should serve the file for preview
      const isPreview = req.query.preview === 'true';
      
      console.log(`Attempting to retrieve message file with ID: ${fileId}, preview mode: ${isPreview}`);

      // Get the file from Supabase Storage
      const { buffer: fileBuffer, mimetype } = await supabaseFileStorage.downloadFile(fileId);

      if (fileBuffer) {
        // Use the mimetype from storage or detect from file signature
        let contentType = mimetype || 'application/octet-stream';
        
        // Check file signatures to determine content type
        if (fileBuffer.length > 8) {
          const signature = fileBuffer.slice(0, 8).toString('hex');
          
          // Check file signatures for common types
          if (signature.startsWith('89504e47')) {
            contentType = 'image/png';
          } else if (signature.startsWith('ffd8ff')) {
            contentType = 'image/jpeg';
          } else if (signature.startsWith('47494638')) {
            contentType = 'image/gif';
          } else if (signature.startsWith('25504446')) {
            contentType = 'application/pdf';
          } else if (signature.startsWith('504b0304')) {
            // Could be DOCX, XLSX, PPTX (all Office Open XML formats)
            if (fileId.endsWith('.docx')) {
              contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else {
              contentType = 'application/zip';
            }
          }
        }
        
        // Add disposition header based on whether we're previewing or downloading
        if (isPreview) {
          res.setHeader('Content-Disposition', 'inline');
        } else {
          // For download, suggest a filename
          const filename = fileId.includes('_') ? fileId.split('_').pop() : fileId;
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }
        
        console.log(`Message file ${fileId} found - serving with content type ${contentType}`);
        
        // Send the file with the appropriate content type
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(fileBuffer);
      }

      console.log(`Message file ${fileId} not found in storage`);
      // If we get here, the file was not found
      res.status(404).json({ message: 'File not found' });
    } catch (error) {
      console.error('Error serving message file:', error);
      next(error);
    }
  });
  
  // Endpoint to serve images
  app.get('/api/images/:imageId', async (req, res, next) => {
    try {
      const { imageId } = req.params;
      
      console.log(`Attempting to retrieve image with ID: ${imageId}`);

      // Determine content type based on file extension or default to jpeg
      let contentType = 'image/jpeg';
      if (imageId.endsWith('.png')) contentType = 'image/png';
      if (imageId.endsWith('.gif')) contentType = 'image/gif';
      if (imageId.endsWith('.webp')) contentType = 'image/webp';

      // Get the image from Supabase Storage
      const { buffer: imageBuffer, mimetype } = await supabaseFileStorage.downloadFile(imageId);

      if (imageBuffer) {
        console.log(`Image ${imageId} found - serving with content type ${mimetype || contentType}`);
        // If we have the image, send it back with the appropriate content type
        res.setHeader('Content-Type', mimetype || contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(imageBuffer);
      }

      console.log(`Image ${imageId} not found in storage`);
      // If we get here, the image was not found
      res.status(404).json({ message: 'Image not found' });
    } catch (error) {
      console.error('Error serving image:', error);
      next(error);
    }
  });

  // Facebook OAuth callback endpoint
  app.post('/api/auth/sync-oauth-user', async (req, res) => {
    try {
      const { email, providerId, provider } = req.body;

      if (!email || !providerId || !provider) {
        return res.status(400).json({ message: 'Missing required OAuth information' });
      }

      // First, check if we already have a user with this email
      let user = await storage.getUserByEmail(email);

      if (user) {
        // User exists - return user data directly (Supabase handles sessions)
        return res.status(200).json({ user });
      } else {
        // User doesn't exist - create a new account
        // Generate a username from email
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        let username = baseUsername;
        let counter = 1;
        
        // Check if username is taken, if so, increment counter until we find a free one
        while (await storage.getUserByUsername(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Create the user
        const newUser = await storage.createUser({
          email,
          username,
          firstName: null,
          lastName: null,
          address: null,
          profileImage: null,
          walletBalance: 0,
          isSeller: true,
          isAdmin: false,
          isBanned: false
        });

        // Return new user data (Supabase handles sessions)
        return res.status(201).json({ user: newUser });
      }
    } catch (error) {
      console.error('Error syncing OAuth user:', error);
      res.status(500).json({ message: 'Failed to process OAuth login' });
    }
  });

  // Handle the /api/product-images endpoint for backward compatibility
  app.post("/api/product-images", async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the request body
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      // Get product ID from request body
      const productId = req.body.productId;
      
      // Verify the product exists and belongs to the seller
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only add images to your own products" });
      }
      
      // IMPORTANT: Use the exact UUID provided in the request
      // This ensures the database and object storage use the same ID
      // Don't generate another UUID here
      
      // Create image record in database with the provided imageUrl
      const productImage = await storage.createProductImage({
        productId,
        imageUrl: req.body.imageUrl,
        imageOrder: req.body.imageOrder,
        imageName: req.body.imageName || 'unnamed'
      });
      
      // Log for debugging
      console.log(`Created new product image record:`, productImage);
      
      res.status(200).json(productImage);
    } catch (error) {
      next(error);
    }
  });

  // Handle the /api/product-images/:id/upload endpoint for backward compatibility
  app.post("/api/product-images/:id/upload", imageUpload.single('image'), async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      const user = await getAuthenticatedUser(req); if (user) {
        if (!user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the form data
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      // Get image ID from URL
      const imageId = parseInt(req.params.id);
      
      console.log(`Looking for product image with id ${imageId}`);
      
      // Since we're having issues with the database method, use a direct approach
      // Get the product images from all products
      let foundProductImage = null;
      const allProducts = await storage.getProducts();
      for (const product of allProducts) {
        if (product.images) {
          for (const image of product.images) {
            if (image.id === imageId) {
              foundProductImage = image;
              break;
            }
          }
          if (foundProductImage) break;
        }
      }
      
      console.log(`Found product image:`, foundProductImage);
      
      if (!foundProductImage) {
        return res.status(404).json({ message: "Product image record not found" });
      }
      
      // Verify the product belongs to the seller
      const product = await storage.getProductById(foundProductImage.productId);
      if (!product) {
        return res.status(404).json({ message: "Associated product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only upload images to your own products" });
      }
      
      // Make sure we have a file
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Extract the UUID from the placeholder URL
      let imageUrl = foundProductImage.imageUrl;
      
      console.log(`Attempting to upload image to object storage with ID: ${imageUrl}`);
      console.log(`Image size: ${req.file.size} bytes, type: ${req.file.mimetype}`);
      
      // Upload the file to storage (re-upload with same ID)
      await supabaseFileStorage.uploadFile(
        req.file.buffer,
        IMAGE_TYPES.PRODUCT,
        req.file.mimetype
      );
      
      console.log(`File re-uploaded successfully`);
      
      // Return success response
      res.status(200).json({
        ...foundProductImage,
        url: await supabaseFileStorage.getPublicUrl(imageUrl),
        message: "Image uploaded successfully"
      });
    } catch (error) {
      console.error("Error in upload handler:", error);
      next(error);
    }
  });
  
  // Messaging API endpoints
  // Get all messages for authenticated user
  app.get("/api/messages", requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user.id;
      const messages = await storage.getUserMessages(userId);
      
      // Decrypt message content and prepare file URLs
      const decryptedMessages = messages.map(msg => ({
        ...msg,
        content: msg.content ? decryptMessage(msg.content) : msg.content,
        fileUrl: msg.fileUrl // Make sure we're consistent with fileUrl property
      }));
      
      res.json(decryptedMessages);
    } catch (error) {
      next(error);
    }
  });
  
  // Get conversation between two users
  app.get("/api/messages/conversation/:userId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const currentUserId = req.user.id;
      const otherUserId = parseInt(req.params.userId);
      
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Get productId from query params if available for product-specific conversations
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      
      let conversation;
      if (productId && !isNaN(productId)) {
        conversation = await storage.getConversationForProduct(currentUserId, otherUserId, productId);
      } else {
        // Get conversation messages with all fields including action type and is_clicked
        conversation = await storage.getConversation(currentUserId, otherUserId);
        
        // Add logging for debugging transaction messages
        conversation.forEach(msg => {
          if (msg.messageType === 'ACTION') {
            console.log(`Found action message ID ${msg.id}, is_clicked=${msg.isClicked}, action_type=${msg.actionType}`);
          }
        });
      }
      
      // Since the optimized storage methods already fetch product data in batches,
      // we only need to handle file URLs and image URLs for existing product data
      
      // Collect unique product IDs that already have product data for image enhancement
      const productIdsWithData = Array.from(new Set(conversation
        .filter(msg => msg.messageType === 'ACTION' && msg.productId && msg.product)
        .map(msg => msg.productId!)
      ));
      
      // Fetch product images for existing products to enhance with main image
      const productImagesMap = new Map();
      if (productIdsWithData.length > 0) {
        try {
          // Fetch product images for all products in one batch
          for (const productId of productIdsWithData) {
            const productImages = await storage.getProductImages(productId);
            if (productImages && productImages.length > 0) {
              // Find the main image (order 0)
              const mainImage = productImages.find((img: any) => img.imageOrder === 0);
              if (mainImage && mainImage.imageUrl) {
                const publicUrl = await supabaseFileStorage.getPublicUrl(mainImage.imageUrl);
                productImagesMap.set(productId, publicUrl);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching product images for transaction messages:', error);
        }
      }
      
      // Process each message
      const decryptedConversation = await Promise.all(conversation.map(async msg => {
        // Check if this is a file message (has fileUrl and/or message_type is FILE)
        const isFileMessage = msg.messageType === 'FILE' || msg.fileUrl;
        
        // For file messages, we need to generate a public URL
        let fileUrl = null;
        if (isFileMessage && msg.fileUrl) {
          fileUrl = await supabaseFileStorage.getPublicUrl(msg.fileUrl);
        }
        
        // For action messages with products, enhance with main image URL if available
        let productWithImage = msg.product;
        if (msg.messageType === 'ACTION' && msg.productId && productWithImage) {
          // Add the main product image URL if available from our batch fetch
          if (productImagesMap.has(msg.productId)) {
            const imageUrl = productImagesMap.get(msg.productId);
            productWithImage = {
              ...productWithImage,
              imageUrl: imageUrl
            };
          }
        }
        
        // Create a properly mapped message
        const mappedMsg = {
          ...msg,
          // Decrypt content if it exists and is encrypted
          content: msg.content ? decryptMessage(msg.content) : msg.content,
          // Set fileUrl to the properly generated URL if it exists
          fileUrl: fileUrl
        };
        
        // Only add the product property if we have product info
        if (productWithImage) {
          mappedMsg.product = productWithImage;
        }
        
        return mappedMsg;
      }));
      
      res.json(decryptedConversation);
    } catch (error) {
      next(error);
    }
  });
  
  // Confirm transaction action
  app.post("/api/messages/action/confirm", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      // Validate request body
      const schema = z.object({
        messageId: z.number()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validationResult.error.errors 
        });
      }
      
      const { messageId } = validationResult.data;
      const userId = req.user.id;
      
      // Fetch the message to verify it's a transaction for this user
      const message = await storage.getMessageById(messageId);
      
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      // Verify this user is the recipient of the message
      if (message.receiverId !== userId) {
        return res.status(403).json({ message: "Unauthorized: You cannot confirm this transaction" });
      }
      
      // Verify it's an action message
      if (message.messageType !== 'ACTION') {
        return res.status(400).json({ message: "Not an action message" });
      }
      
      // Update the message to mark it as clicked
      const updatedMessage = await storage.updateActionMessageStatus(messageId, true);
      
      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to update message status" });
      }
      console.log("action type: ", message.actionType);
      
      // Handle different action types differently
      if (message.actionType === 'CONFIRM_PAYMENT') {
        // This is a seller confirming payment received
        if (message.productId) {
          try {
            // Find the transaction for this product between these users
            const { data: transactions, error } = await supabase
              .from('transactions')
              .select('*')
              .eq('product_id', message.productId)
              .eq('seller_id', userId) // Current user (seller) is confirming payment
              .eq('buyer_id', message.senderId) // The sender of this message is the buyer
              .eq('status', 'WAITING_PAYMENT')
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (error) {
              console.error('Error fetching transaction:', error);
              return res.status(500).json({ message: "Error processing payment confirmation" });
            }
            
            if (transactions && transactions.length > 0) {
              const transaction = transactions[0];
              
              // Update the transaction status to WAITING_DELIVERY (not COMPLETED yet)
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'WAITING_DELIVERY',
                  updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);
              
              if (updateError) {
                console.error('Error updating transaction status:', updateError);
                return res.status(500).json({ message: "Failed to update transaction status" });
              }
              
              console.log(`Updated transaction ${transaction.id} to WAITING_DELIVERY status`);
              
              // Update the product status to 'pending' from 'active'
              const { error: productUpdateError } = await supabase
                .from('products')
                .update({
                  status: 'pending'
                })
                .eq('id', message.productId);

              if (productUpdateError) {
                console.error('Error updating product status to pending:', productUpdateError);
                // Don't return an error response here, as the main transaction was successful
                // Just log the error and continue
                } else {
                  console.log(`Updated product ${message.productId} status to pending`);
                }
            } else {
              console.warn(`No WAITING_PAYMENT transaction found for product ${message.productId} between seller ${userId} and buyer ${message.senderId}`);
            }
            
            // Log payment confirmation success
            console.log(`Payment confirmation successful for message ${messageId}, product ${message.productId}, seller ${userId}`);
          } catch (transError) {
            console.error('Error during payment confirmation:', transError);
            return res.status(500).json({ message: "Error processing payment confirmation" });
          }
        }
      } else if (message.actionType === 'CONFIRM_DELIVERY') {
        // This is a buyer confirming delivery received
        if (message.productId) {
          try {
            // Find the transaction for this product between these users
            const { data: transactions, error } = await supabase
              .from('transactions')
              .select('*')
              .eq('product_id', message.productId)
              .eq('buyer_id', userId) // Current user (buyer) is confirming delivery
              .eq('status', 'WAITING_DELIVERY')
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (error) {
              console.error('Error fetching transaction:', error);
              return res.status(500).json({ message: "Error processing delivery confirmation" });
            }
            
            if (transactions && transactions.length > 0) {
              const transaction = transactions[0];
              
              // Update the transaction status to WAITING_REVIEW
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'WAITING_REVIEW',
                  updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);
              
              if (updateError) {
                console.error('Error updating transaction status:', updateError);
                return res.status(500).json({ message: "Failed to update transaction status" });
              }
              
              console.log(`Updated transaction ${transaction.id} to WAITING_REVIEW status`);
              
              // Update the product status to 'sold' from 'pending'
              const { error: productUpdateError } = await supabase
                .from('products')
                .update({
                  status: 'sold'
                })
                .eq('id', message.productId);

              if (productUpdateError) {
                console.error('Error updating product status to sold:', productUpdateError);
                // Don't return an error response here, as the main transaction was successful
                // Just log the error and continue
              } else {
                console.log(`Updated product ${message.productId} status to sold`);
              }
            } else {
              console.warn(`No WAITING_DELIVERY transaction found for product ${message.productId} for buyer ${userId}`);
            }
            
            // Log delivery confirmation success
            console.log(`Delivery confirmation successful for message ${messageId}, product ${message.productId}, buyer ${userId}`);
          } catch (transError) {
            console.error('Error during delivery confirmation:', transError);
            return res.status(500).json({ message: "Error processing delivery confirmation" });
          }
        }
      } else {
        // Default action type (INITIATE) - Buyer confirming purchase
        // Get product details to include in the confirmation message and create transaction
        let productName = "this item";
        let productPrice = 1; // Default amount for the transaction if price can't be determined
        if (message.productId) {
          try {
            const product = await storage.getProductById(message.productId);
            if (product) {
              productName = product.name;
              productPrice = product.price;
              
              // Create a transaction record with WAITING_PAYMENT status
              try {
                await supabase
                  .from('transactions')
                  .insert({
                    product_id: message.productId,
                    seller_id: message.senderId,
                    buyer_id: userId,
                    amount: productPrice,
                    status: 'WAITING_PAYMENT',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  });
                
                console.log(`Created transaction record for product ${message.productId}, seller ${message.senderId}, buyer ${userId}`);
              } catch (transError) {
                console.error('Error creating transaction record:', transError);
                // Continue execution even if transaction creation fails
                // We don't want to prevent the confirmation message from being sent
              }
            }
          } catch (err) {
            console.error('Error fetching product details for confirmation message:', err);
          }
        }
        
        // Log transaction creation success
        console.log(`Purchase confirmation successful for message ${messageId}, product ${message.productId}, buyer ${userId}`);
      }
      
      // Return success response
      res.json({ success: true, message: "Action confirmed successfully" });
    } catch (error) {
      console.error("Error confirming transaction action:", error);
      next(error);
    }
  });
  
  // Submit a review for a completed transaction
  app.post("/api/messages/submit-review/:messageId", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      // Validate request parameters and body
      const messageId = parseInt(req.params.messageId, 10);
      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message ID" });
      }
      
      const schema = z.object({
        rating: z.number().min(0).max(5),
        comment: z.string().optional(),
        productId: z.number(),
        sellerId: z.number().optional()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validationResult.error.errors 
        });
      }
      
      const { rating, comment, productId, sellerId } = validationResult.data;
      const userId = req.user.id;
      
      // Fetch the message to verify it's a review action message for this user
      const message = await storage.getMessageById(messageId);
      
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      // Verify this user is the sender of the message (only buyer can submit review)
      if (message.senderId !== userId) {
        return res.status(403).json({ message: "Unauthorized: Only the buyer can submit a review" });
      }
      
      // Verify it's a review action message
      if (message.messageType !== 'ACTION' || message.actionType !== 'REVIEW') {
        return res.status(400).json({ message: "Not a review message" });
      }
      
      // Update the message to mark it as clicked (review submitted)
      const updatedMessage = await storage.updateActionMessageStatus(messageId, true);
      
      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to update message status" });
      }
      
      // Find the transaction for this product between these users
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('product_id', productId)
        .eq('buyer_id', userId) // Current user (buyer) is submitting review
        .eq('status', 'WAITING_REVIEW')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching transaction:', error);
        return res.status(500).json({ message: "Error processing review submission" });
      }
      
      if (!transactions || transactions.length === 0) {
        return res.status(404).json({ message: "No transaction found for this review" });
      }
      
      const transaction = transactions[0];
      
      // If sellerId wasn't provided in the request, try to get it from the transaction
      let actualSellerId = sellerId;
      if (!actualSellerId && transaction) {
        actualSellerId = transaction.seller_id;
      }
      
      // 1. Add the review to the reviews table
      const { error: reviewError } = await supabase
        .from('reviews')
        .insert({
          user_id: userId, // Reviewer (buyer)
          product_id: productId,
          seller_id: actualSellerId, // Add the seller ID
          rating: rating,
          comment: comment || null,
          created_at: new Date()
        });
      
      if (reviewError) {
        console.error('Error adding review:', reviewError);
        return res.status(500).json({ message: "Failed to create review" });
      }
      
      // 2. Update the transaction status to COMPLETED
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          updated_at: new Date()
        })
        .eq('id', transaction.id);
      
      if (updateError) {
        console.error('Error updating transaction:', updateError);
        return res.status(500).json({ message: "Failed to update transaction status" });
      }
      
      // Return success
      res.status(200).json({ 
        message: "Review submitted successfully",
        transactionStatus: 'COMPLETED'
      });
      
      // Notify other user through WebSocket
      const otherUserId = message.receiverId;
      const socketMessage = {
        type: 'REVIEW_SUBMITTED',
        messageId: messageId,
        productId: productId,
        userId: userId,
        rating: rating
      };
      
      notifyUser(otherUserId, socketMessage);
      
    } catch (error) {
      console.error('Error in submit-review endpoint:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Mark messages as read
  app.post("/api/messages/mark-read", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      // Validate request body
      const schema = z.object({
        messageId: z.number().optional(),
        senderId: z.number().optional(),
      }).refine(data => data.messageId !== undefined || data.senderId !== undefined, {
        message: "Either messageId or senderId must be provided"
      });
      
      const { messageId, senderId } = schema.parse(req.body);
      const currentUserId = req.user.id;
      
      if (messageId) {
        // Mark a single message as read
        await storage.markMessageAsRead(messageId);
      } else if (senderId) {
        // Mark all messages from a sender as read
        await storage.markAllMessagesAsRead(currentUserId, senderId);
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
  
  // Endpoint to get unread message count
  app.get("/api/messages/unread-count", requireAuth, async (req: AuthenticatedRequest, res, next) => {
    try {
      const currentUserId = req.user.id;
      
      // Get unread message count
      const count = await storage.getUnreadMessageCount(currentUserId);
      
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });

  // Function to check for expired auctions and handle them
  async function checkAndProcessExpiredAuctions() {
    const timestamp = new Date().toISOString();
    console.log(`[AUCTION-CHECK] ===== Starting Auction Expiry Check at ${timestamp} =====`);
    
    // Log server environment details
    console.log(`[AUCTION-CHECK] ===== Auction Expiry Check =====`);
    console.log(`[AUCTION-CHECK] Server timezone offset: ${new Date().getTimezoneOffset()} minutes`);
    console.log(`[AUCTION-CHECK] Server local time: ${new Date().toString()}`);
    console.log(`[AUCTION-CHECK] Server UTC time: ${new Date().toISOString()}`);
    console.log(`[AUCTION-CHECK] Process TZ env: ${process.env.TZ || 'not set'}`);
    console.log(`[AUCTION-CHECK] Node version: ${process.version}`);
    
    // IMPORTANT: Log if timezone offset might cause issues
    const tzOffset = new Date().getTimezoneOffset();
    if (tzOffset !== 0) {
      console.warn(`[AUCTION-CHECK] WARNING: Server timezone offset is ${tzOffset} minutes from UTC!`);
      console.warn(`[AUCTION-CHECK] This may cause auctions to expire ${Math.abs(tzOffset / 60)} hours off schedule.`);
    }
    
    try {
      // Get only active auctions - more efficient
      const auctions = await storage.getActiveAuctions();
      console.log(`[AUCTION-CHECK] Found ${auctions.length} active auctions to check`);
      
      // IMPORTANT: Timezone handling approach
      // - All dates are stored in UTC in the database (as ISO strings)
      // - Server comparisons are done in UTC (no timezone adjustments)
      // - Client displays dates in user's local timezone using toLocaleString() functions
      // - This ensures consistency across different user timezones
      const now = new Date();
      
      // Filter for active auctions that have passed their end time
      const expiredAuctions = auctions.filter(auction => {
        // COMPREHENSIVE UTC FIX: Ensure all timestamp operations are in UTC
        const endsAtString = auction.endsAt.toString();
        
        // Parse the PostgreSQL timestamp
        let auctionEndDateUTC;
        try {
          auctionEndDateUTC = new Date(endsAtString);
          
          // Validate that the date parsed correctly
          if (isNaN(auctionEndDateUTC.getTime())) {
            console.error(`[AUCTION-CHECK] ERROR: Invalid timestamp format for auction #${auction.id}: "${endsAtString}"`);
            return false;
          }
        } catch (parseError) {
          console.error(`[AUCTION-CHECK] ERROR: Failed to parse timestamp for auction #${auction.id}: "${endsAtString}"`, parseError);
          return false;
        }
        
        // CRITICAL FIX: Force UTC comparison by using explicit UTC time
        // Create current time explicitly in UTC to avoid any timezone issues
        const nowUTC = new Date();
        
        // Calculate time difference using UTC milliseconds (always UTC)
        const msUntilEnd = auctionEndDateUTC.getTime() - nowUTC.getTime();
        const hoursUntilEnd = msUntilEnd / (1000 * 60 * 60);
        const isExpired = msUntilEnd < 0;
        
        console.log(`[AUCTION-CHECK] Auction #${auction.id}:`);
        console.log(`  - endsAt (stored): ${auction.endsAt}`);
        console.log(`  - endsAt (parsed UTC): ${auctionEndDateUTC.toISOString()}`);
        console.log(`  - endsAt (parsed local): ${auctionEndDateUTC.toString()}`);
        console.log(`  - current time (UTC): ${nowUTC.toISOString()}`);
        console.log(`  - current time (local): ${nowUTC.toString()}`);
        console.log(`  - ms until end: ${msUntilEnd}`);
        console.log(`  - hours until end: ${hoursUntilEnd.toFixed(2)}`);
        console.log(`  - is expired: ${isExpired}`);
        console.log(`  - TIMEZONE CHECK: Server TZ offset = ${nowUTC.getTimezoneOffset()} minutes`);
        
        return isExpired;
      });
      
      // console.log(`[${timestamp}] Found ${expiredAuctions.length} expired auctions to process`);
      
      // We already logged the auction details in the filter above, no need to do it again
      
      // Admin user ID for system messages
      const ADMIN_USER_ID = 32;
      
      // Process each expired auction
      for (const auction of expiredAuctions) {
        // console.log(`Processing expired auction #${auction.id}`);
        
        try {
          // Check for reserve price
          const hasReservePrice = auction.reservePrice !== null && auction.reservePrice > 0;
          const reserveNotMet = hasReservePrice && 
            (auction.currentBid === null || auction.currentBid < (auction.reservePrice || 0));
            
          if (reserveNotMet) {
            // Reserve price wasn't met, update status to 'reserve_not_met'
            await storage.updateAuction(auction.id, { status: 'reserve_not_met' });
            console.log(`Updated auction #${auction.id} status to 'reserve_not_met'. Reserve price: ${auction.reservePrice}, Current bid: ${auction.currentBid || 'none'}`);
            
            // Update the corresponding product status to pending
            const { error: productUpdateError } = await supabase
              .from('products')
              .update({
                status: 'pending'
              })
              .eq('id', auction.productId);
              
            if (productUpdateError) {
              console.error(`Error updating product #${auction.productId} status to pending:`, productUpdateError);
            } else {
              console.log(`Updated product #${auction.productId} status to 'pending' for expired auction with reserve not met`);
            }
            
            // Get the product and seller details
            const product = await storage.getProductById(auction.productId);
            if (!product) {
              console.log(`Could not find product #${auction.productId} for auction #${auction.id}`);
              continue;
            }
            
            // Get seller information
            const seller = await storage.getUser(product.sellerId);
            if (!seller) {
              console.log(`Missing seller information for auction #${auction.id}`);
              continue;
            }
            
            // Send message from admin to seller that reserve wasn't met
            const messageContent = `The auction for "${product.name}" has ended, but the reserve price of ${auction.reservePrice} was not met. The highest bid was ${auction.currentBid || 'none'}. You can relist the item.`;
            
            await storage.sendMessage({
              senderId: ADMIN_USER_ID,
              receiverId: seller.id,
              content: messageContent,
              productId: product.id,
              isRead: false
            });
            
            console.log(`Sent reserve_not_met message from admin #${ADMIN_USER_ID} to seller #${seller.id}`);
            
            // Notify auction room if there are any connected clients
            notifyAuctionRoom(auction.id, product.id, 'reserveNotMet', auction.currentBid, auction.currentBidderId);
            
          } else {
            // Regular auction completion flow
            await storage.updateAuction(auction.id, { status: 'pending' });
            console.log(`Updated auction #${auction.id} status to 'pending'`);
            
            // Also update the corresponding product status to pending
            const { error: productUpdateError } = await supabase
              .from('products')
              .update({
                status: 'pending'
              })
              .eq('id', auction.productId);
              
            if (productUpdateError) {
              console.error(`Error updating product #${auction.productId} status to pending:`, productUpdateError);
            } else {
              console.log(`Updated product #${auction.productId} status to 'pending' for expired auction with winning bid`);
            }
            
            // If no bids were placed, just end the auction
            if (!auction.currentBidderId) {
              console.log(`Auction #${auction.id} has no winning bidder, skipping messaging`);
              continue;
            }
            
            const product = await storage.getProductById(auction.productId);
            if (!product) {
              console.log(`Could not find product #${auction.productId} for auction #${auction.id}`);
              continue;
            }
            
            // Get information about the seller and winning bidder
            const seller = await storage.getUser(product.sellerId);
            const highestBidder = await storage.getUser(auction.currentBidderId);
            
            if (!seller || !highestBidder) {
              console.log(`Missing seller or bidder information for auction #${auction.id}`);
              continue;
            }
            
            // Send automated message from seller to highest bidder
            const messageContent = `Congratulations! You've won the auction for "${product.name}" with a winning bid of ${auction.currentBid}. Please proceed with payment to complete the purchase. Thank you for participating!`;
            
            await storage.sendMessage({
              senderId: seller.id,
              receiverId: highestBidder.id,
              content: messageContent,
              productId: product.id,
              isRead: false
            });
            
            console.log(`Sent automated message from seller #${seller.id} to winning bidder #${highestBidder.id}`);
            
            // Notify auction room
            notifyAuctionRoom(auction.id, product.id, 'auctionEnded', auction.currentBid, auction.currentBidderId);
          }
        } catch (error) {
          console.error(`Error processing expired auction #${auction.id}:`, error);
        }
      }
      
      // Helper function to notify auction room via WebSocket
      function notifyAuctionRoom(auctionId: number, productId: number, eventType: string, currentBid: number | null, bidderId: number | null) {
        const auctionRoom = auctionRooms.get(auctionId);
        if (auctionRoom && auctionRoom.size > 0) {
          const notificationPayload = {
            type: eventType,
            auctionId,
            productId,
            winningBid: currentBid,
            winningBidderId: bidderId
          };
          
          // Convert Set to Array before iteration to avoid TypeScript error
          Array.from(auctionRoom).forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(notificationPayload));
            }
          });
          
          console.log(`Notified ${auctionRoom.size} clients that auction #${auctionId} has ${eventType}`);
        }
      }
    } catch (error) {
      console.error('Error checking for expired auctions:', error);
    }
    
    // We'll use setInterval outside this function instead of setTimeout here
    // This ensures the next check runs even if there was an error in this execution
  }
  
  // WebSocket server already initialized earlier
  
  // Map of connected users: userId -> WebSocket connection
  // Using the connectedUsers Map declared earlier at line 102
  
  // Helper function to send notification to a specific user
  function notifyUser(userId: number, data: any) {
    const userSocket = connectedUsers.get(userId);
    if (userSocket && userSocket.readyState === WebSocket.OPEN) {
      try {
        userSocket.send(JSON.stringify(data));
        console.log(`Notification sent to user ${userId}:`, data.type);
        return true;
      } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error);
      }
    } else {
      console.log(`User ${userId} is not connected or socket not ready`);
    }
    return false;
  }
  
  // Map of auction rooms: auctionId -> Set of WebSocket connections
  // Using the auctionRooms Map declared earlier at line 99
  
  // Start the auction expiry check process - initial call
  // Commented out to reduce log noise
  // checkAndProcessExpiredAuctions();
  
  // Set up a proper interval to check expired auctions every minute
  // This ensures the check runs even if there are errors in previous executions
  console.log('Setting up recurring auction expiry check (every 60 seconds)');
  // Commented out to reduce log noise
  setInterval(checkAndProcessExpiredAuctions, 60000);
  
  // Function to check for expired featured products
  async function checkAndUpdateExpiredFeaturedProducts() {
    console.log("Running featured products expiration check...");
    
    // Get current time
    const currentTime = new Date().toISOString();
    
    try {
      // Find products where:
      // 1. is_featured is true
      // 2. featured_until exists and is earlier than current time
      const { data: expiredProducts, error } = await supabase
        .from('products')
        .select('id, name, featured_until, featured_duration_hours')
        .eq('is_featured', true)
        .lt('featured_until', currentTime);
        
      if (error) {
        console.error("Error checking for expired featured products:", error);
        return;
      }
      
      if (!expiredProducts || expiredProducts.length === 0) {
        console.log("No expired featured products found");
        return;
      }
      
      console.log(`Found ${expiredProducts.length} products with expired featured status`);
      
      // Update each expired product
      for (const product of expiredProducts) {
        console.log(`Expiring featured status for product #${product.id} "${product.name}" (expired at ${product.featured_until}, duration: ${product.featured_duration_hours || 'unknown'} hours)`);
        
        const { error: updateError } = await supabase
          .from('products')
          .update({
            is_featured: false
          })
          .eq('id', product.id);
          
        if (updateError) {
          console.error(`Error updating product #${product.id}:`, updateError);
        } else {
          console.log(`✅ Successfully expired featured status for product #${product.id}`);
        }
      }
      
      console.log("Completed featured products expiration check");
    } catch (err) {
      console.error("Error in featured products expiration check:", err);
    }
  }
  
  // Run the initial check
  checkAndUpdateExpiredFeaturedProducts();
  
  // Set up recurring check for featured product expiration (every 30 minutes)
  setInterval(checkAndUpdateExpiredFeaturedProducts, 30 * 60 * 1000);
  
  // GET /api/auctions - Get all auctions
  app.get('/api/auctions', async (req, res) => {
    try {
      const auctions = await storage.getAuctions();
      
      // Enhance auctions with bid counts
      const enhancedAuctions = await Promise.all(auctions.map(async (auction) => {
        const bids = await storage.getBidsForAuction(auction.id);
        return {
          ...auction,
          bidCount: bids.length
        };
      }));
      
      res.json(enhancedAuctions);
    } catch (error) {
      console.error('Error getting auctions:', error);
      res.status(500).json({ message: 'Error retrieving auctions' });
    }
  });
  
  // GET /api/auctions/:id - Get auction by ID
  app.get('/api/auctions/:id', async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuctionById(auctionId);
      
      if (!auction) {
        return res.status(404).json({ message: 'Auction not found' });
      }
      
      // Get bids for this auction
      const bids = await storage.getBidsForAuction(auction.id);
      
      // Enhance bids with bidder usernames
      const enhancedBids = await Promise.all(bids.map(async (bid) => {
        try {
          const bidder = await storage.getUser(bid.bidderId);
          return {
            ...bid,
            bidder: bidder?.username || `User #${bid.bidderId}`
          };
        } catch (err) {
          console.warn(`Could not fetch username for bidder ${bid.bidderId}:`, err);
          return {
            ...bid,
            bidder: `User #${bid.bidderId}`
          };
        }
      }));
      
      // Get product details
      console.log(`Looking up product ID ${auction.productId} for auction ${auctionId}`);
      const product = await storage.getProductById(auction.productId);
      
      if (!product) {
        console.warn(`Product ${auction.productId} not found for auction ${auctionId}`);
        return res.status(404).json({ message: 'Product not found for this auction' });
      }
      
      res.json({
        ...auction,
        product,
        bids: enhancedBids
      });
    } catch (error) {
      console.error('Error getting auction:', error);
      res.status(500).json({ message: 'Error retrieving auction' });
    }
  });

  return httpServer;
}
