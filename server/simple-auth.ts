import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { storage } from "./storage";
import crypto from "crypto";
import { User as SelectUser } from "@shared/schema";
import { signInWithEmail } from './supabase';

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

export function setupSimpleAuth(app: Express) {
  // Simple, working session configuration
  const MemoryStore = createMemoryStore(session);
  const sessionStore = new MemoryStore({
    checkPeriod: 86400000, // 24 hours
    ttl: 86400000,
    stale: false
  });

  const sessionConfig = {
    secret: process.env.SESSION_SECRET || "fallback-secret-key",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'strict' as const
    },
    genid: () => crypto.randomBytes(16).toString('hex')
  };

  app.use(session(sessionConfig));
  app.use(passport.initialize());
  app.use(passport.session());

  // Simple authentication strategy
  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      console.log(`Authentication attempt for: ${username}`);
      
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log(`User not found: ${username}`);
        return done(null, false);
      }

      // Authenticate with Supabase
      const result = await signInWithEmail(user.email, password);
      if (result?.user) {
        console.log(`Authentication successful for: ${username}`);
        return done(null, user);
      } else {
        console.log(`Authentication failed for: ${username}`);
        return done(null, false);
      }
    } catch (error) {
      console.error(`Authentication error for ${username}:`, error);
      return done(null, false);
    }
  }));

  // Simple serialization
  passport.serializeUser((user, done) => {
    console.log(`Serializing user: ${user.id} (${user.username})`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log(`Deserializing user ID: ${id}`);
      const user = await storage.getUser(id);
      if (user) {
        console.log(`User found: ${user.id} (${user.username})`);
        done(null, user);
      } else {
        console.log(`User not found for ID: ${id}`);
        done(null, false);
      }
    } catch (error) {
      console.error(`Deserialization error for ID ${id}:`, error);
      done(error);
    }
  });

  console.log('Simple authentication system initialized');
}