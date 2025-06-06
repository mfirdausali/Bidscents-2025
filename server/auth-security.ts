/**
 * Consolidated Security-First Authentication Module
 * 
 * This module implements a unified authentication system using Supabase as the primary
 * identity provider with enhanced security controls and comprehensive audit logging.
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { supabase } from './supabase';
import { storage } from './storage';

// Enforce JWT secret requirement - fail secure if not set
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'your-secret-key' || JWT_SECRET === 'your-secret-key-change-in-production') {
  throw new Error('SECURITY ERROR: JWT_SECRET environment variable must be set to a secure value in production');
}

// Type assertion for TypeScript - we've already validated it exists above
const VALIDATED_JWT_SECRET = JWT_SECRET as string;

const JWT_EXPIRES_IN = '24h';
const TOKEN_REFRESH_THRESHOLD = 60 * 60 * 1000; // 1 hour in milliseconds

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    supabaseId: string;
    username: string;
    isSeller?: boolean;
    isAdmin?: boolean;
    isBanned?: boolean;
  };
}

/**
 * Enhanced security audit logging
 */
function auditLog(event: string, details: any, userId?: number) {
  const timestamp = new Date().toISOString();
  console.log(`[SECURITY AUDIT] ${timestamp} - ${event}:`, {
    userId,
    ...details,
    ip: details.ip || 'unknown',
    userAgent: details.userAgent || 'unknown'
  });
}

/**
 * Rate limiting store for authentication attempts
 */
const authAttempts = new Map<string, { count: number; lastAttempt: number; blocked: boolean }>();

/**
 * Check and enforce rate limiting
 */
function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const attempts = authAttempts.get(identifier);
  
  if (!attempts) {
    authAttempts.set(identifier, { count: 1, lastAttempt: now, blocked: false });
    return true;
  }
  
  // Reset counter if more than 15 minutes have passed
  if (now - attempts.lastAttempt > 15 * 60 * 1000) {
    authAttempts.set(identifier, { count: 1, lastAttempt: now, blocked: false });
    return true;
  }
  
  // Block if more than 5 attempts in 15 minutes
  if (attempts.count >= 5) {
    attempts.blocked = true;
    auditLog('RATE_LIMIT_EXCEEDED', { identifier, attempts: attempts.count });
    return false;
  }
  
  attempts.count++;
  attempts.lastAttempt = now;
  return true;
}

/**
 * Generate secure application JWT with enhanced claims
 */
export function generateSecureJWT(user: any, supabaseId: string): string {
  const payload = {
    userId: user.id,
    email: user.email,
    username: user.username,
    supabaseId,
    isSeller: user.isSeller || false,
    isAdmin: user.isAdmin || false,
    isBanned: user.isBanned || false,
    type: 'app_token',
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, VALIDATED_JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'bidscents-marketplace',
    audience: 'bidscents-users',
    algorithm: 'HS256'
  });
}

/**
 * Verify and decode JWT with enhanced security checks
 */
export function verifySecureJWT(token: string): any {
  try {
    const decoded = jwt.verify(token, VALIDATED_JWT_SECRET, {
      issuer: 'bidscents-marketplace',
      audience: 'bidscents-users',
      algorithms: ['HS256']
    }) as any;

    // Check if token is near expiry and needs refresh
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp - now < TOKEN_REFRESH_THRESHOLD / 1000) {
      decoded.needsRefresh = true;
    }

    return decoded;
  } catch (error: any) {
    auditLog('JWT_VERIFICATION_FAILED', { error: error.message });
    throw new Error('Invalid or expired token');
  }
}

/**
 * Verify Supabase JWT and create/update local user profile
 */
