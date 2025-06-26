/**
 * Comprehensive audit logging system for BidScents
 * Tracks all security-relevant actions for compliance and monitoring
 */

import { db } from './db';
import { auditLogs } from '@shared/schema';
import { createLogger } from './secure-logger';
import type { Request, Response, NextFunction } from 'express';
import { getUserFromToken } from './app-auth';
import type { AuthenticatedRequest } from './app-auth';

const logger = createLogger('AUDIT');

/**
 * Audit event types for different categories of actions
 */
export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED = 'AUTH_LOGIN_FAILED',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_REGISTER = 'AUTH_REGISTER',
  AUTH_PASSWORD_RESET = 'AUTH_PASSWORD_RESET',
  AUTH_EMAIL_VERIFIED = 'AUTH_EMAIL_VERIFIED',
  AUTH_2FA_ENABLED = 'AUTH_2FA_ENABLED',
  AUTH_2FA_DISABLED = 'AUTH_2FA_DISABLED',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  
  // Resource modification events
  RESOURCE_CREATE = 'RESOURCE_CREATE',
  RESOURCE_UPDATE = 'RESOURCE_UPDATE',
  RESOURCE_DELETE = 'RESOURCE_DELETE',
  RESOURCE_RESTORE = 'RESOURCE_RESTORE',
  
  // Admin actions
  ADMIN_USER_BAN = 'ADMIN_USER_BAN',
  ADMIN_USER_UNBAN = 'ADMIN_USER_UNBAN',
  ADMIN_CONTENT_DELETE = 'ADMIN_CONTENT_DELETE',
  ADMIN_CONTENT_RESTORE = 'ADMIN_CONTENT_RESTORE',
  ADMIN_ROLE_CHANGE = 'ADMIN_ROLE_CHANGE',
  ADMIN_CONFIG_CHANGE = 'ADMIN_CONFIG_CHANGE',
  
  // Payment events
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUND = 'PAYMENT_REFUND',
  PAYMENT_DISPUTE = 'PAYMENT_DISPUTE',
  
  // Security violations
  SECURITY_AUTH_FAILURE = 'SECURITY_AUTH_FAILURE',
  SECURITY_RATE_LIMIT = 'SECURITY_RATE_LIMIT',
  SECURITY_CSRF_VIOLATION = 'SECURITY_CSRF_VIOLATION',
  SECURITY_XSS_ATTEMPT = 'SECURITY_XSS_ATTEMPT',
  SECURITY_SQL_INJECTION = 'SECURITY_SQL_INJECTION',
  SECURITY_UNAUTHORIZED_ACCESS = 'SECURITY_UNAUTHORIZED_ACCESS',
  SECURITY_SUSPICIOUS_ACTIVITY = 'SECURITY_SUSPICIOUS_ACTIVITY',
  
  // File operations
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DELETE = 'FILE_DELETE',
  FILE_ACCESS_DENIED = 'FILE_ACCESS_DENIED',
  FILE_MALWARE_DETECTED = 'FILE_MALWARE_DETECTED',
  
  // User actions
  USER_PROFILE_UPDATE = 'USER_PROFILE_UPDATE',
  USER_SETTINGS_CHANGE = 'USER_SETTINGS_CHANGE',
  USER_PRODUCT_CREATE = 'USER_PRODUCT_CREATE',
  USER_PRODUCT_UPDATE = 'USER_PRODUCT_UPDATE',
  USER_PRODUCT_DELETE = 'USER_PRODUCT_DELETE',
  USER_BID_PLACED = 'USER_BID_PLACED',
  USER_MESSAGE_SENT = 'USER_MESSAGE_SENT',
  USER_REVIEW_POSTED = 'USER_REVIEW_POSTED',
  
  // System events
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE',
  SYSTEM_BACKUP = 'SYSTEM_BACKUP',
  SYSTEM_RESTORE = 'SYSTEM_RESTORE'
}

/**
 * Severity levels for audit events
 */
export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Interface for audit log entry
 */
export interface AuditLogEntry {
  eventType: AuditEventType;
  severity: AuditSeverity;
  userId?: number;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  action: string;
  resourceType?: string;
  resourceId?: string | number;
  details?: Record<string, any>;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
  sessionId?: string;
}

/**
 * Extract client information from request
 */
function extractClientInfo(req: Request) {
  const ipAddress = 
    req.headers['x-forwarded-for'] as string ||
    req.socket.remoteAddress ||
    'unknown';
  
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  return { ipAddress, userAgent };
}

/**
 * Get user information from request
 */
