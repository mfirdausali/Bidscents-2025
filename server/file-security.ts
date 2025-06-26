import crypto from 'crypto';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import FileType from 'file-type';
import sharp from 'sharp';
import { createHash } from 'crypto';

const execAsync = promisify(exec);

// Enhanced file type validation with magic bytes
const FILE_SIGNATURES: Record<string, Buffer[]> = {
  'image/jpeg': [
    Buffer.from([0xFF, 0xD8, 0xFF, 0xDB]),
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE1])
  ],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif': [
    Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
    Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])  // GIF89a
  ],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D])], // %PDF-
  'application/zip': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]),
    Buffer.from([0x50, 0x4B, 0x05, 0x06])
  ],
  'application/msword': [Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]) // DOCX is a ZIP file
  ]
};

// File size limits per type (in bytes)
const FILE_SIZE_LIMITS: Record<string, number> = {
  'image/jpeg': 5 * 1024 * 1024,      // 5MB
  'image/png': 5 * 1024 * 1024,       // 5MB
  'image/gif': 3 * 1024 * 1024,       // 3MB
  'image/webp': 5 * 1024 * 1024,      // 5MB
  'application/pdf': 10 * 1024 * 1024, // 10MB
  'application/zip': 20 * 1024 * 1024, // 20MB
  'default': 10 * 1024 * 1024         // 10MB default
};

// Image dimension limits
const IMAGE_DIMENSION_LIMITS = {
  maxWidth: 4096,
  maxHeight: 4096,
  minWidth: 100,
  minHeight: 100,
  productImage: {
    maxWidth: 2048,
    maxHeight: 2048,
    minWidth: 400,
    minHeight: 400
  },
  profileImage: {
    maxWidth: 1024,
    maxHeight: 1024,
    minWidth: 200,
    minHeight: 200
  }
};

// Dangerous file extensions
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.scr', '.vbs', '.js', '.jar',
  '.zip', '.rar', '.sh', '.bash', '.ps1', '.psm1', '.msi', '.app'
];

export interface FileSecurityOptions {
  allowedMimeTypes?: string[];
  maxFileSize?: number;
  requireVirusScan?: boolean;
  imageProcessing?: boolean;
  watermark?: boolean;
  dimensions?: {
    maxWidth?: number;
    maxHeight?: number;
    minWidth?: number;
    minHeight?: number;
  };
}

