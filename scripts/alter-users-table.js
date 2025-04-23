/**
 * Security Update - Alter Users Table
 * 
 * This script adds the provider_id and provider columns to the users table in Supabase.
 * These fields are required for the security fix that prevents unauthorized session creation.
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function alterUsersTable() {
  try {
    console.log('Starting security-related database updates...');
    
    // Method 1: Using Supabase storage API (preferred)
    console.log('Using Supabase RPCJ to modify the users table...');
    
    // Check if users table exists
    const { data: tableInfo, error: tableError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (tableError) {
      console.error('Error checking users table:', tableError.message);
      return;
    }
    
    console.log('Users table exists, proceeding with modifications');
    
    // Execute SQL to add provider_id column
    const { error: providerIdError } = await supabase.rpc('execute_sql', {
      query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT;`
    });
    
    if (providerIdError) {
      console.error('Error adding provider_id column:', providerIdError.message);
    } else {
      console.log('Added provider_id column successfully');
    }
    
    // Execute SQL to add provider column
    const { error: providerError } = await supabase.rpc('execute_sql', {
      query: `ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT;`
    });
    
    if (providerError) {
      console.error('Error adding provider column:', providerError.message);
    } else {
      console.log('Added provider column successfully');
    }
    
    // Method 2: If the above doesn't work, try direct SQL through Postgres API
    if (providerIdError || providerError) {
      console.log('Attempting alternative method using Supabase SQL...');
      
      const { error: sqlError } = await supabase.rpc('query', {
        sql: `
          BEGIN;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT;
          COMMIT;
        `
      });
      
      if (sqlError) {
        console.error('Alternative method also failed:', sqlError.message);
      } else {
        console.log('Alternative method succeeded');
      }
    }
    
    // Update existing users with their Supabase IDs
    console.log('Attempting to update existing users with their Supabase provider IDs...');
    
    // Get all users from Supabase Auth
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('Error getting users from Supabase Auth:', authError.message);
      return;
    }
    
    if (!authUsers || !authUsers.users || authUsers.users.length === 0) {
      console.log('No users found in Supabase Auth');
      return;
    }
    
    console.log(`Found ${authUsers.users.length} users in Supabase Auth`);
    
    // For each auth user, update the corresponding row in the users table
    let updatedCount = 0;
    for (const authUser of authUsers.users) {
      if (authUser.email) {
        // Find the user in our users table by email
        const { data: dbUsers, error: dbUserError } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', authUser.email);
        
        if (dbUserError) {
          console.error(`Error finding user with email ${authUser.email}:`, dbUserError.message);
          continue;
        }
        
        if (dbUsers && dbUsers.length > 0) {
          // Update the user with the provider ID
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              provider_id: authUser.id,
              provider: 'supabase'
            })
            .eq('id', dbUsers[0].id);
          
          if (updateError) {
            console.error(`Error updating user ${dbUsers[0].id}:`, updateError.message);
          } else {
            console.log(`Updated user ${dbUsers[0].id} (${authUser.email}) with provider_id ${authUser.id}`);
            updatedCount++;
          }
        } else {
          console.log(`No matching user found for email ${authUser.email}`);
        }
      }
    }
    
    console.log(`Successfully updated ${updatedCount} users with their provider IDs`);
    console.log('Security schema update completed');
    
  } catch (error) {
    console.error('Unexpected error during table alteration:', error);
  }
}

// Run the script
alterUsersTable()
  .then(() => {
    console.log('Script finished');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });