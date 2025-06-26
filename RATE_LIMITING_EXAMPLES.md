# Rate Limiting Implementation Examples

This file shows concrete examples of how to apply rate limiters to various endpoints in `server/routes.ts`.

## Step 1: Import All Rate Limiters

Add this import statement at the top of `server/routes.ts` after other imports:

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

## Step 2: Apply Rate Limiters to Endpoints

### Authentication Endpoints

```typescript
// BEFORE:
app.post('/api/auth/sync-oauth-user', async (req, res) => {

// AFTER:
app.post('/api/auth/sync-oauth-user', authLimiter, async (req, res) => {
```

### Password Reset Endpoints

```typescript
// BEFORE:
app.post("/api/update-password", async (req, res) => {

// AFTER:
app.post("/api/update-password", passwordResetLimiter, async (req, res) => {

// BEFORE:
app.get('/api/verify-email', authRoutes.verifyEmail);

// AFTER:
app.get('/api/verify-email', passwordResetLimiter, authRoutes.verifyEmail);
```

### Resource Creation Endpoints

```typescript
// BEFORE:
app.post("/api/products", validateCSRF, async (req, res, next) => {

// AFTER:
app.post("/api/products", resourceCreationLimiter, validateCSRF, async (req, res, next) => {

// BEFORE:
app.post("/api/auctions", validateCSRF, async (req, res, next) => {

// AFTER:
app.post("/api/auctions", resourceCreationLimiter, validateCSRF, async (req, res, next) => {
```

### Review Endpoints

```typescript
// BEFORE:
app.post("/api/reviews", async (req, res, next) => {

// AFTER:
app.post("/api/reviews", reviewLimiter, async (req, res, next) => {

// BEFORE:
app.post("/api/messages/submit-review/:messageId", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {

// AFTER:
app.post("/api/messages/submit-review/:messageId", reviewLimiter, validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {
```

### Payment Endpoints

```typescript
// BEFORE:
app.post("/api/boost/create-order", 

// AFTER:
app.post("/api/boost/create-order", paymentLimiter,

// BEFORE:
app.get('/api/payments/billplz/redirect', async (req, res) => {

// AFTER:
app.get('/api/payments/billplz/redirect', paymentLimiter, async (req, res) => {
```

### Webhook Endpoints

```typescript
// BEFORE:
app.post('/api/payments/billplz/webhook', async (req, res) => {

// AFTER:
app.post('/api/payments/billplz/webhook', webhookLimiter, async (req, res) => {

// BEFORE:
app.post('/api/boost/webhook', 

// AFTER:
app.post('/api/boost/webhook', webhookLimiter,
```

### File Upload Endpoints

```typescript
// BEFORE:
app.post("/api/products/:id/images", imageUpload.single('image'), async (req, res, next) => {

// AFTER:
app.post("/api/products/:id/images", fileUploadLimiter, imageUpload.single('image'), async (req, res, next) => {

// BEFORE:
app.post("/api/messages/upload-file", validateCSRF, requireAuth, messageFileUpload.single('file'), async (req: AuthenticatedRequest, res, next) => {

// AFTER:
app.post("/api/messages/upload-file", messageFileLimiter, validateCSRF, requireAuth, messageFileUpload.single('file'), async (req: AuthenticatedRequest, res, next) => {
```

### Profile Image Endpoints

```typescript
// BEFORE:
app.post("/api/user/avatar", imageUpload.single('image'), async (req, res, next) => {

// AFTER:
app.post("/api/user/avatar", profileImageLimiter, imageUpload.single('image'), async (req, res, next) => {

// BEFORE:
app.post("/api/user/cover", imageUpload.single('image'), async (req, res, next) => {

// AFTER:
app.post("/api/user/cover", profileImageLimiter, imageUpload.single('image'), async (req, res, next) => {
```

### Public Read Endpoints

```typescript
// BEFORE:
app.get("/api/products", async (req, res, next) => {

// AFTER:
app.get("/api/products", publicReadLimiter, async (req, res, next) => {

// BEFORE:
app.get("/api/products/:id", async (req, res, next) => {

// AFTER:
app.get("/api/products/:id", publicReadLimiter, async (req, res, next) => {

// BEFORE:
app.get("/api/categories", async (_req, res, next) => {

// AFTER:
app.get("/api/categories", publicReadLimiter, async (_req, res, next) => {
```

