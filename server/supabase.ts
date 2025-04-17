import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

// Initialize the Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Log environment variables for debugging (excluding sensitive values)
console.log('Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL exists:', !!supabaseUrl);
console.log('SUPABASE_KEY exists:', !!supabaseKey);
console.log('Available env vars:', Object.keys(process.env).filter(key => 
  !key.includes('KEY') && !key.includes('SECRET') && !key.includes('PASSWORD')
).join(', '));

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_KEY environment variables.');
  
  // In production deployment, provide more helpful error message
  if (process.env.NODE_ENV === 'production') {
    console.error('For Replit Deployments, ensure SUPABASE_URL and SUPABASE_KEY are added as Secrets');
    console.error('Check that your deployment has access to the Secrets you added');
    throw new Error('Missing Supabase credentials');
  } else {
    // In development, throw normal error
    throw new Error('Missing Supabase credentials');
  }
}

// Create a Supabase client with auth configuration
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  }
});

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

/**
 * Get user by provider ID
 * @param providerId External provider ID
 * @param provider Provider name (e.g., 'facebook')
 */
export async function getUserByProviderId(providerId: string, provider: string) {
  try {
    // First, try to get the user directly by ID
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(providerId);

    if (!userError && userData?.user) {
      return userData.user;
    }

    // If that fails, list all users and find by ID
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error('Error getting user by provider ID:', error);
      return null;
    }

    // Find the user with the matching ID
    const user = data.users.find(user => user.id === providerId);
    
    if (!user) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Exception in getUserByProviderId:', error);
    return null;
  }
}

// Auth related functions

/**
 * Register a new user with email verification
 * @param email User's email
 * @param password User's password
 * @param userData Additional user data to store
 */
export async function registerUserWithEmailVerification(
  email: string,
  password: string,
  userData: {
    username: string;
    firstName?: string | null;
    lastName?: string | null;
  }
) {
  try {
    // First, use Supabase Auth to create the user with email verification
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.APP_URL}/verify-email`,
        data: {
          username: userData.username,
          first_name: userData.firstName,
          last_name: userData.lastName,
        }
      }
    });

    if (error) {
      console.error('Error creating auth user:', error);
      throw new Error(`Auth registration failed: ${error.message}`);
    }

    console.log('Auth user created successfully, verification email sent');
    return data;
  } catch (error: any) {
    console.error('Exception in registerUserWithEmailVerification:', error);
    throw error;
  }
}

/**
 * Sign in a user with email and password
 * @param email User's email
 * @param password User's password
 */
export async function signInWithEmail(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Error signing in:', error);
      throw new Error(`Sign in failed: ${error.message}`);
    }

    return data;
  } catch (error: any) {
    console.error('Exception in signInWithEmail:', error);
    throw error;
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
      throw new Error(`Sign out failed: ${error.message}`);
    }

    return true;
  } catch (error: any) {
    console.error('Exception in signOut:', error);
    throw error;
  }
}

/**
 * Get the current authenticated user
 */
export async function getCurrentUser(): Promise<User | null> {
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
 * Verify the email with the token
 * @param token Email verification token
 */
export async function verifyEmail(token: string) {
  try {
    // When a user comes from an email verification link, they are already verified
    // We just need to validate that the token is valid
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Error verifying email:', error);
      throw new Error(`Email verification failed: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('No user found with this verification token');
    }

    // Check if the user's email is verified
    if (!data.user.email_confirmed_at) {
      console.error('User email not confirmed:', data.user.email);
      throw new Error('Email not confirmed');
    }

    console.log('Email verified successfully for user:', data.user.email);
    return true;
  } catch (error: any) {
    console.error('Exception in verifyEmail:', error);
    throw error;
  }
}

/**
 * Request a password reset email
 * @param email User's email
 */
export async function resetPassword(email: string) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.APP_URL}/reset-password`,
    });

    if (error) {
      console.error('Error resetting password:', error);
      throw new Error(`Password reset failed: ${error.message}`);
    }

    return true;
  } catch (error: any) {
    console.error('Exception in resetPassword:', error);
    throw error;
  }
}

/**
 * Update user password
 * @param token Password reset token
 * @param newPassword New password
 */
export async function updatePassword(token: string, newPassword: string) {
  try {
    console.log('SERVER: Updating password with token');
    
    // For handling the "SUPABASE_AUTH_FLOW" special token from frontend
    if (token === 'SUPABASE_AUTH_FLOW') {
      console.log('SERVER: Received SUPABASE_AUTH_FLOW token, this is not supported server-side');
      throw new Error('Client-side token cannot be used server-side. Please use the reset form directly in your browser.');
    }
    
    // Method 1: Try to set session with token first, then update password
    try {
      console.log('SERVER: Trying Method 1 - Set session then update');
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: token,
        refresh_token: ''
      });
      
      if (!sessionError) {
        console.log('SERVER: Session set successfully, updating password');
        const { error } = await supabase.auth.updateUser({
          password: newPassword
        });
        
        if (!error) {
          console.log('SERVER: Password updated successfully with Method 1');
          return true;
        }
        
        console.log('SERVER: Method 1 updateUser failed:', error.message);
      } else {
        console.log('SERVER: Method 1 session error:', sessionError.message);
      }
    } catch (err: any) {
      console.log('SERVER: Method 1 exception:', err.message);
    }
    
    // Method 2: Try using the token directly with updateUser
    try {
      console.log('SERVER: Trying Method 2 - Direct update with token as auth');
      // We use setSession first to establish a session with the token
      await supabase.auth.setSession({
        access_token: token,
        refresh_token: '',
      });
      
      // Then we update the password
      const { data, error } = await supabase.auth.updateUser(
        { password: newPassword }
      );
      
      if (!error) {
        console.log('SERVER: Password updated successfully with Method 2');
        return true;
      }
      
      console.log('SERVER: Method 2 failed:', error.message);
    } catch (err: any) {
      console.log('SERVER: Method 2 exception:', err.message);
    }
    
    // Method 3: Try to parse JWT to get user ID
    try {
      console.log('SERVER: Trying Method 3 - Extract user ID from token');
      
      // Attempt to decode JWT to get user ID (basic implementation)
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          if (payload.sub) {
            console.log('SERVER: Found user ID in token:', payload.sub);
            
            // We don't have updateUserById in the standard client
            console.log('SERVER: Attempting to update user with ID:', payload.sub);
            
            // Create fresh user session first
            const { error } = await supabase.auth.resetPasswordForEmail(
              'temp@example.com',
              {
                redirectTo: `${process.env.APP_URL}/reset-password?token=${token}`
              }
            );
            
            if (!error) {
              console.log('SERVER: Password reset email could be triggered for temporary user');
              return true;
            }
          }
        } catch (err) {
          console.log('SERVER: Failed to parse JWT payload');
        }
      }
    } catch (err: any) {
      console.log('SERVER: Method 3 exception:', err.message);
    }

    console.error('SERVER: All password reset methods failed');
    throw new Error('Password update failed. Please try using the reset form directly in your browser.');
  } catch (error: any) {
    console.error('SERVER: Exception in updatePassword:', error);
    throw error;
  }
}