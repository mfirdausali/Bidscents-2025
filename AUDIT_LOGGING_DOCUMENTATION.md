# Audit Logging System Documentation

## Overview

The BidScents audit logging system provides comprehensive tracking of all security-relevant actions in the application. This system is designed for compliance, security monitoring, and forensic analysis.

## Architecture

### Components

1. **Audit Logger Module** (`server/audit-logger.ts`)
   - Core audit logging functionality
   - Event type definitions
   - Severity levels
   - Specialized audit functions

2. **Database Table** (`audit_logs`)
   - Persistent storage for audit events
   - Indexed for efficient querying
   - Includes all relevant metadata

3. **Integration Points**
   - Authentication routes
   - Resource CRUD operations
   - Payment processing
   - File uploads
   - Admin actions
   - Security violations

## Event Types

### Authentication Events
- `AUTH_LOGIN_SUCCESS` - Successful user login
- `AUTH_LOGIN_FAILED` - Failed login attempt
- `AUTH_LOGOUT` - User logout
- `AUTH_REGISTER` - New user registration
- `AUTH_PASSWORD_RESET` - Password reset request
- `AUTH_EMAIL_VERIFIED` - Email verification completed
- `AUTH_SESSION_EXPIRED` - Session timeout

### Resource Events
- `RESOURCE_CREATE` - Resource creation (products, etc.)
- `RESOURCE_UPDATE` - Resource modification
- `RESOURCE_DELETE` - Resource deletion
- `RESOURCE_RESTORE` - Resource restoration

### Admin Events
- `ADMIN_USER_BAN` - User banned by admin
- `ADMIN_USER_UNBAN` - User unbanned by admin
- `ADMIN_CONTENT_DELETE` - Content removed by admin
- `ADMIN_ROLE_CHANGE` - User role modification

### Payment Events
- `PAYMENT_INITIATED` - Payment process started
- `PAYMENT_SUCCESS` - Payment completed successfully
- `PAYMENT_FAILED` - Payment failed
- `PAYMENT_REFUND` - Payment refunded

### Security Events
- `SECURITY_AUTH_FAILURE` - Authentication failure
- `SECURITY_RATE_LIMIT` - Rate limit exceeded
- `SECURITY_CSRF_VIOLATION` - CSRF token validation failed
- `SECURITY_UNAUTHORIZED_ACCESS` - Unauthorized access attempt

### File Events
- `FILE_UPLOAD` - File uploaded
- `FILE_DELETE` - File deleted
- `FILE_ACCESS_DENIED` - File access denied

### User Activity Events
- `USER_PROFILE_UPDATE` - Profile updated
- `USER_PRODUCT_CREATE` - Product created
- `USER_PRODUCT_UPDATE` - Product updated
- `USER_BID_PLACED` - Bid placed on auction
- `USER_MESSAGE_SENT` - Message sent
- `USER_REVIEW_POSTED` - Review posted

## Severity Levels

- `INFO` - Normal operations
- `WARNING` - Potentially problematic actions
- `ERROR` - Errors and failures
- `CRITICAL` - Security violations and critical issues

## Database Schema

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  user_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  request_id TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
```

## Usage Examples

### Direct Audit Logging

```typescript
import { auditLog, AuditEventType, AuditSeverity } from './audit-logger';

// Log a custom event
await auditLog({
  eventType: AuditEventType.RESOURCE_CREATE,
  severity: AuditSeverity.INFO,
  userId: user.id,
  userEmail: user.email,
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  action: 'Created new product',
  resourceType: 'product',
  resourceId: product.id,
  details: { productName: product.name },
  success: true
});
```

### Using Specialized Functions

```typescript
// Authentication logging
await auditAuth.loginSuccess(req, userId, email);
await auditAuth.loginFailed(req, email, 'Invalid password');

// Resource logging
await auditResource.create(req, 'product', productId, productData);
await auditResource.update(req, 'product', productId, changes);
await auditResource.delete(req, 'product', productId);

// Security logging
await auditSecurity.rateLimitExceeded(req, '/api/login');
await auditSecurity.unauthorizedAccess(req, 'admin panel', 'Insufficient permissions');
await auditSecurity.csrfViolation(req);

// Payment logging
await auditPayment.initiated(req, orderId, amount, userId);
await auditPayment.success(req, orderId, transactionId, amount);
await auditPayment.failed(req, orderId, 'Insufficient funds');

// Admin logging
await auditAdmin.banUser(req, targetUserId, reason);
await auditAdmin.deleteContent(req, 'product', productId, reason);

// File logging
await auditFile.upload(req, 'avatar', fileName, fileSize);
await auditFile.accessDenied(req, fileName, 'Invalid file type');
```

### Using Audit Middleware

```typescript
// Automatic audit logging for routes
app.get('/api/users/:id', 
  auditMiddleware(AuditEventType.RESOURCE_READ, 'user', req => req.params.id),
  getUserHandler
);
```

## Querying Audit Logs

### Recent Security Events

```sql
SELECT * FROM audit_logs 
WHERE severity IN ('ERROR', 'CRITICAL')
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Failed Login Attempts

```sql
SELECT user_email, ip_address, COUNT(*) as attempts
FROM audit_logs
WHERE event_type = 'AUTH_LOGIN_FAILED'
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_email, ip_address
HAVING COUNT(*) > 3;
```

### User Activity Trail

```sql
SELECT * FROM audit_logs
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 100;
```

### Admin Actions

```sql
SELECT * FROM audit_logs
WHERE event_type LIKE 'ADMIN_%'
ORDER BY created_at DESC;
```

## Compliance and Retention

### Data Retention Policy

- Audit logs should be retained for a minimum of 90 days
- Critical security events should be retained for 1 year
- Consider archiving old logs to cold storage

### Privacy Considerations

- User emails are stored separately to maintain audit trail even if user is deleted
- Sensitive data in the `details` field should be minimized
- IP addresses may need to be anonymized based on local regulations

### Security Best Practices

1. **Access Control**: Audit logs should be read-only for most users
2. **Integrity**: Consider implementing log signing to detect tampering
3. **Backup**: Regular backups of audit logs
4. **Monitoring**: Set up alerts for critical events
5. **Regular Review**: Periodic review of audit logs for anomalies

## Monitoring and Alerts

### Critical Events to Monitor

1. Multiple failed login attempts from same IP
2. CSRF violations
3. Unauthorized access attempts
4. Rapid API calls (potential DoS)
5. Admin actions on user accounts
6. Large file uploads
7. Payment failures

### Sample Alert Query

```sql
-- Alert on multiple failed logins
SELECT user_email, ip_address, COUNT(*) as failed_attempts
FROM audit_logs
WHERE event_type = 'AUTH_LOGIN_FAILED'
AND created_at > NOW() - INTERVAL '15 minutes'
GROUP BY user_email, ip_address
HAVING COUNT(*) >= 5;
```

## Testing

Run the test script to verify audit logging:

```bash
node test-audit-logging.js
```

Then check the database:

```bash
npm run db:query "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;"
```

## Future Enhancements

1. **Real-time Monitoring Dashboard**: Web interface for viewing audit logs
2. **Automated Alerts**: Email/SMS alerts for critical events
3. **Log Shipping**: Send logs to external SIEM systems
4. **Machine Learning**: Anomaly detection for unusual patterns
5. **Compliance Reports**: Automated compliance report generation
6. **Log Signing**: Cryptographic signatures for log integrity