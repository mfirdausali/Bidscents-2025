import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client with environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
  throw new Error('Missing Supabase credentials');
}

// Global singleton to prevent multiple GoTrueClient instances
declare global {
  var __supabaseClient: any | undefined;
}

function createSupabaseClient() {
  // Check if we already have a global instance
  if (globalThis.__supabaseClient) {
    return globalThis.__supabaseClient;
  }

  // Create new instance with optimized configuration
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Reduce token refresh frequency to prevent multiple instances
      storageKey: 'supabase.auth.token',
      // Add debug mode in development
      debug: import.meta.env.DEV
    },
    // Optimize connection settings
    global: {
      headers: {
        'X-Client-Info': 'bidscents-web-client'
      }
    }
  });

  // Store globally to prevent recreation
  globalThis.__supabaseClient = client;
  
  return client;
}

// Create a single Supabase client instance
export const supabase = createSupabaseClient();

/**
 * Sign in with Facebook
 * This function initiates the Facebook authentication flow
 */
export async function signInWithFacebook() {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: `${window.location.origin}/auth-callback`,
      }
    });

    if (error) {
      console.error('Error signing in with Facebook:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Exception in signInWithFacebook:', error);
    throw error;
  }
}

/**
 * Get the current user from Supabase
 */
export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('Error getting current user:', error);
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Exception in getCurrentUser:', error);
    return null;
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Exception in signOut:', error);
    throw error;
  }
}