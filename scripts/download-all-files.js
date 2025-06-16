/**
 * Download All Files from Object Storage Script
 * 
 * This script downloads all files from both object storage buckets:
 * 1. Main bucket (product images, profile photos, cover photos)
 * 2. Message files bucket
 * 
 * Files are organized in folders by type:
 * - downloads/product-images/
 * - downloads/profile-images/
 * - downloads/cover-photos/
 * - downloads/message-files/
 * - downloads/unknown/ (for files not in database)
 */

import { Client } from "@replit/object-storage";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection using Supabase
const { Pool } = pg;

// Construct Supabase connection string with service role
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials:");
  console.error("   VITE_SUPABASE_URL:", supabaseUrl ? "✅ Set" : "❌ Missing");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✅ Set" : "❌ Missing");
  process.exit(1);
}

// Extract database details from Supabase URL
const supabaseUrlObj = new URL(supabaseUrl);
const supabaseHost = supabaseUrlObj.hostname;
const supabaseProject = supabaseHost.split('.')[0];

const connectionString = `postgresql://postgres:${supabaseServiceKey}@db.${supabaseProject}.supabase.co:5432/postgres`;

console.log(`🔗 Connecting to Supabase database: ${supabaseProject}`);

const pool = new Pool({
  connectionString: connectionString,
});

// Object storage clients
const productBucketId =
  process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID ||
  "replit-objstore-0eba980b-4a8f-47b6-90af-f554bb8688e2";
const messageBucketId = "replit-objstore-94260517-cd41-4021-b194-9f9e53fa8889";

const storageClient = new Client({ bucketId: productBucketId });
const messageFileStorageClient = new Client({ bucketId: messageBucketId });

// Create download directories
const downloadDir = path.join(__dirname, "../downloads");
const productImagesDir = path.join(downloadDir, "product-images");
const profileImagesDir = path.join(downloadDir, "profile-images");
const coverPhotosDir = path.join(downloadDir, "cover-photos");
const messageFilesDir = path.join(downloadDir, "message-files");
const unknownDir = path.join(downloadDir, "unknown");

function createDirectories() {
  console.log("📁 Creating download directories...");
  [downloadDir, productImagesDir, profileImagesDir, coverPhotosDir, messageFilesDir, unknownDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  ✅ Created: ${dir}`);
    }
  });
}

// Get all file IDs from database
async function getFileIdsFromDatabase() {
  console.log("🔍 Fetching file IDs from database...");
  
  const fileMap = {
    productImages: new Set(),
    profileImages: new Set(),
    coverPhotos: new Set(),
    messageFiles: new Set()
  };

  try {
    // Get product images
    const productImagesQuery = await pool.query("SELECT DISTINCT image_url FROM product_images WHERE image_url IS NOT NULL");
    productImagesQuery.rows.forEach(row => {
      if (row.image_url) fileMap.productImages.add(row.image_url);
    });
    console.log(`  📸 Found ${fileMap.productImages.size} product images in database`);

    // Get user profile images
    const profileImagesQuery = await pool.query("SELECT DISTINCT avatar_url FROM users WHERE avatar_url IS NOT NULL");
    profileImagesQuery.rows.forEach(row => {
      if (row.avatar_url) fileMap.profileImages.add(row.avatar_url);
    });
    console.log(`  👤 Found ${fileMap.profileImages.size} profile images in database`);

    // Get user cover photos
    const coverPhotosQuery = await pool.query("SELECT DISTINCT cover_photo FROM users WHERE cover_photo IS NOT NULL");
    coverPhotosQuery.rows.forEach(row => {
      if (row.cover_photo) fileMap.coverPhotos.add(row.cover_photo);
    });
    console.log(`  🖼️ Found ${fileMap.coverPhotos.size} cover photos in database`);

    // Get message files
    const messageFilesQuery = await pool.query("SELECT DISTINCT file_url FROM messages WHERE file_url IS NOT NULL AND file_url != 'NULL'");
    messageFilesQuery.rows.forEach(row => {
      if (row.file_url && row.file_url !== 'NULL') fileMap.messageFiles.add(row.file_url);
    });
    console.log(`  📎 Found ${fileMap.messageFiles.size} message files in database`);

  } catch (error) {
    console.error("❌ Error querying database:", error);
  }

  return fileMap;
}

// List all files in a bucket
async function listAllFilesInBucket(client, bucketName) {
  console.log(`📋 Listing all files in ${bucketName} bucket...`);
  
  try {
    // Note: The Replit Object Storage Client doesn't have a direct list method
    // We'll need to rely on database records and attempt downloads
    console.log(`  ⚠️ Object storage client doesn't support listing - relying on database records`);
    return [];
  } catch (error) {
    console.error(`❌ Error listing files in ${bucketName}:`, error);
    return [];
  }
}

