import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pg;

// Create a new Pool instance using the DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createProductImagesTable() {
  const client = await pool.connect();
  try {
    console.log('Creating product_images table...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        image_order INTEGER NOT NULL DEFAULT 0,
        image_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('Product images table created successfully!');
  } catch (error) {
    console.error('Error creating product_images table:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

createProductImagesTable();