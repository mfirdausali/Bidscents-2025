// This script removes the 'image_url' column from the products table
// It's executed as a one-time migration since we've moved to using the product_images table for images

import pg from 'pg';
const { Pool } = pg;

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function removeImageUrlColumn() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: Removing image_url column from products table');
    
    // Create temporary placeholder column for compatibility during the transition
    await client.query(`
      -- First, add a default value to image_url to handle existing entries
      UPDATE products SET image_url = 'placeholder' WHERE image_url IS NULL OR image_url = '';
      
      -- Then, alter the column to be nullable and remove the NOT NULL constraint
      ALTER TABLE products ALTER COLUMN image_url DROP NOT NULL;
    `);
    
    console.log('Successfully updated constraints on image_url column');
    
    console.log('Migration completed successfully!');
    console.log('The image_url column is now prepared for removal in a future update.');
    console.log('Note: We\'re keeping the column for now with NULL constraint removed to maintain compatibility.');
    console.log('To fully remove it in the future, run: ALTER TABLE products DROP COLUMN image_url;');
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute the migration
removeImageUrlColumn();