async function getUserInfo(req: Request) {
  try {
    const tokenUser = getUserFromToken(req);
    if (tokenUser) {
      return {
        userId: tokenUser.id,
        userEmail: tokenUser.email
      };
    }
  } catch (error) {
    // User not authenticated
  }
  return { userId: undefined, userEmail: undefined };
}

/**
 * Main audit logging function
 */
export async function auditLog(entry: AuditLogEntry) {
  try {
    // Skip database logging in demo mode or if DATABASE_URL is not set
    if (process.env.DEMO_MODE === 'true' || !process.env.DATABASE_URL) {
      // Only log to console in demo mode
      console.log('[DEV] [AUDIT]', 'Audit log entry:', entry);
      return;
    }
    
    // Log to database
    await db.insert(auditLogs).values({
      eventType: entry.eventType,
      severity: entry.severity,
      userId: entry.userId,
      userEmail: entry.userEmail,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId?.toString(),
      details: entry.details,
      success: entry.success,
      errorMessage: entry.errorMessage,
      requestId: entry.requestId,
      sessionId: entry.sessionId,
      createdAt: new Date()
    });
    
    // Also log to secure logger for immediate visibility
    const logLevel = entry.severity === AuditSeverity.ERROR || entry.severity === AuditSeverity.CRITICAL
      ? 'error'
      : 'log';
    
    logger[logLevel](`Audit: ${entry.action}`, {
      eventType: entry.eventType,
      userId: entry.userId,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      success: entry.success
    });
  } catch (error) {
    // In development, just log the audit entry to console
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEV] [AUDIT] Failed to write audit log', error.message);
      console.log('Audit log entry:', entry);
    } else {
      logger.error('Failed to write audit log', error);
      console.error('Audit log entry:', entry);
    }
  }
}

/**
 * Audit logging middleware for automatic request logging
 */
export function auditMiddleware(
  eventType: AuditEventType,
  resourceType?: string,
  getResourceId?: (req: Request) => string | number | undefined
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    
    // Store original methods
    const originalSend = res.send;
    const originalJson = res.json;
    const originalStatus = res.status;
    
    let statusCode = 200;
    let responseData: any;
    
    // Override status method
    res.status = function(code: number) {
      statusCode = code;
      return originalStatus.call(this, code);
    };
    
    // Override send method
    res.send = function(data: any) {
      responseData = data;
      return originalSend.call(this, data);
    };
    
    // Override json method
    res.json = function(data: any) {
      responseData = data;
      return originalJson.call(this, data);
    };
    
    // Continue with request
    next();
    
    // Log after response is sent
    res.on('finish', async () => {
      const duration = Date.now() - startTime;
      const success = statusCode >= 200 && statusCode < 400;
      const resourceId = getResourceId ? getResourceId(req) : undefined;
      
      // Determine severity based on status code
      let severity = AuditSeverity.INFO;
      if (statusCode >= 400 && statusCode < 500) {
        severity = AuditSeverity.WARNING;
      } else if (statusCode >= 500) {
        severity = AuditSeverity.ERROR;
      }
      
      await auditLog({
        eventType,
        severity,
        userId,
        userEmail,
        ipAddress,
        userAgent,
        action: `${req.method} ${req.originalUrl}`,
        resourceType,
        resourceId,
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          statusCode,
          duration,
          bodySize: req.headers['content-length']
        },
        success,
        errorMessage: !success && responseData?.error ? responseData.error : undefined,
        requestId,
        sessionId: req.sessionID
      });
    });
  };
}

/**
 * Specific audit functions for common operations
 */
export const auditAuth = {
  async loginSuccess(req: Request, userId: number, email: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    await auditLog({
      eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
      severity: AuditSeverity.INFO,
      userId,
      userEmail: email,
      ipAddress,
      userAgent,
      action: 'User login successful',
      success: true
    });
  },
  
  async loginFailed(req: Request, email: string, reason: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    await auditLog({
      eventType: AuditEventType.AUTH_LOGIN_FAILED,
      severity: AuditSeverity.WARNING,
      userEmail: email,
      ipAddress,
      userAgent,
      action: 'User login failed',
      details: { reason },
      success: false,
      errorMessage: reason
    });
  },
  
  async logout(req: Request) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.AUTH_LOGOUT,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'User logout',
      success: true
    });
  }
};

