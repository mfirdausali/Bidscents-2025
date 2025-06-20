# Security Configuration Guide

This document outlines the security measures implemented in the Bidscents MFA application and provides guidance for secure deployment.

## Table of Contents
- [Environment Variables](#environment-variables)
- [Security Headers](#security-headers)
- [Authentication](#authentication)
- [Encryption](#encryption)
- [CORS Configuration](#cors-configuration)
- [Dependency Security](#dependency-security)
- [Best Practices](#best-practices)

## Environment Variables

### Required Security Environment Variables

Before deploying the application, you MUST set the following environment variables:

```bash
# Database Configuration
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_KEY="your-supabase-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Client-side Supabase configuration
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"

# Security Keys (REQUIRED - Generate secure keys!)
JWT_SECRET="your-secure-jwt-secret-key-here"
MESSAGE_ENCRYPTION_KEY="your-secure-encryption-key-here"
```

### Generating Secure Keys

```bash
# Generate a secure JWT secret (64 bytes)
openssl rand -hex 64

# Generate a secure encryption key (32 bytes)
openssl rand -hex 32
```

**IMPORTANT**: Never commit real credentials to version control. Use `.env` files locally and secure secret management in production.

## Security Headers

The application implements comprehensive security headers using Helmet.js:

### Content Security Policy (CSP)
- Restricts resource loading to trusted sources
- Prevents XSS attacks
- Configured for production and development environments

### HTTP Strict Transport Security (HSTS)
- Forces HTTPS connections
- Prevents protocol downgrade attacks
- Includes subdomains with preload support

### Additional Headers
- X-Frame-Options: DENY (prevents clickjacking)
- X-Content-Type-Options: nosniff (prevents MIME sniffing)
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: Restricts browser features

## Authentication

### Supabase Authentication
- Email/password authentication with verification
- OAuth providers (Facebook)
- Session management with secure cookies
- Password reset flow with secure tokens

### JWT Token Security
- Short-lived tokens (24 hours default)
- Secure signing with environment-based secret
- Token validation on all protected routes

## Encryption

### Message Encryption
- AES encryption for sensitive messages
- Environment-based encryption keys
- Automatic encryption/decryption for chat messages

### Password Security
- Passwords hashed by Supabase (bcrypt)
- Password reset tokens expire after use
- Minimum password requirements enforced

## CORS Configuration

### Allowed Origins
- Production: Configured via APP_URL environment variable
- Development: Localhost origins allowed
- Credentials included for authenticated requests

### Security Considerations
- Whitelist specific origins in production
- Validate origin headers
- Restrict methods and headers

## Dependency Security

### Regular Updates
```bash
# Check for vulnerable dependencies
npm audit

# Fix vulnerabilities automatically
npm audit fix

# Update dependencies
npm update
```

### Subresource Integrity (SRI)
- All CDN resources include integrity hashes
- Prevents tampering with external scripts
- Fallback to local resources recommended

## Best Practices

### 1. Environment Management
- Use `.env` files for local development
- Use secure secret management in production (e.g., Replit Secrets, AWS Secrets Manager)
- Rotate keys regularly
- Never expose service role keys to client

### 2. API Security
- Validate all input data
- Use parameterized queries to prevent SQL injection
- Implement rate limiting for API endpoints
- Log security events for monitoring

### 3. Client-Side Security
- Never store sensitive data in localStorage
- Use secure cookies for session management
- Validate data on both client and server
- Implement proper error handling without exposing internals

### 4. Payment Security
- Always verify payment webhooks signatures
- Use HTTPS for all payment communications
- Log all payment transactions
- Implement proper error handling for failed payments

### 5. Production Deployment Checklist
- [ ] All environment variables set with secure values
- [ ] NODE_ENV set to "production"
- [ ] Database migrations completed
- [ ] SSL/TLS certificates configured
- [ ] Security headers verified
- [ ] Dependencies updated and audited
- [ ] Logging configured for security events
- [ ] Backup and disaster recovery plan in place

## Security Incident Response

If you discover a security vulnerability:
1. Do not disclose it publicly
2. Email security concerns to the development team
3. Include steps to reproduce the issue
4. Allow time for patching before disclosure

## Compliance

This application implements security measures to help with:
- GDPR compliance (data encryption, privacy controls)
- PCI compliance (no credit card storage, secure payment gateway)
- OWASP Top 10 protection

## Resources

- [OWASP Security Guidelines](https://owasp.org/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/security)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)