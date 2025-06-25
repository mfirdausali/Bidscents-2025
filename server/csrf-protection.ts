import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Simple but effective CSRF protection for Bidscents API
 * 
 * CSRF tokens are generated per session and validated on state-changing operations
 */

// Store CSRF tokens in memory (in production, use Redis or database)
const csrfTokens = new Map<string, { token: string; createdAt: number }>();

// CSRF token expiry time (1 hour)
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000;

/**
 * Generate a CSRF token for a session
 */
export function generateCSRFToken(sessionId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  
  csrfTokens.set(sessionId, {
    token,
    createdAt: Date.now()
  });
  
  // Cleanup expired tokens
  cleanupExpiredTokens();
  
  console.log(`[CSRF] Generated token for session: ${sessionId.substring(0, 8)}...`);
  return token;
}

/**
 * Validate CSRF token for a session
 */
export function validateCSRFToken(sessionId: string, providedToken: string): boolean {
  const tokenData = csrfTokens.get(sessionId);
  
  if (!tokenData) {
    console.error(`[CSRF] No token found for session: ${sessionId.substring(0, 8)}...`);
    return false;
  }
  
  // Check if token has expired
  if (Date.now() - tokenData.createdAt > CSRF_TOKEN_EXPIRY) {
    console.error(`[CSRF] Token expired for session: ${sessionId.substring(0, 8)}...`);
    csrfTokens.delete(sessionId);
    return false;
  }
  
  // Validate token
  if (tokenData.token !== providedToken) {
    console.error(`[CSRF] Invalid token for session: ${sessionId.substring(0, 8)}...`);
    return false;
  }
  
  console.log(`[CSRF] Valid token for session: ${sessionId.substring(0, 8)}...`);
  return true;
}

/**
 * Clean up expired CSRF tokens
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [sessionId, tokenData] of csrfTokens.entries()) {
    if (now - tokenData.createdAt > CSRF_TOKEN_EXPIRY) {
      csrfTokens.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[CSRF] Cleaned up ${cleaned} expired tokens`);
  }
}

/**
 * Get session ID from request (from JWT token or session cookie)
 */
function getSessionId(req: Request): string | null {
  // Try to get session ID from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // In a real implementation, you'd decode the JWT to get the session ID
    // For now, use the token itself as session ID (simplified)
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  
  // Try to get from session cookie if available
  if (req.session?.id) {
    return req.session.id;
  }
  
  // Fallback: use IP + User-Agent as session identifier
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  return crypto.createHash('sha256').update(ip + userAgent).digest('hex');
}

/**
 * Middleware to provide CSRF token
 */
export function provideCSRFToken(req: Request, res: Response, next: NextFunction): void {
  const sessionId = getSessionId(req);
  
  if (!sessionId) {
    return res.status(400).json({
      message: 'Cannot generate CSRF token',
      code: 'CSRF_SESSION_ERROR'
    });
  }
  
  const token = generateCSRFToken(sessionId);
  
  // Add token to response headers
  res.setHeader('X-CSRF-Token', token);
  
  // Also make it available in response body for API endpoints that need it
  (req as any).csrfToken = token;
  
  next();
}

/**
 * Middleware to validate CSRF token on state-changing operations
 */
export function validateCSRF(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF validation for GET and HEAD requests
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }
  
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return res.status(400).json({
      message: 'Session required for CSRF validation',
      code: 'CSRF_SESSION_REQUIRED'
    });
  }
  
  // Get CSRF token from header or body
  const csrfToken = req.headers['x-csrf-token'] || req.body.csrfToken;
  
  if (!csrfToken) {
    return res.status(403).json({
      message: 'CSRF token required',
      code: 'CSRF_TOKEN_REQUIRED'
    });
  }
  
  if (!validateCSRFToken(sessionId, csrfToken as string)) {
    return res.status(403).json({
      message: 'Invalid CSRF token',
      code: 'CSRF_TOKEN_INVALID'
    });
  }
  
  next();
}

/**
 * Get CSRF token endpoint
 */
export function getCSRFTokenEndpoint(req: Request, res: Response): void {
  const sessionId = getSessionId(req);
  
  if (!sessionId) {
    return res.status(400).json({
      message: 'Cannot generate CSRF token',
      code: 'CSRF_SESSION_ERROR'
    });
  }
  
  const token = generateCSRFToken(sessionId);
  
  res.json({
    csrfToken: token,
    message: 'CSRF token generated successfully'
  });
}