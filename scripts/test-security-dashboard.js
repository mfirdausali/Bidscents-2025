import { db } from '../server/db.js';
import { loginAttempts, rateLimitViolations, securityAlerts } from '../shared/schema.js';
import { sql } from 'drizzle-orm';

async function generateTestData() {
  console.log('🔄 Generating test data for security dashboard...');

  try {
    // Generate login attempts
    console.log('📊 Creating login attempts...');
    const emails = ['test@example.com', 'user1@example.com', 'user2@example.com', 'hacker@evil.com'];
    const ips = ['192.168.1.100', '192.168.1.101', '10.0.0.1', '203.0.113.0'];
    
    for (let i = 0; i < 50; i++) {
      const email = emails[Math.floor(Math.random() * emails.length)];
      const ip = ips[Math.floor(Math.random() * ips.length)];
      const successful = Math.random() > 0.3; // 70% success rate
      
      await db.insert(loginAttempts).values({
        email,
        ipAddress: ip,
        userAgent: 'Mozilla/5.0 (Test Browser)',
        successful,
        failureReason: successful ? null : 'Invalid password',
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Random time in last 7 days
      });
    }

    // Generate rate limit violations
    console.log('📊 Creating rate limit violations...');
    const endpoints = ['/api/auth/login', '/api/products', '/api/messages', '/api/boost/create'];
    const methods = ['GET', 'POST', 'PUT', 'DELETE'];
    
    for (let i = 0; i < 30; i++) {
      const ip = ips[Math.floor(Math.random() * ips.length)];
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const method = methods[Math.floor(Math.random() * methods.length)];
      
      await db.insert(rateLimitViolations).values({
        ipAddress: ip,
        endpoint,
        method,
        windowStart: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000), // Random time in last 24 hours
        createdAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000)
      });
    }

    // Generate security alerts
    console.log('📊 Creating security alerts...');
    const alertTypes = ['failed_login', 'rate_limit', 'suspicious_activity', 'geographic_anomaly'];
    const severities = ['critical', 'high', 'medium', 'low'];
    
    const alerts = [
      {
        type: 'failed_login',
        severity: 'high',
        title: 'Multiple failed login attempts detected',
        description: '15 failed login attempts from IP 203.0.113.0 in the last hour'
      },
      {
        type: 'rate_limit',
        severity: 'medium',
        title: 'Rate limit exceeded on API endpoint',
        description: 'IP 192.168.1.100 exceeded rate limit on /api/products endpoint'
      },
      {
        type: 'suspicious_activity',
        severity: 'critical',
        title: 'Potential account takeover attempt',
        description: 'User account accessed from 5 different IP addresses within 10 minutes'
      },
      {
        type: 'geographic_anomaly',
        severity: 'high',
        title: 'Login from unusual location',
        description: 'User normally logs in from Malaysia but just logged in from Russia'
      }
    ];

    for (const alert of alerts) {
      await db.insert(securityAlerts).values({
        ...alert,
        status: Math.random() > 0.5 ? 'new' : 'acknowledged',
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'test-script'
        },
        createdAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000) // Random time in last 3 days
      });
    }

    console.log('✅ Test data generated successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('- 50 login attempts created');
    console.log('- 30 rate limit violations created');
    console.log('- 4 security alerts created');
    console.log('');
    console.log('🔗 Visit /admin/security to view the security dashboard');
    
  } catch (error) {
    console.error('❌ Error generating test data:', error);
    process.exit(1);
  }

  process.exit(0);
}

generateTestData();