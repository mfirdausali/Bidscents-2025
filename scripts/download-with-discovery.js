/**
 * Enhanced Object Storage Download Script with File Discovery
 * 
 * This script attempts to discover and download files from object storage by:
 * 1. Downloading all files referenced in the database
 * 2. Attempting to discover additional files using common patterns
 * 3. Trying different file extensions for known IDs
 */

import { Client } from "@replit/object-storage";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase connection
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials:");
  console.error("   VITE_SUPABASE_URL:", supabaseUrl ? "✅ Set" : "❌ Missing");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✅ Set" : "❌ Missing");
  process.exit(1);
}

console.log("🔗 Connecting to Supabase...");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Object storage clients
const productBucketId =
  process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID ||
  "replit-objstore-0eba980b-4a8f-47b6-90af-f554bb8688e2";
const messageBucketId = "replit-objstore-94260517-cd41-4021-b194-9f9e53fa8889";

const storageClient = new Client({ bucketId: productBucketId });
const messageFileStorageClient = new Client({ bucketId: messageBucketId });

// Create download directories
const downloadDir = path.join(__dirname, "../downloads-enhanced");
const productImagesDir = path.join(downloadDir, "product-images");
const profileImagesDir = path.join(downloadDir, "profile-images");
const coverPhotosDir = path.join(downloadDir, "cover-photos");
const messageFilesDir = path.join(downloadDir, "message-files");
const discoveredDir = path.join(downloadDir, "discovered");

