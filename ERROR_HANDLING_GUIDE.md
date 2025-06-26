# BidScents Error Handling System

## Overview

The BidScents error handling system provides comprehensive, secure error management for both server and client-side operations. It ensures sensitive information is never leaked while providing detailed debugging information in development.

## Server-Side Error Handling

### Custom Error Classes

Located in `server/errors/custom-errors.ts`, these provide specific error types:

```typescript
// Authentication errors
throw new AuthenticationError('Invalid credentials');
throw new TokenExpiredError();

// Authorization errors  
throw new AuthorizationError('Insufficient permissions');
throw new InsufficientPermissionsError('admin');

// Validation errors
throw new ValidationError('Invalid input');
throw ValidationError.fromZodError(zodError);

// Business logic errors
throw new BusinessRuleError('Cannot bid on own auction');
throw new InsufficientFundsError(100, 50);
throw new AuctionEndedError(auctionId);
throw new BidTooLowError(100, 90);

// Resource errors
throw new NotFoundError('Product', productId);
throw new ConflictError('Email already exists');

// External service errors
throw new PaymentGatewayError('Billplz', 'Payment failed');
throw new StorageServiceError('Upload failed');

// Security errors
throw new SecurityError('Suspicious activity detected');
throw new CSRFError();
```

### Error Handler Middleware

The centralized error handler in `server/error-handler.ts`:

1. **Converts all errors to AppError instances**
2. **Logs errors with full context**
3. **Tracks error metrics**
4. **Detects suspicious patterns**
5. **Returns safe error responses**

### Integration with Routes

```typescript
import { asyncHandler } from './error-handler';
import { ValidationError, NotFoundError } from './errors/custom-errors';

// Wrap async routes
app.post('/api/products', asyncHandler(async (req, res) => {
  // Validation
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw ValidationError.fromZodError(result.error);
  }

  // Business logic
  const product = await storage.getProduct(id);
  if (!product) {
    throw new NotFoundError('Product', id);
  }

  // Response
  res.json({ product });
}));
```

### Error Response Format

All errors return a consistent JSON structure:

```json
{
  "error": {
    "message": "User-friendly error message",
    "code": "ERROR_CODE",
    "statusCode": 400,
    "requestId": "req_abc123",
    "timestamp": "2024-01-01T00:00:00Z",
    "details": {}  // Only in development
  }
}
```

## Client-Side Error Handling

### Error Boundary Component

The `ErrorBoundary` component catches React errors:

```typescript
// Wrap components
<ErrorBoundary>
  <YourComponent />
</ErrorBoundary>

// Or use HOC
export default withErrorBoundary(YourComponent);
```

### Error Pages

Specific error pages for common scenarios:

- `NotFoundPage` - 404 errors
- `ForbiddenPage` - 403 errors  
- `ServerErrorPage` - 500 errors
- `NetworkErrorPage` - Connection errors
- `RateLimitPage` - 429 errors

### Error Handling Utilities

```typescript
import { 
  parseError, 
  showErrorToast, 
  retry,
  errorRecovery 
} from '@/lib/error-handling';

// Parse and display errors
try {
  await api.createProduct(data);
} catch (error) {
  showErrorToast(error);
}

// Retry with exponential backoff
const result = await retry(
  () => api.fetchData(),
  { maxAttempts: 3, backoff: true }
);

// Handle auth errors
const data = await errorRecovery.refreshAuth(
  () => api.getProtectedData()
);
```

## Error Monitoring

### Audit Logger Integration

All errors are logged to the audit system:

```typescript
// Automatic logging for all errors
await auditLogger.logError({
  action: 'ERROR_OCCURRED',
  userId: user?.id || 'anonymous',
  resourceType: 'system',
  details: errorInfo,
  severity: error.statusCode >= 500 ? 'high' : 'medium'
});
```

### Error Metrics

Track error rates and patterns:

