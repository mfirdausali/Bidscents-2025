import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { 
  AppError, 
  createAppError, 
  getStatusCode,
  isOperationalError,
  SecurityError
} from './errors/custom-errors';
import { auditLogger } from './audit-logger';

// Error response interface
interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    requestId: string;
    timestamp: string;
    path?: string;
    method?: string;
    details?: any;
    stack?: string;
  };
}

// Error metrics tracking
class ErrorMetrics {
  private errorCounts: Map<string, number> = new Map();
  private errorRates: Map<string, number[]> = new Map();
  private readonly windowSize = 60000; // 1 minute window

  incrementError(code: string): void {
    const count = this.errorCounts.get(code) || 0;
    this.errorCounts.set(code, count + 1);

    // Track error rate
    const now = Date.now();
    const rates = this.errorRates.get(code) || [];
    rates.push(now);
    
    // Clean old entries
    const cutoff = now - this.windowSize;
    const filtered = rates.filter(time => time > cutoff);
    this.errorRates.set(code, filtered);
  }

  getErrorRate(code: string): number {
    const rates = this.errorRates.get(code) || [];
    return rates.length;
  }

  getErrorCount(code: string): number {
    return this.errorCounts.get(code) || 0;
  }

  getAllMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    for (const [code, count] of this.errorCounts) {
      metrics[code] = {
        totalCount: count,
        ratePerMinute: this.getErrorRate(code)
      };
    }
    
    return metrics;
  }

  reset(): void {
    this.errorCounts.clear();
    this.errorRates.clear();
  }
}

const errorMetrics = new ErrorMetrics();

// Request ID middleware
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
}

// Error logging function
async function logError(error: AppError, req: Request): Promise<void> {
  const errorInfo = {
    requestId: req.id,
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.id,
    stack: error.stack,
    details: error.details,
    timestamp: error.timestamp
  };

  // Log to audit logger
  await auditLogger.logError({
    action: 'ERROR_OCCURRED',
    userId: (req as any).user?.id || 'anonymous',
    resourceType: 'system',
    resourceId: req.path,
    details: errorInfo,
    severity: error.statusCode >= 500 ? 'high' : 'medium',
    ipAddress: req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  });

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error Details:', errorInfo);
  }

  // Track metrics
  errorMetrics.incrementError(error.code);
}

// Check for suspicious patterns
function checkSuspiciousActivity(error: AppError, req: Request): void {
  const errorRate = errorMetrics.getErrorRate(error.code);
  const ip = req.ip || 'unknown';
  
  // Alert thresholds
  const thresholds = {
    AUTHENTICATION_ERROR: 5,
    VALIDATION_ERROR: 20,
    RATE_LIMIT_EXCEEDED: 10,
    SECURITY_ERROR: 3,
    NOT_FOUND: 50
  };

  const threshold = thresholds[error.code as keyof typeof thresholds];
  
  if (threshold && errorRate > threshold) {
    auditLogger.logSecurityEvent({
      action: 'HIGH_ERROR_RATE_DETECTED',
      userId: (req as any).user?.id || 'anonymous',
      resourceType: 'system',
      resourceId: error.code,
      details: {
        errorCode: error.code,
        ratePerMinute: errorRate,
        threshold,
        ip,
        path: req.path
      },
      severity: 'high',
      ipAddress: ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });
  }
}

// Create error response
function createErrorResponse(error: AppError, req: Request): ErrorResponse {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  return {
    error: {
      message: error.getSafeMessage(),
      code: error.code,
      statusCode: error.statusCode,
      requestId: req.id!,
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        path: req.path,
        method: req.method,
        details: error.details,
        stack: error.stack
      })
    }
  };
}

// Global error handler middleware
export async function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Convert to AppError if needed
  const error = createAppError(err);
  
  // Log the error
  await logError(error, req);
  
  // Check for suspicious activity
  checkSuspiciousActivity(error, req);
  
  // Send error response
  const statusCode = getStatusCode(error);
  const response = createErrorResponse(error, req);
  
  res.status(statusCode).json(response);
}

// 404 handler
export function notFoundHandler(req: Request, res: Response): void {
  const error = new AppError(
    `Resource not found: ${req.method} ${req.path}`,
    404,
    'NOT_FOUND',
    true
  );
  
  const response = createErrorResponse(error, req);
  res.status(404).json(response);
}

// Async error wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Error boundary for critical errors
export function criticalErrorHandler(error: Error): void {
  console.error('CRITICAL ERROR:', error);
  
  // Log critical error
  auditLogger.logError({
    action: 'CRITICAL_ERROR',
    userId: 'system',
    resourceType: 'system',
    resourceId: 'server',
    details: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    severity: 'critical',
    ipAddress: 'system',
    userAgent: 'system'
  }).catch(console.error);
  
  // In production, you might want to:
  // - Send alert to monitoring service
  // - Gracefully shutdown if unrecoverable
  // - Restart the process
  
  if (!isOperationalError(error)) {
    process.exit(1);
  }
}

// Process error handlers
process.on('uncaughtException', criticalErrorHandler);
process.on('unhandledRejection', (reason: any) => {
  criticalErrorHandler(new Error(`Unhandled Rejection: ${reason}`));
});

// Rate limiting for error endpoints
const errorEndpointLimiter = new Map<string, number[]>();

export function errorRateLimiter(
  maxRequests: number = 10,
  windowMs: number = 60000
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}-${req.path}`;
    const now = Date.now();
    const requests = errorEndpointLimiter.get(key) || [];
    
    // Filter out old requests
    const validRequests = requests.filter(time => time > now - windowMs);
    
    if (validRequests.length >= maxRequests) {
      const error = new AppError(
        'Too many error requests',
        429,
        'ERROR_RATE_LIMIT',
        true,
        { retryAfter: windowMs / 1000 }
      );
      
      return res.status(429).json(createErrorResponse(error, req));
    }
    
    validRequests.push(now);
    errorEndpointLimiter.set(key, validRequests);
    
    next();
  };
}

// Export metrics for monitoring
export function getErrorMetrics(): Record<string, any> {
  return errorMetrics.getAllMetrics();
}

// Export request ID type augmentation
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}