export const auditResource = {
  async create(req: Request, resourceType: string, resourceId: string | number, details?: any) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.RESOURCE_CREATE,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: `Created ${resourceType}`,
      resourceType,
      resourceId,
      details,
      success: true
    });
  },
  
  async update(req: Request, resourceType: string, resourceId: string | number, changes?: any) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.RESOURCE_UPDATE,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: `Updated ${resourceType}`,
      resourceType,
      resourceId,
      details: { changes },
      success: true
    });
  },
  
  async delete(req: Request, resourceType: string, resourceId: string | number) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.RESOURCE_DELETE,
      severity: AuditSeverity.WARNING,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: `Deleted ${resourceType}`,
      resourceType,
      resourceId,
      success: true
    });
  }
};

export const auditSecurity = {
  async rateLimitExceeded(req: Request, endpoint: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    await auditLog({
      eventType: AuditEventType.SECURITY_RATE_LIMIT,
      severity: AuditSeverity.WARNING,
      ipAddress,
      userAgent,
      action: 'Rate limit exceeded',
      details: { endpoint },
      success: false,
      errorMessage: 'Too many requests'
    });
  },
  
  async unauthorizedAccess(req: Request, resource: string, reason: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.SECURITY_UNAUTHORIZED_ACCESS,
      severity: AuditSeverity.ERROR,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'Unauthorized access attempt',
      details: { resource, reason },
      success: false,
      errorMessage: reason
    });
  },
  
  // CSRF protection has been removed from the application
  // async csrfViolation(req: Request) {
  //   const { ipAddress, userAgent } = extractClientInfo(req);
  //   await auditLog({
  //     eventType: AuditEventType.SECURITY_CSRF_VIOLATION,
  //     severity: AuditSeverity.CRITICAL,
  //     ipAddress,
  //     userAgent,
  //     action: 'CSRF token validation failed',
  //     details: {
  //       method: req.method,
  //       path: req.path,
  //       headers: req.headers
  //     },
  //     success: false,
  //     errorMessage: 'CSRF validation failed'
  //   });
  // }
};

export const auditPayment = {
  async initiated(req: Request, orderId: string, amount: number, userId: number) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    await auditLog({
      eventType: AuditEventType.PAYMENT_INITIATED,
      severity: AuditSeverity.INFO,
      userId,
      ipAddress,
      userAgent,
      action: 'Payment initiated',
      resourceType: 'payment',
      resourceId: orderId,
      details: { amount },
      success: true
    });
  },
  
  async success(req: Request, orderId: string, transactionId: string, amount: number) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.PAYMENT_SUCCESS,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'Payment successful',
      resourceType: 'payment',
      resourceId: orderId,
      details: { transactionId, amount },
      success: true
    });
  },
  
  async failed(req: Request, orderId: string, reason: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.PAYMENT_FAILED,
      severity: AuditSeverity.WARNING,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'Payment failed',
      resourceType: 'payment',
      resourceId: orderId,
      details: { reason },
      success: false,
      errorMessage: reason
    });
  }
};

export const auditAdmin = {
  async banUser(req: Request, targetUserId: number, reason: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.ADMIN_USER_BAN,
      severity: AuditSeverity.WARNING,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'Banned user',
      resourceType: 'user',
      resourceId: targetUserId,
      details: { reason },
      success: true
    });
  },
  
  async deleteContent(req: Request, contentType: string, contentId: string | number, reason: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.ADMIN_CONTENT_DELETE,
      severity: AuditSeverity.WARNING,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: `Deleted ${contentType}`,
      resourceType: contentType,
      resourceId: contentId,
      details: { reason },
      success: true
    });
  }
};

export const auditFile = {
  async upload(req: Request, fileType: string, fileName: string, fileSize: number) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.FILE_UPLOAD,
      severity: AuditSeverity.INFO,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'File uploaded',
      resourceType: 'file',
      resourceId: fileName,
      details: { fileType, fileSize },
      success: true
    });
  },
  
  async accessDenied(req: Request, fileName: string, reason: string) {
    const { ipAddress, userAgent } = extractClientInfo(req);
    const { userId, userEmail } = await getUserInfo(req);
    await auditLog({
      eventType: AuditEventType.FILE_ACCESS_DENIED,
      severity: AuditSeverity.WARNING,
      userId,
      userEmail,
      ipAddress,
      userAgent,
      action: 'File access denied',
      resourceType: 'file',
      resourceId: fileName,
      details: { reason },
      success: false,
      errorMessage: reason
    });
  }
};

// Export everything
export default {
  auditLog,
  auditMiddleware,
  auditAuth,
  auditResource,
  auditSecurity,
  auditPayment,
  auditAdmin,
  auditFile,
  AuditEventType,
  AuditSeverity
};