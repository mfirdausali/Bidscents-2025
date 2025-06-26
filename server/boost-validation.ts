/**
 * Input validation and sanitization middleware for boost operations
 * Provides comprehensive request validation, sanitization, and security checks
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { BoostOrderError, BoostValidationError, BoostRateLimitError, BoostErrorCode } from './boost-errors';

// Rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Generate request ID for tracking
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Sanitize string input to prevent XSS and injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/['"]/g, '') // Remove quotes
    .replace(/[&]/g, '&amp;') // Escape ampersands
    .slice(0, 1000); // Limit length
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(input: any, min?: number, max?: number): number {
  const num = Number(input);
  
  if (isNaN(num)) {
    throw new BoostValidationError('Invalid number format', 'number', input);
  }
  
  if (min !== undefined && num < min) {
    throw new BoostValidationError(`Number must be at least ${min}`, 'number', input);
  }
  
  if (max !== undefined && num > max) {
    throw new BoostValidationError(`Number must not exceed ${max}`, 'number', input);
  }
  
  return num;
}

/**
 * Validation schemas for boost operations
 */
export const boostValidationSchemas = {
  createBoostOrder: z.object({
    boostPackageId: z.number().int().positive('Boost package ID must be a positive integer'),
    productIds: z.array(z.number().int().positive('Product ID must be a positive integer')).min(1, 'At least one product must be selected'),
    idempotencyKey: z.string().uuid().optional()
  }),

  processBoostPayment: z.object({
    orderId: z.string().min(1).max(100),
    billId: z.string().min(1).max(100),
    amount: z.number().positive('Amount must be positive'),
    status: z.enum(['pending', 'paid', 'failed']),
    signature: z.string().optional()
  }),

  updateBoostStatus: z.object({
    boostId: z.number().int().positive(),
    status: z.enum(['active', 'expired', 'cancelled']),
    reason: z.string().max(500).optional()
  }),

  webhookPayload: z.object({
    billplzid: z.string(),
    billplzpaid: z.string(),
    billplzpaid_at: z.string().optional(),
    x_signature: z.string()
  })
};

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
  boostOrder: { maxRequests: 5, windowMs: 60000 }, // 5 requests per minute
  boostPayment: { maxRequests: 10, windowMs: 60000 }, // 10 requests per minute
  webhookProcessing: { maxRequests: 100, windowMs: 60000 } // 100 requests per minute
};

/**
 * Rate limiting middleware
 */
export function createRateLimiter(operation: keyof typeof RATE_LIMITS) {
  return (req: Request, res: Response, next: NextFunction) => {
    const limit = RATE_LIMITS[operation];
    const clientId = req.ip + ':' + (req.user?.id || 'anonymous');
    const key = `${operation}:${clientId}`;
    const now = Date.now();
    
    // Clean expired entries
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime <= now) {
        rateLimitStore.delete(k);
      }
    }
    
    const record = rateLimitStore.get(key);
    
    if (!record) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + limit.windowMs
      });
      return next();
    }
    
    if (record.resetTime <= now) {
      record.count = 1;
      record.resetTime = now + limit.windowMs;
      return next();
    }
    
    if (record.count >= limit.maxRequests) {
      const error = new BoostRateLimitError(
        `Rate limit exceeded for ${operation}`,
        limit.maxRequests,
        limit.windowMs,
        generateRequestId()
      );
      return next(error);
    }
    
    record.count++;
    next();
  };
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequest(req: Request, res: Response, next: NextFunction) {
  const requestId = generateRequestId();
  req.requestId = requestId;
  
  // Sanitize body
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        req.body[key] = sanitizeString(value);
      }
    }
  }
  
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') {
        req.query[key] = sanitizeString(value);
      }
    }
  }
  
  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    for (const [key, value] of Object.entries(req.params)) {
      if (typeof value === 'string') {
        req.params[key] = sanitizeString(value);
      }
    }
  }
  
  next();
}

/**
 * Validation middleware factory
 */
export function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new BoostValidationError(
          'Validation failed',
          error.errors[0]?.path?.join('.') || 'unknown',
          error.errors[0]?.message || 'Invalid input',
          req.requestId
        );
        return next(validationError);
      }
      next(error);
    }
  };
}

