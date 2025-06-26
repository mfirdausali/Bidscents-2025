import multer from 'multer';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';
import FileType from 'file-type';
import sharp from 'sharp';

const execAsync = promisify(exec);

// File signature validation
const FILE_SIGNATURES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])]
};

export class SecureFileUpload {
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf'
  ];
  
  // Validate file content matches declared MIME type
  async validateFileContent(buffer: Buffer, declaredMimeType: string): Promise<boolean> {
    // Check file type from buffer
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
    
    // Additional signature check
    const signatures = FILE_SIGNATURES[declaredMimeType];
    if (signatures) {
      const fileStart = buffer.slice(0, 20);
      const hasValidSignature = signatures.some(sig => 
        fileStart.slice(0, sig.length).equals(sig)
      );
      
      if (!hasValidSignature) {
        console.error('File signature validation failed');
        return false;
      }
    }
    
    return true;
  }
  
  // Scan file for malware using ClamAV (if available)
  async scanForMalware(filePath: string): Promise<boolean> {
    try {
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      if (stderr) {
        console.error('ClamAV error:', stderr);
        return false;
      }
      
      return !stdout.includes('FOUND');
    } catch (error) {
      console.warn('ClamAV not available, skipping virus scan');
      return true; // Allow if scanner not available (log for monitoring)
    }
  }
  
  // Sanitize filename to prevent path traversal
  sanitizeFilename(filename: string): string {
    // Remove any directory traversal attempts
    const sanitized = filename
      .replace(/\.\./g, '')
      .replace(/[\/\\]/g, '')
      .replace(/^\.+/, '');
    
    // Generate unique filename to prevent collisions
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = sanitized.split('.').pop() || '';
    
    return `${timestamp}_${random}.${extension}`;
  }
  
  // Process and sanitize images
  async processImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    if (!mimeType.startsWith('image/')) {
      return buffer;
    }
    
    try {
      // Re-encode image to remove any embedded malicious content
      const processed = await sharp(buffer)
        .rotate() // Auto-rotate based on EXIF
        .removeMetadata() // Strip all metadata including EXIF
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();
      
      return processed;
    } catch (error) {
      console.error('Image processing failed:', error);
      throw new Error('Failed to process image');
    }
  }
  
  createMulterConfig(options: { fieldName: string }) {
    return multer({
      limits: {
        fileSize: this.maxFileSize,
        files: 1, // Single file upload only
        fieldNameSize: 100,
        fieldSize: this.maxFileSize
      },
      fileFilter: async (req, file, cb) => {
        try {
          // Check allowed MIME types
          if (!this.allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error(`File type ${file.mimetype} not allowed`));
          }
          
          // Sanitize filename
          file.originalname = this.sanitizeFilename(file.originalname);
          
          cb(null, true);
        } catch (error) {
          cb(error as Error);
        }
      },
      storage: multer.memoryStorage() // Store in memory for processing
    });
  }
}

export const secureFileUpload = new SecureFileUpload();

// Example usage:
export const secureImageUpload = secureFileUpload.createMulterConfig({ 
  fieldName: 'image' 
}).single('image');

export const secureMessageFileUpload = secureFileUpload.createMulterConfig({ 
  fieldName: 'file' 
}).single('file');