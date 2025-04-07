import { Client, UploadOptions, DeleteOptions, DownloadOptions } from '@replit/object-storage';

// Initialize Object Storage Client
const objStorage = new Client();
const BUCKET_PREFIX = 'products';

// Function to upload a file to object storage
export async function uploadToObjectStorage(
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  try {
    // Create options for upload
    const options: UploadOptions = {
      compress: true
    };

    // Create a unique path for the file
    const timestamp = Date.now();
    const filePath = `${BUCKET_PREFIX}/${timestamp}-${fileName.replace(/\s+/g, '_')}`;

    // Upload the file
    const result = await objStorage.uploadFromBytes(filePath, fileBuffer, options);
    
    if (!result.ok) {
      throw new Error(`Failed to upload: ${result.error}`);
    }

    // Return the URL to access the file
    return `/${filePath}`;
  } catch (error) {
    console.error('Error uploading to object storage:', error);
    throw new Error('Failed to upload file to storage');
  }
}

// Function to get a file from object storage
export async function getFromObjectStorage(filePath: string): Promise<Buffer | null> {
  try {
    const result = await objStorage.downloadAsBytes(filePath);
    
    if (!result.ok) {
      console.error(`Error downloading file: ${result.error}`);
      return null;
    }
    
    return result.value[0];
  } catch (error) {
    console.error('Error getting file from object storage:', error);
    return null;
  }
}

// Function to delete a file from object storage
export async function deleteFromObjectStorage(filePath: string): Promise<boolean> {
  try {
    const result = await objStorage.delete(filePath);
    
    if (!result.ok) {
      console.error(`Error deleting file: ${result.error}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting file from object storage:', error);
    return false;
  }
}