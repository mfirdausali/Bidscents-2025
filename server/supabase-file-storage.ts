import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { IMAGE_TYPES } from "./types/index.js";
import logger from "./utils/logger.js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const STORAGE_BUCKETS = {
  PRODUCT_IMAGES: "listing-images",
  USER_PROFILES: "profile-images",
  MESSAGE_FILES: "message-files",
} as const;

type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];

function getBucketForImageType(imageType: string): StorageBucket {
  switch (imageType) {
    case IMAGE_TYPES.PRODUCT:
      return STORAGE_BUCKETS.PRODUCT_IMAGES;
    case IMAGE_TYPES.PROFILE:
    case IMAGE_TYPES.COVER:
      return STORAGE_BUCKETS.USER_PROFILES;
    case IMAGE_TYPES.MESSAGE_FILE:
      return STORAGE_BUCKETS.MESSAGE_FILES;
    default:
      throw new Error(`Unknown image type: ${imageType}`);
  }
}

function generateStoragePath(imageType: string, fileExtension: string): string {
  const uuid = uuidv4();
  
  // Upload to root directory with type prefix in filename
  return `${imageType}_${uuid}${fileExtension}`;
}

function getFileExtension(mimetype: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  };
  
  return mimeToExt[mimetype] || ".bin";
}

export async function uploadFile(
  buffer: Buffer,
  imageType: string,
  mimetype: string,
  existingFileId?: string
): Promise<string> {
  try {
    const bucket = getBucketForImageType(imageType);
    const fileExtension = getFileExtension(mimetype);
    
    let storagePath: string;
    let fileId: string;
    
    if (existingFileId) {
      // Parse existing file ID to get the storage path
      const parsed = parseFileId(existingFileId);
      storagePath = `${parsed.imageType}_${parsed.uuid}${fileExtension}`;
      fileId = existingFileId;
    } else {
      // Generate new storage path and file ID
      storagePath = generateStoragePath(imageType, fileExtension);
      const filename = storagePath.split("/").pop() || storagePath;
      const uuid = filename.split("_")[1]?.split(".")[0];
      fileId = `${imageType}_${uuid}`;
    }
    
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        cacheControl: "3600",
        upsert: existingFileId ? true : false, // Allow upsert if using existing file ID
      });

    if (error) {
      logger.error("Supabase storage upload error:", error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
    
    logger.info(`File uploaded to Supabase Storage: ${fileId} -> ${bucket}/${storagePath}`);
    
    return fileId;
  } catch (error) {
    logger.error("File upload error:", error);
    throw error;
  }
}

