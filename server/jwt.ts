import jwt from 'jsonwebtoken';
import { User } from '../shared/schema';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is not set!');
  console.error('Please generate a secure key using: openssl rand -hex 64');
  throw new Error('Missing required JWT_SECRET environment variable');
}

/**
 * Generate a JWT token for a user
 * @param user The user object to encode in the token
 * @returns The signed JWT token
 */
export function generateToken(user: User): string {
  // SECURITY: Only include essential, non-sensitive data in JWT
  // Sensitive data like email, admin status should be fetched from server when needed
  const payload = {
    id: user.id,
    username: user.username,
    // REMOVED: email, isAdmin, isBanned - these should not be in client-accessible tokens
    // These values should be fetched from the server when needed
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'bidscents-marketplace',
    audience: 'bidscents-users'
  });
}

/**
 * Verify and decode a JWT token
 * @param token The JWT token to verify
 * @returns The decoded user data or null if invalid
 */
export function verifyToken(token: string): any | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'bidscents-marketplace',
      audience: 'bidscents-users'
    });
    return decoded;
  } catch (error: any) {
    // SECURITY: Don't log JWT errors in production as they may contain sensitive info
    // In development, you can enable this for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('JWT verification failed:', error.message);
    }
    return null;
  }
}

/**
 * Extract token from Authorization header
 * @param authHeader The Authorization header value
 * @returns The token string or null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}

/**
 * Middleware to verify JWT token from request
 * @param req Express request object
 * @returns Decoded user data or null
 */
export function verifyTokenFromRequest(req: any): any | null {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return null;
  }
  
  return verifyToken(token);
}