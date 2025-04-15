import { drizzle } from 'drizzle-orm/node-postgres';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from '@shared/schema';
import { supabase, testSupabaseConnection, ensureTablesExist } from './supabase';

// Create a PostgreSQL connection pool for legacy code and session store
// This is kept for compatibility with connect-pg-simple and other PG-specific code
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// We'll use Supabase for our data operations instead of direct PG connections
// but keeping the db export for compatibility with existing code
export const db = drizzle(pool, { schema }) as PostgresJsDatabase<typeof schema>;

export async function testConnection() {
  // First test the direct PostgreSQL connection (needed for session store)
  let pgConnected = false;
  try {
    await pool.query('SELECT NOW()');
    console.log('PostgreSQL direct connection successful');
    pgConnected = true;
  } catch (error) {
    console.error('PostgreSQL direct connection failed:', error);
  }
  
  // Then test the Supabase connection
  const supabaseConnected = await testSupabaseConnection();
  
  // If Supabase is connected, ensure tables exist
  if (supabaseConnected) {
    await ensureTablesExist();
  }
  
  // Return overall connection status
  return pgConnected && supabaseConnected;
}