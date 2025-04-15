// Script to migrate schema to Supabase using Drizzle
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from '../shared/schema';
import path from 'path';

async function migrateSchema() {
  console.log('Starting schema migration to Supabase...');
  
  // Get the connection URL from environment variables
  const connectionString = process.env.DATABASE_URL; // Use current DB for drizzle-kit
  
  // Create a PostgreSQL connection pool
  const pool = new Pool({ connectionString });
  
  try {
    console.log('Connecting to database...');
    
    // Create Drizzle instance
    const db = drizzle(pool, { schema });
    
    // Run migrations
    console.log('Running Drizzle migrations...');
    
    // Get migrations directory path
    const migrationsFolder = path.join(process.cwd(), 'migrations');
    
    // Create migrations if they don't exist
    console.log(`Using migrations from: ${migrationsFolder}`);
    console.log('First generating migrations if needed with drizzle-kit...');
    
    // Execute drizzle-kit push
    const { exec } = await import('child_process');
    await new Promise((resolve, reject) => {
      exec('npx drizzle-kit push', (error, stdout, stderr) => {
        if (error) {
          console.error('Error running drizzle-kit push:', error);
          console.error(stderr);
          reject(error);
          return;
        }
        
        console.log(stdout);
        resolve();
      });
    });
    
    console.log('Schema migration completed successfully!');
    
    // Now update drizzle.config.ts to use Supabase connection string
    console.log('\n--- Next Steps ---');
    console.log('1. Edit drizzle.config.ts to use SUPABASE_DB_URL instead of DATABASE_URL');
    console.log('2. Run the data migration script to copy data to Supabase');
    console.log('3. Update the application to use Supabase for storage');
  } catch (error) {
    console.error('Error during schema migration:', error);
  } finally {
    await pool.end();
  }
}

// Run the migration
migrateSchema();