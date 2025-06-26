import { Express, Request, Response, NextFunction } from 'express';
import { 
  errorHandler, 
  notFoundHandler, 
  asyncHandler, 
  requestIdMiddleware,
  errorRateLimiter 
} from './error-handler';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ExternalServiceError,
  DatabaseError,
  RateLimitError,
  FileError,
  FileSizeError,
  FileTypeError
} from './errors/custom-errors';
import { handleClientError, getClientErrorMetrics, resetClientErrorMetrics } from './client-error-handler';
import { z } from 'zod';

/**
 * Example of how to integrate the error handling system with existing routes
 * This file demonstrates best practices for using the new error system
 */

// Example: Converting existing product creation endpoint
export function setupErrorHandledRoutes(app: Express) {
  // Add request ID middleware globally
  app.use(requestIdMiddleware);

  // Client error reporting endpoints
  app.post('/api/client-errors', errorRateLimiter(), handleClientError);
  app.get('/api/admin/client-errors/metrics', requireAuth, requireAdmin, getClientErrorMetrics);
  app.post('/api/admin/client-errors/reset', requireAuth, requireAdmin, resetClientErrorMetrics);

  // Example: Product creation with proper error handling
  app.post('/api/products', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const user = (req as any).user;
    
    // Validate request body
    try {
      const productData = insertProductSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw ValidationError.fromZodError(error);
      }
      throw error;
    }

    // Check authorization
    if (!user.isSeller) {
      throw new AuthorizationError('Only sellers can create products');
    }

    // Business logic validation
    if (productData.startingPrice < 0) {
      throw new BusinessRuleError('Starting price cannot be negative');
    }

    try {
      // Create product in database
      const product = await storage.createProduct(productData);
      
      res.status(201).json({ product });
    } catch (error) {
      // Handle database errors
      if (error.message.includes('duplicate')) {
        throw new ConflictError('A product with this name already exists');
      }
      
      throw new DatabaseError('Failed to create product', error);
    }
  }));

  // Example: Auction bidding with error handling
  app.post('/api/auctions/:id/bid', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const auctionId = parseInt(req.params.id);
    const { amount } = req.body;
    const user = (req as any).user;

    // Validate auction exists
    const auction = await storage.getAuction(auctionId);
    if (!auction) {
      throw new NotFoundError('Auction', auctionId);
    }

    // Check if auction has ended
    if (new Date() > new Date(auction.endTime)) {
      throw new AuctionEndedError(auctionId);
    }

    // Validate bid amount
    const minimumBid = auction.currentBid + auction.bidIncrement;
    if (amount < minimumBid) {
      throw new BidTooLowError(minimumBid, amount);
    }

    // Process bid
    try {
      const result = await storage.placeBid(auctionId, user.id, amount);
      res.json({ success: true, bid: result });
    } catch (error) {
      if (error.message.includes('insufficient funds')) {
        throw new InsufficientFundsError(amount, user.balance);
      }
      throw error;
    }
  }));

  // Example: File upload with error handling
  app.post('/api/upload', requireAuth, upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    
    if (!file) {
      throw new ValidationError('No file provided');
    }

    // Validate file size
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new FileSizeError(maxSize, file.size);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new FileTypeError(allowedTypes, file.mimetype);
    }

    try {
      const uploadResult = await supabaseFileStorage.uploadFile(file);
      res.json({ url: uploadResult.url });
    } catch (error) {
      throw new ExternalServiceError('Storage', 'Failed to upload file', { originalError: error.message });
    }
  }));

  // Example: Payment processing with error handling
  app.post('/api/payments/process', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { amount, method } = req.body;
    const user = (req as any).user;

    try {
      const result = await billplz.processPayment({
        amount,
        method,
        userId: user.id
      });
      
      res.json({ success: true, paymentId: result.id });
    } catch (error) {
      if (error.code === 'INSUFFICIENT_FUNDS') {
        throw new InsufficientFundsError(amount, user.balance);
      }
      
      if (error.code === 'GATEWAY_ERROR') {
        throw new PaymentGatewayError('Billplz', error.message);
      }
      
      throw new ExternalServiceError('Payment', 'Payment processing failed', { 
        gateway: 'billplz',
        error: error.message 
      });
    }
  }));

  // Example: Rate-limited endpoint
  app.get('/api/search', errorRateLimiter(100, 60000), asyncHandler(async (req: Request, res: Response) => {
    const { query } = req.query;
    
    if (!query || typeof query !== 'string') {
      throw new ValidationError('Search query is required');
    }
    
    const results = await storage.searchProducts(query);
    res.json({ results });
  }));

  // Add 404 handler (should be last)
  app.use(notFoundHandler);
  
  // Add global error handler (should be very last)
  app.use(errorHandler);
}

// Example: Converting callback-based middleware to use error handling
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  
  if (!user) {
    throw new AuthenticationError();
  }
  
  if (!user.isAdmin) {
    throw new AuthorizationError('Admin access required');
  }
  
  next();
}

// Example: Using error handling in WebSocket connections
export function handleWebSocketErrors(ws: WebSocket, error: Error) {
  const appError = createAppError(error);
  
  ws.send(JSON.stringify({
    type: 'error',
    error: {
      message: appError.getSafeMessage(),
      code: appError.code
    }
  }));
  
  // Log WebSocket errors
  logError(appError, {
    context: 'websocket',
    clientId: ws.id
  });
}

// Example: Handling errors in background jobs
export async function processAuctionEndJob(auctionId: number) {
  try {
    await storage.endAuction(auctionId);
  } catch (error) {
    const appError = createAppError(error);
    
    // Log background job errors
    await auditLogger.logError({
      action: 'BACKGROUND_JOB_ERROR',
      userId: 'system',
      resourceType: 'auction',
      resourceId: auctionId.toString(),
      details: {
        job: 'processAuctionEnd',
        error: appError.toJSON()
      },
      severity: 'high',
      ipAddress: 'system',
      userAgent: 'background-job'
    });
    
    // Retry logic based on error type
    if (appError.code === 'DATABASE_ERROR') {
      // Schedule retry
      setTimeout(() => processAuctionEndJob(auctionId), 5000);
    }
  }
}

// Helper imports (these would be from your existing code)
import { requireAuth } from './app-auth';
import { storage } from './storage';
import * as supabaseFileStorage from './supabase-file-storage';
import * as billplz from './billplz';
import { insertProductSchema } from '@shared/schema';
import multer from 'multer';
import { AuctionEndedError, BidTooLowError, InsufficientFundsError, PaymentGatewayError } from './errors/custom-errors';
import { createAppError } from './errors/custom-errors';
import { auditLogger } from './audit-logger';

const upload = multer({ dest: 'uploads/' });