### Authenticated Read Endpoints

```typescript
// BEFORE:
app.get("/api/messages", requireAuth, async (req: AuthenticatedRequest, res, next) => {

// AFTER:
app.get("/api/messages", authenticatedReadLimiter, requireAuth, async (req: AuthenticatedRequest, res, next) => {

// BEFORE:
app.get("/api/seller/products", async (req, res, next) => {

// AFTER:
app.get("/api/seller/products", authenticatedReadLimiter, async (req, res, next) => {

// BEFORE:
app.get("/api/cart", async (req, res, next) => {

// AFTER:
app.get("/api/cart", cartLimiter, async (req, res, next) => {
```

### Admin Endpoints

```typescript
// BEFORE:
app.patch("/api/admin/users/:id/ban", async (req, res, next) => {

// AFTER:
app.patch("/api/admin/users/:id/ban", adminLimiter, async (req, res, next) => {

// BEFORE:
app.get("/api/admin/orders", async (req, res, next) => {

// AFTER:
app.get("/api/admin/orders", adminLimiter, async (req, res, next) => {
```

### Specialized Endpoints

```typescript
// Bidding endpoint
// BEFORE:
app.put("/api/auctions/:id", async (req, res, next) => {

// AFTER:
app.put("/api/auctions/:id", biddingLimiter, async (req, res, next) => {

// Social preview endpoints
// BEFORE:
app.get("/social/seller/:id", generateSellerPreview);

// AFTER:
app.get("/social/seller/:id", socialPreviewLimiter, generateSellerPreview);

// BEFORE:
app.get('/social-preview.jpg', (req, res) => {

// AFTER:
app.get('/social-preview.jpg', socialPreviewLimiter, (req, res) => {
```

### Messaging Endpoints

```typescript
// BEFORE:
app.post("/api/messages/action/confirm", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {

// AFTER:
app.post("/api/messages/action/confirm", messagingLimiter, validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {

// BEFORE:
app.post("/api/messages/mark-read", validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {

// AFTER:
app.post("/api/messages/mark-read", messagingLimiter, validateCSRF, requireAuth, async (req: AuthenticatedRequest, res, next) => {
```

### General API Endpoints

```typescript
// BEFORE:
app.get("/api/version", (req, res) => {

// AFTER:
app.get("/api/version", apiLimiter, (req, res) => {

// BEFORE:
app.get('/api/csrf-token', getCSRFTokenEndpoint);

// AFTER:
app.get('/api/csrf-token', apiLimiter, getCSRFTokenEndpoint);

// BEFORE:
app.patch("/api/user/:id", async (req, res, next) => {

// AFTER:
app.patch("/api/user/:id", apiLimiter, async (req, res, next) => {
```

## Complete List of Endpoints to Update

Here's a checklist of all endpoints that need rate limiting added:

