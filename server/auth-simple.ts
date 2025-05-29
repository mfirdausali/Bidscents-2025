import { Express, Request, Response, NextFunction } from "express";
import { createClient } from '@supabase/supabase-js';
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

// Create Supabase admin client for server-side operations
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials for admin client');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: any;
      dbUser?: SelectUser;
    }
  }
}

/**
 * Middleware to authenticate requests using Supabase JWT tokens
 * This provides stateless authentication without server-side sessions
 */
export async function authenticateSupabaseUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Validate the JWT token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      console.log('JWT validation failed:', error?.message);
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Get the corresponding user from our database
    const dbUser = await storage.getUserByEmail(user.email || '');
    
    if (!dbUser) {
      return res.status(404).json({ message: "User not found in database" });
    }

    // Security check: Ensure provider ID matches
    if (dbUser.providerId && dbUser.providerId !== user.id) {
      console.warn(`Security warning: Provider ID mismatch for user ${dbUser.username}`);
      return res.status(403).json({ message: "Authentication mismatch" });
    }

    // Store user data in request for use in routes
    req.supabaseUser = user;
    req.dbUser = dbUser;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export async function optionalAuthenticateSupabaseUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Validate the JWT token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      // Invalid token, continue without authentication
      return next();
    }

    // Get the corresponding user from our database
    const dbUser = await storage.getUserByEmail(user.email || '');
    
    if (dbUser && (!dbUser.providerId || dbUser.providerId === user.id)) {
      // Store user data in request for use in routes
      req.supabaseUser = user;
      req.dbUser = dbUser;
    }
    
    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    next(); // Continue without authentication on error
  }
}

/**
 * Setup the new simplified Supabase-only authentication
 */
export function setupSimpleAuth(app: Express) {
  console.log('🔐 SETTING UP SIMPLIFIED SUPABASE-ONLY AUTH');
  
  // Registration with email verification
  app.post("/api/register-with-verification", async (req, res) => {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      // Check if username is already taken
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if email is already registered
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Register the user with Supabase Auth
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // Require email verification
        user_metadata: { username, firstName, lastName }
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.user) {
        throw new Error('User creation failed');
      }

      // Create user in our database
      const user = await storage.createUser({
        username,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        address: null,
        profileImage: null,
        walletBalance: 0,
        isSeller: true,
        isAdmin: false,
        isBanned: false,
        providerId: data.user.id,
        provider: 'supabase'
      });

      res.status(201).json({ 
        message: "Registration successful! Please check your email to verify your account.",
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: error.message || "Registration failed" });
    }
  });

  // Login with email and password
  app.post("/api/login-with-email", async (req, res) => {
    try {
      const { email, password } = req.body;

      // Authenticate with Supabase
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error || !data.user || !data.session) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Find the corresponding user in our database
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ message: "User account not found" });
      }

      // Security check: Ensure provider ID matches
      if (user.providerId && user.providerId !== data.user.id) {
        console.warn(`Security warning: Provider ID mismatch for user ${user.username}`);
        return res.status(403).json({ 
          message: "Account authentication mismatch. Please contact support.",
          code: "AUTH_MISMATCH"
        });
      }

      // Update provider ID if not set
      if (!user.providerId) {
        await storage.updateUser(user.id, {
          providerId: data.user.id,
          provider: 'supabase'
        });
      }

      // Return user data and access token for frontend
      res.status(200).json({ 
        user,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at
        }
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(401).json({ message: error.message || "Authentication failed" });
    }
  });

  // Password reset request
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/reset-password`,
      });

      if (error) {
        throw new Error(error.message);
      }
      
      res.status(200).json({ message: "Password reset email sent" });
    } catch (error: any) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: error.message || "Password reset failed" });
    }
  });

  // Get current user (requires authentication)
  app.get("/api/user", authenticateSupabaseUser, (req, res) => {
    // User is already validated by middleware
    res.json(req.dbUser);
  });

  // Logout (client-side only, no server state to clear)
  app.post("/api/logout", (req, res) => {
    // With JWT-based auth, logout is handled client-side
    // Server has no session state to clear
    res.status(200).json({ message: "Logged out successfully" });
  });

  console.log('✅ Simplified Supabase authentication setup complete');
}