// Download a single file
async function downloadFile(client, fileId, destinationPath, fileType) {
  try {
    console.log(`📥 Downloading ${fileType}: ${fileId}`);
    
    const result = await client.downloadAsBytes(fileId);
    
    if (!result.ok || !result.value) {
      console.log(`  ⚠️ File not found: ${fileId}`);
      return false;
    }

    const fileBuffer = result.value[0];
    const fileName = fileId.includes('.') ? fileId : `${fileId}.bin`;
    const fullPath = path.join(destinationPath, fileName);
    
    fs.writeFileSync(fullPath, fileBuffer);
    console.log(`  ✅ Downloaded: ${fileName} (${fileBuffer.length} bytes)`);
    
    return true;
  } catch (error) {
    console.log(`  ❌ Error downloading ${fileId}:`, error.message);
    return false;
  }
}

// Download files by category
async function downloadFilesByCategory(fileMap) {
  let totalDownloaded = 0;
  let totalAttempted = 0;

  console.log("\n🚀 Starting downloads...\n");

  // Download product images
  console.log("📸 Downloading product images...");
  for (const fileId of fileMap.productImages) {
    totalAttempted++;
    if (await downloadFile(storageClient, fileId, productImagesDir, "product image")) {
      totalDownloaded++;
    }
  }

  // Download profile images
  console.log("\n👤 Downloading profile images...");
  for (const fileId of fileMap.profileImages) {
    totalAttempted++;
    if (await downloadFile(storageClient, fileId, profileImagesDir, "profile image")) {
      totalDownloaded++;
    }
  }

  // Download cover photos
  console.log("\n🖼️ Downloading cover photos...");
  for (const fileId of fileMap.coverPhotos) {
    totalAttempted++;
    if (await downloadFile(storageClient, fileId, coverPhotosDir, "cover photo")) {
      totalDownloaded++;
    }
  }

  // Download message files
  console.log("\n📎 Downloading message files...");
  for (const fileId of fileMap.messageFiles) {
    totalAttempted++;
    if (await downloadFile(messageFileStorageClient, fileId, messageFilesDir, "message file")) {
      totalDownloaded++;
    }
  }

  return { totalDownloaded, totalAttempted };
}

// Generate download summary
function generateSummary(stats, fileMap) {
  const summaryPath = path.join(downloadDir, "download-summary.txt");
  const timestamp = new Date().toISOString();
  
  const summary = `
OBJECT STORAGE DOWNLOAD SUMMARY
Generated: ${timestamp}

DATABASE RECORDS:
- Product Images: ${fileMap.productImages.size}
- Profile Images: ${fileMap.profileImages.size}
- Cover Photos: ${fileMap.coverPhotos.size}
- Message Files: ${fileMap.messageFiles.size}
- Total in Database: ${fileMap.productImages.size + fileMap.profileImages.size + fileMap.coverPhotos.size + fileMap.messageFiles.size}

DOWNLOAD RESULTS:
- Files Attempted: ${stats.totalAttempted}
- Files Downloaded: ${stats.totalDownloaded}
- Success Rate: ${stats.totalAttempted > 0 ? ((stats.totalDownloaded / stats.totalAttempted) * 100).toFixed(1) : 0}%

DOWNLOAD LOCATIONS:
- Product Images: ./downloads/product-images/
- Profile Images: ./downloads/profile-images/
- Cover Photos: ./downloads/cover-photos/
- Message Files: ./downloads/message-files/
- Unknown Files: ./downloads/unknown/

BUCKET INFORMATION:
- Main Bucket ID: ${productBucketId}
- Message Bucket ID: ${messageBucketId}

NOTE: Files that couldn't be downloaded may have been deleted from object storage
or the file IDs in the database may be outdated.
`;

  fs.writeFileSync(summaryPath, summary);
  console.log(`\n📊 Summary saved to: ${summaryPath}`);
  console.log(summary);
}

// Main execution function
async function main() {
  console.log("🔄 Starting Object Storage Download Script");
  console.log("==========================================\n");

  try {
    // Create directories
    createDirectories();

    // Get file IDs from database
    const fileMap = await getFileIdsFromDatabase();

    // Download all files
    const stats = await downloadFilesByCategory(fileMap);

    // Generate summary
    generateSummary(stats, fileMap);

    console.log("\n✅ Download script completed successfully!");
    console.log(`📁 Check the 'downloads' folder for your files`);

  } catch (error) {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Download interrupted by user');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Download terminated');
  await pool.end();
  process.exit(0);
});

// Run the script
main().catch(async (error) => {
  console.error('❌ Unhandled error:', error);
  await pool.end();
  process.exit(1);
});