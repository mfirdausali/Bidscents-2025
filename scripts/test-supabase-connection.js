// Script to test Supabase connection
import pkg from 'pg';
const { Pool } = pkg;
import { createClient } from '@supabase/supabase-js';

// First, try to connect using the Supabase JavaScript client
console.log('Testing Supabase API connection...');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or key environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabaseApiConnection() {
  try {
    const { data, error } = await supabase.from('_test_connection').select('*').limit(1).maybeSingle();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "relation does not exist" which is expected if the table doesn't exist
      console.error('Error testing Supabase API connection:', error);
    } else {
      console.log('Supabase API connection successful!');
    }
  } catch (error) {
    console.error('Exception testing Supabase API connection:', error);
  }
}

// Then, try direct PostgreSQL connection
console.log('Testing direct PostgreSQL connection...');
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('Missing SUPABASE_DB_URL environment variable');
  process.exit(1);
}

// Parse the connection string parts for debugging and to create a more specific config
console.log('Parsing connection details...');
let connectionConfig = {};

try {
  // Format should be: postgresql://username:password@hostname:port/database
  const urlPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = connectionString.match(urlPattern);
  
  if (match) {
    const [, user, password, host, port, database] = match;
    connectionConfig = {
      user,
      password,
      host,
      port: parseInt(port, 10),
      database,
      ssl: { rejectUnauthorized: false } // Important for Supabase connections
    };
    console.log('Connection details (masked):',
      JSON.stringify({...connectionConfig, password: '****'}, null, 2));
  } else {
    console.error('Could not parse connection string properly');
    connectionConfig = { connectionString };
  }
} catch (error) {
  console.error('Error parsing connection string:', error);
  connectionConfig = { connectionString };
}

// Display masked connection string for debugging
console.log('Connection string format (masked):',
  connectionString.replace(/postgres:\/\/[^:]+:[^@]+@/, 'postgres://user:password@'));

const pool = new Pool(connectionConfig);

async function testDatabaseConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('Direct PostgreSQL connection successful!');
    console.log('Current time on Supabase PostgreSQL:', result.rows[0].now);
    client.release();
    return true;
  } catch (error) {
    console.error('Error connecting directly to PostgreSQL:', error);
    console.error('Error details:', { 
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return false;
  } finally {
    await pool.end();
  }
}

// Run both tests
async function runTests() {
  try {
    await testSupabaseApiConnection();
    await testDatabaseConnection();
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

runTests();