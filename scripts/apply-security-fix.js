/**
 * Security Fix Migration Script
 * 
 * This script applies the necessary database schema changes to fix the critical
 * authentication vulnerability by adding provider_id and provider columns
 * to the users table and running a DB push operation with Drizzle.
 */

import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

// Import needed to verify the database connection
import { db, testConnection } from '../server/db.js';
import { supabase } from '../server/supabase.js';

console.log('Applying security fix for authentication vulnerability...');

async function runMigration() {
  try {
    // First, verify database connection
    console.log('Testing database connection...');
    await testConnection();
    console.log('Database connection successful');
    
    // Run Drizzle push to apply schema changes
    console.log('Applying schema changes with Drizzle...');
    const { stdout, stderr } = await execAsync('npm run db:push');
    
    if (stderr) {
      console.error('Error while running DB push:', stderr);
    }
    
    console.log('DB push completed successfully');
    console.log(stdout);
    
    // Verify Supabase connectivity
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.warn('Supabase session unavailable:', error.message);
    } else {
      console.log('Supabase connection successful');
    }
    
    console.log('Security fix migration complete.');
    console.log('Note: The providerId fields will be automatically populated as users log in.');
    
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

runMigration();