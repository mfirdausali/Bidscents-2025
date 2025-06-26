import { supabase } from './supabase';
import { auditLogger } from './audit-logger';
import EventEmitter from 'events';

interface UploadMetrics {
  totalUploads: number;
  failedUploads: number;
  totalSize: number;
  averageSize: number;
  uploadsByType: Record<string, number>;
  uploadsByUser: Record<number, number>;
  suspiciousActivity: Array<{
    userId: number;
    reason: string;
    timestamp: Date;
    details: any;
  }>;
}

interface UploadEvent {
  userId?: number;
  filename: string;
  size: number;
  mimeType: string;
  success: boolean;
  error?: string;
  duration: number;
  hash?: string;
}

class FileUploadMonitor extends EventEmitter {
  private metrics: UploadMetrics;
  private uploadWindow: UploadEvent[] = [];
  private readonly windowSize = 3600000; // 1 hour in ms
  private readonly suspiciousThresholds = {
    uploadsPerHour: 50,
    totalSizePerHour: 100 * 1024 * 1024, // 100MB
    failureRate: 0.5, // 50% failure rate
    duplicateFiles: 5 // Same file uploaded 5+ times
  };

  constructor() {
    super();
    this.metrics = this.resetMetrics();
    this.startPeriodicCleanup();
    this.setupEventHandlers();
  }

  private resetMetrics(): UploadMetrics {
    return {
      totalUploads: 0,
      failedUploads: 0,
      totalSize: 0,
      averageSize: 0,
      uploadsByType: {},
      uploadsByUser: {},
      suspiciousActivity: []
    };
  }

  /**
   * Track a file upload event
   */
  trackUpload(event: UploadEvent) {
    this.uploadWindow.push({ ...event, timestamp: new Date() } as any);
    this.updateMetrics(event);
    this.checkForSuspiciousActivity(event);
    
    // Emit event for real-time monitoring
    this.emit('upload', event);
  }

  /**
   * Update metrics based on upload event
   */
  private updateMetrics(event: UploadEvent) {
    this.metrics.totalUploads++;
    
    if (!event.success) {
      this.metrics.failedUploads++;
    }
    
    this.metrics.totalSize += event.size;
    this.metrics.averageSize = this.metrics.totalSize / this.metrics.totalUploads;
    
    // Track by type
    this.metrics.uploadsByType[event.mimeType] = 
      (this.metrics.uploadsByType[event.mimeType] || 0) + 1;
    
    // Track by user
    if (event.userId) {
      this.metrics.uploadsByUser[event.userId] = 
        (this.metrics.uploadsByUser[event.userId] || 0) + 1;
    }
  }

  /**
   * Check for suspicious upload patterns
   */
  private async checkForSuspiciousActivity(event: UploadEvent) {
    if (!event.userId) return;
    
    const userUploads = this.getRecentUserUploads(event.userId);
    
    // Check upload frequency
    if (userUploads.length > this.suspiciousThresholds.uploadsPerHour) {
      await this.flagSuspiciousActivity(event.userId, 'high_upload_frequency', {
        uploads: userUploads.length,
        threshold: this.suspiciousThresholds.uploadsPerHour
      });
    }
    
    // Check total size
    const totalSize = userUploads.reduce((sum, upload) => sum + upload.size, 0);
    if (totalSize > this.suspiciousThresholds.totalSizePerHour) {
      await this.flagSuspiciousActivity(event.userId, 'high_upload_volume', {
        totalSize,
        threshold: this.suspiciousThresholds.totalSizePerHour
      });
    }
    
    // Check failure rate
    const failures = userUploads.filter(u => !u.success).length;
    const failureRate = failures / userUploads.length;
    if (userUploads.length > 10 && failureRate > this.suspiciousThresholds.failureRate) {
      await this.flagSuspiciousActivity(event.userId, 'high_failure_rate', {
        failureRate,
        failures,
        total: userUploads.length
      });
    }
    
    // Check for duplicate files
    if (event.hash) {
      const duplicates = userUploads.filter(u => u.hash === event.hash).length;
      if (duplicates > this.suspiciousThresholds.duplicateFiles) {
        await this.flagSuspiciousActivity(event.userId, 'duplicate_uploads', {
          hash: event.hash,
          count: duplicates
        });
      }
    }
  }

  /**
   * Get recent uploads for a specific user
   */
  private getRecentUserUploads(userId: number): UploadEvent[] {
    const cutoff = Date.now() - this.windowSize;
    return this.uploadWindow.filter(
      upload => upload.userId === userId && 
      (upload as any).timestamp.getTime() > cutoff
    );
  }

