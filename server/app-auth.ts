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
export function generateAppJWT(userId: number, email: string, supabaseId: string): string {
  return jwt.sign(
    { 
      userId, 
      email, 
      supabaseId,
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
      const { supabaseToken } = req.body;
      
      if (!supabaseToken) {
        return res.status(400).json({ error: 'Supabase token required' });
      }

      // Verify the Supabase JWT
      const { data: { user }, error } = await supabase.auth.getUser(supabaseToken);
      
      if (error || !user) {
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }

      // Find or create local user profile
      let localUser = await storage.getUserByProviderId(user.id);
      
      if (!localUser) {
        // Try to find existing user by email
        const existingUser = await storage.getUserByEmail(user.email!);
        
        if (existingUser) {
          // Update existing user with provider information
          await storage.updateUserProviderId(existingUser.id, user.id);
          localUser = existingUser;
        } else {
          // Create new user
          localUser = await storage.createUser({
            email: user.email!,
            username: user.email!.split('@')[0],
            providerId: user.id,
            provider: 'supabase',
            firstName: user.user_metadata?.first_name || null,
            lastName: user.user_metadata?.last_name || null,
          });
        }
      }

      // Generate application JWT
      const appToken = generateAppJWT(localUser.id, localUser.email, user.id);

      res.json({
        token: appToken,
        user: {
          id: localUser.id,
          email: localUser.email,
          username: localUser.username,
          firstName: localUser.firstName,
          lastName: localUser.lastName,
        }
      });
    } catch (error) {
      console.error('Session creation error:', error);
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
      });
    } catch (error) {
      console.error('Get user profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Logout (client-side only - just remove token)
  logout: async (req: Request, res: Response) => {
    res.json({ message: 'Logged out successfully' });
  }
};