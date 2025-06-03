import { Express, Request, Response, NextFunction } from "express";
import { generateToken, verifyTokenFromRequest } from "./jwt";
import { storage } from "./storage";
import { createClient } from '@supabase/supabase-js';
import { insertUserSchema, User as SelectUser } from "@shared/schema";

// Initialize Supabase client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Streamlined authentication system using Supabase as sole Identity Provider
 * This replaces all Passport.js and session-based authentication
 */
export function setupAppAuth(app: Express) {
  
  /**
   * Exchange Supabase JWT for Application JWT
   * POST /api/v1/auth/session
   */
  app.post("/api/v1/auth/session", async (req: Request, res: Response) => {
    try {
      const { supabaseToken } = req.body;
      
      if (!supabaseToken) {
        return res.status(400).json({ message: "Supabase token is required" });
      }

      // Verify Supabase JWT and get user data
      const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(supabaseToken);
      
      if (error || !supabaseUser) {
        console.error('Supabase token verification failed:', error);
        return res.status(401).json({ message: "Invalid Supabase token" });
      }

      // Find or create local user profile linked to Supabase user
      let localUser = await storage.getUserByProviderId(supabaseUser.id);
      
      if (!localUser) {
        // Create new local user profile
        const userData = {
          username: supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || `user_${Date.now()}`,
          email: supabaseUser.email!,
          firstName: supabaseUser.user_metadata?.first_name || null,
          lastName: supabaseUser.user_metadata?.last_name || null,
          providerId: supabaseUser.id,
          provider: 'supabase',
          avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
          isVerified: supabaseUser.email_confirmed_at ? true : false
        };

        localUser = await storage.createUser(userData);
        console.log('Created new local user profile for Supabase user:', supabaseUser.id);
      } else {
        // Update existing user with latest Supabase data
        const updatedData = {
          email: supabaseUser.email!,
          firstName: supabaseUser.user_metadata?.first_name || localUser.firstName,
          lastName: supabaseUser.user_metadata?.last_name || localUser.lastName,
          avatarUrl: supabaseUser.user_metadata?.avatar_url || localUser.avatarUrl,
          isVerified: supabaseUser.email_confirmed_at ? true : localUser.isVerified
        };
        
        localUser = await storage.updateUser(localUser.id, updatedData);
        console.log('Updated local user profile for Supabase user:', supabaseUser.id);
      }

      // Generate application-specific JWT
      const appToken = generateToken(localUser);

      res.json({
        user: localUser,
        token: appToken,
        message: "Authentication successful"
      });

    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get current user profile
   * GET /api/v1/auth/me
   */
  app.get("/api/v1/auth/me", async (req: Request, res: Response) => {
    try {
      const user = verifyTokenFromRequest(req);
      
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get fresh user data from database
      const currentUser = await storage.getUser(user.id);
      
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ user: currentUser });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Logout (invalidate application JWT)
   * POST /api/v1/auth/logout
   */
  app.post("/api/v1/auth/logout", async (req: Request, res: Response) => {
    try {
      // Note: In a production environment, you might want to implement
      // JWT blacklisting here. For now, client-side token removal is sufficient.
      
      res.json({ message: "Logout successful" });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Middleware to protect API routes with JWT verification
   */
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const user = verifyTokenFromRequest(req);
    
    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Attach user to request object
    (req as any).user = user;
    next();
  };

  /**
   * Legacy endpoint compatibility - redirect to new auth flow
   * GET /api/user
   */
  app.get("/api/user", async (req: Request, res: Response) => {
    try {
      const user = verifyTokenFromRequest(req);
      
      if (!user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Get fresh user data
      const currentUser = await storage.getUser(user.id);
      
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(currentUser);

    } catch (error) {
      console.error('Legacy user endpoint error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export the middleware for use in other routes
  return { requireAuth };
}

/**
 * Helper function to find or create user from Supabase data
 */
export async function findOrCreateUserFromSupabase(supabaseUser: any): Promise<SelectUser> {
  let localUser = await storage.getUserByProviderId(supabaseUser.id);
  
  if (!localUser) {
    const userData = {
      username: supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || `user_${Date.now()}`,
      email: supabaseUser.email!,
      firstName: supabaseUser.user_metadata?.first_name || null,
      lastName: supabaseUser.user_metadata?.last_name || null,
      providerId: supabaseUser.id,
      provider: 'supabase',
      avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
      isVerified: supabaseUser.email_confirmed_at ? true : false
    };

    localUser = await storage.createUser(userData);
  }

  return localUser;
}