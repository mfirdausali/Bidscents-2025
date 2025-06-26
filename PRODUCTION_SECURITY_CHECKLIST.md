# BidScents Production Security Checklist ✅

## Pre-Deployment Security Verification

### 🔐 Authentication & Authorization
- [ ] JWT_SECRET is 64+ characters and cryptographically random
- [ ] REFRESH_SECRET is different from JWT_SECRET
- [ ] JWT expiration set to 24 hours (not 7 days)
- [ ] All endpoints use `req.user.id` (never `req.body.sellerId`)
- [ ] Ownership verification applied to all resource modifications
- [ ] Admin endpoints have role-based access control
- [ ] Password requirements enforced (12+ chars, complexity)
- [ ] Account lockout after 5 failed attempts

### 🛡️ API Security
- [ ] CSRF protection on all 28 state-changing endpoints
- [ ] Rate limiting on all 65 endpoints
- [ ] Zod validation on every endpoint
- [ ] No SQL injection vulnerabilities (parameterized queries)
- [ ] Error messages don't leak sensitive information
- [ ] Request IDs on all responses
- [ ] Audit logging enabled for all actions

### 🌐 Infrastructure Security
- [ ] Redis configured and running
- [ ] Redis password set and strong
- [ ] HTTPS enforced (no HTTP)
- [ ] Security headers configured (Helmet)
- [ ] CORS properly configured
- [ ] Cookie security (httpOnly, secure, sameSite)
- [ ] File upload virus scanning enabled

### 📊 Monitoring & Alerts
- [ ] Security dashboard accessible at `/admin/security`
- [ ] Email alerts configured for critical events
- [ ] Rate limit violations being tracked
- [ ] Failed login attempts monitored
- [ ] Audit logs retention policy set (90 days)
- [ ] Error tracking enabled
- [ ] Health checks configured

### 🔑 Environment Variables
```bash
# Verify all are set and secure:
[ ] NODE_ENV=production
[ ] JWT_SECRET (64+ chars)
[ ] REFRESH_SECRET (64+ chars)
[ ] SESSION_SECRET (32+ chars)
[ ] ENCRYPTION_KEY (32+ chars)
[ ] DATABASE_URL (with SSL)
[ ] SUPABASE_URL
[ ] SUPABASE_KEY (service role)
[ ] VITE_SUPABASE_KEY (anon key)
[ ] REDIS_URL (with password)
[ ] BILLPLZ_SECRET_KEY
[ ] BILLPLZ_XSIGN_KEY
[ ] SMTP_HOST/PORT/USER/PASS
[ ] ALERT_EMAIL
```

### 🗄️ Database Security
- [ ] All migrations run successfully
- [ ] Indexes created for performance
- [ ] RLS policies enabled in Supabase
- [ ] Database backups configured
- [ ] Connection pooling optimized
- [ ] SSL required for connections
- [ ] Audit tables created

### 📁 File Security
- [ ] File upload size limits enforced
- [ ] Magic bytes validation enabled
- [ ] Virus scanning operational
- [ ] Image metadata stripped
- [ ] Secure file serving implemented
- [ ] Upload monitoring active
- [ ] Suspicious pattern detection enabled

### 🚨 Security Testing
Run all security tests before deployment:

```bash
# 1. Test Redis integration
npm run tsx test-redis-integration.js
✅ All Redis stores operational
✅ Fallback to memory works
✅ Health checks pass

# 2. Test file security
npm run tsx server/file-security-test.ts
✅ Magic bytes validation works
✅ Virus scanning operational
✅ File sanitization works

# 3. Test audit logging
npm run tsx test-audit-logging.js
✅ All events logged correctly
✅ Database persistence works
✅ No sensitive data logged

# 4. Rate limiting audit
node scripts/audit-rate-limiting.js
✅ 65/65 endpoints protected
✅ No missing rate limiters

# 5. Security dashboard test
npm run tsx scripts/test-security-dashboard.js
✅ Metrics collection works
✅ Alerts trigger correctly
✅ Reports generate
```

### 🔍 Manual Security Verification

#### CSRF Testing
```bash
# Attempt CSRF attack
curl -X POST https://your-domain/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}' \
  # Should fail without CSRF token
```