/**
 * CSRF validation middleware for boost operations
 * @deprecated CSRF protection has been removed from the application
 */
export function validateBoostCSRF(req: Request, res: Response, next: NextFunction) {
  // CSRF protection has been removed - this is now a no-op
  return next();
}

/**
 * Idempotency check middleware
 */
const idempotencyStore = new Map<string, { result: any; timestamp: number }>();
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function checkIdempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['idempotency-key'] as string || req.body.idempotencyKey;
  
  if (!key) {
    return next(); // Idempotency is optional
  }
  
  const userId = req.user?.id;
  const idempotencyKey = `${userId}:${key}`;
  const now = Date.now();
  
  // Clean expired entries
  for (const [k, v] of idempotencyStore.entries()) {
    if (v.timestamp + IDEMPOTENCY_TTL <= now) {
      idempotencyStore.delete(k);
    }
  }
  
  const existing = idempotencyStore.get(idempotencyKey);
  if (existing) {
    // Return the cached result
    return res.status(200).json(existing.result);
  }
  
  // Store the idempotency key for this request
  req.idempotencyKey = idempotencyKey;
  next();
}

/**
 * Store idempotent response
 */
export function storeIdempotentResponse(key: string, result: any) {
  if (key) {
    idempotencyStore.set(key, {
      result,
      timestamp: Date.now()
    });
  }
}

/**
 * Webhook signature validation
 */
export function validateWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-signature'] as string;
  const body = JSON.stringify(req.body);
  
  if (!signature) {
    const error = new BoostOrderError(
      'Webhook signature missing',
      BoostErrorCode.WEBHOOK_VALIDATION_FAILED,
      401,
      { type: 'signature_missing' },
      req.requestId
    );
    return next(error);
  }
  
  try {
    // Validate webhook signature using your secret key
    const webhookSecret = process.env.BILLPLZ_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured');
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      const error = new BoostOrderError(
        'Invalid webhook signature',
        BoostErrorCode.WEBHOOK_VALIDATION_FAILED,
        401,
        { type: 'signature_invalid' },
        req.requestId
      );
      return next(error);
    }
    
    next();
  } catch (error) {
    const validationError = new BoostOrderError(
      'Webhook validation failed',
      BoostErrorCode.WEBHOOK_VALIDATION_FAILED,
      500,
      { error: error.message },
      req.requestId
    );
    return next(validationError);
  }
}

/**
 * Input length validation
 */
export function validateInputLengths(req: Request, res: Response, next: NextFunction) {
  const maxLengths = {
    productId: 20,
    packageId: 20,
    orderId: 100,
    billId: 100,
    reason: 500,
    idempotencyKey: 100
  };
  
  for (const [field, maxLength] of Object.entries(maxLengths)) {
    const value = req.body[field];
    if (value && typeof value === 'string' && value.length > maxLength) {
      const error = new BoostValidationError(
        `${field} exceeds maximum length of ${maxLength}`,
        field,
        value.length,
        req.requestId
      );
      return next(error);
    }
  }
  
  next();
}

/**
 * Comprehensive boost validation middleware stack
 */
export const boostValidationMiddleware = {
  // For boost order creation
  createOrder: [
    sanitizeRequest,
    createRateLimiter('boostOrder'),
    validateInputLengths,
    validateRequest(boostValidationSchemas.createBoostOrder),
    validateBoostCSRF,
    checkIdempotency
  ],
  
  // For payment processing
  processPayment: [
    sanitizeRequest,
    createRateLimiter('boostPayment'),
    validateInputLengths,
    validateRequest(boostValidationSchemas.processBoostPayment),
    validateBoostCSRF
  ],
  
  // For webhook processing
  processWebhook: [
    sanitizeRequest,
    createRateLimiter('webhookProcessing'),
    validateWebhookSignature,
    validateRequest(boostValidationSchemas.webhookPayload)
  ],
  
  // For status updates
  updateStatus: [
    sanitizeRequest,
    validateInputLengths,
    validateRequest(boostValidationSchemas.updateBoostStatus),
    validateBoostCSRF
  ]
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      idempotencyKey?: string;
      user?: any;
    }
  }
}