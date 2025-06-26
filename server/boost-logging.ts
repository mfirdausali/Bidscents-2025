/**
 * Comprehensive logging system for boost operations
 * Provides structured logging for debugging, monitoring, and audit trails
 */

import { Request } from 'express';
import { BoostOrderError } from './boost-errors';

// Log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Log categories
export enum LogCategory {
  BOOST_ORDER = 'boost_order',
  BOOST_PAYMENT = 'boost_payment',
  BOOST_WEBHOOK = 'boost_webhook',
  BOOST_VALIDATION = 'boost_validation',
  BOOST_TRANSACTION = 'boost_transaction',
  BOOST_ERROR = 'boost_error',
  BOOST_SECURITY = 'boost_security',
  BOOST_PERFORMANCE = 'boost_performance'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  requestId?: string;
  userId?: number;
  transactionId?: string;
  message: string;
  data?: Record<string, any>;
  context?: Record<string, any>;
  duration?: number;
  tags?: string[];
}

interface PerformanceMetrics {
  requestId: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  errorCode?: string;
  metadata?: Record<string, any>;
}

// Performance tracking store
const performanceStore = new Map<string, PerformanceMetrics>();

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const emoji = {
    [LogLevel.DEBUG]: '🔍',
    [LogLevel.INFO]: 'ℹ️',
    [LogLevel.WARN]: '⚠️',
    [LogLevel.ERROR]: '❌',
    [LogLevel.CRITICAL]: '🚨'
  };

  const prefix = `${emoji[entry.level]} [${entry.timestamp}] [${entry.category.toUpperCase()}]`;
  const context = entry.requestId ? ` [${entry.requestId}]` : '';
  const transaction = entry.transactionId ? ` [TX:${entry.transactionId}]` : '';
  const user = entry.userId ? ` [User:${entry.userId}]` : '';
  const duration = entry.duration ? ` (${entry.duration}ms)` : '';
  
  let logLine = `${prefix}${context}${transaction}${user} ${entry.message}${duration}`;
  
  if (entry.data && Object.keys(entry.data).length > 0) {
    logLine += `\n📋 Data: ${JSON.stringify(entry.data, null, 2)}`;
  }
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    logLine += `\n🔧 Context: ${JSON.stringify(entry.context, null, 2)}`;
  }
  
  if (entry.tags && entry.tags.length > 0) {
    logLine += `\n🏷️ Tags: ${entry.tags.join(', ')}`;
  }
  
  return logLine;
}

/**
 * Core logging function
 */
function log(entry: LogEntry): void {
  const formattedLog = formatLogEntry(entry);
  
  // Output to console based on log level
  switch (entry.level) {
    case LogLevel.DEBUG:
      if (process.env.NODE_ENV === 'development') {
        console.debug(formattedLog);
      }
      break;
    case LogLevel.INFO:
      console.log(formattedLog);
      break;
    case LogLevel.WARN:
      console.warn(formattedLog);
      break;
    case LogLevel.ERROR:
    case LogLevel.CRITICAL:
      console.error(formattedLog);
      break;
  }
  
  // In production, you might want to send logs to external services
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with logging services like Winston, DataDog, etc.
    // sendToExternalLoggingService(entry);
  }
}

/**
 * Create a log entry with common fields
 */
function createLogEntry(
  level: LogLevel,
  category: LogCategory,
  message: string,
  options: {
    requestId?: string;
    userId?: number;
    transactionId?: string;
    data?: Record<string, any>;
    context?: Record<string, any>;
    duration?: number;
    tags?: string[];
  } = {}
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ...options
  };
}

/**
 * Boost order logging functions
 */
