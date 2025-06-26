import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { loginAttempts, rateLimitViolations, sessions, securityAlerts } from '../shared/schema';
import { eq, and, gte } from 'drizzle-orm';

/**
 * Track login attempts for security monitoring
 */
export async function trackLoginAttempt(
  email: string,
  success: boolean,
  ipAddress: string,
  userAgent?: string,
  userId?: number,
  failureReason?: string
) {
  try {
    // Skip database operations in demo mode
    if (process.env.DEMO_MODE === 'true' || !process.env.DATABASE_URL) {
      console.log('[DEV] [SECURITY] Login attempt:', { email, success, ipAddress });
      return;
    }
    
    await db.insert(loginAttempts).values({
      email,
      successful: success,
      ipAddress,
      userAgent: userAgent || null,
      userId: userId || null,
      failureReason: failureReason || null
    });

    // Check for suspicious patterns
    if (!success) {
      // Count recent failed attempts
      const recentFailures = await db.select()
        .from(loginAttempts)
        .where(and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.successful, false),
          gte(loginAttempts.createdAt, new Date(Date.now() - 15 * 60 * 1000)) // Last 15 minutes
        ));

      // Create alert if threshold exceeded
      if (recentFailures.length >= 5) {
        await db.insert(securityAlerts).values({
          type: 'failed_login',
          severity: 'high',
          title: `Multiple failed login attempts for ${email}`,
          description: `${recentFailures.length} failed login attempts in the last 15 minutes`,
          status: 'new',
          metadata: {
            email,
            ipAddress,
            failureCount: recentFailures.length
          }
        });
      }
    }
  } catch (error) {
    console.error('Error tracking login attempt:', error);
  }
}

/**
 * Track rate limit violations
 */
export async function trackRateLimitViolation(
  req: Request,
  endpoint: string
) {
  try {
    // Skip database operations in demo mode
    if (process.env.DEMO_MODE === 'true' || !process.env.DATABASE_URL) {
      console.log('[DEV] [SECURITY] Rate limit violation:', { endpoint, ip: req.ip });
      return;
    }
    
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userId = (req as any).user?.id;

    await db.insert(rateLimitViolations).values({
      ipAddress,
      userId: userId || null,
      endpoint,
      method: req.method,
      windowStart: new Date()
    });

    // Check for excessive violations
    const recentViolations = await db.select()
      .from(rateLimitViolations)
      .where(and(
        eq(rateLimitViolations.ipAddress, ipAddress),
        gte(rateLimitViolations.createdAt, new Date(Date.now() - 60 * 60 * 1000)) // Last hour
      ));

    // Create alert if threshold exceeded
    if (recentViolations.length >= 50) {
      await db.insert(securityAlerts).values({
        type: 'rate_limit',
        severity: 'medium',
        title: `Excessive rate limit violations from ${ipAddress}`,
        description: `${recentViolations.length} rate limit violations in the last hour`,
        status: 'new',
        metadata: {
          ipAddress,
          violationCount: recentViolations.length,
          endpoints: [...new Set(recentViolations.map(v => v.endpoint))]
        }
      });
    }
  } catch (error) {
    console.error('Error tracking rate limit violation:', error);
  }
}

/**
 * Track active sessions
 */
export async function trackSession(
  userId: number,
  token: string,
  ipAddress: string,
  userAgent?: string,
  expiresInHours: number = 24
) {
  try {
    // Skip database operations in demo mode
    if (process.env.DEMO_MODE === 'true' || !process.env.DATABASE_URL) {
      console.log('[DEV] [SECURITY] Session tracked:', { userId, ipAddress });
      return;
    }
    
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    
    await db.insert(sessions).values({
      userId,
      token,
      ipAddress,
      userAgent: userAgent || null,
      active: true,
      expiresAt
    });
  } catch (error) {
    console.error('Error tracking session:', error);
  }
}

/**
 * Update session activity
 */
export async function updateSessionActivity(token: string) {
  try {
    await db.update(sessions)
      .set({ lastActivity: new Date() })
      .where(eq(sessions.token, token));
  } catch (error) {
    console.error('Error updating session activity:', error);
  }
}

/**
 * Deactivate session
 */
export async function deactivateSession(token: string) {
  try {
    await db.update(sessions)
      .set({ active: false })
      .where(eq(sessions.token, token));
  } catch (error) {
    console.error('Error deactivating session:', error);
  }
}

/**
 * Middleware to track session activity
 */
export function sessionActivityMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    // Update session activity asynchronously
    updateSessionActivity(token).catch(console.error);
  }
  next();
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions() {
  try {
    await db.update(sessions)
      .set({ active: false })
      .where(and(
        eq(sessions.active, true),
        gte(new Date(), sessions.expiresAt)
      ));
  } catch (error) {
    console.error('Error cleaning up expired sessions:', error);
  }
}

// Schedule cleanup every hour
setInterval(() => {
  cleanupExpiredSessions().catch(console.error);
}, 60 * 60 * 1000);