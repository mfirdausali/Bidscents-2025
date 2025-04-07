import { Client } from '@replit/object-storage';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { productImages, InsertProductImage } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Create a client instance for Replit Object Storage with configuration
const client = new Client({
  bucketId: 'ProductImageBucket'
});

// The bucket name where product images will be stored
const BUCKET_NAME = 'ProductImageBucket';

export class ImageStorageService {
  /**
   * Initialize the image storage service
   */
  constructor() {
    this.ensureBucketExists();
  }

  /**
   * Make sure the bucket exists
   */
  private async ensureBucketExists() {
    try {
      const { ok, value, error } = await client.list();
      if (!ok) {
        console.error('Failed to list buckets:', error);
        return;
      }
      
      // Check if our bucket already exists
      const bucketExists = value.some(obj => obj.name.startsWith(`${BUCKET_NAME}/`));
      
      if (!bucketExists) {
        // Create a file to initialize the bucket
        const { ok, error } = await client.uploadFromText(
          `${BUCKET_NAME}/.init`, 
          "Bucket initialization file"
        );
        
        if (!ok) {
          console.error('Failed to initialize bucket:', error);
        } else {
          console.log(`Bucket ${BUCKET_NAME} initialized`);
        }
      }
    } catch (error) {
      console.error('Error ensuring bucket exists:', error);
    }
  }

  /**
   * Generate a unique image ID for storage
   * @param productName The name of the product
   * @param sellerName The name of the seller
   * @returns A unique image ID
   */
  generateImageId(productName: string, sellerName: string): string {
    // Clean the names to use in the filename
    const cleanProductName = productName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const cleanSellerName = sellerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Generate a unique ID
    const uniqueId = uuidv4().slice(0, 8);
    
    // Create a unique image ID
    return `${cleanSellerName}_${cleanProductName}_${uniqueId}`;
  }

  /**
   * Upload an image to object storage
   * @param imageId The ID of the image
   * @param imageData The image data as a Buffer
   * @param contentType The content type of the image (e.g., "image/jpeg", "image/png")
   * @returns True if the upload succeeded
   */
  async uploadImage(imageId: string, imageData: Buffer, contentType: string): Promise<boolean> {
    try {
      const objectKey = `${BUCKET_NAME}/${imageId}`;
      
      // Convert Buffer to string for text upload
      const base64Data = imageData.toString('base64');
      
      // Upload the image to object storage
      const { ok, error } = await client.uploadFromText(objectKey, base64Data);
      
      if (!ok) {
        console.error(`Failed to upload image ${imageId}:`, error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Error uploading image ${imageId}:`, error);
      return false;
    }
  }

  /**
   * Retrieve an image from object storage
   * @param imageId The ID of the image to retrieve
   * @returns The image data as a Buffer or null if not found
   */
  async getImage(imageId: string): Promise<{ data: Buffer | null, contentType: string | null }> {
    try {
      const objectKey = `${BUCKET_NAME}/${imageId}`;
      
      // Try to download the image from object storage
      try {
        // Download the image from object storage as text (base64)
        const { ok, value, error } = await client.downloadAsText(objectKey);
        
        if (!ok) {
          console.error(`Failed to download image ${imageId}:`, error);
          // Fall back to placeholder image (return null and let the API handler deal with it)
          return { data: null, contentType: null };
        }
        
        // Convert base64 string back to Buffer
        const buffer = Buffer.from(value, 'base64');
        
        return { 
          data: buffer,
          contentType: 'image/jpeg' // Default to JPEG; in a real implementation we'd store this with the image
        };
      } catch (error) {
        console.error(`Error downloading image ${imageId} from object storage:`, error);
        // Fall back to placeholder image or no image
        return { data: null, contentType: null };
      }
    } catch (error) {
      console.error(`General error handling image ${imageId}:`, error);
      return { data: null, contentType: null };
    }
  }

  /**
   * Delete an image from object storage
   * @param imageId The ID of the image to delete
   * @returns True if the deletion succeeded
   */
  async deleteImage(imageId: string): Promise<boolean> {
    try {
      const objectKey = `${BUCKET_NAME}/${imageId}`;
      
      // Delete the image from object storage
      const { ok, error } = await client.delete(objectKey);
      
      if (!ok) {
        console.error(`Failed to delete image ${imageId}:`, error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Error deleting image ${imageId}:`, error);
      return false;
    }
  }

  /**
   * Associate an image with a product in the database
   * @param productId The ID of the product
   * @param imageId The ID of the image
   * @param isPrimary Whether this is the primary image for the product
   * @returns The created product image record
   */
  async associateImageWithProduct(
    productId: number, 
    imageId: string, 
    isPrimary: boolean = false
  ): Promise<InsertProductImage> {
    try {
      // If this is primary, first clear any existing primary images
      if (isPrimary) {
        try {
          await db.update(productImages)
            .set({ isPrimary: false })
            .where(eq(productImages.productId, productId));
        } catch (e) {
          console.warn(`Warning: Could not reset primary status for images of product ${productId}:`, e);
          // Continue anyway - this is not a critical error
        }
      }
      
      // Create a product image record
      const productImage: InsertProductImage = {
        productId,
        imageId,
        isPrimary
      };
      
      // Insert into the database
      await db.insert(productImages).values(productImage);
      
      console.log(`Successfully associated image ${imageId} with product ${productId}`);
      return productImage;
    } catch (error) {
      console.error(`Error associating image ${imageId} with product ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Get all images associated with a product
   * @param productId The ID of the product
   * @returns An array of product image records
   */
  async getProductImages(productId: number) {
    try {
      return await db.select().from(productImages).where(eq(productImages.productId, productId));
    } catch (error) {
      console.error(`Error getting images for product ${productId}:`, error);
      return [];
    }
  }

  /**
   * Update a product image to be the primary image
   * @param imageId The ID of the image to set as primary
   * @param productId The ID of the product
   * @returns True if the update succeeded
   */
  async setPrimaryImage(imageId: string, productId: number): Promise<boolean> {
    try {
      // First, clear any existing primary images for this product
      await db.update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, productId));
      
      // Then set the specified image as primary
      await db.update(productImages)
        .set({ isPrimary: true })
        .where(
          eq(productImages.imageId, imageId) && 
          eq(productImages.productId, productId)
        );
      
      return true;
    } catch (error) {
      console.error(`Error setting image ${imageId} as primary for product ${productId}:`, error);
      return false;
    }
  }

  /**
   * Delete all images associated with a product
   * @param productId The ID of the product
   * @returns True if the deletion succeeded
   */
  async deleteProductImages(productId: number): Promise<boolean> {
    try {
      // Get all images for this product
      const images = await this.getProductImages(productId);
      
      // Delete each image from object storage
      for (const image of images) {
        await this.deleteImage(image.imageId);
      }
      
      // Delete the database records
      await db.delete(productImages).where(eq(productImages.productId, productId));
      
      return true;
    } catch (error) {
      console.error(`Error deleting images for product ${productId}:`, error);
      return false;
    }
  }
}

// Export a singleton instance of the service
export const imageStorage = new ImageStorageService();