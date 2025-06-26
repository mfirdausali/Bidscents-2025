# Rate Limiting Implementation Guide for BidScents

## Overview
This guide provides instructions for applying comprehensive rate limiting to all BidScents API endpoints. The rate limiting strategy is designed to protect against various types of abuse while maintaining good user experience.

## Rate Limiting Categories

### 1. Authentication Endpoints (Strict Limits)
- **Limiter**: `authLimiter`
- **Limit**: 5 requests per 15 minutes
- **Endpoints**:
  - `POST /api/v1/auth/session` ✓ (already implemented)
  - `POST /api/auth/sync-oauth-user`

### 2. Password & Account Recovery (Moderate Limits)
- **Limiter**: `passwordResetLimiter`
- **Limit**: 3 requests per hour
- **Endpoints**:
  - `POST /api/v1/auth/recover-profile` ✓ (already implemented)
  - `POST /api/update-password`
  - `GET /api/verify-email`

### 3. User Lookup (Strict Limits)
- **Limiter**: `userLookupLimiter`
- **Limit**: 10 requests per 15 minutes
- **Endpoints**:
  - `GET /api/v1/auth/lookup-email` ✓ (already implemented)
  - `POST /api/v1/auth/lookup-email` ✓ (already implemented)

### 4. Resource Creation (Moderate Limits)
- **Limiter**: `resourceCreationLimiter`
- **Limit**: 20 requests per hour per user
- **Endpoints**:
  - `POST /api/products`
  - `POST /api/auctions`
  - `POST /api/product-images`

### 5. Reviews & Ratings
- **Limiter**: `reviewLimiter`
- **Limit**: 10 reviews per day per user
- **Endpoints**:
  - `POST /api/reviews`
  - `POST /api/messages/submit-review/:messageId`

### 6. Payment Operations
- **Limiter**: `paymentLimiter`
- **Limit**: 10 requests per hour per user
- **Endpoints**:
  - `POST /api/boost/create-order`
  - `GET /api/payments/billplz/redirect`

### 7. Webhooks
- **Limiter**: `webhookLimiter`
- **Limit**: 30 requests per minute
- **Endpoints**:
  - `POST /api/payments/billplz/webhook`
  - `POST /api/boost/webhook`

### 8. File Uploads
- **Limiter**: `fileUploadLimiter`
- **Limit**: 50 uploads per hour per user
- **Endpoints**:
  - `POST /api/products/:id/images`
  - `POST /api/product-images/:id/upload`
  - `POST /api/messages/upload-file`

### 9. Profile Images
- **Limiter**: `profileImageLimiter`
- **Limit**: 5 updates per day per user
- **Endpoints**:
  - `POST /api/user/avatar`
  - `POST /api/user/cover`

### 10. Messaging
- **Limiter**: `messagingLimiter`
- **Limit**: 30 messages per minute per user
- **Endpoints**:
  - `POST /api/messages/action/confirm`
  - `POST /api/messages/mark-read`

### 11. Public Read Operations
- **Limiter**: `publicReadLimiter`
- **Limit**: 200 requests per 15 minutes
- **Endpoints**:
  - `GET /api/products`
  - `GET /api/products/all`
  - `GET /api/products/featured`
  - `GET /api/products/:id`
  - `GET /api/categories`
  - `GET /api/sellers/:id`
  - `GET /api/sellers/:id/products`
  - `GET /api/auctions`
  - `GET /api/auctions/:id`
  - `GET /api/auctions/:id/basic`
  - `GET /api/products/:id/images`
  - `GET /api/products/:id/reviews`
  - `GET /api/sellers/:id/reviews`

### 12. Authenticated Read Operations
- **Limiter**: `authenticatedReadLimiter`
- **Limit**: 300 requests per 15 minutes per user
- **Endpoints**:
  - `GET /api/v1/auth/me`
  - `GET /api/messages`
  - `GET /api/messages/conversation/:userId`
  - `GET /api/messages/unread-count`
  - `GET /api/seller/products`
  - `GET /api/cart`
  - `GET /api/boost/orders/:orderId`

### 13. Admin Operations
- **Limiter**: `adminLimiter`
- **Limit**: 200 requests per 15 minutes
- **Endpoints**:
  - `GET /api/admin/users` ✓ (already implemented)
  - `PATCH /api/admin/users/:id/ban`
  - `GET /api/admin/orders`
  - `PATCH /api/admin/orders/:id/status`
  - `POST /api/admin/products/:id/remove`

### 14. Specialized Operations

#### Auction Bidding
- **Limiter**: `biddingLimiter`
- **Limit**: 20 bids per minute per user
- **Endpoints**:
  - `PUT /api/auctions/:id`

#### Search
- **Limiter**: `searchLimiter`
- **Limit**: 30 searches per minute
- **Endpoints**:
  - `GET /api/products` (when search query is present)
  - `GET /api/auctions` (when search query is present)

#### Boost Operations
- **Limiter**: `boostLimiter`
- **Limit**: 10 operations per hour per user
- **Endpoints**:
  - `GET /api/boost/packages` ✓ (already has apiLimiter)
  - `POST /api/boost/create-order`

#### Cart Operations
- **Limiter**: `cartLimiter`
- **Limit**: 60 operations per minute per user
- **Endpoints**:
  - `GET /api/cart`