- [ ] `GET /api/version` → `apiLimiter`
- [ ] `POST /api/auth/sync-oauth-user` → `authLimiter`
- [ ] `GET /api/verify-email` → `passwordResetLimiter`
- [ ] `GET /api/csrf-token` → `apiLimiter`
- [ ] `POST /api/payments/billplz/webhook` → `webhookLimiter`
- [ ] `GET /api/payments/billplz/redirect` → `paymentLimiter`
- [ ] `GET /social/seller/:id` → `socialPreviewLimiter`
- [ ] `PATCH /api/user/:id` → `apiLimiter`
- [ ] `POST /api/update-password` → `passwordResetLimiter`
- [ ] `GET /social-preview.jpg` → `socialPreviewLimiter`
- [ ] `POST /api/user/avatar` → `profileImageLimiter`
- [ ] `POST /api/user/cover` → `profileImageLimiter`
- [ ] `GET /api/categories` → `publicReadLimiter`
- [ ] `POST /api/boost/create-order` → `paymentLimiter` & `boostLimiter`
- [ ] `POST /api/boost/webhook` → `webhookLimiter`
- [ ] `GET /api/boost/orders/:orderId` → `authenticatedReadLimiter`
- [ ] `GET /api/products` → `publicReadLimiter` (or `searchLimiter` if search query)
- [ ] `GET /api/products/all` → `publicReadLimiter`
- [ ] `GET /api/products/featured` → `publicReadLimiter`
- [ ] `GET /api/products/:id` → `publicReadLimiter`
- [ ] `POST /api/products` → `resourceCreationLimiter`
- [ ] `PUT /api/products/:id` → `apiLimiter`
- [ ] `PUT /api/auctions/:id` → `biddingLimiter`
- [ ] `POST /api/auctions` → `resourceCreationLimiter`
- [ ] `GET /api/auctions` → `publicReadLimiter` (or `searchLimiter` if search query)
- [ ] `GET /api/auctions/product/:productId` → `publicReadLimiter`
- [ ] `GET /api/auctions/:id/basic` → `publicReadLimiter`
- [ ] `DELETE /api/products/:id` → `apiLimiter`
- [ ] `GET /api/products/:id/images` → `publicReadLimiter`
- [ ] `POST /api/products/:id/images` → `fileUploadLimiter`
- [ ] `DELETE /api/products/:productId/images/:imageId` → `apiLimiter`
- [ ] `GET /api/cart` → `cartLimiter`
- [ ] `GET /api/products/:id/reviews` → `publicReadLimiter`
- [ ] `POST /api/reviews` → `reviewLimiter`
- [ ] `GET /api/seller/products` → `authenticatedReadLimiter`
- [ ] `GET /api/sellers/:id` → `publicReadLimiter`
- [ ] `GET /api/sellers/:id/reviews` → `publicReadLimiter`
- [ ] `GET /api/sellers/:id/products` → `publicReadLimiter`
- [ ] `PATCH /api/admin/users/:id/ban` → `adminLimiter`
- [ ] `GET /api/admin/orders` → `adminLimiter`
- [ ] `PATCH /api/admin/orders/:id/status` → `adminLimiter`
- [ ] `POST /api/admin/products/:id/remove` → `adminLimiter`
- [ ] `POST /api/messages/upload-file` → `messageFileLimiter`
- [ ] `GET /api/message-files/:fileId` → `apiLimiter`
- [ ] `GET /api/images/:imageId` → `apiLimiter`
- [ ] `POST /api/product-images` → `resourceCreationLimiter`
- [ ] `POST /api/product-images/:id/upload` → `fileUploadLimiter`
- [ ] `GET /api/messages` → `authenticatedReadLimiter`
- [ ] `GET /api/messages/conversation/:userId` → `authenticatedReadLimiter`
- [ ] `POST /api/messages/action/confirm` → `messagingLimiter`
- [ ] `POST /api/messages/submit-review/:messageId` → `reviewLimiter`
- [ ] `POST /api/messages/mark-read` → `messagingLimiter`
- [ ] `GET /api/messages/unread-count` → `authenticatedReadLimiter`
- [ ] `GET /api/auctions` (duplicate?) → `publicReadLimiter`
- [ ] `GET /api/auctions/:id` (duplicate?) → `publicReadLimiter`
- [ ] `POST /api/v1/auth/logout` → `apiLimiter`
- [ ] `GET /api/v1/auth/check-orphaned` → `apiLimiter`
- [ ] `POST /api/v1/auth/repair-orphaned` → `apiLimiter`

## Testing Your Implementation

After applying rate limiters, test them using this simple bash script:

```bash
#!/bin/bash

# Test auth rate limit (should fail after 5 attempts)
echo "Testing auth rate limit..."
for i in {1..7}; do
  echo "Attempt $i:"
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/auth/session \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
  echo ""
done

# Test public read rate limit (should work for 200 requests)
echo -e "\n\nTesting public read rate limit..."
for i in {1..5}; do
  echo "Request $i:"
  curl -s -I http://localhost:3000/api/products | grep -E "(HTTP|RateLimit)"
done
```

## Important Notes

1. **Order Matters**: Always place rate limiters before other middleware like `validateCSRF` or `requireAuth`.

2. **Multiple Limiters**: Some endpoints may benefit from multiple rate limiters:
   ```typescript
   app.post("/api/boost/create-order", paymentLimiter, boostLimiter, async (req, res, next) => {
   ```

3. **Conditional Rate Limiting**: For search endpoints, apply different limiters based on query parameters:
   ```typescript
   app.get("/api/products", async (req, res, next) => {
     const limiter = req.query.search ? searchLimiter : publicReadLimiter;
     limiter(req, res, () => {
       // Your existing endpoint logic here
     });
   });
   ```

4. **Monitor Performance**: After implementing rate limiting, monitor server performance and adjust limits as needed.