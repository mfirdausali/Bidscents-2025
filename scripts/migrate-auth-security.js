/**
 * Database Migration Script for Security Fix
 * 
 * This script migrates the users table to add provider_id and provider columns
 * for improved authentication security and fixes the critical vulnerability
 * where users could be automatically logged in as someone else.
 */

import pkg from 'pg';
const { Pool } = pkg;

// Create a PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// SQL to add new columns if they don't exist
const addColumnsSQL = `
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS provider_id TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT;
`;

// Run the migration
async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting security migration...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Add columns
    console.log('Adding provider_id and provider columns...');
    await client.query(addColumnsSQL);
    
    // Check if there are users from Supabase with null provider_id
    const { rows: supabaseUsers } = await client.query(`
      SELECT * FROM auth.users;
    `);

    if (supabaseUsers.length > 0) {
      console.log(`Found ${supabaseUsers.length} users in Supabase auth.users`);

      // Loop through and update corresponding users in our users table
      for (const supaUser of supabaseUsers) {
        const { rows } = await client.query(
          'SELECT * FROM users WHERE email = $1',
          [supaUser.email]
        );

        if (rows.length > 0) {
          const localUser = rows[0];
          
          // Update the user with their Supabase ID for secure auth
          await client.query(
            'UPDATE users SET provider_id = $1, provider = $2 WHERE id = $3',
            [supaUser.id, 'supabase', localUser.id]
          );
          
          console.log(`Updated user ${localUser.username} with provider_id from Supabase`);
        }
      }
    } else {
      console.log('No users found in Supabase auth.users table');
    }
    
    // Commit the transaction
    await client.query('COMMIT');
    console.log('Security migration completed successfully');
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during migration:', error);
    process.exit(1);
  } finally {
    // Release the client
    client.release();
    pool.end();
  }
}

// Run the migration
migrate();