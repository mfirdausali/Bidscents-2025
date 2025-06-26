import { initializeRedis, shutdownRedis, getRedisClient } from './redis-client';
import { getRateLimitStore, getSessionStore } from './redis-stores';

/**
 * Initialize Redis for BidScents security stores
 * This module handles Redis connection setup and graceful shutdown
 */

export interface RedisInitOptions {
  url?: string;
  skipConnectionTest?: boolean;
  enableHealthCheck?: boolean;
}

let isInitialized = false;

/**
 * Initialize Redis connection and stores
 */
export async function initializeRedisStores(options: RedisInitOptions = {}): Promise<boolean> {
  if (isInitialized) {
    console.log('[Redis] Already initialized');
    return true;
  }

  console.log('[Redis] Initializing Redis connection...');

  try {
    // Initialize Redis client
    const redis = await initializeRedis({
      url: options.url || process.env.REDIS_URL,
      keyPrefix: 'bidscents:'
    });

    // Test connection
    if (!options.skipConnectionTest) {
      const pong = await redis.ping();
      console.log('[Redis] Connection test successful:', pong);
    }

    // Initialize stores
    const rateLimitStore = getRateLimitStore();
    const sessionStore = getSessionStore();

    // Log memory stats
    const stats = await redis.getMemoryStats();
    if (stats) {
      console.log('[Redis] Memory stats:', {
        usedMemory: stats.usedMemoryHuman,
        connectedClients: stats.connectedClients
      });
    }

    // Set up error handlers
    redis.on('error', (error) => {
      console.error('[Redis] Client error:', error);
    });

    redis.on('disconnect', () => {
      console.warn('[Redis] Disconnected from Redis');
      isInitialized = false;
    });

    redis.on('reconnecting', (attempts) => {
      console.log(`[Redis] Reconnecting... (attempt ${attempts})`);
    });

    redis.on('ready', () => {
      console.log('[Redis] Ready for operations');
      isInitialized = true;
    });

    isInitialized = true;
    console.log('[Redis] Initialization complete');
    return true;

  } catch (error) {
    console.error('[Redis] Failed to initialize:', error);
    console.warn('[Redis] Application will continue with in-memory fallback');
    
    // Don't throw error - let the app continue with fallback
    return false;
  }
}

/**
 * Gracefully shutdown Redis connections
 */
export async function shutdownRedisStores(): Promise<void> {
  if (!isInitialized) {
    console.log('[Redis] Not initialized, skipping shutdown');
    return;
  }

  console.log('[Redis] Shutting down Redis connections...');

  try {
    await shutdownRedis();
    isInitialized = false;
    console.log('[Redis] Shutdown complete');
  } catch (error) {
    console.error('[Redis] Error during shutdown:', error);
  }
}

/**
 * Get Redis health status
 */
export async function getRedisHealth(): Promise<{
  connected: boolean;
  initialized: boolean;
  memory?: any;
  error?: string;
}> {
  try {
    const redis = getRedisClient();
    const isReady = redis.isReady();
    
    if (!isReady) {
      return {
        connected: false,
        initialized: isInitialized,
        error: 'Redis client not ready'
      };
    }

    const stats = await redis.getMemoryStats();
    
    return {
      connected: true,
      initialized: isInitialized,
      memory: stats
    };
  } catch (error) {
    return {
      connected: false,
      initialized: isInitialized,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Middleware to check Redis health
 */
export async function redisHealthCheck(req: any, res: any, next: any): Promise<void> {
  const health = await getRedisHealth();
  
  if (!health.connected) {
    console.warn('[Redis] Health check failed - using fallback storage');
  }
  
  // Add health status to request for debugging
  req.redisHealth = health;
  
  next();
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('[Redis] Received SIGINT, shutting down...');
  await shutdownRedisStores();
});

process.on('SIGTERM', async () => {
  console.log('[Redis] Received SIGTERM, shutting down...');
  await shutdownRedisStores();
});

export { isInitialized as isRedisInitialized };