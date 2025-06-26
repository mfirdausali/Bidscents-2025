/**
 * Centralized authentication configuration
 * This module ensures consistent and secure authentication settings across the application
 */

import crypto from 'crypto';

// Validate JWT_SECRET environment variable
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'SECURITY ERROR: JWT_SECRET environment variable is required.\n' +
    'Generate a secure secret with: openssl rand -base64 64'
  );
}

if (JWT_SECRET.length < 64) {
  throw new Error(
    'SECURITY ERROR: JWT_SECRET must be at least 64 characters long.\n' +
    'Current length: ' + JWT_SECRET.length
  );
}

// List of known weak secrets to check against
const WEAK_SECRETS = [
  'your-secret-key',
  'your-secret-key-change-in-production',
  'secret',
  'password',
  '123456',
  'change-me',
  'development',
  'test'
];

// Validate against weak secrets
if (WEAK_SECRETS.includes(JWT_SECRET.toLowerCase())) {
  throw new Error('SECURITY ERROR: JWT_SECRET matches a known weak secret');
}

// Check if secret is numeric only (low entropy)
if (/^\d+$/.test(JWT_SECRET)) {
  throw new Error('SECURITY ERROR: JWT_SECRET cannot be numeric only');
}

// Generate refresh token secret from JWT secret (for token rotation)
const REFRESH_SECRET = process.env.REFRESH_SECRET || 
  crypto.createHash('sha256').update(JWT_SECRET + '-refresh').digest('base64');

/**
 * Centralized authentication configuration
 */
export const AUTH_CONFIG = {
  // JWT Configuration
  JWT_SECRET,
  REFRESH_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  REFRESH_EXPIRES_IN: process.env.REFRESH_EXPIRES_IN || '7d',
  
  // Token Configuration
  JWT_ALGORITHM: 'HS256' as const,
  JWT_ISSUER: 'bidscents-marketplace',
  JWT_AUDIENCE: 'bidscents-users',
  
  // Security Settings
  TOKEN_REFRESH_THRESHOLD: 60 * 60 * 1000, // 1 hour in milliseconds
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  
  // Cookie Configuration (for future httpOnly cookie implementation)
  COOKIE_CONFIG: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  },
  
  // Password Requirements
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_LOWERCASE: true,
  PASSWORD_REQUIRE_NUMBER: true,
  PASSWORD_REQUIRE_SPECIAL: true,
  
  // Session Configuration
  SESSION_IDLE_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  SESSION_ABSOLUTE_TIMEOUT: 8 * 60 * 60 * 1000, // 8 hours
  
  // Rate Limiting (for auth endpoints)
  AUTH_RATE_LIMIT: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many authentication attempts, please try again later'
  },
  
  // Email Verification
  EMAIL_VERIFICATION_EXPIRES: 24 * 60 * 60 * 1000, // 24 hours
  
  // Provider Configuration
  SUPPORTED_PROVIDERS: ['supabase', 'facebook', 'google'] as const,
  
  // Audit Settings
  ENABLE_AUTH_AUDIT: process.env.NODE_ENV === 'production',
  AUDIT_LOG_RETENTION_DAYS: 90
} as const;

// Type exports for TypeScript
export type AuthProvider = typeof AUTH_CONFIG.SUPPORTED_PROVIDERS[number];

export interface JWTPayload {
  userId: number;
  email: string;
  username: string;
  supabaseId: string;
  isSeller: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface SessionData {
  userId: number;
  loginTime: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
}

// Validation functions
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < AUTH_CONFIG.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters long`);
  }
  
  if (AUTH_CONFIG.PASSWORD_REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (AUTH_CONFIG.PASSWORD_REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (AUTH_CONFIG.PASSWORD_REQUIRE_NUMBER && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (AUTH_CONFIG.PASSWORD_REQUIRE_SPECIAL && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Export for testing
export function _resetForTesting() {
  // Only available in test environment
  if (process.env.NODE_ENV === 'test') {
    // Reset any module state for testing
  }
}