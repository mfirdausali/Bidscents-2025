import jwt from 'jsonwebtoken';
import { User } from '../shared/schema';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * Generate a JWT token for a user
 * @param user The user object to encode in the token
 * @returns The signed JWT token
 */
export function generateToken(user: User): string {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    providerId: user.providerId,
    provider: user.provider,
    isAdmin: user.isAdmin,
    isBanned: user.isBanned
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
    console.error('JWT verification failed:', error.message);
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