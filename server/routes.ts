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
  boostPackages,
  createBoostOrderSchema
} from "@shared/schema";
import { productImages } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import multer from "multer";
import * as supabaseFileStorage from "./supabase-file-storage"; // Import Supabase storage implementation
import { IMAGE_TYPES } from "./types/index.js";
import path from "path"; // Added import for path
import { transformProductImages, transformImageUrlsArray, transformUserImages } from "./image-url-helper";
import { handleLegacyImage, isLegacyImageId } from "./legacy-image-handler";
import { supabase } from "./supabase"; // Import Supabase for server-side operations
import { createClient } from '@supabase/supabase-js';
import { users } from "@shared/schema"; // Import the users schema for database updates
import { WebSocketServer, WebSocket } from 'ws';
import { encryptMessage, decryptMessage, isEncrypted } from './encryption';
import { generateSellerPreview, generateAuctionPreview, generateProductPreview } from './social-preview';
import * as billplz from './billplz';
import crypto from 'crypto';
import { requireAuth, getUserFromToken, authRoutes, AuthenticatedRequest } from './app-auth';
import { authLimiter, passwordResetLimiter, apiLimiter, userLookupLimiter, adminLimiter } from './rate-limiter';
import { auditLog, auditMiddleware, auditAuth, auditResource, auditSecurity, auditPayment, auditAdmin, auditFile, AuditEventType, AuditSeverity } from './audit-logger';
import { logger } from './logger';
import sharp from 'sharp';

// Import boost error handling system
import {
  BoostOrderError,
  BoostValidationError,
  BoostPaymentError,
  BoostBillplzError,
  BoostRateLimitError,
  BoostDatabaseError,
  BoostDuplicateRequestError,
  BoostErrorCode,
  BoostErrorMessages,
  createErrorResponse,
  logBoostError,
  handleBoostError
} from './boost-errors';

// Import boost validation middleware
import {
  boostValidationMiddleware,
  sanitizeRequest,
  createRateLimiter,
  validateRequest,
  validateBoostCSRF,
  checkIdempotency,
  storeIdempotentResponse,
  validateWebhookSignature,
  generateRequestId
} from './boost-validation';

// Import boost transaction management
// Using Supabase-based implementation to avoid PostgreSQL role issues
import {
  executeBoostTransaction,
  trackBoostOperation as trackOperation,
  generateBoostTransactionId as generateTransactionId
} from './boost-supabase';

