# BidScents API Security Audit Report

Generated on: 2025-06-26

## Executive Summary

This comprehensive security audit reveals several critical vulnerabilities in the BidScents API that require immediate attention. While some security measures are in place, significant gaps exist in CSRF protection, rate limiting, input validation, and authorization checks.

### Critical Findings
- **71% of state-changing endpoints lack CSRF protection**
- **91% of endpoints lack rate limiting**
- **Multiple authorization bypass vulnerabilities**
- **Inconsistent input validation**
- **In-memory security stores vulnerable to DoS**

## 1. CSRF Protection Audit

### Current Implementation
- CSRF tokens stored in memory with 1-hour expiry
- Session identification uses JWT hash or IP+UserAgent fallback
- Validation middleware exists but is inconsistently applied

### Protected Endpoints (8 out of 28 state-changing endpoints)
```
✅ POST /api/products (validateCSRF)
✅ POST /api/auctions (validateCSRF)
✅ POST /api/messages/upload-file (validateCSRF)
✅ POST /api/messages/action/confirm (validateCSRF)
✅ POST /api/messages/submit-review/:messageId (validateCSRF)
✅ POST /api/messages/mark-read (validateCSRF)
✅ POST /api/boost/create-order (validateBoostCSRF)
✅ POST /api/boost/webhook (validateWebhookSignature)
```

### UNPROTECTED State-Changing Endpoints (20 endpoints - CRITICAL)
```
❌ POST /api/v1/auth/session
❌ POST /api/v1/auth/logout
❌ POST /api/v1/auth/recover-profile
❌ POST /api/v1/auth/repair-orphaned
❌ PATCH /api/user/:id
❌ POST /api/update-password
❌ POST /api/user/avatar
❌ POST /api/user/cover
❌ PUT /api/products/:id
❌ PUT /api/auctions/:id
❌ DELETE /api/products/:id
❌ POST /api/products/:id/images
❌ DELETE /api/products/:productId/images/:imageId
❌ POST /api/reviews
❌ PATCH /api/admin/users/:id/ban
❌ PATCH /api/admin/orders/:id/status
❌ POST /api/admin/products/:id/remove
❌ POST /api/auth/sync-oauth-user
❌ POST /api/product-images
❌ POST /api/product-images/:id/upload
```

### CSRF Vulnerabilities
1. **Memory Storage**: CSRF tokens stored in memory are lost on server restart
2. **No Distributed Storage**: Cannot scale across multiple server instances
3. **Predictable Session Fallback**: IP+UserAgent hash is predictable
4. **Missing Double-Submit Cookie Pattern**: No cookie-based validation

### Recommendations
1. Implement CSRF protection on ALL state-changing endpoints
2. Use Redis or database for token storage
3. Implement double-submit cookie pattern
4. Add SameSite cookie attributes
5. Use cryptographically secure session identifiers

## 2. Rate Limiting Analysis

### Current Implementation
- Uses express-rate-limit with in-memory storage
- Only 6 out of 65 endpoints (9%) have rate limiting
- Different limits for different endpoint types

### Rate Limited Endpoints
```
✅ POST /api/v1/auth/session (authLimiter: 5/15min)
✅ POST /api/v1/auth/lookup-email (userLookupLimiter: 10/15min)
✅ GET /api/v1/auth/lookup-email (userLookupLimiter: 10/15min)
✅ POST /api/v1/auth/recover-profile (passwordResetLimiter: 3/hour)
✅ GET /api/boost/packages (apiLimiter: 100/15min)
✅ GET /api/admin/users (adminLimiter: 200/15min)
```

### UNPROTECTED High-Risk Endpoints
```
❌ POST /api/payments/billplz/webhook (payment processing)
❌ POST /api/products (resource creation)
❌ POST /api/auctions (resource creation)
❌ POST /api/reviews (spam potential)
❌ POST /api/messages/* (messaging spam)
❌ DELETE operations (resource deletion)
❌ File upload endpoints
```

### Rate Limiting Vulnerabilities
1. **In-Memory Storage**: Limits reset on server restart
2. **No Distributed Rate Limiting**: Each server instance has separate limits
3. **IP-Based Only**: No user-based rate limiting
4. **Missing Critical Endpoints**: Payment and resource creation unprotected
5. **No Sliding Window**: Fixed window allows burst attacks

### Recommendations
1. Implement Redis-based distributed rate limiting
2. Add rate limiting to ALL endpoints with appropriate limits
3. Implement user-based rate limiting for authenticated endpoints
4. Use sliding window algorithm
5. Add progressive delays for repeated violations

## 3. Input Validation Analysis

### Zod Schema Usage
Found schemas imported but inconsistent usage:
- `insertProductSchema` - Used in POST /api/products
- `insertReviewSchema` - Not found in usage
- `insertMessageSchema` - Not found in usage
- `insertPaymentSchema` - Not found in usage
- `createBoostOrderSchema` - Not found in usage

### Validation Gaps
1. **Manual Parsing**: Many endpoints use manual `parseInt()` without validation
2. **No Schema Validation**: Most endpoints lack Zod schema validation
3. **SQL Injection Risk**: Search parameters directly interpolated in LIKE queries
4. **XSS Vulnerability**: User input not sanitized in many endpoints
5. **File Upload**: Limited validation on file types and sizes

### Vulnerable Patterns Found
```javascript
// Unsafe search parameter handling in storage.ts
const searchTerm = `%${filters.search}%`;  // Direct interpolation
ilike(products.name, searchTerm)

// Manual parsing without validation
const sellerId = parseInt(req.params.id);  // No validation
const page = parseInt(req.query.page);     // Can be NaN
```