export const BoostLogger = {
  // Boost order operations
  orderCreated: (requestId: string, userId: number, data: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_ORDER,
      'Boost order created successfully',
      { requestId, userId, data, tags: ['order_created', 'success'] }
    ));
  },

  orderFailed: (requestId: string, userId: number, error: string, context: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.ERROR,
      LogCategory.BOOST_ORDER,
      `Boost order creation failed: ${error}`,
      { requestId, userId, context, tags: ['order_failed', 'error'] }
    ));
  },

  // Boost payment operations
  paymentInitiated: (requestId: string, userId: number, amount: number, orderId: string) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_PAYMENT,
      'Boost payment initiated',
      { 
        requestId, 
        userId, 
        data: { amount, orderId },
        tags: ['payment_initiated'] 
      }
    ));
  },

  paymentCompleted: (requestId: string, paymentId: number, billId: string, status: string) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_PAYMENT,
      `Boost payment completed with status: ${status}`,
      { 
        requestId, 
        data: { paymentId, billId, status },
        tags: ['payment_completed', status] 
      }
    ));
  },

  paymentFailed: (requestId: string, error: string, context: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.ERROR,
      LogCategory.BOOST_PAYMENT,
      `Boost payment failed: ${error}`,
      { requestId, context, tags: ['payment_failed', 'error'] }
    ));
  },

  // Webhook operations
  webhookReceived: (requestId: string, billId: string, payload: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_WEBHOOK,
      `Boost webhook received for bill: ${billId}`,
      { 
        requestId, 
        data: { billId, ...payload },
        tags: ['webhook_received'] 
      }
    ));
  },

  webhookProcessed: (requestId: string, billId: string, result: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_WEBHOOK,
      `Boost webhook processed successfully for bill: ${billId}`,
      { 
        requestId, 
        data: { billId, ...result },
        tags: ['webhook_processed', 'success'] 
      }
    ));
  },

  webhookFailed: (requestId: string, billId: string, error: string, context: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.ERROR,
      LogCategory.BOOST_WEBHOOK,
      `Boost webhook processing failed for bill: ${billId}: ${error}`,
      { requestId, context, tags: ['webhook_failed', 'error'] }
    ));
  },

  // Validation operations
  validationPassed: (requestId: string, operation: string, data: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.DEBUG,
      LogCategory.BOOST_VALIDATION,
      `Validation passed for ${operation}`,
      { requestId, data, tags: ['validation_passed'] }
    ));
  },

  validationFailed: (requestId: string, operation: string, errors: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.WARN,
      LogCategory.BOOST_VALIDATION,
      `Validation failed for ${operation}`,
      { requestId, data: errors, tags: ['validation_failed'] }
    ));
  },

  // Transaction operations
  transactionStarted: (requestId: string, transactionId: string, operation: string) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_TRANSACTION,
      `Transaction started for ${operation}`,
      { requestId, transactionId, tags: ['transaction_started'] }
    ));
  },

  transactionCommitted: (requestId: string, transactionId: string, duration: number) => {
    log(createLogEntry(
      LogLevel.INFO,
      LogCategory.BOOST_TRANSACTION,
      'Transaction committed successfully',
      { requestId, transactionId, duration, tags: ['transaction_committed', 'success'] }
    ));
  },

  transactionRolledBack: (requestId: string, transactionId: string, reason: string) => {
    log(createLogEntry(
      LogLevel.WARN,
      LogCategory.BOOST_TRANSACTION,
      `Transaction rolled back: ${reason}`,
      { requestId, transactionId, tags: ['transaction_rollback'] }
    ));
  },

  // Error operations
  errorHandled: (error: BoostOrderError, context: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.ERROR,
      LogCategory.BOOST_ERROR,
      `Boost error handled: ${error.message}`,
      { 
        requestId: error.requestId,
        data: { 
          errorCode: error.code,
          statusCode: error.statusCode,
          details: error.details 
        },
        context,
        tags: ['error_handled', error.code]
      }
    ));
  },

  // Security operations
  securityViolation: (requestId: string, violation: string, context: Record<string, any>) => {
    log(createLogEntry(
      LogLevel.CRITICAL,
      LogCategory.BOOST_SECURITY,
      `Security violation detected: ${violation}`,
      { requestId, context, tags: ['security_violation', 'critical'] }
    ));
  },

  rateLimitExceeded: (requestId: string, ip: string, operation: string) => {
    log(createLogEntry(
      LogLevel.WARN,
      LogCategory.BOOST_SECURITY,
      `Rate limit exceeded for ${operation}`,
      { 
        requestId, 
        data: { ip, operation },
        tags: ['rate_limit_exceeded'] 
      }
    ));
  },

  // Performance operations
  performanceMetric: (requestId: string, operation: string, duration: number, success: boolean, metadata?: Record<string, any>) => {
    const level = duration > 5000 ? LogLevel.WARN : LogLevel.INFO; // Warn if operation takes > 5 seconds
    
    log(createLogEntry(
      level,
      LogCategory.BOOST_PERFORMANCE,
      `Performance metric for ${operation}`,
      { 
        requestId, 
        duration,
        data: { operation, success, duration, ...metadata },
        tags: ['performance', success ? 'success' : 'failure']
      }
    ));
  }
};

