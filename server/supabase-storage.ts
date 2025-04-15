// Supabase storage implementation to replace Replit Object Storage
import { randomUUID } from 'crypto';
import { supabase } from './supabase-db';

// Bucket name for storing perfume images
const BUCKET_NAME = 'perfume-images';

/**
 * Upload an image to Supabase Storage
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
    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(imageId, imageBuffer, {
        contentType,
        upsert: true
      });
    
    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      throw new Error('Failed to upload image');
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(imageId);
    
    console.log(`Successfully uploaded image ${imageId} to Supabase Storage`);
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
 * Delete an image from Supabase Storage
 * @param imageId The ID of the image to delete
 * @returns Promise with the result of the deletion
 */
export async function deleteProductImage(imageId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([imageId]);
    
    if (error) {
      console.error('Error deleting from Supabase Storage:', error);
      return false;
    }
    
    console.log(`Successfully deleted image ${imageId} from Supabase Storage`);
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
  // Return API endpoint for consistency with current implementation
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
 * Get an image from Supabase Storage
 * @param imageId The ID of the image to retrieve
 * @returns Promise with the image buffer or null if not found
 */
export async function getImageFromStorage(imageId: string): Promise<Buffer | null> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .download(imageId);
    
    if (error || !data) {
      console.error('Error retrieving image from Supabase Storage:', error);
      
      // Try to get from Replit Object Storage as a fallback during migration
      try {
        console.log(`Trying to get image ${imageId} from Replit Object Storage as fallback...`);
        // Importing dynamically to avoid circular dependencies
        const replitObjectStorage = await import('./object-storage');
        const imageBuffer = await replitObjectStorage.getImageFromStorage(imageId);
        
        if (imageBuffer) {
          console.log(`Found image ${imageId} in Replit Object Storage, migrating to Supabase...`);
          
          // Migrate the image to Supabase Storage
          await uploadProductImage(
            imageBuffer,
            imageId,
            'image/jpeg' // Assuming JPEG format, but this might not be accurate
          );
          
          console.log(`Successfully migrated image ${imageId} to Supabase Storage`);
          return imageBuffer;
        }
      } catch (replitError) {
        console.error('Error trying to retrieve from Replit Object Storage:', replitError);
      }
      
      return null;
    }
    
    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error in getImageFromStorage:', error);
    return null;
  }
}

// Create the bucket if it doesn't exist
export async function ensureBucketExists(): Promise<boolean> {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing Supabase buckets:', listError);
      return false;
    }
    
    // Find if our bucket exists
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`Bucket ${BUCKET_NAME} does not exist, creating it...`);
      
      // Create the bucket
      const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true // Make the bucket public
      });
      
      if (error) {
        console.error('Error creating Supabase bucket:', error);
        return false;
      }
      
      console.log(`Successfully created Supabase bucket ${BUCKET_NAME}`);
      return true;
    }
    
    console.log(`Supabase bucket ${BUCKET_NAME} already exists`);
    return true;
  } catch (error) {
    console.error('Error in ensureBucketExists:', error);
    return false;
  }
}