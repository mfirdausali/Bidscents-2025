import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { fileSecurity, FileSecurityOptions } from '../file-security';
import { auditLogger } from '../audit-logger';
import rateLimit from 'express-rate-limit';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Temporary upload directory
const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'temp-uploads');

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create temp upload directory:', error);
  }
}

// Clean up old temporary files (older than 1 hour)
async function cleanupTempFiles() {
  try {
    const files = await fs.readdir(TEMP_UPLOAD_DIR);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(TEMP_UPLOAD_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > oneHour) {
        await fs.unlink(filePath);
        console.log('Cleaned up old temp file:', file);
      }
    }
  } catch (error) {
    console.error('Temp file cleanup error:', error);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// Upload rate limiting per user
export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each user to 10 uploads per windowMs
  message: 'Too many uploads, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id?.toString() || req.ip;
  }
});

// File type specific rate limits
export const imageUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // More lenient for images
  message: 'Too many image uploads, please try again later',
  keyGenerator: (req: Request) => req.user?.id?.toString() || req.ip
});

export const documentUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Stricter for documents
  message: 'Too many document uploads, please try again later',
  keyGenerator: (req: Request) => req.user?.id?.toString() || req.ip
});

interface SecureUploadOptions extends FileSecurityOptions {
  fieldName: string;
  uploadType: 'product' | 'profile' | 'message' | 'document';
  requireAuth?: boolean;
  maxFiles?: number;
}

/**
 * Create secure multer configuration
 */
function createMulterConfig(options: SecureUploadOptions) {
  return multer({
    storage: multer.memoryStorage(), // Store in memory for processing
    limits: {
      fileSize: options.maxFileSize || 10 * 1024 * 1024, // Default 10MB
      files: options.maxFiles || 1,
      fields: 5,
      fieldNameSize: 100,
      fieldSize: 1024 * 1024, // 1MB for field values
      headerPairs: 100
    },
    fileFilter: async (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      try {
        // Check file extension
        const ext = path.extname(file.originalname).toLowerCase();
        const dangerousExts = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js'];
        
        if (dangerousExts.includes(ext)) {
          return cb(new Error(`File type ${ext} is not allowed for security reasons`));
        }
        
        // Check MIME type
        const allowedTypes = options.allowedMimeTypes || [
          'image/jpeg', 'image/png', 'image/gif', 'image/webp'
        ];
        
        if (!allowedTypes.includes(file.mimetype)) {
          return cb(new Error(`File type ${file.mimetype} is not allowed`));
        }
        
        // Additional checks will be done after file is received
        cb(null, true);
      } catch (error) {
        cb(error as Error);
      }
    }
  });
}

/**
 * Middleware to process uploaded file(s) with security checks
 */
