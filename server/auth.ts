import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

// Extend Express.User
declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    isAdmin?: boolean;
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "luxury-perfume-marketplace-secret",
    resave: true,
    saveUninitialized: false, // Only create sessions when we have data
    store: storage.sessionStore,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true, 
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
      sameSite: 'lax' // This helps with CSRF protection while still allowing redirects
    },
    name: 'perfume.sid' // Custom name for better security
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).send("Email already exists");
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
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
    console.log("=== LOGIN DEBUGGING ===");
    console.log("Login successful for user:", req.user?.username);
    console.log("Is Admin:", req.user?.isAdmin);
    console.log("User ID:", req.user?.id);
    console.log("Session ID:", req.sessionID);
    console.log("req.isAuthenticated():", req.isAuthenticated());
    
    // Store user directly in session for backup access
    req.session.userId = req.user?.id;
    req.session.isAdmin = req.user?.isAdmin;
    
    console.log("Setting session variables - userId:", req.session.userId);
    console.log("Setting session variables - isAdmin:", req.session.isAdmin);
    
    // Save session data
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({ message: "Session error" });
      }
      
      console.log("Session successfully saved");
      console.log("After save - req.isAuthenticated():", req.isAuthenticated());
      console.log("After save - Session ID:", req.sessionID);
      console.log("After save - Session data:", req.session);
      
      res.status(200).json(req.user);
    });
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", async (req, res) => {
    console.log("=== USER API DEBUGGING ===");
    console.log("API /api/user called - Auth status:", req.isAuthenticated());
    console.log("Session ID:", req.sessionID);
    console.log("Session data:", req.session);
    
    // First check if Passport.js authentication is working
    if (!req.isAuthenticated()) {
      console.log("Passport auth failed - checking session backup");
      
      // Try to get user from session
      if (req.session && req.session.userId) {
        console.log("Session has userId:", req.session.userId);
        const user = await storage.getUser(req.session.userId);
        
        if (user) {
          console.log("User found via session:", user.username);
          return res.json(user);
        } else {
          console.log("Could not find user with ID:", req.session.userId);
        }
      } else {
        console.log("No userId in session");
      }
      
      return res.sendStatus(401);
    }
    
    console.log("User authenticated via Passport:", req.user?.username);
    res.json(req.user);
  });
}
