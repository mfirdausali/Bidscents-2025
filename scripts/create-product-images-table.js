// Script to create the product_images table
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function createProductImagesTable() {
  try {
    console.log('Creating product_images table...');
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        image_order INTEGER NOT NULL DEFAULT 0,
        image_name TEXT
      );
    `);
    
    console.log('Product images table created successfully!');
  } catch (error) {
    console.error('Error creating product_images table:', error);
  } finally {
    process.exit(0);
  }
}

createProductImagesTable();