```typescript
// Get error metrics
GET /api/admin/errors/metrics

// Response
{
  "VALIDATION_ERROR": {
    "totalCount": 150,
    "ratePerMinute": 5
  },
  "NOT_FOUND": {
    "totalCount": 89,
    "ratePerMinute": 2
  }
}
```

### Suspicious Activity Detection

The system automatically detects:

- High error rates from specific IPs
- Repeated authentication failures
- Unusual error patterns
- Security-related errors

## Security Considerations

### Production vs Development

**Production:**
- Generic error messages for non-operational errors
- No stack traces or sensitive details
- Full audit logging

**Development:**
- Detailed error messages
- Full stack traces
- Request/response details

### Preventing Information Leakage

```typescript
// Bad - Leaks database info
throw new Error('Column users.password_hash not found');

// Good - Safe message
throw new DatabaseError('A database error occurred');
```

### Rate Limiting

Error endpoints are rate-limited to prevent abuse:

```typescript
// 10 requests per minute for error reporting
app.post('/api/client-errors', 
  errorRateLimiter(10, 60000), 
  handleClientError
);
```

## Best Practices

### 1. Use Specific Error Classes

```typescript
// Bad
throw new Error('Invalid bid');

// Good
throw new BidTooLowError(minimumBid, attemptedBid);
```

### 2. Always Use asyncHandler

```typescript
// Bad - Errors won't be caught
app.get('/api/data', async (req, res) => {
  const data = await fetchData(); // May throw
  res.json(data);
});

// Good - Errors are properly handled
app.get('/api/data', asyncHandler(async (req, res) => {
  const data = await fetchData();
  res.json(data);
}));
```

### 3. Validate Early

```typescript
// Validate at the beginning of handlers
const result = schema.safeParse(req.body);
if (!result.success) {
  throw ValidationError.fromZodError(result.error);
}
```

### 4. Log Context

```typescript
// Include relevant context in errors
throw new BusinessRuleError('Insufficient inventory', {
  productId,
  requested: quantity,
  available: stock
});
```

### 5. Handle Client Errors

```typescript
// Report client-side errors
window.addEventListener('error', (event) => {
  fetch('/api/client-errors', {
    method: 'POST',
    body: JSON.stringify({
      message: event.error.message,
      stack: event.error.stack,
      url: window.location.href
    })
  });
});
```

## Testing Error Scenarios

```typescript
// Test error handling
describe('Error Handling', () => {
  it('should return 404 for non-existent resource', async () => {
    const response = await request(app)
      .get('/api/products/999999')
      .expect(404);
      
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should validate input', async () => {
    const response = await request(app)
      .post('/api/products')
      .send({ invalid: 'data' })
      .expect(400);
      
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

## Troubleshooting

### Common Issues

1. **Unhandled Promise Rejections**
   - Always use `asyncHandler` for async routes
   - Add `.catch()` to promise chains

2. **Missing Error Details**
   - Check NODE_ENV is set correctly
   - Verify error is operational

3. **Client Errors Not Logged**
   - Ensure error boundary is properly wrapped
   - Check network requests to `/api/client-errors`

4. **Generic 500 Errors**
   - Look for unhandled error types
   - Check error conversion logic

## Migration Guide

To migrate existing routes:

1. Import error classes and asyncHandler
2. Replace `try/catch` with specific error throws
3. Wrap async handlers with `asyncHandler`
4. Update error responses to use new format
5. Add error boundary to React components

Example migration:

```typescript
// Before
app.post('/api/products', async (req, res) => {
  try {
    if (!req.body.name) {
      return res.status(400).json({ error: 'Name required' });
    }
    const product = await createProduct(req.body);
    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// After
app.post('/api/products', asyncHandler(async (req, res) => {
  const result = productSchema.safeParse(req.body);
  if (!result.success) {
    throw ValidationError.fromZodError(result.error);
  }
  
  const product = await createProduct(result.data);
  res.json(product);
}));
```