  /**
   * Flag suspicious activity
   */
  private async flagSuspiciousActivity(userId: number, reason: string, details: any) {
    const activity = {
      userId,
      reason,
      timestamp: new Date(),
      details
    };
    
    this.metrics.suspiciousActivity.push(activity);
    
    // Log to audit
    await auditLogger.logSecurityEvent({
      userId,
      action: 'suspicious_upload_activity',
      severity: 'warning',
      details: { reason, ...details }
    });
    
    // Emit event for real-time alerts
    this.emit('suspicious', activity);
  }

  /**
   * Clean up old data periodically
   */
  private startPeriodicCleanup() {
    setInterval(() => {
      const cutoff = Date.now() - this.windowSize;
      this.uploadWindow = this.uploadWindow.filter(
        upload => (upload as any).timestamp.getTime() > cutoff
      );
      
      // Clean old suspicious activity
      this.metrics.suspiciousActivity = this.metrics.suspiciousActivity.filter(
        activity => activity.timestamp.getTime() > cutoff
      );
    }, 60000); // Run every minute
  }

  /**
   * Setup event handlers for monitoring
   */
  private setupEventHandlers() {
    // Log critical events
    this.on('suspicious', async (activity) => {
      console.warn('Suspicious upload activity detected:', activity);
      
      // Could trigger additional actions here:
      // - Send alerts to admins
      // - Temporarily restrict user uploads
      // - Trigger manual review
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): UploadMetrics {
    return { ...this.metrics };
  }

  /**
   * Get upload statistics for a specific time range
   */
  async getUploadStats(startDate: Date, endDate: Date) {
    try {
      // Query audit logs for upload activities
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .in('action', ['file_uploaded', 'upload_error', 'virus_detected'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      
      if (error) throw error;
      
      // Process statistics
      const stats = {
        totalUploads: 0,
        successfulUploads: 0,
        failedUploads: 0,
        virusesDetected: 0,
        uploadsByType: {} as Record<string, number>,
        uploadsByUser: {} as Record<number, number>,
        errorTypes: {} as Record<string, number>
      };
      
      data?.forEach(log => {
        if (log.action === 'file_uploaded') {
          stats.totalUploads++;
          stats.successfulUploads++;
          
          const details = log.details as any;
          if (details.mimeType) {
            stats.uploadsByType[details.mimeType] = 
              (stats.uploadsByType[details.mimeType] || 0) + 1;
          }
          
          if (log.user_id) {
            stats.uploadsByUser[log.user_id] = 
              (stats.uploadsByUser[log.user_id] || 0) + 1;
          }
        } else if (log.action === 'upload_error') {
          stats.failedUploads++;
          const error = (log.details as any).error || 'unknown';
          stats.errorTypes[error] = (stats.errorTypes[error] || 0) + 1;
        } else if (log.action === 'virus_detected') {
          stats.virusesDetected++;
        }
      });
      
      return stats;
    } catch (error) {
      console.error('Failed to get upload stats:', error);
      throw error;
    }
  }

  /**
   * Generate upload report
   */
  async generateUploadReport(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case 'daily':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }
    
    const stats = await this.getUploadStats(startDate, now);
    const currentMetrics = this.getMetrics();
    
    return {
      period,
      startDate,
      endDate: now,
      summary: {
        totalUploads: stats.totalUploads,
        successRate: stats.totalUploads > 0 
          ? (stats.successfulUploads / stats.totalUploads * 100).toFixed(2) + '%' 
          : '0%',
        failureRate: stats.totalUploads > 0 
          ? (stats.failedUploads / stats.totalUploads * 100).toFixed(2) + '%' 
          : '0%',
        virusesDetected: stats.virusesDetected,
        currentHourActivity: {
          uploads: currentMetrics.totalUploads,
          suspiciousActivities: currentMetrics.suspiciousActivity.length
        }
      },
      uploadsByType: stats.uploadsByType,
      topUploaders: Object.entries(stats.uploadsByUser)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, count]) => ({ userId: parseInt(userId), count })),
      errors: stats.errorTypes,
      suspiciousActivity: currentMetrics.suspiciousActivity
    };
  }
}

// Export singleton instance
export const uploadMonitor = new FileUploadMonitor();

// Middleware to track uploads
export function trackUploadMiddleware(req: any, res: any, next: any) {
  const startTime = Date.now();
  const originalJson = res.json;
  const originalStatus = res.status;
  let statusCode = 200;
  
  res.status = function(code: number) {
    statusCode = code;
    return originalStatus.call(this, code);
  };
  
  res.json = function(data: any) {
    const duration = Date.now() - startTime;
    
    if (req.file || req.files) {
      const files = req.files || [req.file];
      files.forEach((file: any) => {
        if (file) {
          uploadMonitor.trackUpload({
            userId: req.user?.id,
            filename: file.originalname,
            size: file.size || file.buffer?.length || 0,
            mimeType: file.mimetype,
            success: statusCode < 400,
            error: statusCode >= 400 ? data.error : undefined,
            duration,
            hash: file.hash
          });
        }
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
}