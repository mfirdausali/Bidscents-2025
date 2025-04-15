// Script to set up Supabase tables using SQL via the JavaScript client
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create the tables in Supabase
async function createTables() {
  console.log('Setting up Supabase tables...');
  
  try {
    // Create users table
    console.log('Creating users table...');
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (usersError && usersError.code === '42P01') { // Table doesn't exist
      const { error } = await supabase.rpc('rest', {
        method: 'POST',
        path: '/rest/v1/query',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'tx=commit'
        },
        body: {
          query: `
            CREATE TABLE IF NOT EXISTS users (
              id SERIAL PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              password TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE,
              first_name TEXT,
              last_name TEXT,
              address TEXT,
              profile_image TEXT,
              wallet_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
              is_seller BOOLEAN NOT NULL DEFAULT false,
              is_admin BOOLEAN NOT NULL DEFAULT false,
              is_banned BOOLEAN NOT NULL DEFAULT false
            );
          `
        }
      });
      
      if (error) {
        console.error('Error creating users table:', error);
      } else {
        console.log('Users table created successfully');
      }
    } else {
      console.log('Users table already exists');
    }
    
    // Create categories table
    console.log('Creating categories table...');
    const { data: categoriesData, error: categoriesError } = await supabase
      .from('categories')
      .select('*')
      .limit(1);
    
    if (categoriesError && categoriesError.code === '42P01') { // Table doesn't exist
      // Create the table using supabase SQL interface directly
      // We would need to create tables one by one using the SQL editor in the Supabase dashboard
      // Let's just print the instructions for now
      console.log(`
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  description TEXT,
  price DOUBLE PRECISION NOT NULL,
  image_url TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER REFERENCES categories(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  is_new BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  remaining_percentage INTEGER DEFAULT 100,
  batch_code TEXT,
  purchase_year INTEGER,
  box_condition TEXT,
  listing_type TEXT DEFAULT 'fixed',
  volume TEXT
);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_order INTEGER NOT NULL DEFAULT 0,
  image_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1
);
      `);
      
      console.log('\nPlease run these commands in the Supabase SQL editor to create your tables.\n');
    } else {
      console.log('Categories table already exists');
    }
    
    // Since we can't execute raw SQL directly through the JavaScript client,
    // we'll need to tell the user to create the tables manually or use a different approach.
    
    console.log(`
It appears that we can't execute raw SQL through the JavaScript client directly.
Please visit your Supabase dashboard at ${supabaseUrl} and:
1. Go to the SQL Editor
2. Create a new query
3. Paste the SQL statements above
4. Run the query to create all tables
    `);
    
    // Check if tables exist by querying each one
    console.log('Checking for existing tables in Supabase...');
    
    const tables = [
      'users', 'categories', 'products', 'product_images', 
      'reviews', 'orders', 'order_items', 'cart_items'
    ];
    
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('count').limit(1);
      
      if (error && error.code === '42P01') {
        console.log(`Table ${table} does not exist`);
      } else if (error) {
        console.log(`Error checking table ${table}:`, error);
      } else {
        console.log(`Table ${table} exists`);
      }
    }
    
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

// Main function
async function main() {
  try {
    // Check connection
    console.log('Checking Supabase connection...');
    const { data, error } = await supabase.from('_dummy_').select('*').limit(1);
    
    if (error && error.code === '42P01') {
      console.log('Supabase connection successful (table not found error is expected)');
    } else if (error) {
      console.error('Unexpected error checking Supabase connection:', error);
    } else {
      console.log('Supabase connection successful');
    }
    
    // Create tables
    await createTables();
    
    console.log('Supabase setup completed. Please follow the instructions above to create tables if needed.');
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();