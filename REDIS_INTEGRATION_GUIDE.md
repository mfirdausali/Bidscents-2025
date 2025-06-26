# Redis Integration Guide for BidScents

This guide explains how to integrate Redis support for distributed security stores in BidScents, replacing in-memory storage for CSRF tokens and rate limiting.

## Overview

The Redis integration provides:
- Distributed CSRF token storage
- Distributed rate limiting across multiple server instances
- Session storage for future use
- Automatic fallback to in-memory storage when Redis is unavailable
- Health monitoring and graceful shutdown

## Installation

1. **Install Redis dependency:**
```bash
npm install redis
```

2. **Set up Redis server:**
   - Local development: `docker run -d -p 6379:6379 redis:alpine`
   - Production: Use Redis Cloud, AWS ElastiCache, or similar

3. **Configure environment variable:**
```env
REDIS_URL=redis://localhost:6379
# or for production with auth:
REDIS_URL=redis://username:password@redis-host:6379
```

## Integration Steps

### 1. Update Server Initialization

In your `server/index.ts`, add Redis initialization:

```typescript
import { initializeRedisStores, shutdownRedisStores } from './redis-init';

// At server startup
async function startServer() {
  // Initialize Redis (continues with fallback if Redis unavailable)
  const redisReady = await initializeRedisStores({
    url: process.env.REDIS_URL,
    enableHealthCheck: true
  });
  
  console.log(`Server starting with ${redisReady ? 'Redis' : 'in-memory'} storage`);
  
  // ... rest of server initialization
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await shutdownRedisStores();
  // ... other cleanup
});
```

### 2. Replace CSRF Protection Import

Update all files that import CSRF protection:

```typescript
// Before:
import { validateCSRF, provideCSRFToken } from './csrf-protection';

// After:
import { validateCSRF, provideCSRFToken } from './csrf-protection-redis';
```

### 3. Replace Rate Limiter Imports

Update all files that import rate limiters:

```typescript
// Before:
import { authLimiter, apiLimiter, ... } from './rate-limiter';

// After:
import { authLimiter, apiLimiter, ... } from './rate-limiter-redis';
```

### 4. Add Health Check Endpoint

Add a Redis health check to your monitoring:

```typescript
import { getRedisHealth } from './redis-init';

app.get('/api/health', async (req, res) => {
  const redisHealth = await getRedisHealth();
  
  res.json({
    status: 'ok',
    redis: redisHealth,
    // ... other health checks
  });
});
```

## Features

### CSRF Protection with Redis

- Tokens stored in Redis with automatic expiration
- Fallback to in-memory storage if Redis is unavailable
- Same API as before - no code changes needed

### Rate Limiting with Redis

- Sliding window algorithm for accurate rate limiting
- Distributed across all server instances
- Automatic fallback to in-memory limiting

### Session Storage

```typescript
import { getSessionStore } from './redis-stores';

const sessionStore = getSessionStore();

// Store session data
await sessionStore.set('session-123', { userId: 456, data: {...} });

// Get session data
const session = await sessionStore.get('session-123');

// Update expiry
await sessionStore.touch('session-123', 3600); // 1 hour
```

### Cache Utilities

```typescript
import { RedisCacheStore } from './redis-stores';

// Create a cache for product data
const productCache = new RedisCacheStore('products:', 300); // 5 min expiry

// Cache with factory function
const product = await productCache.getOrSet(
  `product-${id}`,
  async () => await fetchProductFromDB(id),
  600 // 10 min expiry
);
```

## Monitoring

### Check Storage Status

Both CSRF and rate limiting modules provide status functions:

```typescript
import { getCSRFStorageStatus } from './csrf-protection-redis';
import { getRateLimitStorageStatus } from './rate-limiter-redis';

// Check which storage is being used
const csrfStatus = getCSRFStorageStatus();
console.log(`CSRF using: ${csrfStatus.type}`); // 'redis' or 'memory'

const rateLimitStatus = getRateLimitStorageStatus();
console.log(`Rate limiting using: ${rateLimitStatus.type}`);
```

### Redis Client Events

The Redis client emits events for monitoring:

```typescript
import { getRedisClient } from './redis-client';

const redis = getRedisClient();

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => console.error('Redis error:', err));
redis.on('disconnect', () => console.warn('Redis disconnected'));
redis.on('reconnecting', (attempts) => console.log(`Reconnecting: ${attempts}`));
```

## Testing

### Test Fallback Behavior

```typescript
import { forceMemoryFallback } from './rate-limiter-redis';

// Force memory fallback for testing
forceMemoryFallback(true);

// Run tests...

// Re-enable Redis
forceMemoryFallback(false);
```

### Test Redis Connection

```typescript
import { getRedisClient } from './redis-client';

const redis = getRedisClient();
const pong = await redis.ping();
console.log('Redis ping:', pong); // Should print 'PONG'
```

## Production Considerations

1. **Redis Configuration:**
   - Use Redis persistence (RDB or AOF) for data durability
   - Configure appropriate memory limits
   - Set up Redis replication for high availability

2. **Connection Pooling:**
   - The Redis client handles connection pooling automatically
   - Monitor connection count with `getMemoryStats()`

3. **Security:**
   - Use Redis AUTH in production
   - Enable TLS for Redis connections
   - Use Redis ACL for fine-grained permissions

4. **Monitoring:**
   - Monitor Redis memory usage
   - Set up alerts for connection failures
   - Track fallback usage (indicates Redis issues)

5. **Scaling:**
   - Use Redis Cluster for horizontal scaling
   - Consider Redis Sentinel for automatic failover
   - Implement cache warming strategies

## Troubleshooting

### Redis Connection Failed

If Redis connection fails, the app automatically falls back to in-memory storage:
- Check Redis server is running
- Verify REDIS_URL is correct
- Check network connectivity
- Review Redis logs

### High Memory Usage

- Monitor with `redis-cli INFO memory`
- Adjust key expiration times
- Implement cache eviction policies
- Consider Redis memory optimization

### Performance Issues

- Use Redis pipelining for batch operations
- Implement proper indexing strategies
- Monitor slow queries with Redis SLOWLOG
- Consider using Redis streams for real-time features

## Migration from In-Memory

The system automatically handles migration:
1. When Redis becomes available, new tokens/limits use Redis
2. Existing in-memory data remains until expired
3. No data loss during transition
4. Seamless fallback if Redis fails

## Future Enhancements

1. **Distributed Locks:**
   - Use Redis for distributed locking
   - Implement Redlock algorithm

2. **Pub/Sub Integration:**
   - Replace WebSocket broadcasting with Redis pub/sub
   - Implement event streaming

3. **Advanced Caching:**
   - Implement cache warming
   - Add cache invalidation strategies
   - Use Redis modules (RedisJSON, RedisSearch)

4. **Analytics:**
   - Use Redis for real-time analytics
   - Implement HyperLogLog for unique counts
   - Track user behavior with Redis time series