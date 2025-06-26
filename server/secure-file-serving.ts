import { Request, Response, NextFunction } from 'express';
import { supabase } from './supabase';
import path from 'path';
import { createHash } from 'crypto';
import { auditLogger } from './audit-logger';

// Safe MIME types for serving
const SAFE_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

// Content disposition settings
const INLINE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

export interface FileAccessControl {
  requireAuth?: boolean;
  checkOwnership?: boolean;
  allowedRoles?: string[];
  maxAge?: number;
}

/**
 * Generate secure file URL with access token
 */
export function generateSecureFileUrl(
  bucketName: string,
  filePath: string,
  expiresIn: number = 3600 // 1 hour default
): string {
  const { data, error } = supabase.storage
    .from(bucketName)
    .createSignedUrl(filePath, expiresIn);
  
  if (error || !data) {
    console.error('Failed to generate signed URL:', error);
    throw new Error('Failed to generate secure file URL');
  }
  
  return data.signedUrl;
}

/**
 * Middleware to validate file access
 */
export function validateFileAccess(options: FileAccessControl = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check authentication if required
      if (options.requireAuth && !req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Check user roles if specified
      if (options.allowedRoles && options.allowedRoles.length > 0) {
        const userRole = req.user?.role || 'user';
        if (!options.allowedRoles.includes(userRole)) {
          return res.status(403).json({ error: 'Insufficient permissions' });
        }
      }
      
      // Additional ownership checks would go here
      // This would typically involve checking if the user owns the resource
      // that the file is associated with (e.g., product, message, etc.)
      
      next();
    } catch (error) {
      console.error('File access validation error:', error);
      res.status(500).json({ error: 'Access validation failed' });
    }
  };
}

/**
 * Serve file securely with proper headers
 */
export async function serveSecureFile(
  req: Request,
  res: Response,
  options: {
    bucketName: string;
    filePath: string;
    filename?: string;
    inline?: boolean;
  }
) {
  try {
    // Sanitize the file path
    const sanitizedPath = filePath.replace(/\.\./g, '').replace(/^\/+/, '');
    
    // Get file extension and MIME type
    const ext = path.extname(sanitizedPath).toLowerCase();
    const mimeType = SAFE_MIME_TYPES[ext] || 'application/octet-stream';
    
    // Generate signed URL for the file
    const signedUrl = generateSecureFileUrl(options.bucketName, sanitizedPath);
    
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline';");
    
    // Set content type
    res.setHeader('Content-Type', mimeType);
    
    // Set content disposition
    const disposition = options.inline || INLINE_TYPES.includes(mimeType) ? 'inline' : 'attachment';
    const filename = options.filename || path.basename(sanitizedPath);
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
    
    // Set cache headers
    if (options.inline && mimeType.startsWith('image/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for images
    } else {
      res.setHeader('Cache-Control', 'private, no-cache');
    }
    
    // Log file access
    await auditLogger.logActivity({
      userId: req.user?.id,
      action: 'file_accessed',
      details: {
        bucketName: options.bucketName,
        filePath: sanitizedPath,
        mimeType
      }
    });
    
    // Redirect to signed URL
    res.redirect(signedUrl);
  } catch (error) {
    console.error('Secure file serving error:', error);
    
    await auditLogger.logError({
      userId: req.user?.id,
      action: 'file_serve_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: { filePath: options.filePath }
    });
    
    res.status(500).json({ error: 'Failed to serve file' });
  }
}

/**
 * Middleware to serve public files (e.g., product images)
 */
export function servePublicFile(bucketName: string) {
  return async (req: Request, res: Response) => {
    const filePath = req.params.filename || req.params[0];
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    await serveSecureFile(req, res, {
      bucketName,
      filePath,
      inline: true
    });
  };
}

/**
 * Middleware to serve private files with access control
 */
export function servePrivateFile(bucketName: string, accessControl: FileAccessControl) {
  return [
    validateFileAccess(accessControl),
    async (req: Request, res: Response) => {
      const filePath = req.params.filename || req.params[0];
      
      if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
      }
      
      await serveSecureFile(req, res, {
        bucketName,
        filePath,
        inline: false
      });
    }
  ];
}

/**
 * Generate ETag for caching
 */
export function generateETag(content: string | Buffer): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * File download tracking
 */
export async function trackFileDownload(
  userId: number | undefined,
  fileInfo: {
    bucketName: string;
    filePath: string;
    fileType: string;
    fileSize?: number;
  }
) {
  try {
    await auditLogger.logActivity({
      userId,
      action: 'file_downloaded',
      details: fileInfo
    });
  } catch (error) {
    console.error('Failed to track file download:', error);
  }
}

/**
 * Batch file URL generation for performance
 */
export async function generateBatchFileUrls(
  files: Array<{ bucketName: string; filePath: string }>,
  expiresIn: number = 3600
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  
  // Process in parallel for better performance
  await Promise.all(
    files.map(async ({ bucketName, filePath }) => {
      try {
        const url = generateSecureFileUrl(bucketName, filePath, expiresIn);
        urls[`${bucketName}/${filePath}`] = url;
      } catch (error) {
        console.error(`Failed to generate URL for ${bucketName}/${filePath}:`, error);
        urls[`${bucketName}/${filePath}`] = '';
      }
    })
  );
  
  return urls;
}

/**
 * Clean up expired signed URLs from cache if implemented
 */
export async function cleanupExpiredUrls() {
  // This would clean up any cached signed URLs if you implement caching
  console.log('Cleaning up expired file URLs');
}