#### Authorization Testing
```bash
# Try to modify another user's product
curl -X PUT https://your-domain/api/products/123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"sellerId": 999}' \
  # Should use your ID, not 999
```

#### Rate Limit Testing
```bash
# Rapid requests to trigger rate limit
for i in {1..10}; do
  curl https://your-domain/api/products
done
# Should get 429 after limit
```

### 📋 Compliance Verification
- [ ] OWASP Top 10 addressed
- [ ] PCI DSS requirements met (payment security)
- [ ] GDPR compliance (data privacy, right to deletion)
- [ ] Audit trail for compliance reporting
- [ ] Security headers scoring A+ on securityheaders.com
- [ ] SSL Labs score A+ on ssllabs.com

### 🚀 Deployment Security
- [ ] Production build created (`npm run build`)
- [ ] Source maps disabled in production
- [ ] Debug mode disabled
- [ ] Console logs removed/disabled
- [ ] Error stack traces hidden
- [ ] Development endpoints removed
- [ ] Test data cleaned up

### 🔄 Post-Deployment Verification
After deployment, verify:

1. **Health Checks**
```bash
curl https://your-domain/health
# Should return: {"status":"healthy"}

curl https://your-domain/ready
# Should show all systems operational
```

2. **Security Headers**
```bash
curl -I https://your-domain
# Verify security headers present
```

3. **Authentication Flow**
- [ ] Login works with correct credentials
- [ ] Login fails with wrong credentials
- [ ] Account locks after 5 failures
- [ ] Token refresh works
- [ ] Logout invalidates session

4. **File Upload**
- [ ] Images upload successfully
- [ ] Large files rejected
- [ ] Non-image files rejected for images
- [ ] Uploaded files accessible only to authorized users

5. **Payment Security**
- [ ] Billplz webhook signature verified
- [ ] Payment notifications work
- [ ] Boost activation secure

### 📱 Client-Side Security
- [ ] No sensitive data in localStorage
- [ ] API keys not exposed in client bundle
- [ ] Error boundaries catch React errors
- [ ] XSS prevention in user content
- [ ] Content Security Policy active

### 🔔 Alert Configuration
Verify alerts trigger for:
- [ ] 5+ failed logins from same IP
- [ ] Rate limit violations (>100/hour)
- [ ] Large file upload attempts (>10MB)
- [ ] SQL injection attempts
- [ ] CSRF token failures
- [ ] Authorization failures
- [ ] Server errors (500s)

### 📈 Performance Under Security
Confirm performance with security enabled:
- [ ] API response time <100ms (p95)
- [ ] Page load time <3s
- [ ] WebSocket latency <50ms
- [ ] Database queries <50ms
- [ ] Redis operations <5ms

### 🔧 Operational Security
- [ ] Backup procedures documented
- [ ] Incident response plan ready
- [ ] Security contact email configured
- [ ] Monitoring dashboards accessible
- [ ] Log retention configured
- [ ] Update procedures defined

### ✅ Final Security Sign-Off

**Date**: _______________

**Verified By**: _______________

**Security Score**: 
- API Security: ___/100
- Infrastructure: ___/100  
- Monitoring: ___/100
- Compliance: ___/100

**Overall**: ___/100

**Approved for Production**: [ ] Yes [ ] No

**Notes**:
_________________________________
_________________________________
_________________________________

---

## Quick Security Commands

```bash
# Generate secure secrets
openssl rand -base64 64  # For JWT_SECRET
openssl rand -base64 32  # For SESSION_SECRET
openssl rand -hex 32     # For ENCRYPTION_KEY

# Test security locally
NODE_ENV=production npm start

# Monitor security in production
tail -f server.log | grep -E "(SECURITY|AUTH|AUDIT)"

# Check active sessions
redis-cli KEYS "session:*" | wc -l

# View rate limit status
redis-cli KEYS "rate_limit:*" | head -20
```

## Emergency Procedures

### If Compromised:
1. Rotate all secrets immediately
2. Invalidate all sessions
3. Check audit logs for breach extent
4. Enable emergency mode (reject all non-admin requests)
5. Notify users if data exposed

### Emergency Contacts:
- Security Team: security@bidscents.com
- DevOps: devops@bidscents.com
- On-Call: +60-XXX-XXXX

Remember: **Security is not a one-time task but an ongoing process!**