export function processSecureUpload(options: SecureUploadOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    ensureTempDir(); // Ensure temp directory exists
    
    let tempFilePath: string | null = null;
    
    try {
      // Check authentication if required
      if (options.requireAuth && !req.user) {
        return res.status(401).json({ error: 'Authentication required for upload' });
      }
      
      // Get uploaded file(s)
      const files = req.files ? (Array.isArray(req.files) ? req.files : [req.file]) : [];
      const file = req.file || files[0];
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Validate file
      const validation = await fileSecurity.validateFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        options
      );
      
      if (!validation.valid) {
        // Log security event
        await auditLogger.logSecurityEvent({
          userId: req.user?.id,
          action: 'file_upload_blocked',
          details: {
            reason: validation.error,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          }
        });
        
        return res.status(400).json({ error: validation.error });
      }
      
      // Generate secure filename
      const secureFilename = fileSecurity.generateSecureFilename(
        validation.sanitizedFilename || file.originalname,
        req.user?.id
      );
      
      // Process image if applicable
      let processedBuffer = file.buffer;
      if (file.mimetype.startsWith('image/') && options.imageProcessing !== false) {
        const imageOptions: any = {
          maxWidth: options.dimensions?.maxWidth,
          maxHeight: options.dimensions?.maxHeight,
          quality: 85
        };
        
        // Add watermark for product images if specified
        if (options.uploadType === 'product' && options.watermark) {
          imageOptions.watermark = true;
          imageOptions.watermarkText = 'BidScents';
        }
        
        processedBuffer = await fileSecurity.processImage(file.buffer, imageOptions);
      }
      
      // Virus scan if enabled
      if (options.requireVirusScan !== false) {
        // Save to temp file for scanning
        tempFilePath = path.join(TEMP_UPLOAD_DIR, `scan_${uuidv4()}_${secureFilename}`);
        await fs.writeFile(tempFilePath, processedBuffer);
        
        const scanResult = await fileSecurity.scanForVirus(tempFilePath);
        
        if (!scanResult.safe) {
          // Log security incident
          await auditLogger.logSecurityEvent({
            userId: req.user?.id,
            action: 'virus_detected',
            severity: 'critical',
            details: {
              filename: file.originalname,
              scanDetails: scanResult.details
            }
          });
          
          // Clean up temp file
          await fs.unlink(tempFilePath);
          
          return res.status(400).json({ 
            error: 'File failed security scan',
            details: process.env.NODE_ENV === 'development' ? scanResult.details : undefined
          });
        }
      }
      
      // Attach processed file to request
      req.file = {
        ...file,
        buffer: processedBuffer,
        originalname: validation.sanitizedFilename || file.originalname,
        filename: secureFilename,
        hash: validation.hash
      };
      
      // Log successful upload
      await auditLogger.logActivity({
        userId: req.user?.id,
        action: 'file_uploaded',
        details: {
          uploadType: options.uploadType,
          filename: secureFilename,
          originalName: file.originalname,
          size: processedBuffer.length,
          hash: validation.hash
        }
      });
      
      // Clean up temp file if it exists
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {});
      }
      
      next();
    } catch (error) {
      // Clean up temp file on error
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {});
      }
      
      console.error('Secure upload processing error:', error);
      
      // Log error
      await auditLogger.logError({
        userId: req.user?.id,
        action: 'upload_error',
        error: error instanceof Error ? error.message : 'Unknown error',
        details: { uploadType: options.uploadType }
      });
      
      res.status(500).json({ error: 'Upload processing failed' });
    }
  };
}

/**
 * Product image upload middleware
 */
export const productImageUpload = [
  imageUploadRateLimit,
  createMulterConfig({
    fieldName: 'images',
    uploadType: 'product',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 5,
    requireAuth: true,
    imageProcessing: true,
    watermark: true,
    dimensions: {
      maxWidth: 2048,
      maxHeight: 2048,
      minWidth: 400,
      minHeight: 400
    }
  }).array('images', 5),
  processSecureUpload({
    fieldName: 'images',
    uploadType: 'product',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    requireAuth: true,
    imageProcessing: true,
    watermark: true,
    dimensions: {
      maxWidth: 2048,
      maxHeight: 2048,
      minWidth: 400,
      minHeight: 400
    }
  })
];

/**
 * Profile image upload middleware
 */
export const profileImageUpload = [
  imageUploadRateLimit,
  createMulterConfig({
    fieldName: 'image',
    uploadType: 'profile',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 3 * 1024 * 1024, // 3MB
    requireAuth: true,
    imageProcessing: true,
    dimensions: {
      maxWidth: 1024,
      maxHeight: 1024,
      minWidth: 200,
      minHeight: 200
    }
  }).single('image'),
  processSecureUpload({
    fieldName: 'image',
    uploadType: 'profile',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    requireAuth: true,
    imageProcessing: true,
    dimensions: {
      maxWidth: 1024,
      maxHeight: 1024,
      minWidth: 200,
      minHeight: 200
    }
  })
];

/**
 * Message attachment upload middleware
 */
export const messageAttachmentUpload = [
  uploadRateLimit,
  createMulterConfig({
    fieldName: 'file',
    uploadType: 'message',
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    requireAuth: true
  }).single('file'),
  processSecureUpload({
    fieldName: 'file',
    uploadType: 'message',
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    requireAuth: true
  })
];

/**
 * Document upload middleware
 */
export const documentUpload = [
  documentUploadRateLimit,
  createMulterConfig({
    fieldName: 'document',
    uploadType: 'document',
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    maxFileSize: 20 * 1024 * 1024, // 20MB
    requireAuth: true
  }).single('document'),
  processSecureUpload({
    fieldName: 'document',
    uploadType: 'document',
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    requireAuth: true,
    requireVirusScan: true
  })
];

// Export helper to clean up on server shutdown
export async function cleanupUploads() {
  try {
    const files = await fs.readdir(TEMP_UPLOAD_DIR);
    for (const file of files) {
      await fs.unlink(path.join(TEMP_UPLOAD_DIR, file));
    }
    console.log('Cleaned up all temporary upload files');
  } catch (error) {
    console.error('Failed to cleanup uploads:', error);
  }
}