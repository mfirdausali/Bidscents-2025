import { Router, Request, Response } from 'express';
import { requireAuth } from './app-auth';
import { 
  productImageUpload, 
  profileImageUpload, 
  messageAttachmentUpload,
  documentUpload 
} from './middleware/secure-upload';
import { 
  servePublicFile, 
  servePrivateFile,
  generateSecureFileUrl,
  trackFileDownload
} from './secure-file-serving';
import { supabase } from './supabase';
import { auditLogger } from './audit-logger';
import { fileSecurity } from './file-security';

const router = Router();

/**
 * Upload product images with security
 */
router.post('/api/products/:id/images', 
  requireAuth,
  productImageUpload,
  async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.id);
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
      }
      
      // Verify user owns the product
      const { data: product } = await supabase
        .from('products')
        .select('seller_id')
        .eq('id', productId)
        .single();
      
      if (!product || product.seller_id !== req.user!.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      const uploadedImages = [];
      
      for (const file of files) {
        // File has already been validated and processed by middleware
        const filename = file.filename || fileSecurity.generateSecureFilename(file.originalname, req.user!.id);
        const filePath = `products/${productId}/${filename}`;
        
        // Upload to Supabase storage
        const { data, error } = await supabase.storage
          .from('product-images')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });
        
        if (error) {
          console.error('Upload error:', error);
          continue;
        }
        
        // Save image reference to database
        const { data: imageRecord } = await supabase
          .from('product_images')
          .insert({
            product_id: productId,
            image_url: filePath,
            is_primary: uploadedImages.length === 0,
            file_size: file.buffer.length,
            file_hash: file.hash
          })
          .select()
          .single();
        
        if (imageRecord) {
          uploadedImages.push({
            id: imageRecord.id,
            url: generateSecureFileUrl('product-images', filePath),
            isPrimary: imageRecord.is_primary
          });
        }
      }
      
      // Log successful upload
      await auditLogger.logActivity({
        userId: req.user!.id,
        action: 'product_images_uploaded',
        details: {
          productId,
          imageCount: uploadedImages.length
        }
      });
      
      res.json({ images: uploadedImages });
    } catch (error) {
      console.error('Product image upload error:', error);
      res.status(500).json({ error: 'Failed to upload images' });
    }
  }
);

/**
 * Upload profile image with security
 */
router.post('/api/users/profile-image',
  requireAuth,
  profileImageUpload,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No image uploaded' });
      }
      
      const userId = req.user!.id;
      const filename = file.filename || fileSecurity.generateSecureFilename(file.originalname, userId);
      const filePath = `profiles/${userId}/${filename}`;
      
      // Delete old profile image if exists
      const { data: user } = await supabase
        .from('users')
        .select('avatar_url')
        .eq('id', userId)
        .single();
      
      if (user?.avatar_url) {
        await supabase.storage
          .from('profile-images')
          .remove([user.avatar_url]);
      }
      
      // Upload new image
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: true
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Update user profile
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          avatar_url: filePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);
      
      if (updateError) {
        throw updateError;
      }
      
      // Generate secure URL
      const imageUrl = generateSecureFileUrl('profile-images', filePath, 86400); // 24 hours
      
      res.json({ 
        avatarUrl: imageUrl,
        message: 'Profile image updated successfully'
      });
    } catch (error) {
      console.error('Profile image upload error:', error);
      res.status(500).json({ error: 'Failed to upload profile image' });
    }
  }
);

/**
 * Upload message attachment with security
 */
router.post('/api/messages/:conversationId/attachment',
  requireAuth,
  messageAttachmentUpload,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Verify user is part of the conversation
      const { data: conversation } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${req.user!.id},receiver_id.eq.${req.user!.id}`)
        .eq('id', conversationId)
        .single();
      
      if (!conversation) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      const filename = file.filename || fileSecurity.generateSecureFilename(file.originalname, req.user!.id);
      const filePath = `messages/${conversationId}/${filename}`;
      
      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Generate secure URL (expires in 7 days for messages)
      const fileUrl = generateSecureFileUrl('message-attachments', filePath, 604800);
      
      res.json({
        url: fileUrl,
        filename: file.originalname,
        size: file.buffer.length,
        type: file.mimetype
      });
    } catch (error) {
      console.error('Message attachment upload error:', error);
      res.status(500).json({ error: 'Failed to upload attachment' });
    }
  }
);

/**
 * Serve public product images
 */
router.get('/files/products/:filename(*)', servePublicFile('product-images'));

/**
 * Serve private message attachments
 */
router.get('/files/messages/:conversationId/:filename(*)', 
  servePrivateFile('message-attachments', {
    requireAuth: true,
    checkOwnership: true
  })
);

/**
 * Download file with tracking
 */
router.get('/api/files/download/:bucket/:path(*)',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { bucket, path } = req.params;
      
      // Validate bucket name
      const allowedBuckets = ['product-images', 'message-attachments', 'documents'];
      if (!allowedBuckets.includes(bucket)) {
        return res.status(400).json({ error: 'Invalid bucket' });
      }
      
      // Check file exists
      const { data: file, error } = await supabase.storage
        .from(bucket)
        .download(path);
      
      if (error || !file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Track download
      await trackFileDownload(req.user!.id, {
        bucketName: bucket,
        filePath: path,
        fileType: file.type,
        fileSize: file.size
      });
      
      // Serve file
      const buffer = Buffer.from(await file.arrayBuffer());
      res.setHeader('Content-Type', file.type);
      res.setHeader('Content-Length', file.size.toString());
      res.setHeader('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
      res.send(buffer);
    } catch (error) {
      console.error('File download error:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
);

/**
 * Bulk delete files with security checks
 */
router.delete('/api/files/bulk',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { files } = req.body; // Array of { bucket, path }
      
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files specified' });
      }
      
      const results = [];
      
      for (const file of files) {
        try {
          // Verify ownership or admin status before deletion
          if (!req.user!.isAdmin) {
            // Add ownership check logic here based on file type
            continue;
          }
          
          const { error } = await supabase.storage
            .from(file.bucket)
            .remove([file.path]);
          
          if (!error) {
            results.push({ ...file, success: true });
            
            await auditLogger.logActivity({
              userId: req.user!.id,
              action: 'file_deleted',
              details: file
            });
          } else {
            results.push({ ...file, success: false, error: error.message });
          }
        } catch (error) {
          results.push({ ...file, success: false, error: 'Failed to delete' });
        }
      }
      
      res.json({ results });
    } catch (error) {
      console.error('Bulk file deletion error:', error);
      res.status(500).json({ error: 'Failed to delete files' });
    }
  }
);

export default router;