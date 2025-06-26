/**
 * Example integration of Redis stores into BidScents server
 * This shows how to update your server/index.ts file
 */

import express from 'express';
import { initializeRedisStores, shutdownRedisStores, getRedisHealth } from './redis-init';

// Import the new Redis-backed modules

import { 
  authLimiter,
  apiLimiter,
  getRateLimitStorageStatus
} from './rate-limiter-redis';

// Example server setup with Redis integration
async function setupServer() {
  const app = express();

  // Initialize Redis stores at startup
  console.log('Initializing Redis stores...');
  const redisReady = await initializeRedisStores({
    url: process.env.REDIS_URL,
    enableHealthCheck: true
  });

  if (redisReady) {
    console.log('✅ Redis stores initialized successfully');
  } else {
    console.warn('⚠️  Redis unavailable - using in-memory fallback');
  }

  // Add middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint with Redis status
  app.get('/api/health', async (req, res) => {
    const redisHealth = await getRedisHealth();
    const rateLimitStatus = getRateLimitStorageStatus();

    res.json({
      status: 'healthy',
      storage: {
        redis: redisHealth,
        rateLimit: rateLimitStatus
      },
      timestamp: new Date().toISOString()
    });
  });

  // CSRF token endpoint

  // Example protected endpoints with Redis-backed security
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    // Login logic here
    res.json({ message: 'Login endpoint with Redis rate limiting' });
  });

  app.get('/api/products', apiLimiter, async (req, res) => {
    // Product listing with Redis rate limiting
    res.json({ products: [] });
  });

  // Example of using session store
  app.post('/api/session/create', async (req, res) => {
    const { getSessionStore } = await import('./redis-stores');
    const sessionStore = getSessionStore();
    
    const sessionId = crypto.randomUUID();
    const sessionData = {
      userId: req.body.userId,
      createdAt: new Date().toISOString()
    };

    await sessionStore.set(sessionId, sessionData);
    res.json({ sessionId });
  });

  // Example of using cache store
  app.get('/api/products/:id', apiLimiter, async (req, res) => {
    const { RedisCacheStore } = await import('./redis-stores');
    const productCache = new RedisCacheStore('api:products:', 300); // 5 min cache

    const product = await productCache.getOrSet(
      req.params.id,
      async () => {
        // Simulate database fetch
        console.log('Cache miss - fetching from database');
        return {
          id: req.params.id,
          name: 'Sample Product',
          price: 99.99
        };
      }
    );

    res.json(product);
  });

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Close Redis connections
    await shutdownRedisStores();
    
    // Close server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start server
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Storage backend: ${redisReady ? 'Redis' : 'In-Memory (Fallback)'}`);
  });

  return server;
}

// Start the server
setupServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

/**
 * Migration checklist for existing server:
 * 
 * 1. Install Redis: npm install redis
 * 
 * 2. Update imports:
 *    - Replace './rate-limiter' with './rate-limiter-redis'
 * 
 * 3. Add Redis initialization at server startup:
 *    await initializeRedisStores()
 * 
 * 4. Add graceful shutdown handling:
 *    await shutdownRedisStores()
 * 
 * 5. Optional: Add health check endpoint to monitor Redis status
 * 
 * 6. Set REDIS_URL environment variable:
 *    - Development: redis://localhost:6379
 *    - Production: Your Redis cloud URL
 * 
 * The system will automatically fallback to in-memory storage if Redis
 * is unavailable, ensuring no downtime during migration.
 */