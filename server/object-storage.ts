import { Client } from '@replit/object-storage';
import { randomUUID } from 'crypto';

// Initialize the Replit Object Storage client with a hardcoded bucket ID
// This is the default bucket ID format used by Replit
export const storageClient = new Client({
  bucketId: "replit-objstore-0eba980b-4a8f-47b6-90af-f554bb8688e2" // Using the ID from the current project
});

console.log("Initialized Replit Object Storage client with project bucket");

/**
 * Upload an image to the Replit Object Storage bucket
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
    // Upload directly to the bucket using the client
    const result = await storageClient.uploadFromBytes(imageId, imageBuffer);
    
    if (!result.ok) {
      console.error('Error uploading to Replit Object Storage:', result.error);
      throw new Error('Failed to upload image');
    }
    
    // Return just the image ID, not the full path
    console.log(`Successfully uploaded image ${imageId} to Replit Object Storage`);
    return { url: imageId, success: true };
  } catch (error) {
    console.error('Error in uploadProductImage:', error);
    return {
      url: '',
      success: false
    };
  }
}

/**
 * Delete an image from Replit Object Storage
 * @param imageId The ID of the image to delete
 * @returns Promise with the result of the deletion
 */
export async function deleteProductImage(imageId: string): Promise<boolean> {
  try {
    const result = await storageClient.delete(imageId);
    
    if (!result.ok) {
      // Check if the error is because the object doesn't exist (404)
      if (result.error && result.error.statusCode === 404) {
        console.error(`Image ${imageId} not found in Object Storage`);
        // Return true since there's nothing to delete anyway
        return true;
      }
      
      console.error('Error deleting from Replit Object Storage:', result.error);
      return false;
    }
    
    console.log(`Successfully deleted image ${imageId} from Replit Object Storage`);
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
  // Since getPublicUrl is not available in the SDK, we use our API endpoint
  return `/api/images/${imageId}`;
}

/**
 * Generate a new UUID for an image
 * @returns A new UUID string
 */
export function generateImageId(): string {
  return randomUUID();
}

/**
 * Get an image from Replit Object Storage
 * @param imageId The ID of the image to retrieve
 * @returns Promise with the image buffer or null if not found
 */
export async function getImageFromStorage(imageId: string): Promise<Buffer | null> {
  try {
    const result = await storageClient.downloadAsBytes(imageId);
    
    if (!result.ok || !result.value) {
      console.error('Error retrieving image from Replit Object Storage:', result.error);
      return null;
    }
    
    // The result value should be a buffer
    return result.value[0]; // downloadAsBytes returns an array with one Buffer
  } catch (error) {
    console.error('Error in getImageFromStorage:', error);
    return null;
  }
}

