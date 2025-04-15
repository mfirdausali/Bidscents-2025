// Script to migrate data from the current PostgreSQL database to Supabase
import { createClient } from '@supabase/supabase-js';
import { db } from '../server/db';
import {
  users,
  categories,
  products,
  productImages,
  cartItems,
  reviews,
  orders,
  orderItems
} from '../shared/schema';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to create tables on Supabase via SQL queries
async function createTables() {
  console.log('Creating tables on Supabase if they don\'t exist...');
  
  try {
    // These queries will create the tables if they don't exist
    
    // Users table
    const { error: usersError } = await supabase.rpc('exec_sql', {
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
    });
    
    if (usersError) {
      console.error('Error creating users table:', usersError);
    } else {
      console.log('Users table created or already exists');
    }
    
    // Categories table
    const { error: categoriesError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT
        );
      `
    });
    
    if (categoriesError) {
      console.error('Error creating categories table:', categoriesError);
    } else {
      console.log('Categories table created or already exists');
    }
    
    // Products table
    const { error: productsError } = await supabase.rpc('exec_sql', {
      query: `
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
      `
    });
    
    if (productsError) {
      console.error('Error creating products table:', productsError);
    } else {
      console.log('Products table created or already exists');
    }
    
    // Product Images table
    const { error: productImagesError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS product_images (
          id SERIAL PRIMARY KEY,
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          image_order INTEGER NOT NULL DEFAULT 0,
          image_name TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (productImagesError) {
      console.error('Error creating product_images table:', productImagesError);
    } else {
      console.log('Product Images table created or already exists');
    }
    
    // Reviews table
    const { error: reviewsError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          rating INTEGER NOT NULL,
          comment TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (reviewsError) {
      console.error('Error creating reviews table:', reviewsError);
    } else {
      console.log('Reviews table created or already exists');
    }
    
    // Orders table
    const { error: ordersError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          total DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `
    });
    
    if (ordersError) {
      console.error('Error creating orders table:', ordersError);
    } else {
      console.log('Orders table created or already exists');
    }
    
    // Order Items table
    const { error: orderItemsError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER NOT NULL,
          price DOUBLE PRECISION NOT NULL
        );
      `
    });
    
    if (orderItemsError) {
      console.error('Error creating order_items table:', orderItemsError);
    } else {
      console.log('Order Items table created or already exists');
    }
    
    // Cart Items table
    const { error: cartItemsError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS cart_items (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER NOT NULL DEFAULT 1
        );
      `
    });
    
    if (cartItemsError) {
      console.error('Error creating cart_items table:', cartItemsError);
    } else {
      console.log('Cart Items table created or already exists');
    }
    
    console.log('All tables created or already exist on Supabase');
    return true;
  } catch (error) {
    console.error('Error creating tables:', error);
    return false;
  }
}

