import * as supabaseFileStorage from './supabase-file-storage';

/**
 * Helper to transform image IDs to public URLs
 * Handles both new Supabase storage and legacy formats
 */
export async function transformImageUrls<T extends Record<string, any>>(
  data: T | null,
  imageFields: string[] = []
): Promise<T | null> {
  if (!data) return null;
  
  const transformed = { ...data };
  
  for (const field of imageFields) {
    const imageId = data[field];
    
    if (imageId && typeof imageId === 'string') {
      try {
        // Check if it's already a full URL (legacy data or external URLs)
        if (imageId.startsWith('http://') || imageId.startsWith('https://')) {
          // Already a full URL, keep as is
          transformed[field] = imageId;
        } else {
          // It's an ID, convert to public URL
          transformed[field] = await supabaseFileStorage.getPublicUrl(imageId);
        }
      } catch (error) {
        console.warn(`Failed to get public URL for ${field}:`, error);
        // On error, return the original value
        transformed[field] = imageId;
      }
    }
  }
  
  return transformed;
}

/**
 * Transform multiple items with image URLs
 */
export async function transformImageUrlsArray<T extends Record<string, any>>(
  items: T[],
  imageFields: string[] = []
): Promise<T[]> {
  return Promise.all(
    items.map(item => transformImageUrls(item, imageFields))
  ).then(results => results.filter(Boolean) as T[]);
}

/**
 * Transform user profile images
 */
export async function transformUserImages(user: any): Promise<any> {
  if (!user) return null;
  
  return transformImageUrls(user, ['profileImage', 'avatarUrl', 'coverPhoto']);
}

/**
 * Transform product images
 */
export async function transformProductImages(product: any): Promise<any> {
  if (!product) return null;
  
  // Transform main image URL
  const transformed = await transformImageUrls(product, ['imageUrl']);
  
  // Transform images array if present
  if (transformed?.images && Array.isArray(transformed.images)) {
    transformed.images = await transformImageUrlsArray(
      transformed.images,
      ['imageUrl']
    );
  }
  
  return transformed;
}

/**
 * Check if a string is already a full URL
 */
export function isFullUrl(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Get image URL - returns full URL or constructs /api/images/ URL
 */
export async function getImageUrl(imageId: string | null | undefined): Promise<string | null> {
  if (!imageId) return null;
  
  // If it's already a full URL, return as is
  if (isFullUrl(imageId)) {
    return imageId;
  }
  
  // For frontend compatibility, we can either:
  // 1. Return the /api/images/ URL (current approach)
  // 2. Return the direct Supabase URL
  
  // Option 1: Keep compatibility with existing frontend
  return `/api/images/${imageId}`;
  
  // Option 2: Return direct Supabase URL (uncomment if preferred)
  // try {
  //   return await supabaseFileStorage.getPublicUrl(imageId);
  // } catch (error) {
  //   console.error('Failed to get public URL:', error);
  //   return `/api/images/${imageId}`; // Fallback to API route
  // }
}