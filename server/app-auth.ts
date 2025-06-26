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
import { auditAuth, auditSecurity, AuditEventType, AuditSeverity, auditLog } from './audit-logger';
import { trackLoginAttempt, trackSession, updateSessionActivity, deactivateSession } from './security-tracking';

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
  const payload = {
    userId, 
    email, 
    supabaseId,
    isSeller: isSeller || false,
    type: 'app_token',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'bidscents-marketplace',
    audience: 'bidscents-users',
    algorithm: 'HS256'
  });
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
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'];
        await trackLoginAttempt('unknown', false, ipAddress, userAgent, undefined, 'Invalid Supabase token');
        await auditAuth.loginFailed(req, 'unknown', 'Invalid Supabase token');
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }
      
      if (!user) {
        console.log('❌ Backend: No user returned from Supabase');
        const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'];
        await trackLoginAttempt('unknown', false, ipAddress, userAgent, undefined, 'No user returned from Supabase');
        await auditAuth.loginFailed(req, 'unknown', 'No user returned from Supabase');
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
      // Find or create local user profile with enhanced error handling
      let localUser = await storage.getUserByEmail(user.email);
      
      if (!localUser) {
        console.log('🔄 Backend: No local user found, checking by provider ID...');
        // Also check by provider ID in case email was changed
        localUser = await storage.getUserByProviderId(user.id);
        
        if (localUser && localUser.email !== user.email) {
          console.log('🔄 Backend: Found user by provider ID but email mismatch, updating email...');
          // Update email if it changed in Supabase
          localUser = await storage.updateUser(localUser.id, { email: user.email });
        }
      }
      
      if (!localUser) {
        console.log('🔄 Backend: Creating new local user profile...');
        
        // Determine provider from app_metadata
        const authProvider = user.app_metadata?.provider || 'email';
        console.log('🔍 Backend: Detected auth provider:', authProvider);
        
        // Generate unique username based on provider
        let baseUsername: string;
        let firstName = null;
        let lastName = null;
        
        if (authProvider === 'facebook') {
          // Facebook user data handling
          firstName = user.user_metadata?.full_name?.split(' ')[0] || 
                     user.user_metadata?.name?.split(' ')[0] || 
                     user.user_metadata?.first_name ||
                     user.email.split('@')[0];
          lastName = user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || 
                    user.user_metadata?.name?.split(' ').slice(1).join(' ') || 
                    user.user_metadata?.last_name || 
                    null;
          
          // Use name or email for username base
          baseUsername = user.user_metadata?.preferred_username ||
                        user.user_metadata?.name?.toLowerCase().replace(/\s+/g, '') ||
                        firstName?.toLowerCase() ||
                        user.email.split('@')[0];
          
          console.log('📘 Backend: Facebook user data:', {
            fullName: user.user_metadata?.full_name,
            firstName,
            lastName,
            baseUsername
          });
        } else {
          // Email/password user data handling
          firstName = user.user_metadata?.first_name || user.user_metadata?.firstName || null;
          lastName = user.user_metadata?.last_name || user.user_metadata?.lastName || null;
          baseUsername = user.email.split('@')[0];
        }
        
        // Ensure username uniqueness
        let username = baseUsername;
        let counter = 0;
        while (await storage.getUserByUsername(username)) {
          counter++;
          username = `${baseUsername}${counter}`;
          if (counter > 9999) {
            username = `${baseUsername}${Date.now()}`;
            break;
          }
        }
        
        const newUserData = {
          email: user.email,
          username: username,
          firstName,
          lastName,
          providerId: user.id,
          provider: authProvider,
          isVerified: !!user.email_confirmed_at,
          profileImage: user.user_metadata?.avatar_url || user.user_metadata?.picture || null
        };
        
        console.log('🔄 Backend: Creating user with data:', newUserData);
        
        try {
          localUser = await storage.createUser(newUserData);
          console.log('✅ Backend: Successfully created local user profile');
        } catch (createError: any) {
          console.error('❌ Backend: Failed to create user profile:', createError);
          // If user creation fails, return a specific error that frontend can handle
          return res.status(500).json({ 
            error: 'Failed to create user profile',
            code: 'PROFILE_CREATION_FAILED',
            details: createError?.message
          });
        }
      } else {
        console.log('✅ Backend: Found existing local user:', localUser.email);
        
        // Update provider ID if missing or update provider info
        const authProvider = user.app_metadata?.provider || 'email';
        if (!localUser.providerId || localUser.provider !== authProvider) {
          console.log('🔄 Backend: Updating provider information...');
          try {
            localUser = await storage.updateUser(localUser.id, {
              providerId: user.id,
              provider: authProvider,
              isVerified: !!user.email_confirmed_at,
              profileImage: localUser.profileImage || user.user_metadata?.avatar_url || user.user_metadata?.picture || null
            });
          } catch (updateError: any) {
            console.error('❌ Backend: Failed to update provider info:', updateError);
            // Continue with session creation even if provider update fails
          }
        }
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
      
      // Track successful login
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'];
      await trackLoginAttempt(localUser.email, true, ipAddress, userAgent, localUser.id);
      
      // Track session
      await trackSession(localUser.id, appToken, ipAddress, userAgent);
      
      // Update user's last login info (non-critical, don't fail login if this fails)
      try {
        await storage.updateUser(localUser.id, {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          failedLoginAttempts: 0 // Reset failed attempts on successful login
        });
      } catch (updateError: any) {
        console.warn('⚠️ Backend: Failed to update last login info:', updateError.message);
        // Continue with login - this is non-critical
      }
      
      // Audit successful login
      await auditAuth.loginSuccess(req, localUser.id, localUser.email);
      
      res.json(response);
    } catch (error: any) {
      console.error('❌ Backend: Session creation error details:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        name: error?.name
      });
      
      // Audit failed login
      await auditAuth.loginFailed(req, 'unknown', error?.message || 'Internal server error');
      
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
        avatarUrl: user.avatarUrl,
        coverPhoto: user.coverPhoto,
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
    // Deactivate session if token provided
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await deactivateSession(token);
    }
    
    // Audit logout event
    await auditAuth.logout(req);
    
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
  },

  // Email verification endpoint for handling Supabase email confirmation
  verifyEmail: async (req: Request, res: Response) => {
    try {
      console.log('🔄 Email verification request received');
      console.log('Query params:', req.query);
      console.log('Headers:', req.headers);

      // Extract token or code from query parameters
      const token = req.query.token as string || req.query.access_token as string;
      const code = req.query.code as string;
      
      if (!token && !code) {
        console.log('❌ No verification token or code provided');
        return res.status(400).json({ 
          error: 'Missing verification token',
          message: 'Invalid verification link or missing parameters'
        });
      }

      let user = null;
      
      if (token) {
        console.log('🔄 Verifying Supabase JWT token...');
        
        // Verify the Supabase JWT token
        const { data: { user: tokenUser }, error } = await supabase.auth.getUser(token);
        
        if (error) {
          console.error('❌ Supabase token verification failed:', error);
          return res.status(401).json({ 
            error: 'Invalid verification token',
            message: 'Invalid verification link or missing parameters'
          });
        }
        
        if (!tokenUser) {
          console.log('❌ No user data returned from token verification');
          return res.status(401).json({ 
            error: 'Invalid verification token',
            message: 'Invalid verification link or missing parameters'
          });
        }
        
        user = tokenUser;
      } else if (code) {
        console.log('🔄 Handling verification code via admin API...');
        
        // For verification codes, we need to use the admin API to verify and get user info
        try {
          // Get all users and find the one with a pending verification
          const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
          
          if (listError) {
            console.error('❌ Failed to list users:', listError);
            return res.status(500).json({
              error: 'Verification failed',
              message: 'Unable to process verification at this time'
            });
          }
          
          // Find user with matching verification code (this is a simplified approach)
          // In a real scenario, you'd store the code and match it properly
          console.log('📋 Processing verification code:', code);
          
          // For now, return a generic response that the frontend can handle
          return res.json({
            success: true,
            message: 'Email verification link processed. Please try signing in.',
            requiresSignIn: true
          });
        } catch (codeError: any) {
          console.error('❌ Code verification error:', codeError);
          return res.status(500).json({
            error: 'Verification failed',
            message: 'Unable to process verification code'
          });
        }
      }

      // Ensure we have a valid user from token verification
      if (!user) {
        console.log('❌ No user data available for verification');
        return res.status(400).json({
          error: 'Verification failed',
          message: 'Unable to process verification request'
        });
      }

      console.log('✅ Token verified successfully for user:', user.email);
      
      // TypeScript assertion - we know user is not null at this point
      const verifiedUser = user;

      // Check if user profile exists in local database
      let localUser = await storage.getUserByEmail(verifiedUser.email!);
      
      if (!localUser) {
        console.log('🔄 Creating user profile for email verification...');
        // Create user profile if it doesn't exist
        const authProvider = verifiedUser.app_metadata?.provider || 'email';
        
        // Generate unique username
        let baseUsername = verifiedUser.email!.split('@')[0];
        let username = baseUsername;
        let counter = 0;
        
        while (await storage.getUserByUsername(username)) {
          counter++;
          username = `${baseUsername}${counter}`;
          if (counter > 9999) {
            username = `${baseUsername}${Date.now()}`;
            break;
          }
        }
        
        const newUserData = {
          email: verifiedUser.email!,
          username: username,
          firstName: verifiedUser.user_metadata?.first_name || verifiedUser.user_metadata?.firstName || null,
          lastName: verifiedUser.user_metadata?.last_name || verifiedUser.user_metadata?.lastName || null,
          providerId: verifiedUser.id,
          provider: authProvider,
          isVerified: true, // Mark as verified since they completed email verification
          profileImage: verifiedUser.user_metadata?.avatar_url || verifiedUser.user_metadata?.picture || null
        };
        
        localUser = await storage.createUser(newUserData);
        console.log('✅ User profile created successfully during email verification');
      } else {
        console.log('✅ User profile already exists, updating verification status...');
        // Update verification status
        await storage.updateUser(localUser.id, { 
          isVerified: true,
          providerId: verifiedUser.id,
          provider: verifiedUser.app_metadata?.provider || 'email'
        });
      }

      console.log('✅ Email verification completed successfully');
      res.json({ 
        success: true, 
        message: 'Email verified successfully',
        user: {
          id: localUser.id,
          email: localUser.email,
          username: localUser.username,
          isVerified: true
        }
      });
    } catch (error: any) {
      console.error('❌ Email verification error:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack
      });
      res.status(500).json({ 
        error: 'Email verification failed',
        message: 'An unexpected error occurred during verification'
      });
    }
  }
};