// Helper function to handle both old and new file ID formats
function parseFileId(fileId: string): { imageType: string; uuid: string } {
  // Handle legacy image-id- format (map to product type)
  if (fileId.startsWith("image-id-")) {
    const uuid = fileId.replace("image-id-", "");
    return { imageType: IMAGE_TYPES.PRODUCT, uuid };
  }
  
  // Handle underscore format (profile_, cover_, etc.)
  if (fileId.includes("_")) {
    const [imageType, uuid] = fileId.split("_");
    return { imageType, uuid };
  } 
  
  // Handle dash format for other types
  const [imageType, ...uuidParts] = fileId.split("-");
  return { imageType, uuid: uuidParts.join("-") };
}

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; mimetype: string }> {
  try {
    const { imageType, uuid } = parseFileId(fileId);
    const bucket = getBucketForImageType(imageType);
    
    // For legacy formats, search for the full original fileId instead of just UUID
    const searchTerm = (fileId.startsWith("image-id-") || fileId.includes("_")) ? fileId : uuid;
    
    // First try to find in root directory
    const { data: rootFiles, error: rootError } = await supabase.storage
      .from(bucket)
      .list("", {
        search: searchTerm,
      });

    let filePath: string | null = null;
    
    if (rootFiles && rootFiles.length > 0) {
      // File found in root
      filePath = rootFiles[0].name;
    } else {
      // Try subdirectories for backward compatibility
      const subdir = imageType === IMAGE_TYPES.PRODUCT ? "products" : 
                     imageType === IMAGE_TYPES.PROFILE ? "avatars" :
                     imageType === IMAGE_TYPES.COVER ? "covers" : "messages";
      
      const { data: subdirFiles } = await supabase.storage
        .from(bucket)
        .list(subdir, {
          search: searchTerm,
        });
        
      if (subdirFiles && subdirFiles.length > 0) {
        filePath = `${subdir}/${subdirFiles[0].name}`;
      }
    }

    if (!filePath) {
      throw new Error(`File not found: ${fileId}`);
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(filePath);

    if (error) {
      logger.error("Supabase storage download error:", error);
      throw new Error(`Failed to download file: ${error.message}`);
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const mimetype = data.type || "application/octet-stream";

    return { buffer, mimetype };
  } catch (error) {
    logger.error("File download error:", error);
    throw error;
  }
}

export async function deleteFile(fileId: string): Promise<void> {
  try {
    const { imageType, uuid } = parseFileId(fileId);
    const bucket = getBucketForImageType(imageType);
    
    // For legacy formats, search for the full original fileId instead of just UUID
    const searchTerm = (fileId.startsWith("image-id-") || fileId.includes("_")) ? fileId : uuid;
    
    // First try to find in root directory
    const { data: rootFiles } = await supabase.storage
      .from(bucket)
      .list("", {
        search: searchTerm,
      });

    let filePath: string | null = null;
    
    if (rootFiles && rootFiles.length > 0) {
      // File found in root
      filePath = rootFiles[0].name;
    } else {
      // Try subdirectories for backward compatibility
      const subdir = imageType === IMAGE_TYPES.PRODUCT ? "products" : 
                     imageType === IMAGE_TYPES.PROFILE ? "avatars" :
                     imageType === IMAGE_TYPES.COVER ? "covers" : "messages";
      
      const { data: subdirFiles } = await supabase.storage
        .from(bucket)
        .list(subdir, {
          search: searchTerm,
        });
        
      if (subdirFiles && subdirFiles.length > 0) {
        filePath = `${subdir}/${subdirFiles[0].name}`;
      }
    }

    if (!filePath) {
      logger.warn(`File not found for deletion: ${fileId}`);
      return;
    }

    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      logger.error("Supabase storage delete error:", error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }

    logger.info(`File deleted from Supabase Storage: ${fileId}`);
  } catch (error) {
    logger.error("File deletion error:", error);
    throw error;
  }
}

export async function getPublicUrl(fileId: string): Promise<string> {
  try {
    const { imageType, uuid } = parseFileId(fileId);
    const bucket = getBucketForImageType(imageType);
    
    // For legacy formats, search for the full original fileId instead of just UUID
    const searchTerm = (fileId.startsWith("image-id-") || fileId.includes("_")) ? fileId : uuid;
    
    // First try to find in root directory
    const { data: rootFiles } = await supabase.storage
      .from(bucket)
      .list("", {
        search: searchTerm,
      });

    let filePath: string | null = null;
    
    if (rootFiles && rootFiles.length > 0) {
      // File found in root
      filePath = rootFiles[0].name;
    } else {
      // Try subdirectories for backward compatibility
      const subdir = imageType === IMAGE_TYPES.PRODUCT ? "products" : 
                     imageType === IMAGE_TYPES.PROFILE ? "avatars" :
                     imageType === IMAGE_TYPES.COVER ? "covers" : "messages";
      
      const { data: subdirFiles } = await supabase.storage
        .from(bucket)
        .list(subdir, {
          search: searchTerm,
        });
        
      if (subdirFiles && subdirFiles.length > 0) {
        filePath = `${subdir}/${subdirFiles[0].name}`;
      }
    }

    if (!filePath) {
      throw new Error(`File not found: ${fileId}`);
    }

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (error) {
    logger.error("Get public URL error:", error);
    throw error;
  }
}

export async function createSignedUrl(fileId: string, expiresIn: number = 3600): Promise<string> {
  try {
    const { imageType, uuid } = parseFileId(fileId);
    const bucket = getBucketForImageType(imageType);
    
    const { data: files, error: listError } = await supabase.storage
      .from(bucket)
      .list(imageType === IMAGE_TYPES.PRODUCT ? "products" : 
            imageType === IMAGE_TYPES.PROFILE ? "avatars" :
            imageType === IMAGE_TYPES.COVER ? "covers" : "messages", {
        search: uuid,
      });

    if (listError || !files || files.length === 0) {
      throw new Error("File not found");
    }

    const filePath = `${imageType === IMAGE_TYPES.PRODUCT ? "products" : 
                       imageType === IMAGE_TYPES.PROFILE ? "avatars" :
                       imageType === IMAGE_TYPES.COVER ? "covers" : "messages"}/${files[0].name}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      logger.error("Create signed URL error:", error);
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  } catch (error) {
    logger.error("Create signed URL error:", error);
    throw error;
  }
}

export async function validateFileSize(buffer: Buffer, maxSize: number): Promise<void> {
  if (buffer.length > maxSize) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSize} bytes`);
  }
}

export async function validateImageDimensions(
  buffer: Buffer,
  maxWidth: number,
  maxHeight: number
): Promise<void> {
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(buffer).metadata();
  
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions");
  }
  
  if (metadata.width > maxWidth || metadata.height > maxHeight) {
    throw new Error(`Image dimensions exceed maximum allowed size of ${maxWidth}x${maxHeight}`);
  }
}