/**
 * Unified Security Configuration
 * Central configuration for all security features in BidScents
 */

import { initializeRedisStores, getRedisHealth } from './redis-init';
import { initializeAuthService, getAuthService } from './auth-service';
import * as rateLimiters from './rate-limiter-redis';
import * as ownership from './middleware/ownership';
import { validateRequest, ValidationSchemas } from './validation-schemas';
import * as secureUpload from './middleware/secure-upload';
import { requestIdMiddleware, errorHandler, asyncHandler } from './error-handler';
import { securityTrackingMiddleware, sessionActivityMiddleware } from './security-tracking';
import { AuditLogger } from './audit-logger';
import { HealthCheckService } from './health-check';
import { IStorage } from './storage';
import { SupabaseClient } from '@supabase/supabase-js';
import { Application } from 'express';
import { Pool } from 'pg';
import { WebSocketServer } from 'ws';

/**
 * Security configuration options
 */
export interface SecurityConfig {
  storage: IStorage;
  supabase: SupabaseClient;
  pool: Pool;
  wss?: WebSocketServer;
  redis?: {
    url: string;
    enableFallback?: boolean;
  };
  security?: {
    enableAuditLogging?: boolean;
    enableSecurityDashboard?: boolean;
    enableFileScanning?: boolean;
    enableRateLimiting?: boolean;
    enableCSRF?: boolean;
  };
}

/**
 * Security context containing all security services
 */
export interface SecurityContext {
  authService: ReturnType<typeof getAuthService>;
  auditLogger: AuditLogger;
  healthCheck: HealthCheckService;
  middleware: {
    // Core middleware
    requestId: typeof requestIdMiddleware;
    errorHandler: typeof errorHandler;
    asyncHandler: typeof asyncHandler;
    
    // Authentication
    requireAuth: ReturnType<typeof getAuthService>['requireAuth'];
    requireRole: ReturnType<typeof getAuthService>['requireRole'];
    
    // Security
    validateCSRF: typeof validateCSRF;
    securityTracking: typeof securityTrackingMiddleware;
    sessionActivity: typeof sessionActivityMiddleware;
    
    // Rate limiting
    rateLimiters: typeof rateLimiters;
    
    // Ownership
    ownership: typeof ownership;
    
    // Validation
    validateRequest: typeof validateRequest;
    
    // File upload
    upload: typeof secureUpload;
  };
  schemas: typeof ValidationSchemas;
}

/**
 * Initialize all security features
 */
export async function initializeSecurity(config: SecurityConfig): Promise<SecurityContext> {
  console.log('🔐 Initializing BidScents Security System...');
  
  // 1. Initialize Redis if configured
  if (config.redis?.url) {
    console.log('📦 Initializing Redis stores...');
    await initializeRedisStores();
    const redisHealth = getRedisHealth();
    console.log(`✅ Redis: ${redisHealth.status} (${redisHealth.connectedClients} clients)`);
  } else {
    console.log('⚠️  Redis not configured - using in-memory fallback');
  }
  
  // 2. Initialize authentication service
  console.log('🔑 Initializing authentication service...');
  const authService = initializeAuthService(config.storage, config.supabase);
  console.log('✅ Authentication service ready');
  
  // 3. Initialize audit logger
  console.log('📝 Initializing audit logger...');
  const auditLogger = new AuditLogger(config.storage);
  console.log('✅ Audit logger ready');
  
  // 4. Initialize health check service
  console.log('🏥 Initializing health check service...');
  const healthCheck = new HealthCheckService(
    config.storage,
    config.supabase,
    config.pool,
    config.wss
  );
  console.log('✅ Health check service ready');
  
  // 5. Create security context
  const context: SecurityContext = {
    authService,
    auditLogger,
    healthCheck,
    middleware: {
      // Core
      requestId: requestIdMiddleware,
      errorHandler,
      asyncHandler,
      
      // Authentication
      requireAuth: authService.requireAuth,
      requireRole: authService.requireRole,
      
      // Security
      validateCSRF: config.security?.enableCSRF !== false ? validateCSRF : (req, res, next) => next(),
      securityTracking: securityTrackingMiddleware,
      sessionActivity: sessionActivityMiddleware,
      
      // Rate limiting
      rateLimiters: config.security?.enableRateLimiting !== false ? rateLimiters : createNoOpRateLimiters(),
      
      // Ownership
      ownership,
      
      // Validation
      validateRequest,
      
      // File upload
      upload: secureUpload
    },
    schemas: ValidationSchemas
  };
  
  console.log('✅ Security system initialized successfully');
  return context;
}

/**
 * Apply core security middleware to Express app
 */
export function applySecurityMiddleware(app: Application, security: SecurityContext): void {
  console.log('🛡️  Applying security middleware...');
  
  // 1. Request tracking (must be first)
  app.use(security.middleware.requestId);
  
  // 2. Security tracking
  app.use(security.middleware.securityTracking);
  
  // 3. Session activity tracking for authenticated routes
  app.use('/api/*', (req, res, next) => {
    // Skip for public endpoints
    const publicEndpoints = ['/api/products', '/api/categories'];
    if (publicEndpoints.some(endpoint => req.path.startsWith(endpoint))) {
      return next();
    }
    security.middleware.sessionActivity(req, res, next);
  });
  
  // 4. CSRF token endpoint
  
  console.log('✅ Security middleware applied');
}

/**
 * Apply error handling middleware (must be last)
 */
export function applyErrorHandling(app: Application, security: SecurityContext): void {
  app.use(security.middleware.errorHandler);
  console.log('✅ Error handling middleware applied');
}

/**
 * Create no-op rate limiters for development
 */
function createNoOpRateLimiters(): typeof rateLimiters {
  const noOpLimiter = (req: any, res: any, next: any) => next();
  
  return new Proxy({} as typeof rateLimiters, {
    get: () => noOpLimiter
  });
}

/**
 * Graceful shutdown for security services
 */
export async function shutdownSecurity(): Promise<void> {
  console.log('🔒 Shutting down security services...');
  
  try {
    // Shutdown Redis connections
    const { shutdownRedisStores } = await import('./redis-init');
    await shutdownRedisStores();
    
    console.log('✅ Security services shut down successfully');
  } catch (error) {
    console.error('❌ Error shutting down security services:', error);
  }
}

/**
 * Security best practices enforcer
 */
export function enforceSecurityHeaders(app: Application): void {
  // This is handled by helmet in security-middleware.ts
  // But we can add additional headers here if needed
  app.use((req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Feature policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
  });
}

/**
 * Example usage in server initialization:
 * 
 * ```typescript
 * import { initializeSecurity, applySecurityMiddleware, applyErrorHandling } from './security-config';
 * 
 * // Initialize security
 * const security = await initializeSecurity({
 *   storage,
 *   supabase,
 *   pool,
 *   wss,
 *   redis: { url: process.env.REDIS_URL }
 * });
 * 
 * // Apply middleware
 * applySecurityMiddleware(app, security);
 * 
 * // ... your routes ...
 * 
 * // Apply error handling (must be last)
 * applyErrorHandling(app, security);
 * ```
 */

export default {
  initializeSecurity,
  applySecurityMiddleware,
  applyErrorHandling,
  shutdownSecurity,
  enforceSecurityHeaders
};