#### Social Previews
- **Limiter**: `socialPreviewLimiter`
- **Limit**: 100 requests per hour
- **Endpoints**:
  - `GET /social/seller/:id`
  - `GET /social-preview.jpg`

### 15. General Operations
- **Limiter**: `apiLimiter`
- **Limit**: 100 requests per 15 minutes
- **Endpoints**:
  - `GET /api/version`
  - `GET /api/csrf-token`
  - `PATCH /api/user/:id`
  - `PUT /api/products/:id`
  - `DELETE /api/products/:id`
  - `DELETE /api/products/:productId/images/:imageId`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/check-orphaned`
  - `POST /api/v1/auth/repair-orphaned`
  - `GET /api/auctions/product/:productId`
  - `GET /api/message-files/:fileId`
  - `GET /api/images/:imageId`

## Implementation Steps

### Step 1: Import Rate Limiters
Add this import at the top of `server/routes.ts`:

```typescript
import {
  authLimiter,
  passwordResetLimiter,
  userLookupLimiter,
  resourceCreationLimiter,
  reviewLimiter,
  paymentLimiter,
  webhookLimiter,
  fileUploadLimiter,
  profileImageLimiter,
  messagingLimiter,
  apiLimiter,
  publicReadLimiter,
  authenticatedReadLimiter,
  adminLimiter,
  biddingLimiter,
  searchLimiter,
  boostLimiter,
  cartLimiter,
  socialPreviewLimiter,
  messageFileLimiter
} from './rate-limiter';
```

### Step 2: Apply Rate Limiters to Endpoints

For each endpoint, add the appropriate rate limiter as middleware. Here are examples:

```typescript
// Authentication endpoint
app.post('/api/auth/sync-oauth-user', authLimiter, async (req, res) => {
  // ... existing code
});

// Resource creation endpoint
app.post("/api/products", resourceCreationLimiter, validateCSRF, async (req, res, next) => {
  // ... existing code
});

// Public read endpoint
app.get("/api/products", publicReadLimiter, async (req, res, next) => {
  // ... existing code
});

// Authenticated read endpoint
app.get("/api/messages", authenticatedReadLimiter, requireAuth, async (req: AuthenticatedRequest, res, next) => {
  // ... existing code
});

// File upload endpoint
app.post("/api/products/:id/images", fileUploadLimiter, imageUpload.single('image'), async (req, res, next) => {
  // ... existing code
});

// Payment endpoint
app.post("/api/boost/create-order", paymentLimiter, async (req, res, next) => {
  // ... existing code
});
```

### Step 3: Special Considerations

1. **Search Endpoints**: Apply `searchLimiter` conditionally when search parameters are present:
```typescript
app.get("/api/products", async (req, res, next) => {
  // Apply search limiter if search query exists
  if (req.query.search || req.query.q) {
    searchLimiter(req, res, () => {
      // Continue with request handling
    });
  } else {
    publicReadLimiter(req, res, () => {
      // Continue with request handling
    });
  }
});
```

2. **Authenticated Endpoints**: For endpoints that require authentication, apply the rate limiter before the auth middleware:
```typescript
app.get("/api/messages", authenticatedReadLimiter, requireAuth, async (req, res, next) => {
  // ... existing code
});
```

3. **Multiple Limiters**: Some endpoints may need multiple rate limiters:
```typescript
app.post("/api/messages/upload-file", 
  messagingLimiter, 
  messageFileLimiter, 
  validateCSRF, 
  requireAuth, 
  messageFileUpload.single('file'), 
  async (req, res, next) => {
    // ... existing code
  }
);
```

## Monitoring and Adjustments

1. **Monitor Rate Limit Headers**: Check response headers for rate limit information:
   - `RateLimit-Limit`: Maximum number of requests
   - `RateLimit-Remaining`: Number of requests remaining
   - `RateLimit-Reset`: Time when the limit resets

2. **Log Rate Limit Violations**: Consider adding logging for rate limit violations:
```typescript
const rateLimitLogger = (req, res, next) => {
  if (res.statusCode === 429) {
    console.log(`Rate limit exceeded: ${req.ip} - ${req.path}`);
  }
  next();
};
```

3. **Adjust Limits Based on Usage**: Monitor actual usage patterns and adjust limits as needed to balance security with user experience.

## Testing Rate Limits

Test rate limits using curl or a testing tool:

```bash
# Test auth rate limit (should fail after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/v1/auth/session \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
  echo ""
done

# Check rate limit headers
curl -I http://localhost:3000/api/products
```

## Best Practices

1. **User-Based Limiting**: For authenticated endpoints, use user-based rate limiting to prevent abuse by individual users.

2. **Progressive Delays**: Critical endpoints (auth, payments) include progressive delay handlers that increase wait time for repeat offenders.

3. **Whitelist Trusted IPs**: Consider whitelisting trusted IPs (e.g., payment webhooks) by modifying the key generator:
```typescript
skip: (req) => {
  const trustedIPs = ['webhook.billplz.com'];
  return trustedIPs.includes(req.ip);
}
```

4. **Monitor and Alert**: Set up monitoring to alert when rate limits are frequently hit, which may indicate an attack or need for limit adjustment.

5. **Document Rate Limits**: Include rate limit information in API documentation so legitimate users can design their applications accordingly.