import { Request, Response } from 'express';
import { z } from 'zod';
import { auditLogger } from './audit-logger';
import { asyncHandler } from './error-handler';

// Schema for client error reports
const clientErrorSchema = z.object({
  type: z.enum(['error', 'unhandledRejection', 'errorBoundary']).optional(),
  message: z.string(),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  errorId: z.string().optional(),
  url: z.string(),
  userAgent: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.any()).optional()
});

// Client error metrics
class ClientErrorMetrics {
  private errors: Map<string, number> = new Map();
  private errorsByUrl: Map<string, number> = new Map();
  private errorsByType: Map<string, number> = new Map();

  recordError(url: string, type: string = 'error'): void {
    // Count total errors
    const totalKey = 'total';
    this.errors.set(totalKey, (this.errors.get(totalKey) || 0) + 1);

    // Count by URL
    this.errorsByUrl.set(url, (this.errorsByUrl.get(url) || 0) + 1);

    // Count by type
    this.errorsByType.set(type, (this.errorsByType.get(type) || 0) + 1);
  }

  getMetrics() {
    return {
      total: this.errors.get('total') || 0,
      byUrl: Object.fromEntries(this.errorsByUrl),
      byType: Object.fromEntries(this.errorsByType)
    };
  }

  reset(): void {
    this.errors.clear();
    this.errorsByUrl.clear();
    this.errorsByType.clear();
  }
}

const clientErrorMetrics = new ClientErrorMetrics();

// Handle client error reports
export const handleClientError = asyncHandler(async (
  req: Request,
  res: Response
): Promise<void> => {
  const result = clientErrorSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: {
        message: 'Invalid error report format',
        code: 'INVALID_ERROR_REPORT'
      }
    });
    return;
  }

  const errorReport = result.data;
  const userId = (req as any).user?.id || 'anonymous';

  // Record metrics
  clientErrorMetrics.recordError(errorReport.url, errorReport.type);

  // Log to audit logger
  await auditLogger.logError({
    action: 'CLIENT_ERROR',
    userId,
    resourceType: 'client',
    resourceId: errorReport.errorId || 'unknown',
    details: {
      type: errorReport.type || 'error',
      message: errorReport.message,
      url: errorReport.url,
      userAgent: errorReport.userAgent,
      stack: errorReport.stack,
      componentStack: errorReport.componentStack,
      metadata: errorReport.metadata,
      clientTimestamp: errorReport.timestamp
    },
    severity: determineErrorSeverity(errorReport),
    ipAddress: req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || errorReport.userAgent
  });

  // Check for patterns that might indicate issues
  await checkErrorPatterns(errorReport, userId);

  res.status(200).json({
    message: 'Error report received',
    errorId: errorReport.errorId
  });
});

// Determine error severity based on content
function determineErrorSeverity(errorReport: z.infer<typeof clientErrorSchema>): 'low' | 'medium' | 'high' | 'critical' {
  const message = errorReport.message.toLowerCase();
  const stack = errorReport.stack?.toLowerCase() || '';

  // Critical errors
  if (
    message.includes('cannot read properties of null') ||
    message.includes('cannot read properties of undefined') ||
    message.includes('maximum call stack') ||
    stack.includes('chunkloaderror')
  ) {
    return 'critical';
  }

  // High severity
  if (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    errorReport.type === 'unhandledRejection'
  ) {
    return 'high';
  }

  // Medium severity
  if (errorReport.type === 'errorBoundary') {
    return 'medium';
  }

  return 'low';
}

// Check for error patterns that might indicate issues
async function checkErrorPatterns(
  errorReport: z.infer<typeof clientErrorSchema>,
  userId: string
): Promise<void> {
  const metrics = clientErrorMetrics.getMetrics();

  // Check for high error rate from specific URL
  const urlErrorCount = metrics.byUrl[errorReport.url] || 0;
  if (urlErrorCount > 10) {
    await auditLogger.logSecurityEvent({
      action: 'HIGH_CLIENT_ERROR_RATE',
      userId: 'system',
      resourceType: 'client',
      resourceId: errorReport.url,
      details: {
        url: errorReport.url,
        errorCount: urlErrorCount,
        latestError: errorReport.message
      },
      severity: 'high',
      ipAddress: 'system',
      userAgent: 'system'
    });
  }

  // Check for repeated errors from same user
  if (userId !== 'anonymous') {
    // You might want to implement user-specific error tracking here
  }

  // Check for security-related errors
  const message = errorReport.message.toLowerCase();
  if (
    message.includes('cross-origin') ||
    message.includes('content security policy') ||
    message.includes('refused to execute')
  ) {
    await auditLogger.logSecurityEvent({
      action: 'CLIENT_SECURITY_ERROR',
      userId,
      resourceType: 'client',
      resourceId: errorReport.url,
      details: {
        message: errorReport.message,
        url: errorReport.url
      },
      severity: 'high',
      ipAddress: 'client',
      userAgent: errorReport.userAgent
    });
  }
}

// Get client error metrics endpoint
export const getClientErrorMetrics = asyncHandler(async (
  req: Request,
  res: Response
): Promise<void> => {
  // This should be restricted to admin users
  const metrics = clientErrorMetrics.getMetrics();

  res.json({
    metrics,
    timestamp: new Date().toISOString()
  });
});

// Reset client error metrics (admin only)
export const resetClientErrorMetrics = asyncHandler(async (
  req: Request,
  res: Response
): Promise<void> => {
  clientErrorMetrics.reset();

  await auditLogger.logAdminAction({
    action: 'RESET_CLIENT_ERROR_METRICS',
    userId: (req as any).user?.id || 'unknown',
    resourceType: 'system',
    resourceId: 'client-error-metrics',
    details: {},
    ipAddress: req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown'
  });

  res.json({
    message: 'Client error metrics reset successfully'
  });
});