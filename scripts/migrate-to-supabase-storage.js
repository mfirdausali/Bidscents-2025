#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Migration tracking
const migrationLog = {
  success: [],
  failed: [],
  skipped: []
};

async function migrateExistingFiles() {
  console.log("🚀 Starting migration to Supabase Storage...\n");

  // Step 1: Analyze existing data
  console.log("📊 Analyzing existing data...");
  
  // Check for products with image URLs
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, image_url')
    .not('image_url', 'is', null);

  if (productsError) {
    console.error("❌ Error fetching products:", productsError);
    return;
  }

  console.log(`   Found ${products?.length || 0} products with image_url`);

  // Check for product images
  const { data: productImages, error: productImagesError } = await supabase
    .from('product_images')
    .select('id, product_id, image_url')
    .not('image_url', 'is', null);

  if (productImagesError) {
    console.error("❌ Error fetching product images:", productImagesError);
    return;
  }

  console.log(`   Found ${productImages?.length || 0} product images`);

  // Check for user profile images
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, profile_image, avatar_url, cover_photo')
    .or('profile_image.not.is.null,avatar_url.not.is.null,cover_photo.not.is.null');

  if (usersError) {
    console.error("❌ Error fetching users:", usersError);
    return;
  }

  console.log(`   Found ${users?.length || 0} users with profile images`);

  // Step 2: Check which URLs need migration
  console.log("\n🔍 Checking which files need migration...");
  
  const needsMigration = {
    products: [],
    productImages: [],
    userProfiles: [],
    userAvatars: [],
    userCovers: []
  };

  // Check products
  for (const product of products || []) {
    if (product.image_url && !isSupabaseFileId(product.image_url)) {
      needsMigration.products.push(product);
    }
  }

  // Check product images
  for (const image of productImages || []) {
    if (image.image_url && !isSupabaseFileId(image.image_url)) {
      needsMigration.productImages.push(image);
    }
  }

  // Check user images
  for (const user of users || []) {
    if (user.profile_image && !isSupabaseFileId(user.profile_image)) {
      needsMigration.userProfiles.push({ ...user, field: 'profile_image' });
    }
    if (user.avatar_url && !isSupabaseFileId(user.avatar_url)) {
      needsMigration.userAvatars.push({ ...user, field: 'avatar_url' });
    }
    if (user.cover_photo && !isSupabaseFileId(user.cover_photo)) {
      needsMigration.userCovers.push({ ...user, field: 'cover_photo' });
    }
  }

  console.log("\n📋 Migration Summary:");
  console.log(`   Products needing migration: ${needsMigration.products.length}`);
  console.log(`   Product images needing migration: ${needsMigration.productImages.length}`);
  console.log(`   User profile images needing migration: ${needsMigration.userProfiles.length}`);
  console.log(`   User avatars needing migration: ${needsMigration.userAvatars.length}`);
  console.log(`   User covers needing migration: ${needsMigration.userCovers.length}`);

  const totalToMigrate = 
    needsMigration.products.length +
    needsMigration.productImages.length +
    needsMigration.userProfiles.length +
    needsMigration.userAvatars.length +
    needsMigration.userCovers.length;

  if (totalToMigrate === 0) {
    console.log("\n✨ No files need migration! All files are already using Supabase Storage.");
    return;
  }

  // Step 3: Perform migration
  console.log(`\n🔄 Starting migration of ${totalToMigrate} files...`);
  
  // Note: Actual migration would require:
  // 1. Downloading files from old storage
  // 2. Uploading to Supabase storage
  // 3. Updating database records
  
  console.log("\n⚠️  Migration Implementation Notes:");
  console.log("1. This script identifies files that need migration");
  console.log("2. Actual file migration requires access to the old storage system");
  console.log("3. If files are stored as URLs pointing to external services,");
  console.log("   they may not need migration");
  console.log("4. If files are stored locally or in Replit Object Storage,");
  console.log("   they need to be downloaded and re-uploaded to Supabase");

  // Log files that would be migrated
  console.log("\n📄 Files that would be migrated:");
  
  if (needsMigration.products.length > 0) {
    console.log("\nProducts:");
    needsMigration.products.slice(0, 5).forEach(p => {
      console.log(`  - Product ${p.id}: ${p.name} -> ${p.image_url}`);
    });
    if (needsMigration.products.length > 5) {
      console.log(`  ... and ${needsMigration.products.length - 5} more`);
    }
  }

  if (needsMigration.productImages.length > 0) {
    console.log("\nProduct Images:");
    needsMigration.productImages.slice(0, 5).forEach(img => {
      console.log(`  - Image ${img.id} for product ${img.product_id} -> ${img.image_url}`);
    });
    if (needsMigration.productImages.length > 5) {
      console.log(`  ... and ${needsMigration.productImages.length - 5} more`);
    }
  }

  // Save migration report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalToMigrate,
      products: needsMigration.products.length,
      productImages: needsMigration.productImages.length,
      userProfiles: needsMigration.userProfiles.length,
      userAvatars: needsMigration.userAvatars.length,
      userCovers: needsMigration.userCovers.length
    },
    needsMigration
  };

  await fs.writeFile(
    join(__dirname, '../migration-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log("\n📄 Migration report saved to migration-report.json");
}

function isSupabaseFileId(value) {
  if (!value || typeof value !== 'string') return false;
  
  // Check if it's already a Supabase file ID format
  const supabasePatterns = [
    /^product_[a-f0-9-]+$/,
    /^profile_[a-f0-9-]+$/,
    /^cover_[a-f0-9-]+$/,
    /^message_[a-f0-9-]+$/,
    /^image-id-[a-f0-9-]+$/
  ];
  
  return supabasePatterns.some(pattern => pattern.test(value));
}

// Run the migration analysis
migrateExistingFiles().catch(console.error);