function createDirectories() {
  console.log("Creating download directories...");
  [downloadDir, productImagesDir, profileImagesDir, coverPhotosDir, messageFilesDir, discoveredDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created: ${dir}`);
    }
  });
}

// Get all file IDs from database
async function getFileIdsFromDatabase() {
  console.log("Fetching file IDs from database...");
  
  const fileData = {
    productImages: [],
    profileImages: [],
    coverPhotos: [],
    messageFiles: [],
    allIds: new Set()
  };

  try {
    // Get product images with metadata
    const { data: productImagesData, error: productImagesError } = await supabase
      .from('product_images')
      .select(`
        image_url,
        image_name,
        created_at,
        products(name)
      `)
      .not('image_url', 'is', null);
    
    if (productImagesError) throw productImagesError;
    
    productImagesData.forEach(row => {
      if (row.image_url) {
        fileData.productImages.push({
          id: row.image_url,
          name: row.image_name,
          productName: row.products?.name,
          createdAt: row.created_at
        });
        fileData.allIds.add(row.image_url);
      }
    });
    console.log(`Found ${fileData.productImages.length} product images`);

    // Get user profile images
    const { data: profileImagesData, error: profileImagesError } = await supabase
      .from('users')
      .select('avatar_url, username, email')
      .not('avatar_url', 'is', null);
    
    if (profileImagesError) throw profileImagesError;
    
    profileImagesData.forEach(row => {
      if (row.avatar_url) {
        fileData.profileImages.push({
          id: row.avatar_url,
          username: row.username,
          email: row.email
        });
        fileData.allIds.add(row.avatar_url);
      }
    });
    console.log(`Found ${fileData.profileImages.length} profile images`);

    // Get user cover photos
    const { data: coverPhotosData, error: coverPhotosError } = await supabase
      .from('users')
      .select('cover_photo, username, email')
      .not('cover_photo', 'is', null);
    
    if (coverPhotosError) throw coverPhotosError;
    
    coverPhotosData.forEach(row => {
      if (row.cover_photo) {
        fileData.coverPhotos.push({
          id: row.cover_photo,
          username: row.username,
          email: row.email
        });
        fileData.allIds.add(row.cover_photo);
      }
    });
    console.log(`Found ${fileData.coverPhotos.length} cover photos`);

    // Get message files
    const { data: messageFilesData, error: messageFilesError } = await supabase
      .from('messages')
      .select(`
        file_url,
        created_at,
        sender:users!messages_sender_id_fkey(username),
        receiver:users!messages_receiver_id_fkey(username)
      `)
      .not('file_url', 'is', null)
      .neq('file_url', 'NULL');
    
    if (messageFilesError) throw messageFilesError;
    
    messageFilesData.forEach(row => {
      if (row.file_url && row.file_url !== 'NULL') {
        fileData.messageFiles.push({
          id: row.file_url,
          sender: row.sender?.username,
          receiver: row.receiver?.username,
          createdAt: row.created_at
        });
        fileData.allIds.add(row.file_url);
      }
    });
    console.log(`Found ${fileData.messageFiles.length} message files`);

  } catch (error) {
    console.error("Error querying database:", error);
  }

  return fileData;
}

// Download a single file with metadata
async function downloadFileWithMetadata(client, fileInfo, destinationPath, fileType) {
  try {
    const fileId = typeof fileInfo === 'string' ? fileInfo : fileInfo.id;
    console.log(`Downloading ${fileType}: ${fileId}`);
    
    const result = await client.downloadAsBytes(fileId);
    
    if (!result.ok || !result.value) {
      console.log(`File not found: ${fileId}`);
      return false;
    }

    const fileBuffer = result.value[0];
    
    // Determine file extension
    let extension = '';
    if (fileId.includes('.')) {
      extension = path.extname(fileId);
    } else {
      // Try to determine from file signature
      const signature = fileBuffer.slice(0, 4);
      if (signature[0] === 0xFF && signature[1] === 0xD8) extension = '.jpg';
      else if (signature[0] === 0x89 && signature[1] === 0x50) extension = '.png';
      else if (signature[0] === 0x47 && signature[1] === 0x49) extension = '.gif';
      else if (signature[0] === 0x52 && signature[1] === 0x49) extension = '.webp';
      else extension = '.bin';
    }
    
    const fileName = fileId.includes('.') ? fileId : `${fileId}${extension}`;
    const fullPath = path.join(destinationPath, fileName);
    
    fs.writeFileSync(fullPath, fileBuffer);
    
    // Create metadata file
    if (typeof fileInfo === 'object') {
      const metadataPath = path.join(destinationPath, `${fileName}.metadata.json`);
      fs.writeFileSync(metadataPath, JSON.stringify(fileInfo, null, 2));
    }
    
    console.log(`Downloaded: ${fileName} (${fileBuffer.length} bytes)`);
    return true;
  } catch (error) {
    console.log(`Error downloading ${typeof fileInfo === 'string' ? fileInfo : fileInfo.id}: ${error.message}`);
    return false;
  }
}

// Attempt to discover files using common patterns
async function discoverAdditionalFiles(knownIds) {
  console.log("Attempting to discover additional files...");
  
  const discoveredFiles = [];
  const commonExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt'];
  const prefixes = ['product_', 'profile_', 'cover_', 'message-file_'];
  
  // Try variations of known IDs
  for (const knownId of knownIds) {
    // Try different extensions
    const baseId = knownId.split('.')[0];
    for (const ext of commonExtensions) {
      const testId = `${baseId}${ext}`;
      if (!knownIds.has(testId)) {
        try {
          const result = await storageClient.downloadAsBytes(testId);
          if (result.ok && result.value) {
            console.log(`Discovered file: ${testId}`);
            discoveredFiles.push(testId);
            await downloadFileWithMetadata(storageClient, testId, discoveredDir, "discovered file");
          }
        } catch (error) {
          // Silent fail for discovery attempts
        }
      }
    }
  }
  
  console.log(`Discovered ${discoveredFiles.length} additional files`);
  return discoveredFiles;
}

// Download files by category with enhanced features
async function downloadFilesByCategory(fileData) {
  let totalDownloaded = 0;
  let totalAttempted = 0;

  console.log("Starting enhanced downloads...");

  // Download product images
  console.log("Downloading product images...");
  for (const fileInfo of fileData.productImages) {
    totalAttempted++;
    if (await downloadFileWithMetadata(storageClient, fileInfo, productImagesDir, "product image")) {
      totalDownloaded++;
    }
  }

  // Download profile images
  console.log("Downloading profile images...");
  for (const fileInfo of fileData.profileImages) {
    totalAttempted++;
    if (await downloadFileWithMetadata(storageClient, fileInfo, profileImagesDir, "profile image")) {
      totalDownloaded++;
    }
  }

  // Download cover photos
  console.log("Downloading cover photos...");
  for (const fileInfo of fileData.coverPhotos) {
    totalAttempted++;
    if (await downloadFileWithMetadata(storageClient, fileInfo, coverPhotosDir, "cover photo")) {
      totalDownloaded++;
    }
  }

  // Download message files
  console.log("Downloading message files...");
  for (const fileInfo of fileData.messageFiles) {
    totalAttempted++;
    if (await downloadFileWithMetadata(messageFileStorageClient, fileInfo, messageFilesDir, "message file")) {
      totalDownloaded++;
    }
  }

  return { totalDownloaded, totalAttempted };
}

// Generate enhanced summary
function generateEnhancedSummary(stats, fileData, discoveredFiles = []) {
  const summaryPath = path.join(downloadDir, "enhanced-download-summary.txt");
  const timestamp = new Date().toISOString();
  
  const summary = `
ENHANCED OBJECT STORAGE DOWNLOAD SUMMARY
Generated: ${timestamp}

DATABASE RECORDS WITH METADATA:
- Product Images: ${fileData.productImages.length}
- Profile Images: ${fileData.profileImages.length}  
- Cover Photos: ${fileData.coverPhotos.length}
- Message Files: ${fileData.messageFiles.length}
- Total in Database: ${fileData.productImages.length + fileData.profileImages.length + fileData.coverPhotos.length + fileData.messageFiles.length}

DISCOVERY RESULTS:
- Additional Files Found: ${discoveredFiles.length}

DOWNLOAD RESULTS:
- Files Attempted: ${stats.totalAttempted}
- Files Downloaded: ${stats.totalDownloaded}
- Success Rate: ${stats.totalAttempted > 0 ? ((stats.totalDownloaded / stats.totalAttempted) * 100).toFixed(1) : 0}%

DOWNLOAD LOCATIONS:
- Product Images: ./downloads-enhanced/product-images/
- Profile Images: ./downloads-enhanced/profile-images/
- Cover Photos: ./downloads-enhanced/cover-photos/
- Message Files: ./downloads-enhanced/message-files/
- Discovered Files: ./downloads-enhanced/discovered/

FEATURES:
- Metadata files (.metadata.json) created for each download
- File type detection from binary signatures
- Automatic file extension assignment
- Enhanced discovery of additional files

BUCKET INFORMATION:
- Main Bucket ID: ${productBucketId}
- Message Bucket ID: ${messageBucketId}
`;

  fs.writeFileSync(summaryPath, summary);
  console.log(`Enhanced summary saved to: ${summaryPath}`);
  console.log(summary);
}

// Main execution function
async function main() {
  console.log("Starting Enhanced Object Storage Download Script");
  console.log("===============================================");

  try {
    createDirectories();
    const fileData = await getFileIdsFromDatabase();
    const stats = await downloadFilesByCategory(fileData);
    const discoveredFiles = await discoverAdditionalFiles(fileData.allIds);
    generateEnhancedSummary(stats, fileData, discoveredFiles);

    console.log("Enhanced download script completed successfully!");
    console.log("Check the 'downloads-enhanced' folder for your files");

  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Download interrupted by user');
  process.exit(0);
});

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});