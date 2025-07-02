import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Define buckets with their configurations
const BUCKETS = [
  {
    name: "listing-images",
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  {
    name: "profile-images", 
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  {
    name: "message-files",
    public: false, // Private bucket for message attachments
    fileSizeLimit: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
];

async function setupStorageBuckets() {
  console.log("🚀 Setting up Supabase Storage buckets...\n");

  for (const bucket of BUCKETS) {
    try {
      console.log(`📦 Checking bucket: ${bucket.name}`);
      
      // Check if bucket exists
      const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        console.error(`❌ Error listing buckets: ${listError.message}`);
        continue;
      }

      const bucketExists = existingBuckets?.some(b => b.name === bucket.name);

      if (!bucketExists) {
        // Create bucket
        console.log(`  📝 Creating bucket: ${bucket.name}`);
        const { error: createError } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: bucket.fileSizeLimit,
          allowedMimeTypes: bucket.allowedMimeTypes,
        });

        if (createError) {
          console.error(`  ❌ Error creating bucket: ${createError.message}`);
          continue;
        }
        console.log(`  ✅ Bucket created successfully`);
      } else {
        console.log(`  ✅ Bucket already exists`);
        
        // Update bucket configuration
        const { error: updateError } = await supabase.storage.updateBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: bucket.fileSizeLimit,
          allowedMimeTypes: bucket.allowedMimeTypes,
        });

        if (updateError) {
          console.error(`  ⚠️ Could not update bucket config: ${updateError.message}`);
        } else {
          console.log(`  ✅ Bucket configuration updated`);
        }
      }

      // Set RLS policies for public access (if bucket is public)
      if (bucket.public) {
        console.log(`  🔓 Setting public access policies...`);
        
        // Note: These policies need to be set in Supabase Dashboard or via SQL
        // as the JS SDK doesn't support creating storage policies
        console.log(`  ℹ️  Please ensure the following policies are set in Supabase Dashboard:`);
        console.log(`     - SELECT: Allow public access`);
        console.log(`     - INSERT: Require authentication`);
        console.log(`     - UPDATE: Require authentication and ownership`);
        console.log(`     - DELETE: Require authentication and ownership`);
      }

      // Test bucket access
      console.log(`  🧪 Testing bucket access...`);
      const testFileName = `test-${Date.now()}.txt`;
      const testContent = "Test file content";
      
      const { error: uploadError } = await supabase.storage
        .from(bucket.name)
        .upload(testFileName, testContent, {
          contentType: "text/plain",
        });

      if (uploadError) {
        console.error(`  ❌ Upload test failed: ${uploadError.message}`);
      } else {
        console.log(`  ✅ Upload test successful`);
        
        // Clean up test file
        await supabase.storage.from(bucket.name).remove([testFileName]);
      }

      console.log();
    } catch (error) {
      console.error(`❌ Unexpected error with bucket ${bucket.name}:`, error);
    }
  }

  console.log("\n✨ Storage bucket setup complete!");
  console.log("\n📋 Next steps:");
  console.log("1. Go to Supabase Dashboard > Storage");
  console.log("2. For each bucket, click on 'Policies'");
  console.log("3. Add the following RLS policies:");
  console.log("   - For public buckets (listing-images, profile-images):");
  console.log("     • SELECT: true (allow public read)");
  console.log("     • INSERT: auth.role() = 'authenticated'");
  console.log("     • UPDATE: auth.uid() = owner");
  console.log("     • DELETE: auth.uid() = owner");
  console.log("   - For private buckets (message-files):");
  console.log("     • All operations: auth.role() = 'authenticated'");
}

// Run the setup
setupStorageBuckets().catch(console.error);