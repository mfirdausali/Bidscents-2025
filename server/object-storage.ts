import { Client } from '@replit/object-storage';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create a temporary directory for image storage while we work on the object storage implementation
export const TEMP_DIR = path.join(os.tmpdir(), 'product-images');

// Create the temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Initialize the storage client (lazy load to prevent application from crashing if credentials not set)
export let storageClient: any = null;

// We'll only use local file system for now
// We are not initializing the client since it requires additional configuration
// which would need to be done through environment variables
console.log('Using local filesystem for image storage');

/**
 * Upload an image to storage (uses local filesystem as fallback)
 * @param imageBuffer The image buffer to upload
 * @param imageId The UUID to use as the filename
 * @param contentType The content type of the image
 * @returns Promise with the result of the upload
 */
export async function uploadProductImage(
  imageBuffer: Buffer, 
  imageId: string, 
  contentType: string
): Promise<{ url: string, success: boolean }> {
  try {
    // If object storage client is available, try to use it
    if (storageClient) {
      try {
        await storageClient.uploadFromBuffer(imageId, imageBuffer);
        const url = `/api/images/${imageId}`;
        return { url, success: true };
      } catch (error) {
        console.warn('Object storage upload failed, falling back to filesystem:', error);
      }
    }
    
    // Fallback to local filesystem
    const imagePath = path.join(TEMP_DIR, imageId);
    await fs.promises.writeFile(imagePath, imageBuffer);
    
    // Return a temporary URL for local development
    // In production, this would be a proper URL
    const url = `/api/images/${imageId}`;
    return { url, success: true };
  } catch (error) {
    console.error('Error in uploadProductImage:', error);
    return {
      url: '',
      success: false
    };
  }
}

/**
 * Delete an image from storage
 * @param imageId The ID of the image to delete
 * @returns Promise with the result of the deletion
 */
export async function deleteProductImage(imageId: string): Promise<boolean> {
  try {
    // If object storage client is available, try to use it
    if (storageClient) {
      try {
        await storageClient.delete(imageId);
        return true;
      } catch (error) {
        console.warn('Object storage deletion failed, falling back to filesystem:', error);
      }
    }
    
    // Fallback to local filesystem
    const imagePath = path.join(TEMP_DIR, imageId);
    if (fs.existsSync(imagePath)) {
      await fs.promises.unlink(imagePath);
    }
    
    return true;
  } catch (error) {
    console.error('Error in deleteProductImage:', error);
    return false;
  }
}

/**
 * Get the public URL for an image
 * @param imageId The ID of the image
 * @returns The public URL to access the image
 */
export function getImagePublicUrl(imageId: string): string {
  // We'll always use our own API endpoint for image serving
  // This way we can handle both local file storage and object storage
  return `/api/images/${imageId}`;
}

/**
 * Generate a new UUID for an image
 * @returns A new UUID string
 */
export function generateImageId(): string {
  return randomUUID();
}