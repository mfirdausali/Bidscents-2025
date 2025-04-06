import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendPasswordResetEmail } from "./email";
import { z } from "zod";

declare global {
  namespace Express {
    interface User extends SelectUser {}
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
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
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
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
  
  // Password reset endpoints
  app.post("/api/forgot-password", async (req, res, next) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      
      // Check if the email exists in our database
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if the email exists for security reasons
        return res.status(200).json({ success: true, message: "If your email is registered, you will receive a password reset code." });
      }
      
      // Generate a 6-digit code (3 bytes = 6 hex chars)
      const resetCode = randomBytes(3).toString('hex').toUpperCase();
      
      // Set expiry to 1 hour
      const expiryHours = 1;
      
      // Store the reset token in the database
      await storage.setPasswordResetToken(email, resetCode, expiryHours);
      
      // Send the email with the code
      const emailSent = await sendPasswordResetEmail(email, resetCode, expiryHours);
      
      if (!emailSent) {
        return res.status(500).json({ success: false, message: "Failed to send password reset email" });
      }
      
      res.status(200).json({ success: true, message: "Password reset code sent" });
    } catch (error) {
      console.error("Forgot password error:", error);
      next(error);
    }
  });
  
  app.post("/api/verify-reset-code", async (req, res, next) => {
    try {
      const { email, code } = z.object({ 
        email: z.string().email(),
        code: z.string().length(6)
      }).parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      if (user.resetToken !== code || !user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
        return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
      }
      
      res.status(200).json({ success: true, message: "Code verified successfully" });
    } catch (error) {
      console.error("Verify reset code error:", error);
      next(error);
    }
  });
  
  app.post("/api/reset-password", async (req, res, next) => {
    try {
      const { email, code, newPassword } = z.object({ 
        email: z.string().email(),
        code: z.string().length(6),
        newPassword: z.string().min(6)
      }).parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      if (user.resetToken !== code || !user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
        return res.status(400).json({ success: false, message: "Invalid or expired reset code" });
      }
      
      // Hash the new password and reset the token
      const hashedPassword = await hashPassword(newPassword);
      await storage.resetPassword(code, hashedPassword);
      
      res.status(200).json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      next(error);
    }
  });
}
