// Supabase database connection
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from '@shared/schema';
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client for API operations
export const supabaseUrl = process.env.SUPABASE_URL || '';
export const supabaseKey = process.env.SUPABASE_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);

// Create a PostgreSQL connection pool using the Supabase connection string
const connectionString = process.env.SUPABASE_DB_URL;

// Use the old pool configuration to skip hostname resolution
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create a Drizzle instance using the pool and schema
export const db = drizzle(pool, { schema });

export async function testConnection() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Use Supabase to upload file to storage
export async function uploadFileToSupabase(
  bucket: string,
  path: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error('Error uploading file to Supabase Storage:', error);
      return null;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Exception uploading file to Supabase Storage:', error);
    return null;
  }
}

// Get file from Supabase storage
export async function getFileFromSupabase(
  bucket: string,
  path: string
): Promise<Buffer | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      console.error('Error downloading file from Supabase Storage:', error);
      return null;
    }

    // Convert the Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Exception downloading file from Supabase Storage:', error);
    return null;
  }
}

// Delete file from Supabase storage
export async function deleteFileFromSupabase(
  bucket: string,
  path: string
): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(bucket).remove([path]);

    if (error) {
      console.error('Error deleting file from Supabase Storage:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception deleting file from Supabase Storage:', error);
    return false;
  }
}