export async function verifySupabaseAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!authHeader?.startsWith('Bearer ')) {
      auditLog('AUTH_MISSING_TOKEN', { ip: clientIP, path: req.path });
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Rate limiting check
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
    }

    const supabaseToken = authHeader.substring(7);
    
    // Verify the Supabase JWT
    const { data: { user }, error } = await supabase.auth.getUser(supabaseToken);
    
    if (error || !user) {
      auditLog('SUPABASE_AUTH_FAILED', { ip: clientIP, error: error?.message });
      return res.status(401).json({ error: 'Invalid Supabase token' });
    }

    // Find local user by provider ID (secure linkage)
    let localUser = await storage.getUserByProviderId(user.id);
    
    if (!localUser) {
      // Check if user exists by email but without provider ID (legacy users)
      const existingUser = await storage.getUserByEmail(user.email!);
      
      if (existingUser && !existingUser.providerId) {
        // Update existing user with provider ID for security
        localUser = await storage.updateUser(existingUser.id, {
          providerId: user.id,
          provider: 'supabase'
        });
        auditLog('USER_PROVIDER_LINKED', { 
          userId: existingUser.id, 
          email: user.email,
          ip: clientIP 
        });
      } else {
        // Create new local user profile
        localUser = await storage.createUser({
          email: user.email!,
          username: user.email!.split('@')[0],
          providerId: user.id,
          provider: 'supabase',
          firstName: user.user_metadata?.first_name || null,
          lastName: user.user_metadata?.last_name || null,
        });
        auditLog('USER_CREATED', { 
          userId: localUser.id, 
          email: user.email,
          ip: clientIP 
        });
      }
    }

    // Security check: verify provider ID matches
    if (localUser.providerId !== user.id) {
      auditLog('PROVIDER_ID_MISMATCH', { 
        userId: localUser.id, 
        expectedProviderId: user.id,
        actualProviderId: localUser.providerId,
        ip: clientIP 
      });
      return res.status(401).json({ error: 'Authentication mismatch detected' });
    }

    // Check if user is banned
    if (localUser.isBanned) {
      auditLog('BANNED_USER_ACCESS_ATTEMPT', { 
        userId: localUser.id, 
        email: user.email,
        ip: clientIP 
      });
      return res.status(403).json({ error: 'Account has been suspended' });
    }

    (req as AuthenticatedRequest).user = {
      id: localUser.id,
      email: localUser.email,
      username: localUser.username,
      supabaseId: user.id,
      isSeller: localUser.isSeller,
      isAdmin: localUser.isAdmin,
      isBanned: localUser.isBanned,
    };

    auditLog('AUTH_SUCCESS', { 
      userId: localUser.id, 
      email: user.email,
      ip: clientIP 
    });

    next();
  } catch (error: any) {
    auditLog('AUTH_ERROR', { 
      error: error.message, 
      ip: req.ip || 'unknown' 
    });
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to verify application JWT
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!authHeader?.startsWith('Bearer ')) {
      auditLog('APP_AUTH_MISSING_TOKEN', { ip: clientIP, path: req.path });
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Rate limiting check
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
    }

    const token = authHeader.substring(7);
    const decoded = verifySecureJWT(token);
    
    // Check if user is banned
    if (decoded.isBanned) {
      auditLog('BANNED_USER_APP_ACCESS_ATTEMPT', { 
        userId: decoded.userId, 
        ip: clientIP 
      });
      return res.status(403).json({ error: 'Account has been suspended' });
    }

    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      supabaseId: decoded.supabaseId,
      isSeller: decoded.isSeller,
      isAdmin: decoded.isAdmin,
      isBanned: decoded.isBanned,
    };

    // Add refresh hint to response headers if token needs refresh
    if (decoded.needsRefresh) {
      res.set('X-Token-Refresh-Needed', 'true');
    }

    auditLog('APP_AUTH_SUCCESS', { 
      userId: decoded.userId, 
      ip: clientIP 
    });

    next();
  } catch (error: any) {
    auditLog('APP_AUTH_FAILED', { 
      error: error.message, 
      ip: req.ip || 'unknown' 
    });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Verify WebSocket authentication with JWT
 */
export function verifyWebSocketAuth(token: string): any | null {
  try {
    const decoded = verifySecureJWT(token);
    
    // Additional WebSocket-specific security checks
    if (decoded.isBanned) {
      auditLog('BANNED_USER_WEBSOCKET_ACCESS_ATTEMPT', { userId: decoded.userId });
      return null;
    }

    auditLog('WEBSOCKET_AUTH_SUCCESS', { userId: decoded.userId });
    return decoded;
  } catch (error: any) {
    auditLog('WEBSOCKET_AUTH_FAILED', { error: error.message });
    return null;
  }
}

/**
 * Get user from JWT token helper
 */
export function getUserFromToken(req: Request): { id: number; email: string; supabaseId: string; username: string } | null {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decoded = verifySecureJWT(token);
    
    return {
      id: decoded.userId,
      email: decoded.email,
      supabaseId: decoded.supabaseId,
      username: decoded.username,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Enhanced role-based access control middleware
 */
export function requireRole(role: 'seller' | 'admin') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = role === 'seller' ? user.isSeller : user.isAdmin;
    
    if (!hasPermission) {
      auditLog('INSUFFICIENT_PERMISSIONS', { 
        userId: user.id, 
        requiredRole: role,
        ip: req.ip || 'unknown' 
      });
      return res.status(403).json({ error: `${role} access required` });
    }

    next();
  };
}

/**
 * Session management endpoints
 */
export const secureAuthRoutes = {
  // Exchange Supabase JWT for application JWT
  session: async (req: Request, res: Response) => {
    try {
      const { supabaseToken } = req.body;
      const clientIP = req.ip || 'unknown';
      
      if (!supabaseToken) {
        auditLog('SESSION_MISSING_TOKEN', { ip: clientIP });
        return res.status(400).json({ error: 'Supabase token required' });
      }

      // Rate limiting check
      if (!checkRateLimit(clientIP)) {
        return res.status(429).json({ error: 'Too many authentication attempts. Please try again later.' });
      }

      // Verify the Supabase JWT
      const { data: { user }, error } = await supabase.auth.getUser(supabaseToken);
      
      if (error || !user) {
        auditLog('SESSION_SUPABASE_AUTH_FAILED', { ip: clientIP, error: error?.message });
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }
      
      // Find or create local user profile with secure provider ID linking
      let localUser = await storage.getUserByProviderId(user.id);
      
      if (!localUser) {
        const existingUser = await storage.getUserByEmail(user.email!);
        
        if (existingUser && !existingUser.providerId) {
          localUser = await storage.updateUser(existingUser.id, {
            providerId: user.id,
            provider: 'supabase'
          });
        } else {
          localUser = await storage.createUser({
            email: user.email!,
            username: user.email!.split('@')[0],
            providerId: user.id,
            provider: 'supabase',
            firstName: user.user_metadata?.first_name || null,
            lastName: user.user_metadata?.last_name || null,
          });
        }
      }

      // Security verification
      if (localUser.providerId !== user.id) {
        auditLog('SESSION_PROVIDER_ID_MISMATCH', { 
          userId: localUser.id, 
          ip: clientIP 
        });
        return res.status(401).json({ error: 'Authentication mismatch detected' });
      }

      if (localUser.isBanned) {
        auditLog('SESSION_BANNED_USER_ATTEMPT', { 
          userId: localUser.id, 
          ip: clientIP 
        });
        return res.status(403).json({ error: 'Account has been suspended' });
      }

      const appJWT = generateSecureJWT(localUser, user.id);
      
      auditLog('SESSION_CREATED', { 
        userId: localUser.id, 
        email: user.email,
        ip: clientIP 
      });

      res.json({
        token: appJWT,
        user: {
          id: localUser.id,
          email: localUser.email,
          username: localUser.username,
          firstName: localUser.firstName,
          lastName: localUser.lastName,
          isSeller: localUser.isSeller,
          isAdmin: localUser.isAdmin,
        }
      });
    } catch (error: any) {
      auditLog('SESSION_ERROR', { 
        error: error.message, 
        ip: req.ip || 'unknown' 
      });
      res.status(500).json({ error: 'Session creation failed' });
    }
  },

  // Get current user profile
  me: async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Fetch fresh user data from database
    const localUser = await storage.getUserByProviderId(user.supabaseId);
    if (!localUser) {
      auditLog('USER_NOT_FOUND_IN_DB', { userId: user.id });
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: localUser.id,
      email: localUser.email,
      username: localUser.username,
      firstName: localUser.firstName,
      lastName: localUser.lastName,
      isSeller: localUser.isSeller,
      isAdmin: localUser.isAdmin,
    });
  },

  // Logout and invalidate session
  logout: async (req: Request, res: Response) => {
    const user = (req as AuthenticatedRequest).user;
    if (user) {
      auditLog('USER_LOGOUT', { 
        userId: user.id, 
        ip: req.ip || 'unknown' 
      });
    }
    res.json({ message: 'Logged out successfully' });
  },

  // Email lookup for username-based login
  lookupEmail: async (req: Request, res: Response) => {
    try {
      const { username } = req.body;
      const clientIP = req.ip || 'unknown';
      
      if (!username) {
        return res.status(400).json({ error: 'Username required' });
      }

      // Rate limiting check
      if (!checkRateLimit(clientIP)) {
        return res.status(429).json({ error: 'Too many lookup attempts. Please try again later.' });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        auditLog('EMAIL_LOOKUP_FAILED', { username, ip: clientIP });
        return res.status(404).json({ error: 'Username not found' });
      }

      auditLog('EMAIL_LOOKUP_SUCCESS', { 
        username, 
        userId: user.id, 
        ip: clientIP 
      });

      res.json({ email: user.email });
    } catch (error: any) {
      auditLog('EMAIL_LOOKUP_ERROR', { 
        error: error.message, 
        ip: req.ip || 'unknown' 
      });
      res.status(500).json({ error: 'Lookup failed' });
    }
  },
};