export class FileSecurity {
  private readonly defaultAllowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];

  /**
   * Validate file type using magic bytes (file signatures)
   */
  async validateFileSignature(buffer: Buffer, declaredMimeType: string): Promise<boolean> {
    try {
      // Check file type from buffer using file-type library
      const fileTypeResult = await FileType.fromBuffer(buffer);
      
      if (!fileTypeResult) {
        console.error('Could not determine file type from buffer');
        return false;
      }
      
      // Verify MIME type matches
      if (fileTypeResult.mime !== declaredMimeType) {
        console.error(`MIME type mismatch: declared ${declaredMimeType}, detected ${fileTypeResult.mime}`);
        return false;
      }
      
      // Additional manual signature check
      const signatures = FILE_SIGNATURES[declaredMimeType];
      if (signatures && signatures.length > 0) {
        const fileStart = buffer.slice(0, 20);
        const hasValidSignature = signatures.some(sig => 
          fileStart.slice(0, sig.length).equals(sig)
        );
        
        if (!hasValidSignature) {
          console.error('File signature validation failed for', declaredMimeType);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('File signature validation error:', error);
      return false;
    }
  }

  /**
   * Validate file size based on type
   */
  validateFileSize(size: number, mimeType: string): boolean {
    const limit = FILE_SIZE_LIMITS[mimeType] || FILE_SIZE_LIMITS.default;
    return size <= limit;
  }

  /**
   * Sanitize filename to prevent path traversal and other attacks
   */
  sanitizeFilename(filename: string): string {
    // Remove any directory traversal attempts
    let sanitized = filename
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '')
      .replace(/^\.+/, '')
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[^a-zA-Z0-9._-]/g, ''); // Keep only safe characters
    
    // Ensure filename is not empty
    if (!sanitized || sanitized === '.') {
      sanitized = 'file';
    }
    
    // Check for dangerous extensions
    const ext = path.extname(sanitized).toLowerCase();
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      sanitized = sanitized.replace(ext, '.txt'); // Force safe extension
    }
    
    // Limit filename length
    const maxLength = 255;
    if (sanitized.length > maxLength) {
      const extension = path.extname(sanitized);
      const nameWithoutExt = path.basename(sanitized, extension);
      sanitized = nameWithoutExt.substring(0, maxLength - extension.length - 1) + extension;
    }
    
    return sanitized;
  }

  /**
   * Generate secure unique filename
   */
  generateSecureFilename(originalFilename: string, userId?: number): string {
    const sanitized = this.sanitizeFilename(originalFilename);
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(sanitized) || '';
    const userPrefix = userId ? `user${userId}_` : '';
    
    return `${userPrefix}${timestamp}_${random}${extension}`;
  }

  /**
   * Scan file for viruses using ClamAV
   */
  async scanForVirus(filePath: string): Promise<{ safe: boolean; details?: string }> {
    try {
      // Check if ClamAV is installed
      await execAsync('which clamscan');
      
      const { stdout, stderr } = await execAsync(
        `clamscan --no-summary --infected --remove=no "${filePath}"`
      );
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error('ClamAV scan error:', stderr);
        return { safe: false, details: 'Scan error' };
      }
      
      const infected = stdout.includes('FOUND');
      return {
        safe: !infected,
        details: infected ? stdout.trim() : 'Clean'
      };
    } catch (error) {
      // ClamAV not available - log warning but don't block
      console.warn('ClamAV not available for virus scanning:', error);
      return { safe: true, details: 'Scanner not available' };
    }
  }

  /**
   * Validate image dimensions
   */
  async validateImageDimensions(
    buffer: Buffer,
    limits?: typeof IMAGE_DIMENSION_LIMITS.productImage
  ): Promise<{ valid: boolean; width?: number; height?: number; error?: string }> {
    try {
      const metadata = await sharp(buffer).metadata();
      const { width, height } = metadata;
      
      if (!width || !height) {
        return { valid: false, error: 'Could not determine image dimensions' };
      }
      
      const actualLimits = limits || IMAGE_DIMENSION_LIMITS;
      
      if (width > actualLimits.maxWidth || height > actualLimits.maxHeight) {
        return {
          valid: false,
          width,
          height,
          error: `Image too large: ${width}x${height} exceeds ${actualLimits.maxWidth}x${actualLimits.maxHeight}`
        };
      }
      
      if (width < actualLimits.minWidth || height < actualLimits.minHeight) {
        return {
          valid: false,
          width,
          height,
          error: `Image too small: ${width}x${height} below ${actualLimits.minWidth}x${actualLimits.minHeight}`
        };
      }
      
      return { valid: true, width, height };
    } catch (error) {
      console.error('Image dimension validation error:', error);
      return { valid: false, error: 'Failed to process image' };
    }
  }

  /**
   * Process and optimize image
   */
  async processImage(
    buffer: Buffer,
    options: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      watermark?: boolean;
      watermarkText?: string;
    } = {}
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(buffer)
        .rotate() // Auto-rotate based on EXIF
        .removeMetadata() // Strip all metadata including EXIF
        .resize(options.maxWidth || 2048, options.maxHeight || 2048, {
          fit: 'inside',
          withoutEnlargement: true
        });
      
      // Add watermark if requested
      if (options.watermark && options.watermarkText) {
        const watermarkSvg = Buffer.from(`
          <svg width="200" height="50">
            <style>
              .watermark { 
                fill: white; 
                font-size: 16px; 
                font-family: Arial, sans-serif;
                opacity: 0.7;
              }
            </style>
            <text x="10" y="30" class="watermark">${options.watermarkText}</text>
          </svg>
        `);
        
        pipeline = pipeline.composite([{
          input: watermarkSvg,
          gravity: 'southeast'
        }]);
      }
      
      // Convert to appropriate format with optimization
      const metadata = await sharp(buffer).metadata();
      if (metadata.format === 'png' && !metadata.hasAlpha) {
        // Convert PNG without transparency to JPEG for better compression
        return pipeline.jpeg({ 
          quality: options.quality || 85,
          progressive: true,
          mozjpeg: true
        }).toBuffer();
      } else if (metadata.format === 'png') {
        return pipeline.png({ 
          quality: options.quality || 90,
          compressionLevel: 9,
          progressive: true
        }).toBuffer();
      } else {
        return pipeline.jpeg({ 
          quality: options.quality || 85,
          progressive: true,
          mozjpeg: true
        }).toBuffer();
      }
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image');
    }
  }

  /**
   * Calculate file hash for integrity checking
   */
  calculateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Comprehensive file validation
   */
  async validateFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    options: FileSecurityOptions = {}
  ): Promise<{
    valid: boolean;
    error?: string;
    sanitizedFilename?: string;
    hash?: string;
  }> {
    try {
      // Check allowed MIME types
      const allowedTypes = options.allowedMimeTypes || this.defaultAllowedMimeTypes;
      if (!allowedTypes.includes(mimeType)) {
        return { valid: false, error: `File type ${mimeType} not allowed` };
      }
      
      // Validate file size
      const maxSize = options.maxFileSize || FILE_SIZE_LIMITS[mimeType] || FILE_SIZE_LIMITS.default;
      if (buffer.length > maxSize) {
        return { 
          valid: false, 
          error: `File size ${buffer.length} exceeds limit of ${maxSize} bytes` 
        };
      }
      
      // Validate file signature
      const validSignature = await this.validateFileSignature(buffer, mimeType);
      if (!validSignature) {
        return { valid: false, error: 'Invalid file signature or type mismatch' };
      }
      
      // Validate image dimensions if applicable
      if (mimeType.startsWith('image/') && options.dimensions) {
        const dimensionCheck = await this.validateImageDimensions(buffer, options.dimensions);
        if (!dimensionCheck.valid) {
          return { valid: false, error: dimensionCheck.error };
        }
      }
      
      // Sanitize filename
      const sanitizedFilename = this.sanitizeFilename(filename);
      
      // Calculate file hash
      const hash = this.calculateFileHash(buffer);
      
      return {
        valid: true,
        sanitizedFilename,
        hash
      };
    } catch (error) {
      console.error('File validation error:', error);
      return { valid: false, error: 'File validation failed' };
    }
  }
}

// Export singleton instance
export const fileSecurity = new FileSecurity();

// Export types for use in other modules
export type { FileSecurityOptions };