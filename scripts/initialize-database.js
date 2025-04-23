/**
 * Database Initialization Script
 * 
 * This script runs the necessary SQL to create all tables from schema.ts including
 * the security enhancement fields providerId and provider.
 */

import pkg from 'pg';
const { Pool } = pkg;
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../shared/schema.js';

// Create a PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize the database with our Drizzle schema
async function initializeDatabase() {
  const db = drizzle(pool, { schema });
  
  console.log('Starting database initialization...');
  
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        first_name TEXT,
        last_name TEXT,
        address TEXT,
        profile_image TEXT,
        avatar_url TEXT,
        cover_photo TEXT,
        wallet_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
        is_seller BOOLEAN NOT NULL DEFAULT true,
        is_admin BOOLEAN NOT NULL DEFAULT false,
        is_banned BOOLEAN NOT NULL DEFAULT false,
        is_verified BOOLEAN DEFAULT false,
        shop_name TEXT,
        location TEXT,
        bio TEXT,
        provider_id TEXT,
        provider TEXT
      );
    `);
    console.log('Created users table successfully');
    
    // Create categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );
    `);
    console.log('Created categories table successfully');
    
    // Create products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        description TEXT,
        price DOUBLE PRECISION NOT NULL,
        image_url TEXT,
        stock_quantity INTEGER NOT NULL DEFAULT 1,
        category_id INTEGER REFERENCES categories(id),
        seller_id INTEGER NOT NULL REFERENCES users(id),
        is_new BOOLEAN DEFAULT false,
        is_featured BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        remaining_percentage INTEGER DEFAULT 100,
        batch_code TEXT,
        purchase_year INTEGER,
        box_condition TEXT,
        listing_type TEXT DEFAULT 'fixed',
        volume INTEGER
      );
    `);
    console.log('Created products table successfully');
    
    // Create product_images table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        image_url TEXT NOT NULL,
        image_order INTEGER NOT NULL DEFAULT 0,
        image_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Created product_images table successfully');
    
    // Create reviews table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Created reviews table successfully');
    
    // Create orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total DOUBLE PRECISION NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Created orders table successfully');
    
    // Create order_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        price DOUBLE PRECISION NOT NULL
      );
    `);
    console.log('Created order_items table successfully');
    
    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        receiver_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        product_id INTEGER REFERENCES products(id),
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Created messages table successfully');
    
    // Create session table for connect-pg-simple
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
    console.log('Created session table successfully');
    
    // Insert default categories if none exist
    const defaultCategories = [
      { name: "Women's Fragrances", description: "Perfumes for women" },
      { name: "Men's Fragrances", description: "Perfumes for men" },
      { name: "Unisex", description: "Fragrances for everyone" },
      { name: "Niche", description: "Exclusive and unique fragrances" },
      { name: "New Arrivals", description: "Latest additions to our collection" },
    ];
    
    const { rows: existingCategories } = await pool.query('SELECT * FROM categories LIMIT 1');
    
    if (existingCategories.length === 0) {
      console.log('Inserting default categories...');
      
      for (const category of defaultCategories) {
        await pool.query(
          'INSERT INTO categories (name, description) VALUES ($1, $2)',
          [category.name, category.description]
        );
      }
      
      console.log('Default categories inserted successfully');
    } else {
      console.log('Categories already exist, skipping defaults');
    }
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error during database initialization:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the initialization
initializeDatabase();