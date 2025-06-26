import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { auditSecurity } from './audit-logger';
import { trackRateLimitViolation } from './security-tracking';

// SECURITY: Comprehensive rate limiting to prevent brute force attacks and API abuse

// Helper to create key generator with IP + user agent fingerprinting
const createKeyGenerator = (includeUserId = false) => {
  return (req: Request & { userId?: string }) => {
    const baseKey = req.ip + ':' + req.get('user-agent');
    if (includeUserId && req.userId) {
      return baseKey + ':' + req.userId;
    }
    return baseKey;
  };
};

// Progressive delay handler for repeated violations
const progressiveDelayHandler = (req: Request, res: any, next: any, options: any) => {
  const retryAfter = Math.round(options.windowMs / 1000);
  
  // Track rate limit violation
  trackRateLimitViolation(req, req.path).catch(err => {
    console.error('Failed to track rate limit violation:', err);
  });
  
  // Audit rate limit violation
  auditSecurity.rateLimitExceeded(req, req.path).catch(err => {
    console.error('Failed to audit rate limit violation:', err);
  });
  
  res.status(options.statusCode).json({
    error: options.message,
    retryAfter,
    resetTime: new Date(Date.now() + options.windowMs).toISOString()
  });
};

// === AUTHENTICATION RATE LIMITERS ===

// Strict rate limit for authentication endpoints (login, register)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Increased from 5 to 20 requests per windowMs
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: createKeyGenerator(false),
  handler: progressiveDelayHandler
});

// Moderate rate limit for password reset and email verification
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset requests per hour
  message: 'Too many password reset attempts, please try again later',
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: createKeyGenerator(false),
  handler: progressiveDelayHandler
});

// Strict rate limit for user enumeration endpoints
export const userLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 lookups per 15 minutes
  message: 'Too many lookup requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// === RESOURCE CREATION RATE LIMITERS ===

// Rate limiter for creating products, auctions
export const resourceCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 creations per hour per user
  message: 'Too many resource creation attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: createKeyGenerator(true)
});

// Rate limiter for reviews and ratings
export const reviewLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // 10 reviews per day per user
  message: 'Too many review submissions, please try again tomorrow',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// === PAYMENT RATE LIMITERS ===

// Strict rate limiter for payment endpoints
export const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 payment attempts per hour
  message: 'Too many payment attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true),
  handler: progressiveDelayHandler
});

// Webhook rate limiter (more permissive for legitimate webhook calls)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 webhook calls per minute
  message: 'Too many webhook requests',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// === FILE UPLOAD RATE LIMITERS ===

// Strict rate limiter for file uploads
export const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour per user
  message: 'Too many file uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// Very strict limiter for profile image uploads
export const profileImageLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // 5 profile image updates per day
  message: 'Too many profile image updates, please try again tomorrow',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// === MESSAGING RATE LIMITERS ===

// Rate limiter for sending messages
export const messagingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute per user
  message: 'Too many messages sent, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// Rate limiter for message file uploads
export const messageFileLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 file messages per hour
  message: 'Too many file uploads in messages, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// === GENERAL API RATE LIMITERS ===

// General API rate limit for read operations
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// More generous limiter for public read endpoints
export const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Authenticated read operations limiter
export const authenticatedReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per 15 minutes for authenticated users
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true)
});

// === ADMIN RATE LIMITERS ===

// Admin endpoints rate limit (more permissive)
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Higher limit for admin operations
  message: 'Too many admin requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true)
});

// === SPECIALIZED RATE LIMITERS ===

// Auction bidding rate limiter
export const biddingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 bids per minute (to allow competitive bidding)
  message: 'Too many bids, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// Search endpoint rate limiter
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Too many search requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

// Boost operations rate limiter
export const boostLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 boost operations per hour
  message: 'Too many boost operations, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: createKeyGenerator(true)
});

// Cart operations rate limiter
export const cartLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 cart operations per minute
  message: 'Too many cart operations, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: createKeyGenerator(true)
});

// Social preview generation limiter
export const socialPreviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 preview generations per hour
  message: 'Too many preview requests',
  standardHeaders: true,
  legacyHeaders: false
});