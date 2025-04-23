/**
 * Direct Database Schema Update
 * 
 * This script directly modifies the database schema to add the security enhancement
 * fields required for the authentication vulnerability fix.
 */

import pkg from 'pg';
const { Pool } = pkg;

// Create a PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateSchema() {
  const client = await pool.connect();
  
  try {
    console.log('Starting security schema update...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Check if the 'users' table exists
    const tableCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);
    
    const tableExists = tableCheckResult.rows[0].exists;
    
    if (!tableExists) {
      console.log('Users table does not exist yet, no schema changes needed.');
      await client.query('COMMIT');
      return;
    }
    
    console.log('Users table exists, checking columns...');
    
    // Check if provider_id column exists
    const providerIdCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'provider_id'
      );
    `);
    
    const providerIdExists = providerIdCheckResult.rows[0].exists;
    
    // Check if provider column exists
    const providerCheckResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'provider'
      );
    `);
    
    const providerExists = providerCheckResult.rows[0].exists;
    
    // Add provider_id column if it doesn't exist
    if (!providerIdExists) {
      console.log('Adding provider_id column...');
      await client.query(`
        ALTER TABLE users ADD COLUMN provider_id TEXT;
      `);
      console.log('provider_id column added successfully');
    } else {
      console.log('provider_id column already exists');
    }
    
    // Add provider column if it doesn't exist
    if (!providerExists) {
      console.log('Adding provider column...');
      await client.query(`
        ALTER TABLE users ADD COLUMN provider TEXT;
      `);
      console.log('provider column added successfully');
    } else {
      console.log('provider column already exists');
    }
    
    // Update existing users with their Supabase IDs (if possible)
    if (providerIdExists || !providerExists) {
      console.log('Updating existing users is not possible without separate access to auth.users');
      console.log('The application will handle this during user login instead');
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log('Security schema update completed successfully');
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during schema update:', error);
    throw error;
  } finally {
    // Release the client
    client.release();
  }
}

// Run the update
updateSchema()
  .then(() => {
    console.log('Schema update script finished');
    pool.end();
  })
  .catch(err => {
    console.error('Schema update script failed:', err);
    pool.end();
    process.exit(1);
  });