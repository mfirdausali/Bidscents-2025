/**
 * Supabase-Only Authentication Module
 * 
 * This module implements authentication using Supabase as the sole Identity Provider.
 * It validates Supabase JWTs and issues application-specific JWTs for API access.
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { supabase } from './supabase';
import { storage } from './storage';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '7d';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    supabaseId: string;
    isSeller?: boolean;
  };
}

/**
 * Middleware to verify Supabase JWT and get user info
 */
export async function verifySupabaseAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const supabaseToken = authHeader.substring(7);
    
    // Verify the Supabase JWT
    const { data: { user }, error } = await supabase.auth.getUser(supabaseToken);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid Supabase token' });
    }

    // Find or create local user profile
    let localUser = await storage.getUserByProviderId(user.id);
    
    if (!localUser) {
      // Create new local user profile
      localUser = await storage.createUser({
        email: user.email!,
        username: user.email!.split('@')[0],
        providerId: user.id,
        provider: 'supabase',
        firstName: user.user_metadata?.first_name || null,
        lastName: user.user_metadata?.last_name || null,
      });
    }

    (req as AuthenticatedRequest).user = {
      id: localUser.id,
      email: localUser.email,
      supabaseId: user.id,
    };

    next();
  } catch (error) {
    console.error('Supabase auth verification error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Generate application-specific JWT
 */
export function generateAppJWT(userId: number, email: string, supabaseId: string, isSeller?: boolean): string {
  return jwt.sign(
    { 
      userId, 
      email, 
      supabaseId,
      isSeller,
      type: 'app_token' 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify application JWT
 */
export function verifyAppJWT(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid application token');
  }
}

/**
 * Middleware to verify application JWT
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyAppJWT(token);
    
    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      email: decoded.email,
      supabaseId: decoded.supabaseId,
      isSeller: decoded.isSeller,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Get user from JWT token helper
 */
export function getUserFromToken(req: Request): { id: number; email: string; supabaseId: string } | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verifyAppJWT(token);
    
    return {
      id: decoded.userId,
      email: decoded.email,
      supabaseId: decoded.supabaseId,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Auth endpoints
 */
export const authRoutes = {
  // Exchange Supabase JWT for application JWT
  session: async (req: Request, res: Response) => {
    try {
      console.log('🔄 Backend: Starting session creation with request body:', req.body);
      const { supabaseToken } = req.body;
      
      if (!supabaseToken) {
        console.log('❌ Backend: No Supabase token provided');
        return res.status(400).json({ error: 'Supabase token required' });
      }

      console.log('🔄 Backend: Verifying Supabase JWT...');
      // Verify the Supabase JWT
      const { data: { user }, error } = await supabase.auth.getUser(supabaseToken);
      
      if (error) {
        console.error('❌ Backend: Supabase auth error:', error);
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }
      
      if (!user) {
        console.log('❌ Backend: No user returned from Supabase');
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }

      console.log('✅ Backend: Supabase user verified:', {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        user_metadata: user.user_metadata
      });

      if (!user.email) {
        console.error('❌ Backend: User email is null/undefined');
        return res.status(400).json({ error: 'User email is required' });
      }

      console.log('🔄 Backend: Looking up local user by email:', user.email);
      // Find or create local user profile - simplified approach
      let localUser = await storage.getUserByEmail(user.email);
      
      if (!localUser) {
        console.log('🔄 Backend: Creating new local user');
        // Create new user
        const newUserData = {
          email: user.email,
          username: user.email.split('@')[0],
          firstName: user.user_metadata?.first_name || null,
          lastName: user.user_metadata?.last_name || null,
        };
        console.log('🔄 Backend: New user data:', newUserData);
        
        localUser = await storage.createUser(newUserData);
        console.log('✅ Backend: Created local user:', localUser);
      } else {
        console.log('✅ Backend: Found existing local user:', localUser);
      }

      console.log('🔄 Backend: Generating application JWT...');
      // Generate application JWT with seller status
      const appToken = generateAppJWT(localUser.id, localUser.email, user.id, localUser.isSeller);

      const response = {
        token: appToken,
        user: {
          id: localUser.id,
          email: localUser.email,
          username: localUser.username,
          firstName: localUser.firstName,
          lastName: localUser.lastName,
          isSeller: localUser.isSeller,
        }
      };
      
      console.log('✅ Backend: Session created successfully for user:', localUser.email);
      res.json(response);
    } catch (error: any) {
      console.error('❌ Backend: Session creation error details:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        name: error?.name
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Look up email by username for authentication
  lookupEmail: async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({ error: 'Username required' });
      }

      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(404).json({ error: 'Username not found' });
      }

      res.json({ email: user.email });
    } catch (error) {
      console.error('Email lookup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get current user profile
  me: async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const user = await storage.getUser(authReq.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImage: user.profileImage,
        isEmailVerified: user.isVerified,
        isSeller: user.isSeller,
      });
    } catch (error) {
      console.error('Get user profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Logout (client-side only - just remove token)
  logout: async (req: Request, res: Response) => {
    res.json({ message: 'Logged out successfully' });
  },

  // Recovery endpoint for orphaned users (exist in auth.users but not public.users)
  recoverProfile: async (req: Request, res: Response) => {
    try {
      const { supabaseToken } = req.body;
      
      if (!supabaseToken) {
        return res.status(400).json({ error: 'Supabase token required' });
      }

      console.log('🔄 Recovery: Verifying Supabase JWT...');
      // Verify the Supabase JWT
      const { data: { user }, error } = await supabase.auth.getUser(supabaseToken);
      
      if (error || !user) {
        console.error('❌ Recovery: Invalid Supabase token:', error);
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }

      if (!user.email) {
        return res.status(400).json({ error: 'User email is required' });
      }

      console.log('🔄 Recovery: Checking for existing local user...');
      // Check if user already exists in public.users
      let localUser = await storage.getUserByEmail(user.email);
      
      if (localUser) {
        console.log('✅ Recovery: User profile already exists');
        // User exists, just return the profile
        const appToken = generateAppJWT(localUser.id, localUser.email, user.id, localUser.isSeller);
        
        return res.json({
          token: appToken,
          user: {
            id: localUser.id,
            email: localUser.email,
            username: localUser.username,
            firstName: localUser.firstName,
            lastName: localUser.lastName,
            isSeller: localUser.isSeller,
          },
          recovered: false
        });
      }

      console.log('🔄 Recovery: Creating missing user profile...');
      // User doesn't exist in public.users, create it
      const newUserData = {
        email: user.email,
        username: user.email.split('@')[0],
        firstName: user.user_metadata?.first_name || user.user_metadata?.firstName || null,
        lastName: user.user_metadata?.last_name || user.user_metadata?.lastName || null,
        providerId: user.id,
        provider: 'supabase',
        isVerified: !!user.email_confirmed_at
      };
      
      // Handle username conflicts
      let baseUsername = newUserData.username;
      let counter = 0;
      let usernameExists = true;
      
      while (usernameExists) {
        const existingUser = await storage.getUserByUsername(newUserData.username);
        if (!existingUser) {
          usernameExists = false;
        } else {
          counter++;
          newUserData.username = `${baseUsername}${counter}`;
          
          // Prevent infinite loops
          if (counter > 9999) {
            newUserData.username = `${baseUsername}${Date.now()}`;
            break;
          }
        }
      }

      localUser = await storage.createUser(newUserData);
      console.log('✅ Recovery: Successfully created user profile:', localUser.email);

      // Generate application JWT
      const appToken = generateAppJWT(localUser.id, localUser.email, user.id, localUser.isSeller);

      res.json({
        token: appToken,
        user: {
          id: localUser.id,
          email: localUser.email,
          username: localUser.username,
          firstName: localUser.firstName,
          lastName: localUser.lastName,
          isSeller: localUser.isSeller,
        },
        recovered: true
      });
    } catch (error: any) {
      console.error('❌ Recovery: Profile recovery error:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack
      });
      res.status(500).json({ error: 'Profile recovery failed' });
    }
  },

  // Admin endpoint to check for orphaned users
  checkOrphanedUsers: async (req: Request, res: Response) => {
    try {
      // This endpoint requires admin access - implement admin check here
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const adminUser = await storage.getUser(authReq.user.id);
      if (!adminUser?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Call the Supabase function to count orphaned users
      const { data, error } = await supabase.rpc('count_orphaned_users');
      
      if (error) {
        console.error('Error checking orphaned users:', error);
        return res.status(500).json({ error: 'Failed to check orphaned users' });
      }

      res.json({ orphanedCount: data || 0 });
    } catch (error) {
      console.error('Error in checkOrphanedUsers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Admin endpoint to repair orphaned users
  repairOrphanedUsers: async (req: Request, res: Response) => {
    try {
      // This endpoint requires admin access
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const adminUser = await storage.getUser(authReq.user.id);
      if (!adminUser?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Call the Supabase function to repair orphaned users
      const { data, error } = await supabase.rpc('repair_orphaned_users');
      
      if (error) {
        console.error('Error repairing orphaned users:', error);
        return res.status(500).json({ error: 'Failed to repair orphaned users' });
      }

      const results = data || [];
      const successful = results.filter((r: any) => r.success).length;
      const failed = results.filter((r: any) => !r.success).length;

      res.json({ 
        repaired: successful,
        failed: failed,
        results: results
      });
    } catch (error) {
      console.error('Error in repairOrphanedUsers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};