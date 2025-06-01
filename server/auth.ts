import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { storage } from "./storage";
import crypto from "crypto";
import { User as SelectUser } from "@shared/schema";
import {
  registerUserWithEmailVerification, 
  signInWithEmail, 
  signInWithGoogle,
  signOut as supabaseSignOut,
  getCurrentUser,
  verifyEmail,
  resetPassword,
  updatePassword,
  supabase
} from './supabase';

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// No longer need password hashing or comparison functions as we're using Supabase auth

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "luxury-perfume-marketplace-secret",
    resave: false, // SECURITY: Don't save unmodified sessions
    saveUninitialized: false, // SECURITY: Don't create sessions for unauthenticated users
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'strict' // CSRF protection
    },
    store: storage.sessionStore,
    name: 'luxperfume.sid', // Custom session name to avoid conflicts
    genid: () => {
      // Generate cryptographically secure session IDs
      return crypto.randomBytes(32).toString('hex');
    }
  };
  
  console.log('🔧 Session configuration:');
  console.log('🔧   - Secret length:', sessionSettings.secret?.length);
  console.log('🔧   - Store type:', storage.sessionStore.constructor.name);
  console.log('🔧   - Cookie settings:', sessionSettings.cookie);

  app.set("trust proxy", 1);
  
  // Session debugging middleware (commented out for cleaner logs)
  // app.use((req, res, next) => {
  //   const originalSessionId = req.sessionID;
  //   req.on('close', () => {
  //     if (req.sessionID !== originalSessionId) {
  //       console.warn(`🚨 SESSION ID CHANGED during request: ${originalSessionId} -> ${req.sessionID}`);
  //     }
  //   });
  //   next();
  // });
  
  app.use(session(sessionSettings));
  
  // Log session creation/access
  app.use((req, res, next) => {
    const sessionId = req.sessionID;
    if (req.session && (req.session as any).isNew) {
      console.log(`🆕 NEW SESSION CREATED: ${sessionId}`);
    }
    
    // Track session to user mapping
    const sessionUser = req.session && (req.session as any).passport ? (req.session as any).passport.user : null;
    if (sessionUser) {
      const trackingKey = `session_${sessionId}`;
      const lastMapping = (global as any)[trackingKey];
      
      if (lastMapping && lastMapping.userId !== sessionUser) {
        console.error(`🚨 SESSION HIJACK DETECTED: Session ${sessionId} was mapped to user ${lastMapping.userId}, now mapped to user ${sessionUser}`);
        console.error(`🚨 Previous mapping: ${JSON.stringify(lastMapping)}`);
        console.error(`🚨 Current mapping: User ID ${sessionUser} at ${new Date().toISOString()}`);
      }
      
      (global as any)[trackingKey] = {
        userId: sessionUser,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };
    }
    
    next();
  });
  
  app.use(passport.initialize());
  app.use(passport.session());

  // Simplified local strategy - direct database authentication
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      console.log(`🔐 AUTH ATTEMPT - Username: ${username}`);
      try {
        // Get user from database
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`🔐 AUTH FAILED - User not found: ${username}`);
          return done(null, false);
        }
        
        // For now, authenticate with Supabase but with proper error handling
        try {
          const result = await signInWithEmail(user.email, password);
          if (result?.user) {
            console.log(`🔐 AUTH SUCCESS - User: ${user.id} (${user.username})`);
            return done(null, user);
          } else {
            console.log(`🔐 AUTH FAILED - Invalid credentials for: ${username}`);
            return done(null, false);
          }
        } catch (authError) {
          console.error(`🔐 AUTH ERROR - Supabase error for ${username}:`, authError);
          return done(null, false);
        }
      } catch (error) {
        console.error(`🔐 AUTH SYSTEM ERROR:`, error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log('🔐 SERIALIZE USER - ID:', user.id, 'Username:', user.username, 'Email:', user.email, 'ProviderId:', user.providerId);
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: number, done) => {
    const deserializeId = Math.random().toString(36).substr(2, 9);
    console.log(`🔐 [${deserializeId}] DESERIALIZE START - Requested User ID: ${id}`);
    
    try {
      // CRITICAL: Check if we've seen this ID request before and what user we returned
      const sessionKey = `deserialize_${id}`;
      const lastResult = (global as any)[sessionKey];
      
      const user = await storage.getUser(id);
      if (user) {
        console.log(`🔐 [${deserializeId}] DESERIALIZE SUCCESS:`);
        console.log(`🔐 [${deserializeId}]   - Requested ID: ${id}`);
        console.log(`🔐 [${deserializeId}]   - Returned User: ${user.id} (${user.username})`);
        console.log(`🔐 [${deserializeId}]   - User Email: ${user.email}`);
        console.log(`🔐 [${deserializeId}]   - Provider ID: ${user.providerId}`);
        
        // SECURITY CHECK: Verify the ID we're returning matches what was requested
        if (user.id !== id) {
          console.error(`🚨 [${deserializeId}] CRITICAL SESSION BUG: Requested ID ${id} but returning user ID ${user.id}!`);
          console.error(`🚨 [${deserializeId}] This indicates a serious session mapping error!`);
        }
        
        // Track what we returned for this session ID
        if (lastResult && lastResult.userId !== user.id) {
          console.warn(`🚨 [${deserializeId}] SESSION ID COLLISION: Session ID ${id} previously returned user ${lastResult.userId} (${lastResult.username}), now returning ${user.id} (${user.username})`);
        }
        
        (global as any)[sessionKey] = {
          userId: user.id,
          username: user.username,
          timestamp: new Date().toISOString()
        };
        
      } else {
        console.log(`🔐 [${deserializeId}] DESERIALIZE FAILED - No user found for ID: ${id}`);
      }
      done(null, user);
    } catch (error) {
      console.log(`🔐 [${deserializeId}] DESERIALIZE ERROR - ID: ${id}, Error:`, error);
      done(error, null);
    }
  });

  // New authentication endpoints using Supabase Auth

  // Register with email verification
  app.post("/api/register-with-verification", async (req, res, next) => {
    try {
      const { email, password, username, firstName, lastName } = req.body;

      // Validate input fields
      if (!email || !password || !username) {
        return res.status(400).json({ message: "Email, password, and username are required" });
      }

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

      // Register the user with Supabase Auth (sends verification email)
      const authData = await registerUserWithEmailVerification(
        email,
        password,
        { username, firstName, lastName }
      );

      let providerId = null;
      if (authData?.user?.id) {
        providerId = authData.user.id;
      }

      // Create user in our database too (for backward compatibility)
      const user = await storage.createUser({
        username,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        address: null,
        profileImage: null,
        walletBalance: 0,
        isSeller: true, // Set to true by default
        isAdmin: false,
        isBanned: false,
        providerId: providerId,
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
      console.error("Registration error:", error.message);
      
      // Send more specific error messages based on error type
      if (error.message && error.message.includes('duplicate key')) {
        res.status(400).json({ message: "User already exists" });
      } else if (error.message && error.message.includes('pattern')) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: error.message || "Registration failed" });
      }
    }
  });

  // Email verification endpoint
  app.get("/api/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: "Invalid verification token" });
      }
      
      // Try to verify the token
      await verifyEmail(token);
      
      // Verification successful
      console.log('Email verification successful for token');
      
      // Redirect to login page after successful verification
      // Changed from '/login' to '/auth' to match the actual route
      res.redirect('/auth?verified=true');
    } catch (error: any) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: error.message || "Email verification failed" });
    }
  });

  // Google OAuth sign-in
  app.post("/api/auth/google", async (req, res) => {
    try {
      const data = await signInWithGoogle();
      
      if (!data.url) {
        return res.status(500).json({ message: "Google authentication failed" });
      }
      
      res.json({ url: data.url });
    } catch (error: any) {
      console.error("Google OAuth error:", error.message);
      res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });

  // OAuth callback handler
  app.get("/auth/callback", async (req, res) => {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.redirect('/auth?error=no_code');
      }

      // Exchange code for session with Supabase
      const { data: authData, error: authError } = await supabase.auth.exchangeCodeForSession(code as string);
      
      if (authError || !authData?.user) {
        console.error("OAuth callback error:", authError);
        return res.redirect('/auth?error=oauth_failed');
      }

      // Check if user exists in our database
      let user = await storage.getUserByEmail(authData.user.email!);
      
      if (!user) {
        // Create new user from Google OAuth data
        const userData = authData.user.user_metadata;
        console.log('Creating new Google OAuth user:', {
          email: authData.user.email,
          name: userData.name,
          given_name: userData.given_name,
          family_name: userData.family_name,
          avatar_url: userData.avatar_url
        });
        
        user = await storage.createUser({
          username: userData.email || authData.user.email!,
          email: authData.user.email!,
          firstName: userData.given_name || userData.name?.split(' ')[0] || null,
          lastName: userData.family_name || userData.name?.split(' ').slice(1).join(' ') || null,
          address: null,
          profileImage: userData.avatar_url || null,
          walletBalance: 0,
          isSeller: true,
          isAdmin: false,
          isBanned: false,
          providerId: authData.user.id,
          provider: 'google'
        });
        
        console.log('Successfully created Google OAuth user in database:', {
          id: user.id,
          username: user.username,
          email: user.email
        });
      } else if (!user.providerId) {
        // Link existing account with Google
        console.log('Linking existing user with Google OAuth:', user.email);
        await storage.updateUser(user.id, {
          providerId: authData.user.id,
          provider: 'google'
        });
        user = await storage.getUserByEmail(authData.user.email!);
      } else {
        console.log('Existing Google OAuth user found:', user.email);
      }

      // Create session
      req.login(user!, (err) => {
        if (err) {
          console.error("Session creation failed:", err);
          return res.redirect('/auth?error=session_failed');
        }
        
        // Redirect to homepage on successful login
        res.redirect('/');
      });
      
    } catch (error: any) {
      console.error("OAuth callback error:", error);
      res.redirect('/auth?error=oauth_failed');
    }
  });

  // Login with Supabase Auth
  app.post("/api/login-with-email", async (req, res) => {
    try {
      const { email, password } = req.body;

      // Authenticate with Supabase
      const authData = await signInWithEmail(email, password);
      
      if (!authData.user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Find the corresponding user in our database
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Handle edge case where user exists in Supabase but not in our DB
        return res.status(404).json({ message: "User account not found" });
      }

      // Ensure the Supabase authentication is linked to our user record
      // Handle three cases:
      // 1. No providerId: New security system, needs to be linked
      // 2. providerId matches: Correct authentication 
      // 3. providerId doesn't match: Security issue, need to be careful

      if (!user.providerId && authData.user.id) {
        // Case 1: First login after security update - link accounts
        try {
          console.log(`Linking Supabase user ${authData.user.id} to local user ${user.id}`);
          
          // Update the user record with the provider ID
          await storage.updateUser(user.id, {
            providerId: authData.user.id,
            provider: 'supabase'
          });
          
          // Refresh the user data after update
          const updatedUser = await storage.getUserByEmail(email);
          if (updatedUser) {
            // Log in with the updated user info
            console.log(`🔐 CREATING SESSION for user ${updatedUser.username} (ID: ${updatedUser.id}) - Account linking`);
            req.login(updatedUser, (err) => {
              if (err) {
                console.error(`❌ SESSION CREATION FAILED for user ${updatedUser.username}:`, err);
                return res.status(500).json({ message: "Session creation failed" });
              }
              console.log(`✅ SESSION CREATED for user ${updatedUser.username} (ID: ${updatedUser.id}) - Session ID: ${req.sessionID}`);
              return res.status(200).json({ user: updatedUser });
            });
            return;
          }
        } catch (updateError) {
          console.error("Failed to update user with Supabase providerId:", updateError);
          // Continue with login even if the update fails
        }
      } 
      else if (user.providerId === authData.user.id) {
        // Case 2: Accounts already properly linked
        console.log(`User ${user.username} authenticated with matching Supabase ID`);
        console.log(`🔐 CREATING SESSION for user ${user.username} (ID: ${user.id}) - Proper auth`);
        req.login(user, (err) => {
          if (err) {
            console.error(`❌ SESSION CREATION FAILED for user ${user.username}:`, err);
            return res.status(500).json({ message: "Session creation failed" });
          }
          console.log(`✅ SESSION CREATED for user ${user.username} (ID: ${user.id}) - Session ID: ${req.sessionID}`);
          res.status(200).json({ user });
        });
      }
      else {
        // Case 3: providerId exists but doesn't match Supabase ID - security issue
        console.warn(`Security warning: User ${user.username} has mismatched providerId`);
        console.warn(`DB providerId: ${user.providerId}, Supabase ID: ${authData.user.id}`);
        
        // For security, return a specific error to handle on the client
        return res.status(403).json({ 
          message: "Account authentication mismatch. Please contact support.",
          code: "AUTH_MISMATCH"
        });
      }
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(401).json({ message: error.message || "Authentication failed" });
    }
  });

  // Password reset request
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      // Send password reset email
      await resetPassword(email);
      
      res.status(200).json({ message: "Password reset email sent" });
    } catch (error: any) {
      console.error("Password reset error:", error);
      res.status(500).json({ message: error.message || "Password reset failed" });
    }
  });
  
  // NOTE: The /api/update-password endpoint is now handled in routes.ts with a more robust implementation

  // Keep legacy endpoints for backward compatibility

  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, email, password, ...otherFields } = req.body;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // First register with Supabase Auth
      let authData;
      try {
        authData = await registerUserWithEmailVerification(email, password, { username });
      } catch (authError: any) {
        console.error("Supabase registration error:", authError);
        return res.status(400).json({ message: authError.message || "Registration failed with auth provider" });
      }
      
      // Extract the provider ID for secure authentication
      let providerId = null;
      if (authData?.user?.id) {
        providerId = authData.user.id;
      }
      
      // Then create in our database with security enhancement
      const user = await storage.createUser({
        username,
        email,
        // Security enhancement - store provider ID and provider type
        providerId: providerId,
        provider: 'supabase',
        ...otherFields
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", async (req, res, next) => {
    try {
      // Sign out from Supabase
      await supabaseSignOut();
      
      // Also sign out from passport session
      req.logout((err) => {
        if (err) return next(err);
        res.sendStatus(200);
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/user", async (req, res) => {
    const sessionId = req.sessionID;
    const timestamp = new Date().toISOString();
    
    console.log(`\n🔍 [${timestamp}] /api/user REQUEST START`);
    console.log(`🔍 Session ID: ${sessionId}`);
    const sessionUser = req.session && (req.session as any).passport ? (req.session as any).passport.user : 'none';
    console.log(`🔍 Express Session User ID: ${sessionUser}`);
    console.log(`🔍 req.isAuthenticated(): ${req.isAuthenticated()}`);
    console.log(`🔍 req.user exists: ${!!req.user}`);
    if (req.user) {
      console.log(`🔍 req.user details: ID=${req.user.id}, Username=${req.user.username}, Email=${req.user.email}, ProviderId=${req.user.providerId}`);
    }

    try {
      // First check if user is authenticated with Passport
      if (req.isAuthenticated() && req.user) {
        console.log(`✅ [${sessionId}] PASSPORT AUTH SUCCESS - returning user ${req.user.username} (ID: ${req.user.id})`);
        return res.json(req.user);
      }

      // If not, check if authenticated with Supabase
      console.log(`🔍 [${sessionId}] Checking Supabase authentication...`);
      const supabaseUser = await getCurrentUser();
      
      if (supabaseUser) {
        console.log(`🔍 [${sessionId}] Supabase user found - ID: ${supabaseUser.id}, Email: ${supabaseUser.email}`);
        
        // SECURITY FIX: Find user by provider ID first for secure authentication
        let user = await storage.getUserByProviderId(supabaseUser.id);
        console.log(`🔍 [${sessionId}] getUserByProviderId(${supabaseUser.id}) result: ${user ? `Found user ${user.username} (ID: ${user.id})` : 'No user found'}`);
        
        if (!user) {
          // If no user found by provider ID, try to find by email for account linking
          console.log(`🔍 [${sessionId}] Trying to find user by email: ${supabaseUser.email}`);
          const userByEmail = await storage.getUserByEmail(supabaseUser.email || '');
          console.log(`🔍 [${sessionId}] getUserByEmail(${supabaseUser.email}) result: ${userByEmail ? `Found user ${userByEmail.username} (ID: ${userByEmail.id}, ProviderId: ${userByEmail.providerId})` : 'No user found'}`);
          
          if (userByEmail) {
            // SECURITY: Only link accounts if the user doesn't already have a provider ID
            if (!userByEmail.providerId) {
              // TEMPORARILY DISABLED: Link the Supabase account to existing user
              // await storage.updateUserProviderId(userByEmail.id, supabaseUser.id, 'supabase');
              user = { ...userByEmail, providerId: supabaseUser.id, provider: 'supabase' };
              console.log(`🔗 [${sessionId}] Using existing user ${userByEmail.username} (provider linking disabled)`);
            } else {
              // User already has a different provider ID - this is a security violation
              console.warn(`🚨 [${sessionId}] SECURITY VIOLATION: User ${userByEmail.username} (ID: ${userByEmail.id}) already has provider ID ${userByEmail.providerId}, but Supabase user ${supabaseUser.id} tried to access it`);
              console.warn(`🚨 [${sessionId}] This suggests a potential account hijacking attempt!`);
              return res.status(401).json({ message: "Account authentication mismatch" });
            }
          } else {
            // No user found at all
            console.log(`❌ [${sessionId}] No user found for Supabase ID ${supabaseUser.id} or email ${supabaseUser.email}`);
            return res.status(404).json({ message: "User not found" });
          }
        }

        if (user) {
          // Final security check: Ensure provider IDs match
          if (user.providerId !== supabaseUser.id) {
            console.warn(`🚨 [${sessionId}] CRITICAL SECURITY VIOLATION: Provider ID mismatch!`);
            console.warn(`🚨 [${sessionId}] Local user: ${user.username} (ID: ${user.id}, ProviderId: ${user.providerId})`);
            console.warn(`🚨 [${sessionId}] Supabase user: ID ${supabaseUser.id}, Email: ${supabaseUser.email}`);
            console.warn(`🚨 [${sessionId}] This indicates a serious authentication bug!`);
            return res.status(401).json({ message: "Authentication provider mismatch" });
          }

          // Create the session with verified user
          console.log(`🔐 [${sessionId}] Creating session for user ${user.username} (ID: ${user.id})`);
          req.login(user, (err) => {
            if (err) {
              console.error(`❌ [${sessionId}] Session creation failed:`, err);
              return res.status(500).json({ message: "Session creation failed" });
            }
            console.log(`✅ [${sessionId}] SESSION CREATED - Authenticated user ${user.username} (ID: ${user.id}) via Supabase (ProviderId: ${supabaseUser.id})`);
            const newSessionUser = req.session && (req.session as any).passport ? (req.session as any).passport.user : 'none';
            console.log(`✅ [${sessionId}] New session user: ${newSessionUser}`);
            return res.json(user);
          });
        } else {
          console.log(`❌ [${sessionId}] No user object available after processing`);
          return res.status(404).json({ message: "User not found" });
        }
      } else {
        console.log(`❌ [${sessionId}] No Supabase user found`);
        return res.sendStatus(401);
      }
    } catch (error) {
      console.error(`❌ [${sessionId}] Error in /api/user:`, error);
      return res.status(500).json({ message: "Server error" });
    }
  });
}
