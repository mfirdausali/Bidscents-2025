import { Client } from '@replit/object-storage';
import { randomUUID } from 'crypto';

// Define constants for file types
export const IMAGE_TYPES = {
  PRODUCT: 'product',
  PROFILE: 'profile',
  COVER: 'cover',
  MESSAGE_FILE: 'message-file'
};

// Initialize the Replit Object Storage clients
// Use environment variable for deployment or fallback to default bucket ID
const productBucketId = process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID || "replit-objstore-0eba980b-4a8f-47b6-90af-f554bb8688e2";
const messageBucketId = "replit-objstore-94260517-cd41-4021-b194-9f9e53fa8889";

// Client for product images and user profiles
export const storageClient = new Client({
  bucketId: productBucketId
});

// Client for message file uploads
export const messageFileStorageClient = new Client({
  bucketId: messageBucketId
});

console.log(`Initialized main storage client with bucket: ${productBucketId}`);
console.log(`Initialized message files storage client with bucket: ${messageBucketId}`);

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
 * @param type Optional type prefix to help identify image usage
 * @returns A new UUID string
 */
export function generateImageId(type: string = IMAGE_TYPES.PRODUCT): string {
  return `${type}_${randomUUID()}`;
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

/**
 * Upload a user profile image
 * @param imageBuffer The image buffer to upload
 * @param userId The user ID associated with the profile image
 * @param contentType The content type of the image
 * @returns Promise with the result of the upload
 */
export async function uploadProfileImage(
  imageBuffer: Buffer,
  userId: number,
  contentType: string
): Promise<{ url: string, success: boolean }> {
  try {
    // Create an ID that includes the type prefix
    const imageId = generateImageId(IMAGE_TYPES.PROFILE);
    
    // Upload the image using the existing method
    const result = await storageClient.uploadFromBytes(imageId, imageBuffer);
    
    if (!result.ok) {
      console.error('Error uploading profile image:', result.error);
      throw new Error('Failed to upload profile image');
    }
    
    console.log(`Successfully uploaded profile image ${imageId} for user ${userId}`);
    return { url: imageId, success: true };
  } catch (error) {
    console.error('Error in uploadProfileImage:', error);
    return {
      url: '',
      success: false
    };
  }
}

/**
 * Upload a user cover photo
 * @param imageBuffer The image buffer to upload
 * @param userId The user ID associated with the cover photo
 * @param contentType The content type of the image
 * @returns Promise with the result of the upload
 */
export async function uploadCoverPhoto(
  imageBuffer: Buffer,
  userId: number,
  contentType: string
): Promise<{ url: string, success: boolean }> {
  try {
    // Create an ID that includes the type prefix
    const imageId = generateImageId(IMAGE_TYPES.COVER);
    
    // Upload the image using the existing method
    const result = await storageClient.uploadFromBytes(imageId, imageBuffer);
    
    if (!result.ok) {
      console.error('Error uploading cover photo:', result.error);
      throw new Error('Failed to upload cover photo');
    }
    
    console.log(`Successfully uploaded cover photo ${imageId} for user ${userId}`);
    return { url: imageId, success: true };
  } catch (error) {
    console.error('Error in uploadCoverPhoto:', error);
    return {
      url: '',
      success: false
    };
  }
}

/**
 * Validate an image's dimensions and size before upload
 * @param buffer Image buffer to validate
 * @param maxWidth Maximum width allowed
 * @param maxHeight Maximum height allowed
 * @param maxSizeMB Maximum size in MB
 * @returns Promise with validation result
 */
export async function validateImage(
  buffer: Buffer,
  maxWidth: number = 2048,
  maxHeight: number = 2048,
  maxSizeMB: number = 5
): Promise<{ valid: boolean, message?: string }> {
  // Check file size
  if (buffer.length > maxSizeMB * 1024 * 1024) {
    return { 
      valid: false, 
      message: `Image size exceeds the maximum allowed size of ${maxSizeMB}MB` 
    };
  }
  
  // Additional validation could be added here in the future
  // such as detecting image dimensions
  
  return { valid: true };
}

/**
 * Upload a file for a message
 * @param fileBuffer The file buffer to upload
 * @param contentType The content type of the file
 * @returns Promise with the result of the upload
 */
export async function uploadMessageFile(
  fileBuffer: Buffer,
  contentType: string
): Promise<{ url: string, success: boolean }> {
  try {
    // Create an ID that includes the type prefix
    const fileId = generateImageId(IMAGE_TYPES.MESSAGE_FILE);
    
    // Upload the file using the message file storage client
    const result = await messageFileStorageClient.uploadFromBytes(fileId, fileBuffer);
    
    if (!result.ok) {
      console.error('Error uploading message file:', result.error);
      throw new Error('Failed to upload message file');
    }
    
    console.log(`Successfully uploaded message file ${fileId}`);
    return { url: fileId, success: true };
  } catch (error) {
    console.error('Error in uploadMessageFile:', error);
    return {
      url: '',
      success: false
    };
  }
}

/**
 * Get a message file from Replit Object Storage
 * @param fileId The ID of the file to retrieve
 * @returns Promise with the file buffer or null if not found
 */
export async function getMessageFileFromStorage(fileId: string): Promise<Buffer | null> {
  try {
    const result = await messageFileStorageClient.downloadAsBytes(fileId);
    
    if (!result.ok || !result.value) {
      console.error('Error retrieving message file from Replit Object Storage:', result.error);
      return null;
    }
    
    return result.value[0]; // downloadAsBytes returns an array with one Buffer
  } catch (error) {
    console.error('Error in getMessageFileFromStorage:', error);
    return null;
  }
}

/**
 * Get the public URL for a message file
 * @param fileId The ID of the file
 * @returns The public URL to access the file
 */
export function getMessageFilePublicUrl(fileId: string): string {
  return `/api/message-files/${fileId}`;
}

