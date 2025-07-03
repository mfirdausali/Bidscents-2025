#!/usr/bin/env node

/**
 * Script to check and update admin status in the database
 * This helps ensure users have the correct admin privileges
 */

const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');

// Load environment variables
config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Supabase credentials not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdminUser() {
  console.log('Admin User Check\n================\n');
  
  const email = process.argv[2];
  
  if (!email) {
    console.error('Usage: node scripts/check-admin-user.js <email>');
    console.log('\nExample: node scripts/check-admin-user.js admin@example.com');
    process.exit(1);
  }
  
  console.log(`Checking user: ${email}\n`);
  
  try {
    // Get user from public.users table
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) {
      console.error('Error fetching user:', error.message);
      process.exit(1);
    }
    
    if (!users) {
      console.error('User not found in database');
      process.exit(1);
    }
    
    console.log('User found:');
    console.log('- ID:', users.id);
    console.log('- Username:', users.username);
    console.log('- Email:', users.email);
    console.log('- Is Admin:', users.isAdmin);
    console.log('- Is Seller:', users.isSeller);
    console.log('- Is Banned:', users.isBanned);
    console.log('- Provider:', users.provider);
    console.log('- Created:', new Date(users.createdAt).toLocaleString());
    
    if (!users.isAdmin) {
      console.log('\n⚠️  User is NOT an admin');
      console.log('\nTo make this user an admin, run the following SQL:');
      console.log(`UPDATE users SET is_admin = true WHERE email = '${email}';`);
      console.log('\nYou can run this in the Supabase SQL editor.');
    } else {
      console.log('\n✓ User is already an admin');
    }
    
    // Check if user exists in auth.users
    console.log('\nChecking Supabase auth status...');
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(users.providerId || users.supabaseUserId);
    
    if (authError) {
      console.log('⚠️  Could not verify auth user (this requires service role key)');
    } else if (authData) {
      console.log('✓ User exists in auth.users');
      console.log('- Auth ID:', authData.user.id);
      console.log('- Email verified:', authData.user.email_confirmed_at ? 'Yes' : 'No');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the check
checkAdminUser().catch(console.error);