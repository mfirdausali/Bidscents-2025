import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
  throw new Error('Missing Supabase credentials');
}

// Create a Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Test the connection
export async function testSupabaseConnection() {
  try {
    const { data, error } = await supabase.from('users').select('count');
    
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    
    console.log('Supabase connection successful');
    return true;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return false;
  }
}

// Function to check if tables exist, and create them if they don't
export async function ensureTablesExist() {
  try {
    // This is a simple check to see if our tables exist
    // We could make this more sophisticated by checking each table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (usersError) {
      console.error('Error checking users table:', usersError.message);
      // If tables don't exist, we need to create them
      // However, this should be handled by Drizzle migrations
      console.warn('Tables may not exist in Supabase. Please run database migrations.');
    } else {
      console.log('Supabase tables verification successful');
    }
  } catch (error) {
    console.error('Error ensuring tables exist:', error);
  }
}