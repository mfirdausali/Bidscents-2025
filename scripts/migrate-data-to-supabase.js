// Script to migrate data from Replit PostgreSQL to Supabase PostgreSQL
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../shared/schema';

async function migrateData() {
  console.log('Starting data migration to Supabase...');
  
  // Source database connection
  const sourceConnectionString = process.env.DATABASE_URL;
  console.log('Connecting to source database...');
  const sourcePool = new Pool({ connectionString: sourceConnectionString });
  const sourceDb = drizzle(sourcePool, { schema });
  
  // Target database connection (Supabase)
  const targetConnectionString = process.env.SUPABASE_DB_URL;
  console.log('Connecting to target Supabase database...');
  
  // Parse connection details for better error handling
  console.log('Parsing connection details...');
  const urlPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = targetConnectionString.match(urlPattern);
  
  if (!match) {
    console.error('Could not parse Supabase connection string properly');
    return;
  }
  
  const [, user, password, host, port, database] = match;
  const connectionConfig = {
    user,
    password,
    host,
    port: parseInt(port, 10),
    database,
    ssl: { rejectUnauthorized: false } // Important for Supabase connections
  };
  
  console.log('Using connection config:', {
    ...connectionConfig,
    password: '***REDACTED***'
  });
  
  const targetPool = new Pool(connectionConfig);
  const targetDb = drizzle(targetPool, { schema });
  
  try {
    // Test connections
    console.log('Testing source database connection...');
    await sourcePool.query('SELECT NOW()');
    console.log('Source database connection successful!');
    
    // Let's use a more targeted approach for the target database
    try {
      console.log('Testing target database connection...');
      await targetPool.query('SELECT NOW()');
      console.log('Target database connection successful!');
    } catch (error) {
      console.error('Error connecting to target database:', error);
      console.log('The script will attempt to continue, but migrations may fail');
    }
    
    // Start migrating data
    console.log('Starting data migration...');
    
    // Helper function to migrate table data
    async function migrateTable(tableName, schemaTable) {
      console.log(`Migrating ${tableName}...`);
      try {
        // Get data from source
        const sourceData = await sourceDb.select().from(schemaTable);
        
        if (sourceData.length === 0) {
          console.log(`No data to migrate for ${tableName}`);
          return;
        }
        
        // For each item, try to insert it
        let successCount = 0;
        let errorCount = 0;
        
        for (const item of sourceData) {
          try {
            // Insert into target (using raw query to handle potential PK conflicts)
            await targetPool.query(
              `INSERT INTO ${tableName} SELECT * FROM json_populate_record(null::${tableName}, $1::json) ON CONFLICT DO NOTHING`,
              [item]
            );
            successCount++;
          } catch (error) {
            console.error(`Error inserting ${tableName} item:`, error);
            errorCount++;
          }
        }
        
        console.log(`Migrated ${successCount}/${sourceData.length} ${tableName} items (${errorCount} errors)`);
      } catch (error) {
        console.error(`Error migrating ${tableName}:`, error);
      }
    }
    
    // Migrate tables in order (respecting foreign key constraints)
    await migrateTable('users', schema.users);
    await migrateTable('categories', schema.categories);
    await migrateTable('products', schema.products);
    await migrateTable('product_images', schema.productImages);
    await migrateTable('reviews', schema.reviews);
    await migrateTable('orders', schema.orders);
    await migrateTable('order_items', schema.orderItems);
    await migrateTable('cart_items', schema.cartItems);
    
    console.log('Data migration completed!');
    
  } catch (error) {
    console.error('Error during data migration:', error);
  } finally {
    // Close connections
    await sourcePool.end();
    await targetPool.end();
  }
}

// Run the migration
migrateData().catch(error => {
  console.error('Unhandled error during migration:', error);
});