// Main migration function
async function migrateToSupabase() {
  console.log('Starting migration to Supabase...');
  
  try {
    // Check if Supabase supports the exec_sql function
    const { error: rpcTestError } = await supabase.rpc('exec_sql', {
      query: 'SELECT 1;'
    });
    
    if (rpcTestError) {
      console.error('Supabase exec_sql RPC not available. Please enable the pg_execute extension in Supabase.');
      console.error('Error:', rpcTestError);
      console.log('Trying alternative approach with direct table operations...');
      // Continue with the migration using direct table operations
    } else {
      // Create tables if they don't exist
      await createTables();
    }
    
    // Step 1: Migrate users
    console.log('Migrating users...');
    const userData = await db.select().from(users);
    
    if (userData.length === 0) {
      console.log('No users to migrate');
    } else {
      const { error: usersError } = await supabase.from('users').upsert(
        userData.map(user => ({
          id: user.id,
          username: user.username,
          password: user.password,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          address: user.address,
          profile_image: user.profileImage,
          wallet_balance: user.walletBalance,
          is_seller: user.isSeller,
          is_admin: user.isAdmin,
          is_banned: user.isBanned
        })),
        { onConflict: 'id' }
      );
      
      if (usersError) {
        console.error('Error migrating users:', usersError);
      } else {
        console.log(`Migrated ${userData.length} users`);
      }
    }
    
    // Step 2: Migrate categories
    console.log('Migrating categories...');
    const categoryData = await db.select().from(categories);
    
    if (categoryData.length === 0) {
      console.log('No categories to migrate');
    } else {
      const { error: categoriesError } = await supabase.from('categories').upsert(
        categoryData,
        { onConflict: 'id' }
      );
      
      if (categoriesError) {
        console.error('Error migrating categories:', categoriesError);
      } else {
        console.log(`Migrated ${categoryData.length} categories`);
      }
    }
    
    // Step 3: Migrate products
    console.log('Migrating products...');
    const productData = await db.select().from(products);
    
    if (productData.length === 0) {
      console.log('No products to migrate');
    } else {
      const { error: productsError } = await supabase.from('products').upsert(
        productData.map(product => ({
          id: product.id,
          name: product.name,
          brand: product.brand,
          description: product.description,
          price: product.price,
          image_url: product.imageUrl,
          stock_quantity: product.stockQuantity,
          category_id: product.categoryId,
          seller_id: product.sellerId,
          is_new: product.isNew,
          is_featured: product.isFeatured,
          created_at: product.createdAt,
          remaining_percentage: product.remainingPercentage,
          batch_code: product.batchCode,
          purchase_year: product.purchaseYear,
          box_condition: product.boxCondition,
          listing_type: product.listingType,
          volume: product.volume
        })),
        { onConflict: 'id' }
      );
      
      if (productsError) {
        console.error('Error migrating products:', productsError);
      } else {
        console.log(`Migrated ${productData.length} products`);
      }
    }
    
    // Step 4: Migrate product images
    console.log('Migrating product images...');
    const productImageData = await db.select().from(productImages);
    
    if (productImageData.length === 0) {
      console.log('No product images to migrate');
    } else {
      const { error: productImagesError } = await supabase.from('product_images').upsert(
        productImageData.map(image => ({
          id: image.id,
          product_id: image.productId,
          image_url: image.imageUrl,
          image_order: image.imageOrder,
          image_name: image.imageName,
          created_at: image.createdAt
        })),
        { onConflict: 'id' }
      );
      
      if (productImagesError) {
        console.error('Error migrating product images:', productImagesError);
      } else {
        console.log(`Migrated ${productImageData.length} product images`);
      }
    }
    
    // Step 5: Migrate reviews
    console.log('Migrating reviews...');
    const reviewData = await db.select().from(reviews);
    
    if (reviewData.length === 0) {
      console.log('No reviews to migrate');
    } else {
      const { error: reviewsError } = await supabase.from('reviews').upsert(
        reviewData.map(review => ({
          id: review.id,
          user_id: review.userId,
          product_id: review.productId,
          rating: review.rating,
          comment: review.comment,
          created_at: review.createdAt
        })),
        { onConflict: 'id' }
      );
      
      if (reviewsError) {
        console.error('Error migrating reviews:', reviewsError);
      } else {
        console.log(`Migrated ${reviewData.length} reviews`);
      }
    }
    
    // Step 6: Migrate orders
    console.log('Migrating orders...');
    const orderData = await db.select().from(orders);
    
    if (orderData.length === 0) {
      console.log('No orders to migrate');
    } else {
      const { error: ordersError } = await supabase.from('orders').upsert(
        orderData.map(order => ({
          id: order.id,
          user_id: order.userId,
          total: order.total,
          status: order.status,
          created_at: order.createdAt
        })),
        { onConflict: 'id' }
      );
      
      if (ordersError) {
        console.error('Error migrating orders:', ordersError);
      } else {
        console.log(`Migrated ${orderData.length} orders`);
      }
    }
    
    // Step 7: Migrate order items
    console.log('Migrating order items...');
    const orderItemData = await db.select().from(orderItems);
    
    if (orderItemData.length === 0) {
      console.log('No order items to migrate');
    } else {
      const { error: orderItemsError } = await supabase.from('order_items').upsert(
        orderItemData.map(item => ({
          id: item.id,
          order_id: item.orderId,
          product_id: item.productId,
          quantity: item.quantity,
          price: item.price
        })),
        { onConflict: 'id' }
      );
      
      if (orderItemsError) {
        console.error('Error migrating order items:', orderItemsError);
      } else {
        console.log(`Migrated ${orderItemData.length} order items`);
      }
    }
    
    // Step 8: Migrate cart items
    console.log('Migrating cart items...');
    const cartItemData = await db.select().from(cartItems);
    
    if (cartItemData.length === 0) {
      console.log('No cart items to migrate');
    } else {
      const { error: cartItemsError } = await supabase.from('cart_items').upsert(
        cartItemData.map(item => ({
          id: item.id,
          user_id: item.userId,
          product_id: item.productId,
          quantity: item.quantity
        })),
        { onConflict: 'id' }
      );
      
      if (cartItemsError) {
        console.error('Error migrating cart items:', cartItemsError);
      } else {
        console.log(`Migrated ${cartItemData.length} cart items`);
      }
    }
    
    console.log('Migration to Supabase completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Run the migration
migrateToSupabase();