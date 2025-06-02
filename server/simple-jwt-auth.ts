import { Express, Request, Response, NextFunction } from "express";
import { generateToken, verifyTokenFromRequest } from "./jwt";
import { storage } from "./storage";
import { signInWithEmail, registerUserWithEmailVerification } from "./supabase";
import { insertUserSchema } from "@shared/schema";

/**
 * Simple JWT-based authentication setup
 * Replaces complex Passport.js session handling
 */
export function setupJWTAuth(app: Express) {
  
  // Login endpoint with JWT token generation
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const loginId = Math.random().toString(36).substr(2, 9);
      
      console.log(`[${loginId}] JWT Login attempt for: ${email}`);

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Get user from database by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.log(`[${loginId}] User not found: ${email}`);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // DEBUG: Log user details to identify the issue
      console.log(`[${loginId}] Found user:`, {
        id: user.id,
        username: user.username,
        email: user.email,
        providerId: user.providerId,
        provider: user.provider,
        hasProviderId: !!user.providerId
      });

      // Verify credentials with Supabase
      try {
        const authResult = await signInWithEmail(email, password);
        console.log(`[${loginId}] Supabase auth result:`, {
          hasUser: !!authResult?.user,
          supabaseUserId: authResult?.user?.id,
          supabaseUserEmail: authResult?.user?.email
        });

        if (!authResult?.user) {
          console.log(`[${loginId}] Supabase authentication failed for: ${email}`);
          return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check if user has providerId set
        if (!user.providerId) {
          console.log(`[${loginId}] User missing providerId, attempting to update with Supabase ID: ${authResult.user.id}`);
          
          // Update user with Supabase provider ID for future logins
          try {
            console.log(`[${loginId}] Attempting to update user ${user.id} with providerId...`);
            const updatedUser = await storage.updateUser(user.id, {
              providerId: authResult.user.id,
              provider: 'supabase'
            });
            console.log(`[${loginId}] Successfully updated user ${user.id} with providerId: ${authResult.user.id}`);
            
            // Update the user object for the rest of this request
            user.providerId = authResult.user.id;
            user.provider = 'supabase';
          } catch (updateError: any) {
            console.error(`[${loginId}] Failed to update user providerId:`, updateError);
            console.error(`[${loginId}] Update error details:`, updateError.message, updateError.stack);
            // Continue with login even if update fails
          }
        } else {
          // Verify provider ID matches for security
          if (user.providerId !== authResult.user.id) {
            console.error(`[${loginId}] Provider ID mismatch - User: ${user.providerId}, Supabase: ${authResult.user.id}`);
            return res.status(401).json({ message: "Authentication provider mismatch" });
          }
        }

        // Generate JWT token
        const token = generateToken(user);
        
        console.log(`[${loginId}] JWT Login successful for: ${user.username} (ID: ${user.id})`);
        
        // Return user and token
        res.json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
            isAdmin: user.isAdmin,
            isSeller: user.isSeller,
            isVerified: user.isVerified,
            shopName: user.shopName,
            location: user.location,
            bio: user.bio
          },
          token
        });

      } catch (authError: any) {
        console.error(`[${loginId}] Supabase authentication error:`, authError.message);
        return res.status(401).json({ message: "Invalid credentials" });
      }

    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get current user endpoint with JWT verification
  app.get("/api/user", async (req: Request, res: Response) => {
    try {
      const sessionId = Math.random().toString(36).substr(2, 9);
      console.log(`[${sessionId}] JWT /api/user request`);

      // Try to verify JWT token first
      const tokenUser = verifyTokenFromRequest(req);
      
      if (tokenUser) {
        // Token is valid, get fresh user data from database
        const user = await storage.getUser(tokenUser.id);
        if (user) {
          // Verify token user ID matches database user ID for security
          if (user.id !== tokenUser.id) {
            console.error(`[${sessionId}] Token ID mismatch - Token: ${tokenUser.id}, DB: ${user.id}`);
            return res.status(401).json({ message: "Token validation failed" });
          }

          console.log(`[${sessionId}] JWT authentication successful for: ${user.username} (ID: ${user.id})`);
          return res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            avatarUrl: user.avatarUrl,
            isAdmin: user.isAdmin,
            isSeller: user.isSeller,
            isVerified: user.isVerified,
            shopName: user.shopName,
            location: user.location,
            bio: user.bio
          });
        } else {
          console.log(`[${sessionId}] User not found in database for token ID: ${tokenUser.id}`);
          return res.status(401).json({ message: "User not found" });
        }
      }

      // No valid JWT token found
      console.log(`[${sessionId}] No valid JWT token found`);
      return res.status(401).json({ message: "Authentication required" });

    } catch (error: any) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Registration endpoint with JWT token generation
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const registrationId = Math.random().toString(36).substr(2, 9);
      console.log(`[${registrationId}] JWT Registration attempt`);

      // Validate request body and get password
      const { password, ...userData } = req.body;
      const validatedData = insertUserSchema.parse(userData);
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const existingUsername = await storage.getUserByUsername(validatedData.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Register with Supabase first
      let authData;
      try {
        authData = await registerUserWithEmailVerification(validatedData.email, password, { 
          username: validatedData.username 
        });
      } catch (authError: any) {
        console.error(`[${registrationId}] Supabase registration error:`, authError);
        return res.status(400).json({ message: authError.message || "Registration failed with auth provider" });
      }

      // Extract provider ID for secure linking
      let providerId = null;
      if (authData?.user?.id) {
        providerId = authData.user.id;
      }

      // Create user in our database
      const user = await storage.createUser({
        ...validatedData,
        providerId: providerId,
        provider: 'supabase',
      });

      // Generate JWT token
      const token = generateToken(user);

      console.log(`[${registrationId}] JWT Registration successful for: ${user.username} (ID: ${user.id})`);

      // Return user and token
      res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: user.avatarUrl,
          isAdmin: user.isAdmin,
          isSeller: user.isSeller,
          isVerified: user.isVerified,
          shopName: user.shopName,
          location: user.location,
          bio: user.bio
        },
        token
      });

    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Logout endpoint (client-side token removal)
  app.post("/api/logout", (req: Request, res: Response) => {
    // With JWT, logout is primarily client-side (remove token)
    // Server can optionally maintain a token blacklist for additional security
    console.log("Logout request received");
    res.json({ message: "Logged out successfully" });
  });

  // JWT verification middleware for protected routes
  app.use("/api/protected", (req: Request, res: Response, next: NextFunction) => {
    const tokenUser = verifyTokenFromRequest(req);
    
    if (!tokenUser) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Add user info to request for use in protected routes
    (req as any).jwtUser = tokenUser;
    next();
  });
}