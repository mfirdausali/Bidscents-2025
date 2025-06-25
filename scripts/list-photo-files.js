/**
 * List Photo Files in Supabase Storage Buckets
 * 
 * This script lists only photo/image files in your Supabase storage buckets.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Photo file extensions to filter
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.tif'];

function isPhotoFile(filename) {
  const lowerName = filename.toLowerCase();
  return PHOTO_EXTENSIONS.some(ext => lowerName.endsWith(ext)) || 
         // Handle files without extensions that might be images
         (!lowerName.includes('.') && lowerName.includes('image'));
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function listPhotoFiles(supabase, bucketName, path = '', indent = '   ') {
  const { data, error } = await supabase
    .storage
    .from(bucketName)
    .list(path, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });
  
  if (error) {
    console.log(`${indent}❌ Error accessing bucket: ${error.message}`);
    return { count: 0, totalSize: 0 };
  }
  
  if (!data || data.length === 0) {
    return { count: 0, totalSize: 0 };
  }
  
  let photoCount = 0;
  let totalSize = 0;
  
  for (const item of data) {
    if (item.id) {
      // It's a file
      if (isPhotoFile(item.name)) {
        const size = item.metadata?.size || 0;
        console.log(`${indent}📸 ${item.name}`);
        console.log(`${indent}   Size: ${formatBytes(size)} | Modified: ${item.updated_at?.split('T')[0]}`);
        photoCount++;
        totalSize += size;
      }
    } else {
      // It's a folder - recursively check
      const folderPath = path ? `${path}/${item.name}` : item.name;
      const folderStats = await listPhotoFiles(supabase, bucketName, folderPath, indent + '   ');
      photoCount += folderStats.count;
      totalSize += folderStats.totalSize;
    }
  }
  
  return { count: photoCount, totalSize };
}

async function listAllPhotoFiles() {
  try {
    console.log("📸 PHOTO FILES IN SUPABASE STORAGE");
    console.log("=" .repeat(50));
    
    // Get all buckets
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets();
    
    if (bucketsError) throw bucketsError;
    
    let grandTotal = 0;
    let grandTotalSize = 0;
    
    for (const bucket of buckets) {
      console.log(`\n📁 BUCKET: ${bucket.name.toUpperCase()}`);
      console.log(`   Public: ${bucket.public ? '✅' : '🔒'} | Created: ${bucket.created_at?.split('T')[0]}`);
      console.log(`   Photo Files:`);
      
      const stats = await listPhotoFiles(supabase, bucket.name);
      
      if (stats.count === 0) {
        console.log(`   (no photo files found)`);
      } else {
        console.log(`\n   📊 BUCKET SUMMARY:`);
        console.log(`      Photos: ${stats.count} files`);
        console.log(`      Total Size: ${formatBytes(stats.totalSize)}`);
      }
      
      grandTotal += stats.count;
      grandTotalSize += stats.totalSize;
    }
    
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📊 GRAND TOTAL:`);
    console.log(`   Total Photo Files: ${grandTotal}`);
    console.log(`   Total Storage Used: ${formatBytes(grandTotalSize)}`);
    console.log(`   Across ${buckets.length} buckets`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
listAllPhotoFiles();