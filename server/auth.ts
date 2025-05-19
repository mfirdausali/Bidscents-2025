import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import {
  registerUserWithEmailVerification, 
  signInWithEmail, 
  signOut as supabaseSignOut,
  getCurrentUser,
  verifyEmail,
  resetPassword,
  updatePassword
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
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Update local strategy to verify with Supabase auth
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // Get user from database first to check if username exists
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false);
        }
        
        // Then verify credentials with Supabase
        try {
          const result = await signInWithEmail(user.email, password);
          if (result?.user) {
            return done(null, user);
          } else {
            return done(null, false);
          }
        } catch (authError) {
          console.error("Authentication error:", authError);
          return done(null, false);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // New authentication endpoints using Supabase Auth

  // Register with email verification
  app.post("/api/register-with-verification", async (req, res, next) => {
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

      // Register the user with Supabase Auth (sends verification email)
      const authData = await registerUserWithEmailVerification(
        email,
        password,
        { username, firstName, lastName }
      );

      // Create user in our database too (for backward compatibility)
      // Only creating basic info, the rest will be completed after email verification
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
        isBanned: false
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

      // Log in with Passport session for backward compatibility
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Session creation failed" });
        }
        res.status(200).json({ user });
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
      try {
        await registerUserWithEmailVerification(email, password, { username });
      } catch (authError: any) {
        console.error("Supabase registration error:", authError);
        return res.status(400).json({ message: authError.message || "Registration failed with auth provider" });
      }
      
      // Then create in our database
      const user = await storage.createUser({
        username,
        email,
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
    try {
      // First check if user is authenticated with Passport
      if (req.isAuthenticated() && req.user) {
        return res.json(req.user);
      }

      // If not, check if authenticated with Supabase
      const supabaseUser = await getCurrentUser();
      if (supabaseUser) {
        // Get user from our database by email
        const user = await storage.getUserByEmail(supabaseUser.email || '');
        if (user) {
          // Log in with Passport session
          req.login(user, (err) => {
            if (err) {
              return res.status(500).json({ message: "Session creation failed" });
            }
            return res.json(user);
          });
        } else {
          return res.status(404).json({ message: "User not found" });
        }
      } else {
        return res.sendStatus(401);
      }
    } catch (error) {
      console.error("Error in /api/user:", error);
      return res.status(500).json({ message: "Server error" });
    }
  });
}
