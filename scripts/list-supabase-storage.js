/**
 * List All Supabase Storage Contents Script
 * 
 * This script lists all buckets and their contents in your Supabase storage.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials:");
  console.error("   SUPABASE_URL:", supabaseUrl ? "✅ Set" : "❌ Missing");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✅ Set" : "❌ Missing");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listAllStorageContents(supabase) {
  try {
    // Step 1: Get all buckets
    const { data: buckets, error: bucketsError } = await supabase
      .storage
      .listBuckets()
    
    if (bucketsError) throw bucketsError
    
    console.log(`\nFound ${buckets.length} bucket(s):\n`)
    
    // Step 2: List contents of each bucket
    for (const bucket of buckets) {
      console.log(`\n📁 Bucket: ${bucket.name}`)
      console.log(`   Public: ${bucket.public}`)
      console.log(`   Created: ${bucket.created_at}`)
      console.log(`   Contents:`)
      
      await listBucketContents(supabase, bucket.name)
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

async function listBucketContents(supabase, bucketName, path = '', indent = '   ') {
  const { data, error } = await supabase
    .storage
    .from(bucketName)
    .list(path, {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    })
  
  if (error) {
    console.log(`${indent}❌ Error accessing bucket: ${error.message}`)
    return
  }
  
  if (!data || data.length === 0) {
    console.log(`${indent}(empty)`)
    return
  }
  
  for (const item of data) {
    if (item.id) {
      // It's a file
      console.log(`${indent}📄 ${item.name}`)
      console.log(`${indent}   Size: ${formatBytes(item.metadata?.size || 0)}`)
      console.log(`${indent}   Last modified: ${item.updated_at}`)
    } else {
      // It's a folder
      console.log(`${indent}📁 ${item.name}/`)
      // Recursively list folder contents
      const folderPath = path ? `${path}/${item.name}` : item.name
      await listBucketContents(supabase, bucketName, folderPath, indent + '   ')
    }
  }
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Main execution
async function main() {
  console.log("🔍 Listing all Supabase storage contents...");
  console.log("==========================================");
  
  await listAllStorageContents(supabase);
  
  console.log("\n✅ Storage listing completed!");
}

main().catch(console.error);