/**
 * Unified Authentication Service
 * Consolidates all authentication logic with enhanced security
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AUTH_CONFIG, JWTPayload, validatePassword } from './auth-config';
import { IStorage, User } from './storage';
import { secureLogger } from './secure-logger';
import { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

// Audit log events
type AuthEvent = 
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'TOKEN_GENERATED'
  | 'TOKEN_VERIFIED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_REFRESH'
  | 'LOGOUT'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_LOCKED'
  | 'PROVIDER_AUTH'
  | 'USER_CREATED'
  | 'USER_UPDATED';

interface AuthAuditLog {
  event: AuthEvent;
  userId?: number;
  email?: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  details?: Record<string, any>;
  timestamp: Date;
}

// In-memory storage for login attempts (should be Redis in production)
const loginAttempts = new Map<string, { count: number; lastAttempt: Date; lockedUntil?: Date }>();

export class AuthService {
  constructor(
    private storage: IStorage,
    private supabase: SupabaseClient
  ) {}

  /**
   * Generate a secure token pair (access + refresh tokens)
   */
  async generateTokenPair(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const now = Math.floor(Date.now() / 1000);
    
    // Access token payload (minimal data)
    const accessPayload: Partial<JWTPayload> = {
      userId: user.id,
      email: user.email,
      username: user.username,
      supabaseId: user.supabaseUserId || '',
      type: 'access',
      iat: now,
      iss: AUTH_CONFIG.JWT_ISSUER,
      aud: AUTH_CONFIG.JWT_AUDIENCE
    };

    // Refresh token payload (even more minimal)
    const refreshPayload = {
      userId: user.id,
      type: 'refresh',
      iat: now,
      iss: AUTH_CONFIG.JWT_ISSUER,
      aud: AUTH_CONFIG.JWT_AUDIENCE
    };

    const accessToken = jwt.sign(
      accessPayload,
      AUTH_CONFIG.JWT_SECRET,
      {
        expiresIn: AUTH_CONFIG.JWT_EXPIRES_IN,
        algorithm: AUTH_CONFIG.JWT_ALGORITHM
      }
    );

    const refreshToken = jwt.sign(
      refreshPayload,
      AUTH_CONFIG.REFRESH_SECRET,
      {
        expiresIn: AUTH_CONFIG.REFRESH_EXPIRES_IN,
        algorithm: AUTH_CONFIG.JWT_ALGORITHM
      }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify and decode an access token
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, AUTH_CONFIG.JWT_SECRET, {
        issuer: AUTH_CONFIG.JWT_ISSUER,
        audience: AUTH_CONFIG.JWT_AUDIENCE,
        algorithms: [AUTH_CONFIG.JWT_ALGORITHM]
      }) as JWTPayload;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Fetch fresh user data for sensitive operations
      // This ensures banned status and roles are always current
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Verify refresh token and generate new token pair
   */
  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = jwt.verify(refreshToken, AUTH_CONFIG.REFRESH_SECRET, {
        issuer: AUTH_CONFIG.JWT_ISSUER,
        audience: AUTH_CONFIG.JWT_AUDIENCE,
        algorithms: [AUTH_CONFIG.JWT_ALGORITHM]
      }) as any;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Fetch fresh user data
      const user = await this.storage.getUser(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.isBanned) {
        throw new Error('User is banned');
      }

      // Generate new token pair
      return this.generateTokenPair(user);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Exchange Supabase JWT for application tokens
   */
  async exchangeSupabaseToken(supabaseToken: string, ipAddress: string, userAgent: string): Promise<{
    user: User;
    accessToken: string;
    refreshToken: string;
  }> {
    // Verify Supabase token
    const { data: { user: supabaseUser }, error } = await this.supabase.auth.getUser(supabaseToken);
    
    if (error || !supabaseUser) {
      this.logAuthEvent({
        event: 'LOGIN_FAILED',
        email: 'unknown',
        ipAddress,
        userAgent,
        success: false,
        details: { error: error?.message || 'Invalid Supabase token' }
      });
      throw new Error('Invalid Supabase token');
    }

    // Find or create local user
    let localUser = await this.findOrCreateUser(supabaseUser);

    // Check if user is banned
    if (localUser.isBanned) {
      this.logAuthEvent({
        event: 'LOGIN_FAILED',
        userId: localUser.id,
        email: localUser.email,
        ipAddress,
        userAgent,
        success: false,
        details: { reason: 'User is banned' }
      });
      throw new Error('User is banned');
    }

    // Generate token pair
    const tokens = await this.generateTokenPair(localUser);

    this.logAuthEvent({
      event: 'LOGIN_SUCCESS',
      userId: localUser.id,
      email: localUser.email,
      ipAddress,
      userAgent,
      success: true
    });

    return {
      user: localUser,
      ...tokens
    };
  }

  /**
   * Find or create user from Supabase user
   */
  private async findOrCreateUser(supabaseUser: SupabaseUser): Promise<User> {
    // Always look up by provider ID first for security
    let user = await this.storage.getUserByProviderId(supabaseUser.id);

    if (!user && supabaseUser.email) {
      // Check if email exists with different provider
      const existingByEmail = await this.storage.getUserByEmail(supabaseUser.email);
      if (existingByEmail) {
        // Link accounts if same email
        if (!existingByEmail.providerId) {
          user = await this.storage.updateUser(existingByEmail.id, {
            providerId: supabaseUser.id,
            supabaseUserId: supabaseUser.id
          });
        } else {
          throw new Error('Email already associated with another account');
        }
      }
    }

    if (!user) {
      // Create new user
      const username = this.generateUsername(supabaseUser.email || supabaseUser.id);
      user = await this.storage.createUser({
        email: supabaseUser.email || `${supabaseUser.id}@supabase.local`,
        username,
        isSeller: true,
        providerId: supabaseUser.id,
        supabaseUserId: supabaseUser.id,
        provider: 'supabase'
      });

      this.logAuthEvent({
        event: 'USER_CREATED',
        userId: user.id,
        email: user.email,
        ipAddress: 'system',
        userAgent: 'system',
        success: true
      });
    }

    return user;
  }

  /**
   * Generate unique username from email or ID
   */
  private generateUsername(input: string): string {
    const base = input.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return base + Math.random().toString(36).substring(2, 7);
  }

  /**
   * Check login attempts and lockout status
   */
  private checkLoginAttempts(identifier: string): void {
    const attempts = loginAttempts.get(identifier);
    if (!attempts) return;

    // Check if account is locked
    if (attempts.lockedUntil && attempts.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((attempts.lockedUntil.getTime() - Date.now()) / 1000 / 60);
      throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
    }

    // Reset if lockout has expired
    if (attempts.lockedUntil && attempts.lockedUntil <= new Date()) {
      loginAttempts.delete(identifier);
    }
  }

  /**
   * Record failed login attempt
   */
  private recordFailedLogin(identifier: string, ipAddress: string, userAgent: string): void {
    const attempts = loginAttempts.get(identifier) || { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();

    if (attempts.count >= AUTH_CONFIG.MAX_LOGIN_ATTEMPTS) {
      attempts.lockedUntil = new Date(Date.now() + AUTH_CONFIG.LOCKOUT_DURATION);
      this.logAuthEvent({
        event: 'ACCOUNT_LOCKED',
        email: identifier,
        ipAddress,
        userAgent,
        success: false,
        details: { attempts: attempts.count }
      });
    }

    loginAttempts.set(identifier, attempts);
  }

  /**
   * Clear login attempts on successful login
   */
  private clearLoginAttempts(identifier: string): void {
    loginAttempts.delete(identifier);
  }

  /**
   * Log authentication event
   */
  private logAuthEvent(log: Omit<AuthAuditLog, 'timestamp'>): void {
    if (!AUTH_CONFIG.ENABLE_AUTH_AUDIT) return;

    const auditLog: AuthAuditLog = {
      ...log,
      timestamp: new Date()
    };

    secureLogger.info('AUTH_AUDIT', auditLog);
  }

  /**
   * Express middleware for authentication
   */
  requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = this.extractToken(req);
      if (!token) {
        return res.status(401).json({ error: 'No authentication token provided' });
      }

      const payload = this.verifyAccessToken(token);

      // Fetch fresh user data for each request
      const user = await this.storage.getUser(payload.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.isBanned) {
        return res.status(403).json({ error: 'User is banned' });
      }

      // Attach user to request
      (req as any).user = {
        id: user.id,
        email: user.email,
        username: user.username,
        isSeller: user.isSeller,
        isAdmin: user.isAdmin,
        isBanned: user.isBanned
      };

      // Check if token needs refresh hint
      const tokenAge = Date.now() - (payload.iat * 1000);
      if (tokenAge > AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD) {
        res.setHeader('X-Token-Refresh-Needed', 'true');
      }

      next();
    } catch (error) {
      this.logAuthEvent({
        event: 'TOKEN_INVALID',
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        success: false,
        details: { error: (error as Error).message }
      });
      return res.status(401).json({ error: 'Invalid authentication token' });
    }
  };

  /**
   * Middleware for role-based access control
   */
  requireRole = (role: 'admin' | 'seller') => {
    return (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (role === 'admin' && !user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      if (role === 'seller' && !user.isSeller) {
        return res.status(403).json({ error: 'Seller access required' });
      }

      next();
    };
  };

  /**
   * Extract token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Future: Check httpOnly cookie
    // if (req.cookies?.auth_token) {
    //   return req.cookies.auth_token;
    // }

    return null;
  }

  /**
   * Validate password reset token
   */
  verifyPasswordResetToken(token: string): { userId: number; email: string } {
    try {
      const decoded = jwt.verify(token, AUTH_CONFIG.JWT_SECRET, {
        issuer: AUTH_CONFIG.JWT_ISSUER,
        audience: 'password-reset'
      }) as any;

      return {
        userId: decoded.userId,
        email: decoded.email
      };
    } catch (error) {
      throw new Error('Invalid or expired reset token');
    }
  }

  /**
   * Generate password reset token
   */
  generatePasswordResetToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        type: 'password-reset'
      },
      AUTH_CONFIG.JWT_SECRET,
      {
        expiresIn: '1h',
        issuer: AUTH_CONFIG.JWT_ISSUER,
        audience: 'password-reset'
      }
    );
  }
}

// Export singleton instance
let authService: AuthService;

export function initializeAuthService(storage: IStorage, supabase: SupabaseClient): AuthService {
  authService = new AuthService(storage, supabase);
  return authService;
}

export function getAuthService(): AuthService {
  if (!authService) {
    throw new Error('AuthService not initialized. Call initializeAuthService first.');
  }
  return authService;
}