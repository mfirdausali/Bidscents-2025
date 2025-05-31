import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { storage } from "./storage";
import crypto from "crypto";
import { User as SelectUser } from "@shared/schema";
import { signInWithEmail, getCurrentUser, supabase } from './supabase';

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

export function setupSupabaseAuth(app: Express) {
  // Secure session configuration with proper isolation
  const MemoryStore = createMemoryStore(session);
  const sessionStore = new MemoryStore({
    checkPeriod: 86400000, // 24 hours
    ttl: 86400000,
    stale: false,
    noDisposeOnSet: false,
    dispose: (key: string, sess: any) => {
      console.log(`Session disposed: ${key}, User: ${sess?.passport?.user || 'none'}`);
    }
  });

  const sessionConfig = {
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'strict' as const
    },
    genid: () => crypto.randomBytes(32).toString('hex')
  };

  console.log('Session configuration:');
  console.log('  - Store type:', sessionStore.constructor.name);
  console.log('  - Cookie settings:', sessionConfig.cookie);

  app.use(session(sessionConfig));
  app.use(passport.initialize());
  app.use(passport.session());

  // Supabase-integrated authentication strategy
  passport.use(new LocalStrategy(async (username, password, done) => {
    const authId = Math.random().toString(36).substr(2, 9);
    console.log(`[${authId}] Authentication attempt for: ${username}`);
    
    try {
      // Get user from local database first
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log(`[${authId}] User not found in database: ${username}`);
        return done(null, false);
      }

      // Authenticate with Supabase Auth
      try {
        const result = await signInWithEmail(user.email, password);
        
        if (result?.user) {
          console.log(`[${authId}] Supabase authentication successful for: ${username}`);
          console.log(`[${authId}] User ID: ${user.id}, Supabase ID: ${result.user.id}`);
          
          // Update user with Supabase provider ID if not set
          if (!user.providerId) {
            await storage.updateUser(user.id, { providerId: result.user.id });
            console.log(`[${authId}] Updated user ${user.id} with provider ID: ${result.user.id}`);
          }
          
          return done(null, user);
        } else {
          console.log(`[${authId}] Supabase authentication failed for: ${username}`);
          return done(null, false);
        }
      } catch (supabaseError: any) {
        console.error(`[${authId}] Supabase authentication error for ${username}:`, supabaseError.message);
        return done(null, false);
      }
    } catch (error: any) {
      console.error(`[${authId}] Authentication system error:`, error.message);
      return done(error);
    }
  }));

  // Session serialization - store only user ID
  passport.serializeUser((user, done) => {
    const serializeId = Math.random().toString(36).substr(2, 9);
    console.log(`[${serializeId}] Serializing user: ${user.id} (${user.username})`);
    done(null, user.id);
  });

  // Session deserialization - fetch user by ID
  passport.deserializeUser(async (id: number, done) => {
    const deserializeId = Math.random().toString(36).substr(2, 9);
    console.log(`[${deserializeId}] Deserializing user ID: ${id}`);
    
    try {
      const user = await storage.getUser(id);
      if (user) {
        console.log(`[${deserializeId}] User found: ${user.id} (${user.username})`);
        
        // Verify user ID matches what was requested
        if (user.id !== id) {
          console.error(`[${deserializeId}] CRITICAL: Requested ID ${id} but got user ID ${user.id}`);
          return done(new Error('Session integrity error'));
        }
        
        done(null, user);
      } else {
        console.log(`[${deserializeId}] User not found for ID: ${id}`);
        done(null, false);
      }
    } catch (error: any) {
      console.error(`[${deserializeId}] Deserialization error for ID ${id}:`, error.message);
      done(error);
    }
  });

  // Add middleware to verify Supabase session consistency
  app.use(async (req, res, next) => {
    if (req.user && req.user.providerId) {
      try {
        // Verify Supabase session is still valid
        const currentUser = await getCurrentUser();
        if (!currentUser || currentUser.id !== req.user.providerId) {
          console.log(`Supabase session mismatch for user ${req.user.id}, clearing session`);
          req.logout((err) => {
            if (err) console.error('Logout error:', err);
          });
        }
      } catch (error) {
        // Supabase session invalid, continue without clearing local session
        console.log(`Supabase session check failed for user ${req.user.id}`);
      }
    }
    next();
  });

  console.log('Supabase-integrated authentication system initialized');
}