/**
 * Performance tracking utilities
 */
export const PerformanceTracker = {
  start: (requestId: string, operation: string, metadata?: Record<string, any>): void => {
    performanceStore.set(requestId, {
      requestId,
      operation,
      startTime: Date.now(),
      success: false,
      metadata
    });
  },

  end: (requestId: string, success: boolean = true, errorCode?: string): void => {
    const metric = performanceStore.get(requestId);
    if (metric) {
      const endTime = Date.now();
      const duration = endTime - metric.startTime;
      
      metric.endTime = endTime;
      metric.duration = duration;
      metric.success = success;
      metric.errorCode = errorCode;
      
      BoostLogger.performanceMetric(
        requestId,
        metric.operation,
        duration,
        success,
        { ...metric.metadata, errorCode }
      );
      
      performanceStore.delete(requestId);
    }
  },

  measure: async <T>(
    requestId: string,
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> => {
    PerformanceTracker.start(requestId, operation, metadata);
    
    try {
      const result = await fn();
      PerformanceTracker.end(requestId, true);
      return result;
    } catch (error) {
      PerformanceTracker.end(requestId, false, error.code || 'unknown_error');
      throw error;
    }
  }
};

/**
 * Request logging middleware
 */
export function logRequest(req: Request, category: LogCategory = LogCategory.BOOST_ORDER): void {
  const requestId = req.requestId || 'unknown';
  const userId = req.user?.id;
  
  log(createLogEntry(
    LogLevel.INFO,
    category,
    `${req.method} ${req.path} - Request received`,
    {
      requestId,
      userId,
      data: {
        method: req.method,
        path: req.path,
        query: req.query,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      },
      tags: ['request_received']
    }
  ));
}

/**
 * Response logging middleware
 */
export function logResponse(req: Request, statusCode: number, category: LogCategory = LogCategory.BOOST_ORDER): void {
  const requestId = req.requestId || 'unknown';
  const userId = req.user?.id;
  
  const level = statusCode >= 400 ? LogLevel.ERROR : LogLevel.INFO;
  
  log(createLogEntry(
    level,
    category,
    `${req.method} ${req.path} - Response sent`,
    {
      requestId,
      userId,
      data: {
        method: req.method,
        path: req.path,
        statusCode
      },
      tags: ['response_sent', statusCode >= 400 ? 'error' : 'success']
    }
  ));
}

/**
 * Cleanup old performance metrics (call periodically)
 */
export function cleanupPerformanceMetrics(): void {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  
  for (const [requestId, metric] of performanceStore.entries()) {
    if (metric.startTime < oneHourAgo) {
      console.warn(`🧹 Cleaning up stale performance metric: ${requestId} (operation: ${metric.operation})`);
      performanceStore.delete(requestId);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupPerformanceMetrics, 30 * 60 * 1000);

// Export the main logger for backwards compatibility
export default BoostLogger;