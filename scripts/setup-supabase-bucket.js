// Script to set up Supabase storage bucket
import { createClient } from '@supabase/supabase-js';

// Bucket name for storing perfume images
const BUCKET_NAME = 'perfume-images';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create the bucket if it doesn't exist
async function ensureBucketExists() {
  try {
    console.log('Checking if bucket exists...');
    
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('Error listing Supabase buckets:', listError);
      return false;
    }
    
    // Find if our bucket exists
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`Bucket ${BUCKET_NAME} does not exist, creating it...`);
      
      // Create the bucket
      const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true // Make the bucket public
      });
      
      if (error) {
        console.error('Error creating Supabase bucket:', error);
        return false;
      }
      
      console.log(`Successfully created Supabase bucket ${BUCKET_NAME}`);
      return true;
    }
    
    console.log(`Supabase bucket ${BUCKET_NAME} already exists`);
    return true;
  } catch (error) {
    console.error('Error in ensureBucketExists:', error);
    return false;
  }
}

// Run the bucket creation
async function main() {
  const success = await ensureBucketExists();
  if (success) {
    console.log('Supabase storage bucket setup completed successfully!');
  } else {
    console.error('Failed to set up Supabase storage bucket.');
  }
}

main();