### Recommendations
1. Implement Zod validation for ALL endpoints
2. Create reusable validation schemas
3. Sanitize all user inputs
4. Use parameterized queries consistently
5. Implement file upload restrictions

## 4. Authorization & Ownership Checks

### Critical Authorization Issues

#### 1. Seller ID Bypass Vulnerability
Multiple endpoints accept `sellerId` from request body/query instead of authenticated user:
```javascript
// VULNERABLE: Product update accepts sellerId from body
else if (req.body.sellerId) {
  sellerId = req.body.sellerId;  // Allows impersonation
}

// VULNERABLE: Product delete accepts sellerId from query
else if (req.query.sellerId) {
  sellerId = parseInt(req.query.sellerId);  // Allows deletion of others' products
}
```

#### 2. Missing Ownership Verification
- Product updates don't verify current owner
- Auction updates don't verify seller ownership
- Image deletion doesn't verify product ownership
- Review submission doesn't verify purchase history

#### 3. Admin Endpoints
- Admin check exists but uses deprecated `getAuthenticatedUser`
- No role-based access control (RBAC)
- Missing audit logging for admin actions

### Recommendations
1. ALWAYS use authenticated user ID from token
2. Verify resource ownership before modifications
3. Implement proper RBAC system
4. Add audit logging for all admin actions
5. Remove deprecated authentication methods

## 5. Additional Security Concerns

### 1. Webhook Security
- Billplz webhook has signature validation ✅
- Boost webhook has comprehensive validation ✅
- But webhooks are not rate-limited ❌

### 2. File Upload Security
- Basic multer configuration
- Missing virus scanning
- No file type validation beyond MIME
- Storage paths may be predictable

### 3. Authentication Issues
- Mixed authentication systems (deprecated + new)
- JWT tokens without refresh mechanism
- No session invalidation on password change
- No MFA/2FA support

### 4. Encryption & Data Protection
- Message encryption implemented ✅
- But no encryption for sensitive user data
- Payment details logged in plaintext
- No PII data masking

### 5. Error Handling
- Detailed error messages may leak information
- Stack traces exposed in some endpoints
- Database errors not properly sanitized

## Priority Recommendations

### Immediate Actions (Critical)
1. **Add CSRF protection** to all 20 unprotected state-changing endpoints
2. **Fix authorization bypass** in product/auction management endpoints
3. **Implement rate limiting** on payment and resource creation endpoints
4. **Add input validation** schemas for all endpoints

### Short-term (High Priority)
1. Migrate to Redis for CSRF tokens and rate limiting
2. Implement comprehensive Zod validation
3. Add ownership verification middleware
4. Implement audit logging

### Medium-term (Important)
1. Implement RBAC system
2. Add file upload security scanning
3. Implement distributed rate limiting
4. Add monitoring and alerting

### Long-term (Enhancement)
1. Implement 2FA/MFA
2. Add end-to-end encryption for sensitive data
3. Implement API versioning strategy
4. Add comprehensive API documentation

## Specific Endpoint Fixes Required

### 1. Product Management
```javascript
// BEFORE (VULNERABLE):
app.put("/api/products/:id", async (req, res, next) => {
  // Accepts sellerId from body - INSECURE
  else if (req.body.sellerId) {
    sellerId = req.body.sellerId;
  }
});

// AFTER (SECURE):
app.put("/api/products/:id", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const sellerId = req.user.id; // Always use authenticated user
  // Verify ownership
  const product = await storage.getProduct(req.params.id);
  if (product.sellerId !== sellerId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
});
```

### 2. Admin Endpoints
```javascript
// Add proper middleware chain
app.patch("/api/admin/users/:id/ban", 
  adminLimiter,
  requireAuth, 
  requireAdmin,
  validateCSRF,
  auditLog,
  async (req, res, next) => {
    // Implementation
  }
);
```

### 3. File Uploads
```javascript
// Add comprehensive validation
const fileUploadValidation = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    // Check file extension
    // Scan for malware (integrate with ClamAV)
  }
});
```

## Compliance Considerations

### PCI DSS (Payment Card Industry)
- Payment webhooks need better security
- Logging of payment details needs masking
- Rate limiting required for payment endpoints

### GDPR/Data Protection
- User data deletion not properly implemented
- No data export functionality
- Audit trails incomplete

### OWASP Top 10 Coverage
- A01:2021 Broken Access Control ❌
- A02:2021 Cryptographic Failures ⚠️
- A03:2021 Injection ⚠️
- A04:2021 Insecure Design ❌
- A05:2021 Security Misconfiguration ❌
- A07:2021 Identification and Authentication Failures ❌

## Testing Recommendations

1. **Security Testing Suite**
   - Implement OWASP ZAP scanning
   - Add Burp Suite testing
   - Create security test cases

2. **Penetration Testing**
   - Schedule quarterly pen tests
   - Focus on authorization bypasses
   - Test rate limiting effectiveness

3. **Monitoring**
   - Implement security event logging
   - Set up anomaly detection
   - Create security dashboards

## Conclusion

The BidScents API has significant security vulnerabilities that need immediate attention. The most critical issues are:

1. **71% of state-changing endpoints lack CSRF protection**
2. **Authorization bypass vulnerabilities allowing user impersonation**
3. **91% of endpoints lack rate limiting**
4. **Inconsistent input validation creating injection risks**

Implementing the recommended security measures should be prioritized based on risk level and potential impact. Start with the immediate actions to address critical vulnerabilities, then work through the short-term and medium-term recommendations to build a robust security posture.

## Security Contact

For reporting security vulnerabilities, please use responsible disclosure:
- Email: security@bidscents.com
- PGP Key: [Add public key]
- Response time: Within 24 hours