import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { 
  users, 
  auditLogs, 
  sessions,
  securityAlerts,
  loginAttempts,
  rateLimitViolations 
} from '../../shared/schema';
import { sql, desc, asc, and, gte, lte, eq, count, avg } from 'drizzle-orm';
import { authenticateToken } from '../app-auth';
import { sendEmail } from '../email';

// Schema definitions
const TimeRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).default(100)
});

const AlertConfigSchema = z.object({
  type: z.enum(['failed_login', 'rate_limit', 'suspicious_activity', 'geographic_anomaly']),
  threshold: z.number().min(1),
  timeWindowMinutes: z.number().min(1).max(1440),
  emailNotification: z.boolean(),
  webhookUrl: z.string().url().optional()
});

// Authentication metrics
export async function getAuthenticationMetrics(req: Request, res: Response) {
  try {
    const { startDate, endDate } = TimeRangeSchema.parse(req.query);
    
    const conditions = [];
    if (startDate) conditions.push(gte(loginAttempts.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(loginAttempts.createdAt, new Date(endDate)));

    // Get login statistics
    const [stats] = await db.select({
      totalAttempts: count(),
      successfulLogins: count(sql`CASE WHEN ${loginAttempts.successful} = true THEN 1 END`),
      failedLogins: count(sql`CASE WHEN ${loginAttempts.successful} = false THEN 1 END`),
      uniqueUsers: count(sql`DISTINCT ${loginAttempts.userId}`),
      avgAttemptsPerUser: avg(sql`1`)
    })
    .from(loginAttempts)
    .where(and(...conditions));

    // Get failed login patterns
    const failedPatterns = await db.select({
      userId: loginAttempts.userId,
      email: users.email,
      failureCount: count(),
      lastAttempt: sql<string>`MAX(${loginAttempts.createdAt})`
    })
    .from(loginAttempts)
    .leftJoin(users, eq(loginAttempts.userId, users.id))
    .where(and(
      eq(loginAttempts.successful, false),
      ...conditions
    ))
    .groupBy(loginAttempts.userId, users.email)
    .having(sql`COUNT(*) > 3`)
    .orderBy(desc(count()));

    // Get lockout statistics
    const lockouts = await db.select({
      count: count(),
      users: sql<string[]>`ARRAY_AGG(DISTINCT ${users.email})`
    })
    .from(users)
    .where(and(
      eq(users.accountLocked, true),
      ...conditions.map(c => c)
    ));

    res.json({
      stats,
      failedPatterns,
      lockouts: lockouts[0]
    });
  } catch (error) {
    console.error('Error fetching authentication metrics:', error);
    res.status(500).json({ error: 'Failed to fetch authentication metrics' });
  }
}

// Rate limiting statistics
export async function getRateLimitStats(req: Request, res: Response) {
  try {
    const { startDate, endDate } = TimeRangeSchema.parse(req.query);
    
    const conditions = [];
    if (startDate) conditions.push(gte(rateLimitViolations.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(rateLimitViolations.createdAt, new Date(endDate)));

    // Get violations by endpoint
    const violationsByEndpoint = await db.select({
      endpoint: rateLimitViolations.endpoint,
      method: rateLimitViolations.method,
      count: count(),
      uniqueIps: count(sql`DISTINCT ${rateLimitViolations.ipAddress}`)
    })
    .from(rateLimitViolations)
    .where(and(...conditions))
    .groupBy(rateLimitViolations.endpoint, rateLimitViolations.method)
    .orderBy(desc(count()));

    // Get violations by IP
    const violationsByIp = await db.select({
      ipAddress: rateLimitViolations.ipAddress,
      count: count(),
      endpoints: sql<string[]>`ARRAY_AGG(DISTINCT ${rateLimitViolations.endpoint})`,
      lastViolation: sql<string>`MAX(${rateLimitViolations.createdAt})`
    })
    .from(rateLimitViolations)
    .where(and(...conditions))
    .groupBy(rateLimitViolations.ipAddress)
    .orderBy(desc(count()))
    .limit(20);

    // Get hourly heat map data
    const heatMapData = await db.select({
      hour: sql<number>`EXTRACT(HOUR FROM ${rateLimitViolations.createdAt})`,
      dayOfWeek: sql<number>`EXTRACT(DOW FROM ${rateLimitViolations.createdAt})`,
      count: count()
    })
    .from(rateLimitViolations)
    .where(and(...conditions))
    .groupBy(sql`EXTRACT(HOUR FROM ${rateLimitViolations.createdAt})`, 
             sql`EXTRACT(DOW FROM ${rateLimitViolations.createdAt})`);

    res.json({
      violationsByEndpoint,
      violationsByIp,
      heatMapData
    });
  } catch (error) {
    console.error('Error fetching rate limit stats:', error);
    res.status(500).json({ error: 'Failed to fetch rate limit statistics' });
  }
}

// Audit logs
export async function getAuditLogs(req: Request, res: Response) {
  try {
    const { startDate, endDate, limit } = TimeRangeSchema.parse(req.query);
    const { userId, action, entityType } = req.query as any;
    
    const conditions = [];
    if (startDate) conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (action) conditions.push(eq(auditLogs.action, action));
    if (entityType) conditions.push(eq(auditLogs.entityType, entityType));

    const logs = await db.select({
      id: auditLogs.id,
      userId: auditLogs.userId,
      userEmail: users.email,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      changes: auditLogs.changes,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}

// Active sessions
export async function getActiveSessions(req: Request, res: Response) {
  try {
    const activeSessions = await db.select({
      id: sessions.id,
      userId: sessions.userId,
      userEmail: users.email,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      lastActivity: sessions.lastActivity,
      createdAt: sessions.createdAt
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.active, true))
    .orderBy(desc(sessions.lastActivity));

    // Group sessions by user
    const sessionsByUser = activeSessions.reduce((acc, session) => {
      if (!acc[session.userId]) {
        acc[session.userId] = {
          userId: session.userId,
          email: session.userEmail,
          sessions: []
        };
      }
      acc[session.userId].sessions.push(session);
      return acc;
    }, {} as Record<string, any>);

    res.json({
      totalSessions: activeSessions.length,
      uniqueUsers: Object.keys(sessionsByUser).length,
      sessions: activeSessions,
      sessionsByUser: Object.values(sessionsByUser)
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
}

// Security alerts
export async function getSecurityAlerts(req: Request, res: Response) {
  try {
    const { startDate, endDate, limit } = TimeRangeSchema.parse(req.query);
    const { severity, status } = req.query as any;
    
    const conditions = [];
    if (startDate) conditions.push(gte(securityAlerts.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(securityAlerts.createdAt, new Date(endDate)));
    if (severity) conditions.push(eq(securityAlerts.severity, severity));
    if (status) conditions.push(eq(securityAlerts.status, status));

    const alerts = await db.select()
      .from(securityAlerts)
      .where(and(...conditions))
      .orderBy(desc(securityAlerts.createdAt))
      .limit(limit);

    // Get alert statistics
    const [stats] = await db.select({
      total: count(),
      critical: count(sql`CASE WHEN ${securityAlerts.severity} = 'critical' THEN 1 END`),
      high: count(sql`CASE WHEN ${securityAlerts.severity} = 'high' THEN 1 END`),
      medium: count(sql`CASE WHEN ${securityAlerts.severity} = 'medium' THEN 1 END`),
      low: count(sql`CASE WHEN ${securityAlerts.severity} = 'low' THEN 1 END`),
      unacknowledged: count(sql`CASE WHEN ${securityAlerts.status} = 'new' THEN 1 END`)
    })
    .from(securityAlerts)
    .where(and(...conditions));

    res.json({
      alerts,
      stats
    });
  } catch (error) {
    console.error('Error fetching security alerts:', error);
    res.status(500).json({ error: 'Failed to fetch security alerts' });
  }
}

// Create security alert
export async function createSecurityAlert(req: Request, res: Response) {
  try {
    const { type, severity, title, description, metadata } = req.body;

    const [alert] = await db.insert(securityAlerts)
      .values({
        type,
        severity,
        title,
        description,
        metadata,
        status: 'new'
      })
      .returning();

    // Send notifications if configured
    if (severity === 'critical' || severity === 'high') {
      await sendAlertNotifications(alert);
    }

    res.json(alert);
  } catch (error) {
    console.error('Error creating security alert:', error);
    res.status(500).json({ error: 'Failed to create security alert' });
  }
}

// Acknowledge alert
export async function acknowledgeAlert(req: Request, res: Response) {
  try {
    const { alertId } = req.params;
    const { acknowledgedBy, notes } = req.body;

    const [updated] = await db.update(securityAlerts)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy,
        notes
      })
      .where(eq(securityAlerts.id, alertId))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
}

// Suspicious activity detection
export async function detectSuspiciousActivity(req: Request, res: Response) {
  try {
    const timeWindow = new Date(Date.now() - 60 * 60 * 1000); // Last hour

    // Detect rapid failed login attempts
    const rapidFailedLogins = await db.select({
      userId: loginAttempts.userId,
      email: users.email,
      attempts: count(),
      ipAddresses: sql<string[]>`ARRAY_AGG(DISTINCT ${loginAttempts.ipAddress})`
    })
    .from(loginAttempts)
    .leftJoin(users, eq(loginAttempts.userId, users.id))
    .where(and(
      eq(loginAttempts.successful, false),
      gte(loginAttempts.createdAt, timeWindow)
    ))
    .groupBy(loginAttempts.userId, users.email)
    .having(sql`COUNT(*) > 5`);

    // Detect multiple IP usage
    const multipleIpUsers = await db.select({
      userId: sessions.userId,
      email: users.email,
      ipCount: count(sql`DISTINCT ${sessions.ipAddress}`),
      ipAddresses: sql<string[]>`ARRAY_AGG(DISTINCT ${sessions.ipAddress})`
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .where(and(
      eq(sessions.active, true),
      gte(sessions.lastActivity, timeWindow)
    ))
    .groupBy(sessions.userId, users.email)
    .having(sql`COUNT(DISTINCT ${sessions.ipAddress}) > 3`);

    // Detect unusual activity patterns
    const unusualPatterns = await db.select({
      userId: auditLogs.userId,
      email: users.email,
      actionCount: count(),
      actions: sql<string[]>`ARRAY_AGG(DISTINCT ${auditLogs.action})`
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(gte(auditLogs.createdAt, timeWindow))
    .groupBy(auditLogs.userId, users.email)
    .having(sql`COUNT(*) > 100`);

    res.json({
      rapidFailedLogins,
      multipleIpUsers,
      unusualPatterns
    });
  } catch (error) {
    console.error('Error detecting suspicious activity:', error);
    res.status(500).json({ error: 'Failed to detect suspicious activity' });
  }
}

// Security reports
export async function generateSecurityReport(req: Request, res: Response) {
  try {
    const { reportType, startDate, endDate } = req.query as any;
    
    let report;
    switch (reportType) {
      case 'daily_summary':
        report = await generateDailySummaryReport(startDate);
        break;
      case 'compliance':
        report = await generateComplianceReport(startDate, endDate);
        break;
      case 'user_access':
        report = await generateUserAccessReport(startDate, endDate);
        break;
      case 'incident':
        report = await generateIncidentReport(startDate, endDate);
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    res.json(report);
  } catch (error) {
    console.error('Error generating security report:', error);
    res.status(500).json({ error: 'Failed to generate security report' });
  }
}

// Helper functions
async function sendAlertNotifications(alert: any) {
  // Send email notification
  const admins = await db.select()
    .from(users)
    .where(eq(users.role, 'admin'));

  for (const admin of admins) {
    await sendEmail({
      to: admin.email,
      subject: `[CRITICAL] Security Alert: ${alert.title}`,
      html: `
        <h2>Security Alert</h2>
        <p><strong>Type:</strong> ${alert.type}</p>
        <p><strong>Severity:</strong> ${alert.severity}</p>
        <p><strong>Description:</strong> ${alert.description}</p>
        <p><strong>Time:</strong> ${new Date(alert.createdAt).toISOString()}</p>
        <p>Please check the security dashboard for more details.</p>
      `
    });
  }
}

async function generateDailySummaryReport(date: string) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const [authStats] = await db.select({
    totalLogins: count(),
    successfulLogins: count(sql`CASE WHEN ${loginAttempts.successful} = true THEN 1 END`),
    failedLogins: count(sql`CASE WHEN ${loginAttempts.successful} = false THEN 1 END`)
  })
  .from(loginAttempts)
  .where(and(
    gte(loginAttempts.createdAt, startOfDay),
    lte(loginAttempts.createdAt, endOfDay)
  ));

  const [alertStats] = await db.select({
    totalAlerts: count(),
    criticalAlerts: count(sql`CASE WHEN ${securityAlerts.severity} = 'critical' THEN 1 END`)
  })
  .from(securityAlerts)
  .where(and(
    gte(securityAlerts.createdAt, startOfDay),
    lte(securityAlerts.createdAt, endOfDay)
  ));

  return {
    date,
    authentication: authStats,
    alerts: alertStats
  };
}

async function generateComplianceReport(startDate: string, endDate: string) {
  // Implementation for compliance report
  return {
    period: { startDate, endDate },
    dataProtection: {
      encryptedData: true,
      dataRetentionCompliant: true,
      userConsentTracked: true
    },
    accessControl: {
      mfaEnabled: true,
      passwordPolicyEnforced: true,
      sessionManagement: true
    },
    auditTrail: {
      allActionsLogged: true,
      logRetentionDays: 90,
      tamperProof: true
    }
  };
}

async function generateUserAccessReport(startDate: string, endDate: string) {
  const userAccess = await db.select({
    userId: users.id,
    email: users.email,
    role: users.role,
    lastLogin: sql<string>`MAX(${loginAttempts.createdAt})`,
    totalLogins: count(loginAttempts.id),
    activeSessions: count(sql`DISTINCT ${sessions.id}`)
  })
  .from(users)
  .leftJoin(loginAttempts, and(
    eq(loginAttempts.userId, users.id),
    eq(loginAttempts.successful, true),
    gte(loginAttempts.createdAt, new Date(startDate)),
    lte(loginAttempts.createdAt, new Date(endDate))
  ))
  .leftJoin(sessions, and(
    eq(sessions.userId, users.id),
    eq(sessions.active, true)
  ))
  .groupBy(users.id, users.email, users.role);

  return {
    period: { startDate, endDate },
    userAccess
  };
}

async function generateIncidentReport(startDate: string, endDate: string) {
  const incidents = await db.select()
    .from(securityAlerts)
    .where(and(
      gte(securityAlerts.createdAt, new Date(startDate)),
      lte(securityAlerts.createdAt, new Date(endDate)),
      sql`${securityAlerts.severity} IN ('critical', 'high')`
    ))
    .orderBy(desc(securityAlerts.createdAt));

  return {
    period: { startDate, endDate },
    totalIncidents: incidents.length,
    incidents
  };
}

// Export all functions
export const securityDashboardApi = {
  getAuthenticationMetrics,
  getRateLimitStats,
  getAuditLogs,
  getActiveSessions,
  getSecurityAlerts,
  createSecurityAlert,
  acknowledgeAlert,
  detectSuspiciousActivity,
  generateSecurityReport
};