// Import other functions from boost-transactions (these don't use db)
import {
  createBoostOrderTransaction,
  processBoostPaymentTransaction,
  expireFeaturedProductsTransaction,
  createIdempotencyKey,
  checkIdempotentOperation,
  addRollbackAction
} from './boost-transactions';

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
    logger.error('Error fetching full user details', { error: error instanceof Error ? error.message : error });
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

  // Preprocessing function for product data to handle type mismatches
  const preprocessProductData = (data: any) => ({
    ...data,
    price: typeof data.price === 'number' ? data.price.toString() : data.price,
    stockQuantity: typeof data.stockQuantity === 'string' ? parseInt(data.stockQuantity) : data.stockQuantity,
    remainingPercentage: typeof data.remainingPercentage === 'string' ? parseInt(data.remainingPercentage) : data.remainingPercentage,
    purchaseYear: typeof data.purchaseYear === 'string' ? parseInt(data.purchaseYear) : data.purchaseYear,
    categoryId: typeof data.categoryId === 'string' ? parseInt(data.categoryId) : data.categoryId
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
    logger.websocket('Client connected');
    
    // Handle messages from client
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        logger.websocket('Received message', { type: data.type });
        
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
                    logger.warn('WebSocket authentication failed: user not found in database');
                    ws.send(JSON.stringify({ type: 'auth_failed', message: 'User profile not found' }));
                    ws.close();
                  }
                } else {
                  logger.warn('WebSocket authentication failed: invalid token');
                  ws.send(JSON.stringify({ type: 'auth_failed', message: 'Invalid authentication token' }));
                  ws.close();
                }
              } catch (error) {
                console.error('WebSocket authentication error:', error);
                ws.send(JSON.stringify({ type: 'auth_failed', message: 'Authentication failed' }));
                ws.close();
              }
            } else {
              logger.warn('WebSocket authentication failed: no token provided');
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
              
              // Audit message sent
              await auditLog({
                eventType: AuditEventType.USER_MESSAGE_SENT,
                severity: AuditSeverity.INFO,
                userId: clientInfo.userId,
                ipAddress: ws._socket?.remoteAddress || 'websocket',
                userAgent: 'WebSocket Client',
                action: 'Sent message',
                resourceType: 'message',
                resourceId: savedMessage.id,
                details: {
                  receiverId: data.receiverId,
                  productId: data.productId,
                  hasContent: !!data.content
                },
                success: true
              });
              
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
            
          case 'send_action_message':
            // Handle action message (transaction initiation, payment confirmation, etc.)
            console.log('🎯 SERVER: Processing send_action_message request');
            console.log('📥 Action message data:', {
              type: data.type,
              receiverId: data.receiverId,
              productId: data.productId,
              actionType: data.actionType
            });
            
            // Get authenticated user from WebSocket client
            const actionClientInfo = clients.get(ws);
            if (!actionClientInfo) {
              console.error('❌ SERVER: User not authenticated for send_action_message');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated'
              }));
              break;
            }
            
            if (!data.receiverId || !data.productId || !data.actionType) {
              console.error('❌ SERVER: Missing required fields for send_action_message');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Missing receiverId, productId, or actionType'
              }));
              break;
            }
            
            try {
              console.log('💾 SERVER: Creating action message in database');
              
              // Create action message data - don't encrypt action messages
              const actionMessageData = {
                senderId: actionClientInfo.userId,
                receiverId: data.receiverId,
                content: null, // Action messages don't have text content - use null instead of empty string
                productId: data.productId,
                messageType: 'ACTION' as const,
                actionType: data.actionType,
                isRead: false,
              };
              
              console.log('📝 SERVER: Creating action message with data:', {
                senderId: actionMessageData.senderId,
                receiverId: actionMessageData.receiverId,
                productId: actionMessageData.productId,
                messageType: actionMessageData.messageType,
                actionType: actionMessageData.actionType
              });
              
              // Save action message to database
              const savedActionMessage = await storage.sendMessage(actionMessageData);
              console.log('✅ SERVER: Action message saved with ID:', savedActionMessage.id);
              
              // Audit action message sent
              await auditLog({
                eventType: AuditEventType.USER_MESSAGE_SENT,
                severity: AuditSeverity.INFO,
                userId: actionClientInfo.userId,
                ipAddress: ws._socket?.remoteAddress || 'websocket',
                userAgent: 'WebSocket Client',
                action: `Sent action message: ${data.actionType}`,
                resourceType: 'message',
                resourceId: savedActionMessage.id,
                details: {
                  receiverId: data.receiverId,
                  productId: data.productId,
                  actionType: data.actionType,
                  messageType: 'ACTION'
                },
                success: true
              });
              
              // Get user details for response
              const actionSender = await storage.getUser(actionClientInfo.userId);
              const actionReceiver = await storage.getUser(data.receiverId);
              
              // Get product details
              let actionProduct = null;
              try {
                actionProduct = await storage.getProductById(data.productId);
              } catch (err) {
                console.warn('SERVER: Could not fetch product details for action message:', err);
              }
              
              // Create detailed action message response
              const actionMessageResponse = {
                id: savedActionMessage.id,
                senderId: savedActionMessage.senderId,
                receiverId: savedActionMessage.receiverId,
                content: savedActionMessage.content,
                productId: savedActionMessage.productId,
                messageType: savedActionMessage.messageType,
                actionType: savedActionMessage.actionType,
                isRead: savedActionMessage.isRead,
                createdAt: savedActionMessage.createdAt,
                sender: actionSender ? {
                  id: actionSender.id,
                  username: actionSender.username,
                  profileImage: actionSender.profileImage
                } : undefined,
                receiver: actionReceiver ? {
                  id: actionReceiver.id,
                  username: actionReceiver.username,
                  profileImage: actionReceiver.profileImage
                } : undefined,
                product: actionProduct ? {
                  id: actionProduct.id,
                  name: actionProduct.name,
                  price: actionProduct.price,
                  imageUrl: actionProduct.imageUrl
                } : undefined
              };
              
              console.log('📤 SERVER: Sending action message confirmation to sender');
              // Send confirmation to sender
              ws.send(JSON.stringify({
                type: 'action_message_sent',
                message: actionMessageResponse
              }));
              
              // Send action message to receiver if they're connected
              let actionReceiverNotified = false;
              clients.forEach((receiverInfo, receiverWs) => {
                if (receiverWs.readyState === WebSocket.OPEN && receiverInfo.userId === data.receiverId) {
                  console.log('📨 SERVER: Sending action message to receiver');
                  receiverWs.send(JSON.stringify({
                    type: 'new_action_message',
                    message: actionMessageResponse
                  }));
                  actionReceiverNotified = true;
                }
              });
              
              if (!actionReceiverNotified) {
                console.log('⚠️ SERVER: Action message receiver not connected, saved for later');
              }
              
              console.log('✅ SERVER: send_action_message processing complete');
              
            } catch (error) {
              console.error('❌ SERVER: Error processing send_action_message:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to send action message: ' + errorMessage
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
                
                // Audit bid placement
                await auditLog({
                  eventType: AuditEventType.USER_BID_PLACED,
                  severity: AuditSeverity.INFO,
                  userId: userId,
                  ipAddress: ws._socket?.remoteAddress || 'websocket',
                  userAgent: 'WebSocket Client',
                  action: 'Placed bid',
                  resourceType: 'bid',
                  resourceId: bid.id,
                  details: {
                    auctionId: parseInt(auctionId),
                    amount: parseFloat(amount),
                    productId: auction.productId
                  },
                  success: true
                });
                
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
                  message: `Your bid of RM${parseFloat(amount).toFixed(2)} was accepted`
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
            
          case 'mark_read':
            // Handle marking messages as read
            console.log('📖 [WebSocket] Processing mark_read request:', data);
            
            // Get authenticated user from WebSocket client
            const readerInfo = clients.get(ws);
            if (!readerInfo) {
              console.error('❌ [WebSocket] User not authenticated for mark_read');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Not authenticated'
              }));
              break;
            }
            
            try {
              const currentUserId = readerInfo.userId;
              
              if (data.messageId) {
                // Mark a single message as read
                console.log(`📖 [WebSocket] Marking message ${data.messageId} as read for user ${currentUserId}`);
                await storage.markMessageAsRead(data.messageId);
              } else if (data.senderId) {
                // Mark all messages from a sender as read
                console.log(`📖 [WebSocket] Marking all messages from sender ${data.senderId} as read for user ${currentUserId}`);
                await storage.markAllMessagesAsRead(currentUserId, data.senderId);
              } else {
                console.error('❌ [WebSocket] mark_read requires either messageId or senderId');
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Either messageId or senderId must be provided'
                }));
                break;
              }
              
              // Send confirmation back to the client
              console.log('✅ [WebSocket] Messages marked as read successfully');
              ws.send(JSON.stringify({
                type: 'messages_read',
                messageId: data.messageId,
                senderId: data.senderId
              }));
              
              // Also notify any connected receiver to update their message list
              if (data.senderId) {
                const receiverSocket = connectedUsers.get(data.senderId);
                if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
                  console.log(`📡 [WebSocket] Notifying sender ${data.senderId} that their messages were read`);
                  receiverSocket.send(JSON.stringify({
                    type: 'messages_read',
                    messageId: data.messageId,
                    senderId: data.senderId,
                    readBy: currentUserId
                  }));
                }
              }
              
              console.log('✅ [WebSocket] mark_read processing complete');
              
            } catch (error) {
              console.error('❌ [WebSocket] Error processing mark_read:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to mark messages as read: ' + errorMessage
              }));
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

  // **TASK 2.1: Billplz Webhook Handler**
  app.post('/api/payments/billplz/webhook', async (req, res) => {
    console.log('🔔 BILLPLZ WEBHOOK RECEIVED');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Request headers:', JSON.stringify(req.headers, null, 2));

    try {
      const xSignature = req.headers['x-signature'] as string;
      const payload = req.body;

      // Verify webhook signature
      const isValidSignature = billplz.verifyWebhookSignature(payload, xSignature);
      if (!isValidSignature) {
        console.error('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log('✅ Webhook signature verified');

      // Extract payment information from webhook payload
      const {
        id: billId,
        collection_id,
        paid,
        state,
        amount,
        paid_amount,
        due_at,
        email,
        mobile,
        name,
        paid_at,
        transaction_id,
        transaction_status,
        reference_1,
        reference_2
      } = payload;

      console.log(`📦 Processing webhook for bill: ${billId}, status: ${state}, paid: ${paid}`);

      // Find the payment record by bill ID
      const payment = await storage.getPaymentByBillId(billId);
      if (!payment) {
        console.warn(`⚠️ Payment not found for bill ID: ${billId}`);
        return res.status(404).json({ error: 'Payment not found' });
      }

      console.log(`💳 Found payment record: ID ${payment.id}, Type: ${payment.paymentType}, Status: ${payment.status}`);

      // Update payment status based on webhook data
      let newStatus = 'pending';
      if (paid === true || state === 'paid') {
        newStatus = 'paid';
      } else if (state === 'due') {
        newStatus = 'pending';
      } else if (state === 'deleted') {
        newStatus = 'failed';
      }

      // Update the payment record
      await storage.updatePaymentStatus(
        payment.id,
        newStatus,
        billId,
        transaction_id || undefined,
        paid_at ? new Date(paid_at) : undefined
      );

      console.log(`📝 Payment ${payment.id} status updated to: ${newStatus}`);
      
      // Audit payment status update
      if (newStatus === 'paid') {
        await auditPayment.success(req, payment.orderId, transaction_id || billId, amount);
      } else if (newStatus === 'failed') {
        await auditPayment.failed(req, payment.orderId, `Payment state: ${state}`);
      }

      // **BOOST ACTIVATION LOGIC** - Only activate boost for successful payments
      if (newStatus === 'paid' && payment.paymentType === 'boost') {
        console.log('🚀 Processing boost activation for successful payment');

        try {
          // Get boost package details
          const boostPackage = await storage.getBoostPackageById(payment.boost_option_id!);
          if (!boostPackage) {
            console.error(`❌ Boost package not found: ${payment.boost_option_id}`);
          } else {
            // Parse product IDs from payment record
            const productIds = payment.productIds?.map(id => parseInt(id.toString())) || [];
            
            if (productIds.length > 0) {
              // Activate boost for the products
              await storage.activateBoostForProducts(productIds, boostPackage.durationHours);
              console.log(`✨ Boost activated for products: ${productIds.join(', ')} for ${boostPackage.durationHours} hours`);
            } else {
              console.error('❌ No product IDs found in payment record');
            }
          }
        } catch (boostError) {
          console.error('❌ Error activating boost:', boostError);
          // Don't fail the webhook - payment is still successful
        }
      }

      // Return success response to Billplz
      console.log('✅ Webhook processed successfully');
      return res.status(200).json({ 
        status: 'success',
        message: 'Webhook processed successfully',
        bill_id: billId,
        payment_status: newStatus
      });

    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // **TASK 2.3: Billplz Redirect Handler**
  app.get('/api/payments/billplz/redirect', async (req, res) => {
    console.log('🔄 BILLPLZ REDIRECT RECEIVED');
    console.log('Query parameters:', JSON.stringify(req.query, null, 2));

    try {
      // Extract Billplz parameters from query string
      const billplzParams = req.query as any;
      const billId = billplzParams['billplz[id]'];
      const xSignature = billplzParams['billplz[x_signature]'];

      if (!billId) {
        console.error('❌ Missing bill ID in redirect');
        return res.redirect(`${process.env.CLIENT_URL}/payment/error?error=missing_bill_id`);
      }

      // Build raw query string for signature verification
      const rawQuery = new URL(req.protocol + '://' + req.get('host') + req.originalUrl).search.substring(1);
      
      // Verify redirect signature
      const isValidSignature = billplz.verifyRedirectSignature(rawQuery, xSignature);
      if (!isValidSignature) {
        console.error('❌ Invalid redirect signature');
        return res.redirect(`${process.env.CLIENT_URL}/payment/error?error=invalid_signature`);
      }

      console.log('✅ Redirect signature verified');

      // Get fresh payment status from Billplz API
      let billDetails;
      try {
        billDetails = await billplz.getBill(billId);
        console.log('📄 Bill details from API:', JSON.stringify(billDetails, null, 2));
      } catch (apiError) {
        console.error('❌ Error fetching bill details:', apiError);
        return res.redirect(`${process.env.CLIENT_URL}/payment/error?error=api_error`);
      }

      // Find our payment record
      const payment = await storage.getPaymentByBillId(billId);
      if (!payment) {
        console.warn(`⚠️ Payment not found for bill ID: ${billId}`);
        return res.redirect(`${process.env.CLIENT_URL}/payment/error?error=payment_not_found`);
      }

      // Determine redirect based on payment status
      const isPaid = billDetails.paid === true || billDetails.state === 'paid';
      
      if (isPaid) {
        console.log('✅ Payment confirmed as successful');
        
        // Ensure our database is updated (in case webhook hasn't processed yet)
        if (payment.status !== 'paid') {
          await storage.updatePaymentStatus(
            payment.id,
            'paid',
            billId,
            billDetails.transaction_id || undefined,
            billDetails.paid_at ? new Date(billDetails.paid_at) : new Date()
          );

          // Activate boost if this is a boost payment
          if (payment.paymentType === 'boost') {
            try {
              const boostPackage = await storage.getBoostPackageById(payment.boost_option_id!);
              if (boostPackage) {
                const productIds = payment.productIds?.map(id => parseInt(id.toString())) || [];
                if (productIds.length > 0) {
                  await storage.activateBoostForProducts(productIds, boostPackage.durationHours);
                  console.log(`✨ Boost activated for products: ${productIds.join(', ')}`);
                }
              }
            } catch (boostError) {
              console.error('❌ Error activating boost in redirect:', boostError);
            }
          }
        }

        return res.redirect(`${process.env.CLIENT_URL}/payment/success?bill_id=${billId}&order_id=${payment.orderId}`);
      } else {
        console.log('❌ Payment not successful');
        return res.redirect(`${process.env.CLIENT_URL}/payment/failed?bill_id=${billId}&order_id=${payment.orderId}`);
      }

    } catch (error) {
      console.error('❌ Error processing redirect:', error);
      return res.redirect(`${process.env.CLIENT_URL}/payment/error?error=server_error`);
    }
  });
  
  // Middleware to detect social media crawlers and redirect to preview pages
  app.use((req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const isSocialCrawler = /facebookexternalhit|WhatsApp|Twitterbot|LinkedInBot|Slackbot|Telegram|discord|Instagram|Facebot|Pinterest|Snapchat/i.test(userAgent);
    
    // Check if this is an auction page request from a social crawler
    if (isSocialCrawler && req.path.match(/^\/auctions?\/(\d+)$/)) {
      const auctionId = req.path.match(/^\/auctions?\/(\d+)$/)?.[1];
      console.log(`[SOCIAL-REDIRECT] Detected social crawler for auction ${auctionId}, redirecting to preview`);
      return res.redirect(`/social/auction/${auctionId}`);
    }
    
    // Check if this is a product page request from a social crawler
    if (isSocialCrawler && req.path.match(/^\/products\/(\d+)$/)) {
      const productId = req.path.match(/^\/products\/(\d+)$/)?.[1];
      console.log(`[SOCIAL-REDIRECT] Detected social crawler for product ${productId}, redirecting to preview`);
      return res.redirect(`/social/product/${productId}`);
    }
    
    // Check if this is a seller page request from a social crawler
    if (isSocialCrawler && req.path.match(/^\/sellers\/(\d+)$/)) {
      const sellerId = req.path.match(/^\/sellers\/(\d+)$/)?.[1];
      console.log(`[SOCIAL-REDIRECT] Detected social crawler for seller ${sellerId}, redirecting to preview`);
      return res.redirect(`/social/seller/${sellerId}`);
    }
    
    next();
  });

  // Social preview routes for better WhatsApp/Facebook sharing
  app.get("/social/seller/:id", generateSellerPreview);
  app.get("/social/auction/:id", generateAuctionPreview);
  app.get("/social/product/:id", generateProductPreview);

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
      
      // Audit file upload
      await auditFile.upload(req, 'avatar', fileId, req.file.buffer.length);

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
  
  // Get all boost packages with comprehensive error handling
  app.get("/api/boost/packages", apiLimiter, async (req, res, next) => {
    const requestId = generateRequestId();
    
    try {
      console.log(`🎯 [${requestId}] Fetching boost packages`);
      
      const { data, error } = await supabase
        .from('boost_packages')
        .select('*')
        .eq('is_active', true)
        .order('package_type', { ascending: true })
        .order('item_count', { ascending: true });
        
      if (error) {
        const dbError = new BoostDatabaseError(
          'Failed to fetch boost packages',
          'fetch_boost_packages',
          new Error(error.message),
          requestId
        );
        logBoostError(dbError, { supabaseError: error });
        return next(dbError);
      }
      
      if (!data || data.length === 0) {
        console.log(`⚠️ [${requestId}] No active boost packages found`);
        return res.json([]);
      }
      
      console.log(`✅ [${requestId}] Successfully fetched ${data.length} boost packages`);
      return res.json({
        success: true,
        data,
        count: data.length,
        requestId
      });
      
    } catch (err) {
      const error = new BoostDatabaseError(
        'Unexpected error fetching boost packages',
        'fetch_boost_packages',
        err as Error,
        requestId
      );
      return next(error);
    }
  });

  // Create boost order with comprehensive error handling and transaction management
  app.post("/api/boost/create-order", 
    ...boostValidationMiddleware.createOrder,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const requestId = req.requestId || generateRequestId();
      
      try {
        console.log(`🎯 [${requestId}] Creating boost order`);
        
        // Authenticate user
        const user = await getAuthenticatedUser(req);
        if (!user) {
          const error = new BoostOrderError(
            'Authentication required to create boost order',
            BoostErrorCode.UNAUTHORIZED_ACCESS,
            401,
            { operation: 'create_boost_order' },
            requestId
          );
          return next(error);
        }

        const { boostPackageId, productIds } = req.body;
        
        console.log(`🔍 [${requestId}] Debug - Received boost package ID:`, boostPackageId);
        console.log(`🔍 [${requestId}] Debug - Product IDs:`, productIds);
        
        // Create idempotency key for this operation
        const idempotencyKey = req.idempotencyKey || createIdempotencyKey(
          user.id, 
          'create_boost_order', 
          { boostPackageId, productIds }
        );

        // Check for existing idempotent operation
        const existingOperation = checkIdempotentOperation(idempotencyKey);
        if (existingOperation) {
          console.log(`🔄 [${requestId}] Returning idempotent result for boost order`);
          return res.status(200).json(existingOperation.result);
        }

        // Execute boost order creation in transaction
        const result = await executeBoostTransaction(async (txId) => {
          trackOperation(txId, 'validate_boost_package');
          
          // Verify boost package exists and is active
          console.log(`🔍 [${requestId}] Querying boost package with ID: ${boostPackageId}`);
          const { data: boostPackage, error: packageError } = await supabase
            .from('boost_packages')
            .select('*')
            .eq('id', boostPackageId)
            .eq('is_active', true)
            .single();

          console.log(`🔍 [${requestId}] Boost package query result:`, { 
            found: !!boostPackage, 
            error: packageError?.message,
            packageData: boostPackage
          });

          if (packageError || !boostPackage) {
            throw new BoostOrderError(
              'Boost package not found or inactive',
              BoostErrorCode.PACKAGE_NOT_FOUND,
              404,
              { boostPackageId, supabaseError: packageError },
              requestId
            );
          }

          // Check if user selected correct number of products for the package
          if (productIds.length !== boostPackage.item_count) {
            throw new BoostValidationError(
              `This boost package requires exactly ${boostPackage.item_count} product(s)`,
              'productIds',
              `${productIds.length} products selected`,
              requestId
            );
          }

          trackOperation(txId, 'validate_products');
          
          // Verify all products exist, belong to the user, are active, and not already featured
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*')
            .in('id', productIds)
            .eq('seller_id', user.id);

          if (productsError) {
            throw new BoostDatabaseError(
              'Error verifying products',
              'fetch_user_products',
              new Error(productsError.message),
              requestId
            );
          }

          if (!products || products.length !== productIds.length) {
            const foundIds = products?.map(p => p.id) || [];
            const missingIds = productIds.filter(id => !foundIds.includes(id));
            
            throw new BoostOrderError(
              'One or more products not found or not owned by user',
              BoostErrorCode.PRODUCT_NOT_OWNED,
              404,
              { requestedIds: productIds, foundIds, missingIds },
              requestId
            );
          }

          // Check if products are active and not already featured
          const inactiveProducts = products.filter(p => p.status !== 'active');
          if (inactiveProducts.length > 0) {
            throw new BoostValidationError(
              'Products must be active to be featured',
              'productStatus',
              inactiveProducts.map(p => ({ id: p.id, name: p.name, status: p.status })),
              requestId
            );
          }

          const alreadyFeatured = products.filter(p => p.is_featured === true);
          if (alreadyFeatured.length > 0) {
            throw new BoostOrderError(
              'Some products are already featured',
              BoostErrorCode.ALREADY_FEATURED,
              409,
              { featuredProducts: alreadyFeatured.map(p => ({ id: p.id, name: p.name })) },
              requestId
            );
          }

          trackOperation(txId, 'create_payment_record');
          
          // Generate unique order ID
          const orderId = crypto.randomUUID();

          // Calculate expiration time (24 hours from now)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          // Create payment record in database
          // Note: Using existing database schema columns, storing extra data in webhook_payload
          const paymentMetadata = {
            boost_package: boostPackage,
            selected_products: products.map(p => ({ id: p.id, name: p.name })),
            expires_at: expiresAt.toISOString(),
            transaction_id: txId,
            request_id: requestId,
            payment_type: 'boost',
            product_ids: productIds
          };
          
          const paymentData = {
            user_id: user.id.toString(), // Ensure string format to match existing schema
            order_id: orderId,
            amount: boostPackage.price,
            status: 'pending',
            boost_option_id: boostPackageId,
            product_id: productIds[0], // Use first product for backward compatibility
            collection_id: process.env.BILLPLZ_COLLECTION_ID, // Required field from Billplz
            created_at: new Date().toISOString(),
            webhook_payload: JSON.stringify(paymentMetadata) // Store metadata in existing column
          };
          
          console.log(`🔍 [${requestId}] Creating payment record with data:`, {
            ...paymentData,
            webhook_payload: '[JSON_PAYLOAD]' // Don't log the full JSON
          });
          
          const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert(paymentData)
            .select()
            .single();

          if (paymentError || !payment) {
            throw new BoostDatabaseError(
              'Failed to create payment record',
              'create_payment',
              new Error(paymentError?.message || 'No payment returned'),
              requestId
            );
          }

          // Add rollback action to delete payment record if bill creation fails
          addRollbackAction(txId, async () => {
            await supabase
              .from('payments')
              .delete()
              .eq('order_id', orderId);
          });

          trackOperation(txId, 'create_billplz_bill');
          
          // Create Billplz bill
          let billData;
          try {
            billData = await billplz.createBill({
              name: `${user.firstName || user.username} ${user.lastName || ''}`.trim(),
              email: user.email,
              amount: boostPackage.price, // Amount in sen
              description: `Boost Package: ${boostPackage.name} (${boostPackage.item_count} items for ${boostPackage.duration_hours} hours)`,
              reference_1: orderId,
              reference_2: `boost_${boostPackageId}`,
              callback_url: `${process.env.APP_URL || 'http://localhost:5000'}/api/payments/billplz/webhook`,
              redirect_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/boost/payment-result`
            });
          } catch (billplzError) {
            throw new BoostBillplzError(
              'Failed to create payment bill',
              billplzError,
              requestId
            );
          }

          if (!billData || !billData.id) {
            throw new BoostBillplzError(
              'Invalid response from payment service',
              billData,
              requestId
            );
          }

          trackOperation(txId, 'update_payment_with_bill_id');
          
          // Update payment record with bill ID
          const { error: updateError } = await supabase
            .from('payments')
            .update({ 
              bill_id: billData.id,
              updated_at: new Date().toISOString()
            })
            .eq('order_id', orderId);

          if (updateError) {
            console.warn(`⚠️ [${requestId}] Failed to update payment with bill ID:`, updateError);
            // Don't fail the transaction for this, as the bill was created successfully
          }

          // Return success result
          const successResult = {
            success: true,
            paymentUrl: billData.url,
            orderId: orderId,
            billId: billData.id,
            amount: boostPackage.price,
            expiresAt: expiresAt.toISOString(),
            transactionId: txId,
            requestId
          };

          // Store idempotent result
          if (req.idempotencyKey) {
            storeIdempotentResponse(req.idempotencyKey, successResult);
          }

          return successResult;

        }, {
          idempotencyKey,
          metadata: { 
            userId: user.id, 
            boostPackageId, 
            productIds,
            operation: 'create_boost_order'
          }
        });

        console.log(`✅ [${requestId}] Boost order created successfully`);
        return res.status(201).json(result);

      } catch (error) {
        if (error instanceof BoostOrderError) {
          return next(error);
        }
        
        const unexpectedError = new BoostDatabaseError(
          'Unexpected error creating boost order',
          'create_boost_order',
          error as Error,
          requestId
        );
        return next(unexpectedError);
      }
    }
  );

  // Enhanced boost payment webhook with comprehensive error handling
  app.post('/api/boost/webhook', 
    ...boostValidationMiddleware.processWebhook,
    async (req: Request, res: Response, next: NextFunction) => {
      const requestId = req.requestId || generateRequestId();
      
      try {
        console.log(`🔔 [${requestId}] BOOST WEBHOOK RECEIVED`);
        
        // Log webhook details for monitoring
        const logData = {
          requestId,
          headers: req.headers,
          body: req.body,
          timestamp: new Date().toISOString()
        };
        console.log('📋 Boost Webhook Details:', JSON.stringify(logData, null, 2));

        const {
          billplzid: billId,
          billplzpaid: paid,
          billplzpaid_at: paidAt
        } = req.body;

        // Find the payment record by bill ID
        const payment = await storage.getPaymentByBillId(billId);
        if (!payment) {
          const error = new BoostOrderError(
            'Payment record not found for webhook',
            BoostErrorCode.PAYMENT_FAILED,
            404,
            { billId },
            requestId
          );
          return next(error);
        }

        // Only process boost payments
        if (payment.paymentType !== 'boost') {
          console.log(`⚠️ [${requestId}] Ignoring non-boost payment: ${payment.paymentType}`);
          return res.status(200).json({ status: 'ignored', reason: 'not_boost_payment' });
        }

        // Create idempotency key for webhook processing
        const idempotencyKey = createIdempotencyKey(
          payment.userId,
          'process_boost_webhook',
          { billId, paid, paidAt }
        );

        // Check for existing idempotent operation
        const existingOperation = checkIdempotentOperation(idempotencyKey);
        if (existingOperation) {
          console.log(`🔄 [${requestId}] Returning idempotent webhook result`);
          return res.status(200).json(existingOperation.result);
        }

        // Process payment in transaction
        const result = await processBoostPaymentTransaction(
          payment.id,
          billId,
          paid === 'true' ? 'paid' : 'failed',
          paidAt ? new Date(paidAt) : undefined,
          idempotencyKey
        );

        const webhookResult = {
          status: 'success',
          message: 'Boost webhook processed successfully',
          billId,
          paymentId: payment.id,
          paymentStatus: result.status,
          transactionId: result.transactionId,
          requestId
        };

        console.log(`✅ [${requestId}] Boost webhook processed successfully`);
        return res.status(200).json(webhookResult);

      } catch (error) {
        if (error instanceof BoostOrderError) {
          return next(error);
        }
        
        const webhookError = new BoostOrderError(
          'Failed to process boost webhook',
          BoostErrorCode.WEBHOOK_VALIDATION_FAILED,
          500,
          { originalError: error.message },
          requestId
        );
        return next(webhookError);
      }
    }
  );

  // Get boost order status endpoint
  app.get('/api/boost/orders/:orderId', 
    apiLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      const requestId = generateRequestId();
      
      try {
        const user = await getAuthenticatedUser(req);
        if (!user) {
          const error = new BoostOrderError(
            'Authentication required',
            BoostErrorCode.UNAUTHORIZED_ACCESS,
            401,
            {},
            requestId
          );
          return next(error);
        }

        const { orderId } = req.params;
        
        // Get payment by order ID
        const payment = await storage.getPaymentByOrderId(orderId);
        if (!payment) {
          const error = new BoostOrderError(
            'Boost order not found',
            BoostErrorCode.PAYMENT_FAILED,
            404,
            { orderId },
            requestId
          );
          return next(error);
        }

        // Verify user owns this order
        if (payment.userId !== user.id) {
          const error = new BoostOrderError(
            'You can only view your own boost orders',
            BoostErrorCode.UNAUTHORIZED_ACCESS,
            403,
            { orderId, userId: user.id, paymentUserId: payment.userId },
            requestId
          );
          return next(error);
        }

        return res.json({
          success: true,
          order: {
            id: payment.id,
            orderId: payment.orderId,
            amount: payment.amount,
            status: payment.status,
            paymentType: payment.paymentType,
            billId: payment.billId,
            createdAt: payment.createdAt,
            paidAt: payment.paidAt,
            productIds: payment.productIds
          },
          requestId
        });

      } catch (error) {
        const dbError = new BoostDatabaseError(
          'Failed to fetch boost order status',
          'get_boost_order_status',
          error as Error,
          requestId
        );
        return next(dbError);
      }
    }
  );

  // Global boost error handler
  app.use('/api/boost', handleBoostError);

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

  app.post("/api/products", async (req, res, next) => {
    try {
      // SECURITY FIX: Require proper authentication - no bypass allowed
      const user = await getAuthenticatedUser(req);
      if (!user) {
        await auditSecurity.unauthorizedAccess(req, 'product creation', 'Authentication required');
        return res.status(401).json({ 
          message: "Authentication required", 
          code: "AUTH_REQUIRED" 
        });
      }
      
      // SECURITY FIX: Verify user is a seller
      if (!user.isSeller) {
        await auditSecurity.unauthorizedAccess(req, 'product creation', 'Seller account required');
        return res.status(403).json({ 
          message: "Seller account required", 
          code: "SELLER_REQUIRED" 
        });
      }
      
      // Preprocess the data to handle type mismatches
      const processedData = preprocessProductData(req.body);
      
      // SECURITY FIX: Always use authenticated user's ID, ignore any sellerId in request body
      const productData = {
        ...insertProductSchema.parse(processedData),
        sellerId: user.id // Force seller ID to authenticated user
      };
      
      console.log(`[SECURITY] Product creation by authenticated seller ID: ${user.id}`);
      const product = await storage.createProduct(productData);
      
      // Audit product creation
      await auditResource.create(req, 'product', product.id, {
        name: product.name,
        brand: product.brand,
        price: product.price,
        sellerId: product.sellerId
      });
      
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

      // Preprocess the data to handle type conversions
      const preprocessedData = preprocessProductData({
        ...req.body,
        sellerId: sellerId, // Use the determined sellerId
      });
      
      const validatedData = insertProductSchema.parse(preprocessedData);

      const updatedProduct = await storage.updateProduct(id, validatedData);
      
      // Audit product update
      await auditResource.update(req, 'product', id, {
        changes: validatedData,
        sellerId: sellerId
      });
      
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
        
        // Convert numeric price fields to strings for decimal type
        const convertedAuctionData = {
          ...auctionData,
          ...(auctionData.startingPrice !== undefined && { startingPrice: String(auctionData.startingPrice) }),
          ...(auctionData.reservePrice !== undefined && { reservePrice: String(auctionData.reservePrice) }),
          ...(auctionData.buyNowPrice !== undefined && { buyNowPrice: String(auctionData.buyNowPrice) }),
          ...(auctionData.bidIncrement !== undefined && { bidIncrement: String(auctionData.bidIncrement) }),
          ...(auctionData.currentBid !== undefined && { currentBid: String(auctionData.currentBid) })
        };
        
        // Only update certain fields if there are no bids yet
        if (auction.currentBid) {
          // If there are bids, only allow updating certain fields
          const safeAuctionData = {
            buyNowPrice: convertedAuctionData.buyNowPrice,
            // Add other safe-to-update fields here
          };
          await storage.updateAuction(auctionId, safeAuctionData);
        } else {
          // If no bids yet, can update all fields
          await storage.updateAuction(auctionId, convertedAuctionData);
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
  app.post("/api/auctions", async (req, res, next) => {
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
        try {
          await supabaseFileStorage.deleteFile(image.imageUrl);
          console.log(`Successfully deleted image ${image.imageUrl} from storage`);
        } catch (deleteError: any) {
          console.error(`Failed to delete image ${image.imageUrl} from storage:`, deleteError.message);
          // Continue with database deletion even if storage deletion fails
        }
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
      
      // Audit admin ban/unban action
      if (isBanned) {
        await auditAdmin.banUser(req, id, `User banned by admin ${user.id}`);
      } else {
        await auditLog({
          eventType: AuditEventType.ADMIN_USER_UNBAN,
          severity: AuditSeverity.WARNING,
          userId: user.id,
          userEmail: user.email,
          ipAddress: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown',
          userAgent: req.headers['user-agent'] || 'unknown',
          action: 'Unbanned user',
          resourceType: 'user',
          resourceId: id,
          success: true
        });
      }
      
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
  app.post("/api/messages/upload-file", requireAuth, messageFileUpload.single('file'), async (req: AuthenticatedRequest, res, next) => {
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

      // Check for optimization parameters
      const width = req.query.w ? parseInt(req.query.w as string) : undefined;
      const height = req.query.h ? parseInt(req.query.h as string) : undefined;
      const quality = req.query.q ? parseInt(req.query.q as string) : 90;

      // Determine content type based on file extension or default to jpeg
      let contentType = 'image/jpeg';
      if (imageId.endsWith('.png')) contentType = 'image/png';
      if (imageId.endsWith('.gif')) contentType = 'image/gif';
      if (imageId.endsWith('.webp')) contentType = 'image/webp';

      try {
        // Try to get the image from Supabase Storage
        const { buffer: imageBuffer, mimetype } = await supabaseFileStorage.downloadFile(imageId);

        if (imageBuffer) {
          console.log(`Image ${imageId} found - serving with content type ${mimetype || contentType}`);
          
          // If optimization parameters are provided, process the image
          if (width || height) {
            console.log(`Optimizing image ${imageId} with w=${width}, h=${height}, q=${quality}`);
            
            try {
              // Use sharp to resize and optimize the image
              let sharpInstance = sharp(imageBuffer);
              
              // Apply resizing
              if (width || height) {
                sharpInstance = sharpInstance.resize(width, height, {
                  fit: 'cover', // Ensures the image covers the entire area
                  position: 'center' // Centers the image
                });
              }
              
              // Apply format-specific optimizations
              if (contentType === 'image/jpeg' || !contentType.includes('png')) {
                sharpInstance = sharpInstance.jpeg({ 
                  quality: quality,
                  progressive: true // Progressive JPEGs load better on slow connections
                });
                contentType = 'image/jpeg';
              } else if (contentType === 'image/png') {
                sharpInstance = sharpInstance.png({ 
                  quality: quality,
                  compressionLevel: 9
                });
              }
              
              const optimizedBuffer = await sharpInstance.toBuffer();
              
              // Set headers for optimized image
              res.setHeader('Content-Type', contentType);
              res.setHeader('Cache-Control', 'public, max-age=2592000'); // Cache for 30 days
              res.setHeader('X-Image-Optimized', 'true');
              return res.send(optimizedBuffer);
              
            } catch (optimizationError) {
              console.error(`Error optimizing image ${imageId}:`, optimizationError);
              // Fall back to original image if optimization fails
            }
          }
          
          // If no optimization needed or optimization failed, send original
          res.setHeader('Content-Type', mimetype || contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
          return res.send(imageBuffer);
        }
      } catch (storageError: any) {
        console.log(`Image ${imageId} not found in Supabase storage, checking legacy handler`);
        
        // If it's a legacy image ID, try the legacy handler
        if (isLegacyImageId(imageId)) {
          const legacyResult = await handleLegacyImage(imageId);
          if (legacyResult) {
            console.log(`Serving placeholder for legacy image ${imageId}`);
            res.setHeader('Content-Type', legacyResult.mimetype);
            res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
            return res.send(legacyResult.buffer);
          }
        }
      }

      console.log(`Image ${imageId} not found in storage or legacy handler`);
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

      console.log('📧 OAuth sync request:', { email, providerId, provider });

      if (!providerId || !provider) {
        return res.status(400).json({ 
          message: 'Missing required OAuth information',
          details: 'Provider ID and provider name are required'
        });
      }

      // Email might be missing for some OAuth providers (like Facebook)
      if (!email) {
        console.error('❌ No email provided from OAuth provider:', provider);
        return res.status(400).json({ 
          message: 'Error getting user email from external provider',
          details: 'Email permission may not have been granted. Please ensure you grant email access when logging in with Facebook.'
        });
      }

      // First, check if we already have a user with this email
      let user = await storage.getUserByEmail(email);

      if (user) {
        console.log('✅ Existing user found:', user.id);
        // User exists - return user data directly (Supabase handles sessions)
        return res.status(200).json({ user });
      } else {
        console.log('🆕 Creating new user for email:', email);
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

        console.log('📝 Generated username:', username);

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

        console.log('✅ New user created:', newUser.id);

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
      console.log(`[CREATE] Created new product image record:`, {
        id: productImage.id,
        productId: productImage.productId,
        imageUrl: productImage.imageUrl,
        sellerId: sellerId,
        timestamp: new Date().toISOString()
      });
      
      // Double-check the image was created by querying it back
      const verifyImages = await storage.getProductImages(productId);
      console.log(`[CREATE] Verification - Product ${productId} now has ${verifyImages.length} images`);
      console.log(`[CREATE] Image IDs:`, verifyImages.map(img => img.id));
      
      res.status(200).json(productImage);
    } catch (error) {
      next(error);
    }
  });

  // Handle the /api/product-images/:id/upload endpoint for backward compatibility
  app.post("/api/product-images/:id/upload", imageUpload.single('image'), async (req, res, next) => {
    try {
      console.log('=== Product Image Upload Request ===');
      console.log('URL params:', req.params);
      console.log('Body:', req.body);
      console.log('File:', req.file ? { name: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype } : 'No file');
      console.log('Headers:', req.headers);
      console.log('Auth header present:', !!req.headers.authorization);
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
      
      // Get the product image directly from database
      let foundProductImage = null;
      
      console.log(`[UPLOAD] Step 1: Looking for image ID ${imageId} for seller ${sellerId}`);
      
      try {
        // Method 1: Try direct query first (if we had a getProductImageById method)
        console.log('[UPLOAD] Method 1: Attempting direct image lookup...');
        // Note: This would be ideal but we don't have this method yet
        
        // Method 2: Get all products for seller and search their images
        console.log('[UPLOAD] Method 2: Getting all products for seller...');
        const allProducts = await storage.getProducts();
        const sellerProducts = allProducts.filter(p => p.sellerId === sellerId);
        console.log(`[UPLOAD] Found ${sellerProducts.length} products for seller ${sellerId}`);
        console.log('[UPLOAD] Product IDs:', sellerProducts.map(p => p.id));
        
        for (const product of sellerProducts) {
          console.log(`[UPLOAD] Checking product ${product.id} for images...`);
          const images = await storage.getProductImages(product.id);
          console.log(`[UPLOAD] Product ${product.id} has ${images.length} images:`, images.map(img => ({ id: img.id, url: img.imageUrl })));
          
          const image = images.find(img => img.id === imageId);
          if (image) {
            foundProductImage = image;
            console.log(`[UPLOAD] Found image ${imageId} in product ${product.id}`);
            break;
          }
        }
        
        if (!foundProductImage) {
          // Method 3: Try getting ALL product images across ALL products (emergency fallback)
          console.log('[UPLOAD] Method 3: Emergency fallback - checking ALL products...');
          const allProducts = await storage.getProducts();
          console.log(`[UPLOAD] Total products in system: ${allProducts.length}`);
          
          for (const product of allProducts) {
            const images = await storage.getProductImages(product.id);
            const image = images.find(img => img.id === imageId);
            if (image) {
              console.log(`[UPLOAD] Found image ${imageId} in product ${product.id} (seller: ${product.sellerId})`);
              // Verify this product belongs to the seller
              if (product.sellerId === sellerId) {
                foundProductImage = image;
                console.log('[UPLOAD] Image belongs to correct seller');
              } else {
                console.log(`[UPLOAD] WARNING: Image found but belongs to different seller (${product.sellerId} vs ${sellerId})`);
              }
              break;
            }
          }
        }
      } catch (error) {
        console.error("[UPLOAD] Error finding product image:", error);
      }
      
      console.log(`[UPLOAD] Final result - Found product image:`, foundProductImage);
      
      if (!foundProductImage) {
        console.log(`[UPLOAD] ERROR: Image ${imageId} not found for seller ${sellerId}`);
        console.log('[UPLOAD] Debugging info:', {
          imageId,
          sellerId,
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.url
        });
        return res.status(404).json({ 
          message: "Product image record not found",
          debug: {
            imageId,
            sellerId,
            searchedAt: new Date().toISOString()
          }
        });
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
      
      try {
        // For legacy image IDs, create a new ID since they don't exist in Supabase
        let uploadedFileId;
        if (imageUrl.startsWith("image-id-")) {
          // Generate new file ID for legacy images
          uploadedFileId = await supabaseFileStorage.uploadFile(
            req.file.buffer,
            IMAGE_TYPES.PRODUCT,
            req.file.mimetype
          );
          
          // Update the product image record with the new ID
          await storage.updateProductImage(foundProductImage.id, {
            imageUrl: uploadedFileId
          });
        } else {
          // Try to reuse existing ID for newer formats
          uploadedFileId = await supabaseFileStorage.uploadFile(
            req.file.buffer,
            IMAGE_TYPES.PRODUCT,
            req.file.mimetype,
            imageUrl
          );
        }
        
        console.log(`File uploaded successfully with ID: ${uploadedFileId}`);
        
        // Get the public URL for the uploaded file
        const publicUrl = await supabaseFileStorage.getPublicUrl(uploadedFileId);
        
        // Return success response
        res.status(200).json({
          ...foundProductImage,
          imageUrl: uploadedFileId,
          url: publicUrl,
          message: "Image uploaded successfully"
        });
      } catch (uploadError: any) {
        console.error("Failed to upload file:", uploadError);
        throw uploadError;
      }
    } catch (error: any) {
      console.error("Error in upload handler:", error);
      console.error("Error stack:", error.stack);
      
      // Send a proper error response
      res.status(500).json({ 
        message: error.message || "Failed to upload image",
        error: error.toString()
      });
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
  app.post("/api/messages/action/confirm", requireAuth, async (req: AuthenticatedRequest, res, next) => {
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
  app.post("/api/messages/submit-review/:messageId", requireAuth, async (req: AuthenticatedRequest, res, next) => {
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
  app.post("/api/messages/mark-read", requireAuth, async (req: AuthenticatedRequest, res, next) => {
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
      console.error(`[AUCTION-CHECK] ❌ CRITICAL: Server timezone offset is ${tzOffset} minutes from UTC!`);
      console.error(`[AUCTION-CHECK] ❌ This WILL cause auctions to expire ${Math.abs(tzOffset / 60)} hours off schedule!`);
      console.error(`[AUCTION-CHECK] ❌ Server must run with TZ=UTC environment variable set!`);
    } else {
      console.log(`[AUCTION-CHECK] ✅ Server timezone is UTC (offset: 0 minutes) - Good!`);
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
        const minutesUntilEnd = msUntilEnd / (1000 * 60);
        
        // SAFEGUARD: Add grace period to prevent premature expiration
        // Only mark as expired if it's been at least 1 minute past the end time
        const GRACE_PERIOD_MS = 60 * 1000; // 1 minute grace period
        const isExpired = msUntilEnd < -GRACE_PERIOD_MS;
        
        // SAFEGUARD: Warn if auction appears to have JUST expired
        if (msUntilEnd < 0 && msUntilEnd > -GRACE_PERIOD_MS) {
          console.warn(`[AUCTION-CHECK] ⚠️ GRACE PERIOD: Auction #${auction.id} ended ${Math.abs(minutesUntilEnd).toFixed(2)} minutes ago`);
          console.warn(`[AUCTION-CHECK] ⚠️ Waiting for grace period before marking as expired`);
        }
        
        // SAFEGUARD: Extra validation for auctions that appear to expire too early
        if (isExpired && hoursUntilEnd > -24) { // If expired within last 24 hours
          const createdAt = new Date(auction.startsAt);
          const intendedDuration = auctionEndDateUTC.getTime() - createdAt.getTime();
          const actualDuration = nowUTC.getTime() - createdAt.getTime();
          const durationDiff = Math.abs(intendedDuration - actualDuration);
          
          // If the actual duration is significantly different from intended (> 1 hour difference)
          if (durationDiff > 60 * 60 * 1000) {
            console.error(`[AUCTION-CHECK] ⚠️ SUSPICIOUS EXPIRY: Auction #${auction.id}`);
            console.error(`[AUCTION-CHECK] ⚠️ Intended duration: ${(intendedDuration / (1000 * 60 * 60)).toFixed(2)} hours`);
            console.error(`[AUCTION-CHECK] ⚠️ Actual duration: ${(actualDuration / (1000 * 60 * 60)).toFixed(2)} hours`);
            console.error(`[AUCTION-CHECK] ⚠️ Difference: ${(durationDiff / (1000 * 60 * 60)).toFixed(2)} hours`);
          }
        }
        
        console.log(`[AUCTION-CHECK] Auction #${auction.id}:`);
        console.log(`  - endsAt (stored): ${auction.endsAt}`);
        console.log(`  - endsAt (parsed UTC): ${auctionEndDateUTC.toISOString()}`);
        console.log(`  - endsAt (parsed local): ${auctionEndDateUTC.toString()}`);
        console.log(`  - current time (UTC): ${nowUTC.toISOString()}`);
        console.log(`  - current time (local): ${nowUTC.toString()}`);
        console.log(`  - ms until end: ${msUntilEnd}`);
        console.log(`  - hours until end: ${hoursUntilEnd.toFixed(2)}`);
        console.log(`  - minutes until end: ${minutesUntilEnd.toFixed(2)}`);
        console.log(`  - is expired (with grace): ${isExpired}`);
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
          
          // DIAGNOSTIC LOGGING - Type analysis
          console.log(`\n=== AUCTION ${auction.id} RESERVE PRICE DEBUG ===`);
          console.log(`Reserve Price: ${auction.reservePrice} (type: ${typeof auction.reservePrice})`);
          console.log(`Current Bid: ${auction.currentBid} (type: ${typeof auction.currentBid})`);
          console.log(`Has Reserve Price: ${hasReservePrice}`);
          
          // Convert to numbers for comparison to avoid string comparison issues
          const reservePriceNum = auction.reservePrice ? parseFloat(auction.reservePrice.toString()) : 0;
          const currentBidNum = auction.currentBid ? parseFloat(auction.currentBid.toString()) : 0;
          
          // Validation: Check for invalid number conversions
          if (hasReservePrice && (isNaN(reservePriceNum) || reservePriceNum <= 0)) {
            console.error(`❌ AUCTION ${auction.id} ERROR: Invalid reserve price conversion: ${auction.reservePrice} -> ${reservePriceNum}`);
            continue; // Skip this auction to avoid incorrect processing
          }
          
          if (auction.currentBid !== null && (isNaN(currentBidNum) || currentBidNum < 0)) {
            console.error(`❌ AUCTION ${auction.id} ERROR: Invalid current bid conversion: ${auction.currentBid} -> ${currentBidNum}`);
            continue; // Skip this auction to avoid incorrect processing
          }
          
          console.log(`Reserve Price (number): ${reservePriceNum}`);
          console.log(`Current Bid (number): ${currentBidNum}`);
          
          const reserveNotMet = hasReservePrice && 
            (auction.currentBid === null || currentBidNum < reservePriceNum);
          
          // Additional validation: Double-check the logic before proceeding
          if (hasReservePrice && auction.currentBid !== null && currentBidNum >= reservePriceNum) {
            console.log(`✅ VALIDATION: Reserve price met (${currentBidNum} >= ${reservePriceNum})`);
          } else if (hasReservePrice && (auction.currentBid === null || currentBidNum < reservePriceNum)) {
            console.log(`❌ VALIDATION: Reserve price not met (${currentBidNum} < ${reservePriceNum})`);
          } else {
            console.log(`✅ VALIDATION: No reserve price, auction can complete normally`);
          }
          
          console.log(`Reserve Not Met: ${reserveNotMet} (currentBid null: ${auction.currentBid === null}, currentBid < reserve: ${currentBidNum < reservePriceNum})`);
          console.log(`=== END DEBUG ===\n`);
            
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
            // Regular auction completion flow - RESERVE MET OR NO RESERVE
            console.log(`\n=== AUCTION ${auction.id} SUCCESSFUL COMPLETION ===`);
            console.log(`Reserve was met or no reserve required. Setting status to 'pending'`);
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
  
  // Start auction health monitoring to catch and fix stuck auctions
  import('./auction-health-monitor.js').then(({ startAuctionHealthMonitor }) => {
    startAuctionHealthMonitor();
  }).catch(error => {
    console.error('Failed to start auction health monitor:', error);
  });
  
  // Enhanced function to check for expired featured products with comprehensive error handling
  async function checkAndUpdateExpiredFeaturedProducts() {
    const requestId = generateRequestId();
    
    try {
      console.log(`🔄 [${requestId}] Running featured products expiration check...`);
      
      // Use Supabase-based expiration (no longer uses complex Drizzle transactions)
      const result = await expireFeaturedProductsTransaction();
      
      if (result.expiredCount === 0) {
        console.log(`✅ [${requestId}] No expired featured products found`);
        return;
      }
      
      console.log(`✅ [${requestId}] Successfully expired ${result.expiredCount} featured products`);
      console.log(`📋 [${requestId}] Expired product IDs: ${result.expiredProducts.join(', ')}`);
      
      // Log the successful expiration
      try {
        const { BoostLogger } = await import('./boost-logging');
        BoostLogger.performanceMetric(
          requestId,
          'expire_featured_products',
          Date.now(),
          true,
          { 
            expiredCount: result.expiredCount,
            expiredProducts: result.expiredProducts 
          }
        );
      } catch (logError) {
        console.error('Error logging performance metric:', logError);
      }
      
    } catch (error) {
      console.error(`❌ [${requestId}] Error in featured products expiration check:`, error);
      
      // Log the error with simplified error handling (no complex boost error system)
      try {
        const { BoostLogger } = await import('./boost-logging');
        BoostLogger.logError(
          error as Error,
          'expire_featured_products_scheduled',
          {
            operation: 'expire_featured_products',
            requestId,
            scheduled: true,
            errorMessage: (error as Error).message
          }
        );
      } catch (logError) {
        console.error('Error logging boost error:', logError);
      }
      
      // Don't throw the error - this is a background process
      // We want it to continue running even if one execution fails
    }
  }
  
  // Run the initial check
  checkAndUpdateExpiredFeaturedProducts();
  
  // Set up recurring check for featured product expiration (every 2 minutes for testing)
  setInterval(checkAndUpdateExpiredFeaturedProducts, 2 * 60 * 1000);
  
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

  // Security Dashboard Routes
  const { securityDashboardApi } = await import('./api/security-dashboard');
  
  // Apply admin authentication and rate limiting to all security endpoints
  app.use('/api/security/*', adminLimiter, requireAuth, async (req: AuthenticatedRequest, res, next) => {
    // Check if user is admin
    const user = await storage.getUser(req.user!.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });

  // Authentication metrics
  app.get('/api/security/auth-metrics', async (req, res) => {
    await securityDashboardApi.getAuthenticationMetrics(req, res);
  });

  // Rate limit statistics
  app.get('/api/security/rate-limits', async (req, res) => {
    await securityDashboardApi.getRateLimitStats(req, res);
  });

  // Audit logs
  app.get('/api/security/audit-logs', async (req, res) => {
    await securityDashboardApi.getAuditLogs(req, res);
  });

  // Active sessions
  app.get('/api/security/sessions', async (req, res) => {
    await securityDashboardApi.getActiveSessions(req, res);
  });

  // Security alerts
  app.get('/api/security/alerts', async (req, res) => {
    await securityDashboardApi.getSecurityAlerts(req, res);
  });

  app.post('/api/security/alerts', async (req, res) => {
    await securityDashboardApi.createSecurityAlert(req, res);
  });

  app.post('/api/security/alerts/:alertId/acknowledge', async (req, res) => {
    await securityDashboardApi.acknowledgeAlert(req, res);
  });

  // Suspicious activity detection
  app.get('/api/security/suspicious-activity', async (req, res) => {
    await securityDashboardApi.detectSuspiciousActivity(req, res);
  });

  // Security reports
  app.get('/api/security/reports', async (req, res) => {
    await securityDashboardApi.generateSecurityReport(req, res);
  });

  // Note: Basic health check is defined in server/index.ts before CORS middleware

  // Detailed health check endpoint with database connectivity test
  app.get('/api/health/detailed', async (req, res) => {
    try {
      // Check database connectivity
      const { data, error } = await supabase
        .from('users')
        .select('count')
        .limit(1);
      
      if (error) {
        return res.status(503).json({
          status: 'unhealthy',
          database: 'disconnected',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(200).json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
      });
    } catch (error) {
      return res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Payment verification endpoint for frontend
  app.get('/api/payments/verify-status', async (req, res) => {
    try {
      const { bill_id } = req.query;
      
      if (!bill_id || typeof bill_id !== 'string') {
        return res.status(400).json({ 
          error: 'Missing or invalid bill_id parameter' 
        });
      }
      
      console.log(`🔍 Verifying payment status for bill: ${bill_id}`);
      
      // Get payment from our database
      const payment = await storage.getPaymentByBillId(bill_id);
      if (!payment) {
        return res.status(404).json({ 
          error: 'Payment not found',
          bill_id 
        });
      }
      
      // Get fresh status from Billplz API
      let billplzStatus = null;
      try {
        const billDetails = await billplz.getBill(bill_id);
        billplzStatus = {
          paid: billDetails.paid,
          state: billDetails.state,
          amount: billDetails.amount,
          paid_at: billDetails.paid_at
        };
      } catch (billplzError) {
        console.warn('Failed to fetch bill details from Billplz:', billplzError.message);
        // Continue with database status only
      }
      
      return res.json({
        success: true,
        payment: {
          id: payment.id,
          bill_id: bill_id,
          status: payment.status,
          amount: payment.amount,
          order_id: payment.orderId,
          created_at: payment.createdAt,
          updated_at: payment.updatedAt
        },
        billplz_status: billplzStatus
      });
      
    } catch (error) {
      console.error('❌ Error verifying payment status:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return httpServer;
}
