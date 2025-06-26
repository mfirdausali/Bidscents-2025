import { RedisClient, getRedisClient } from './redis-client';
import crypto from 'crypto';

/**
 * Redis-backed stores for distributed security features in BidScents
 * Replaces in-memory storage with Redis for horizontal scaling
 */

// CSRF protection has been removed from the application
// export interface CSRFTokenData {
//   token: string;
//   createdAt: number;
// }

export interface RateLimitData {
  count: number;
  resetAt: number;
}

// /**
//  * Redis-backed CSRF token store
//  */
// export class RedisCSRFStore {
//   private redis: RedisClient;
//   private readonly keyPrefix = 'csrf:';
//   private readonly tokenExpiry = 3600; // 1 hour in seconds
// 
//   constructor(redis?: RedisClient) {
//     this.redis = redis || getRedisClient();
//   }
// 
//   /**
//    * Generate and store CSRF token
//    */
//   async generateToken(sessionId: string): Promise<string> {
//     const token = crypto.randomBytes(32).toString('hex');
//     const key = this.redis.createKey(this.keyPrefix, sessionId);
//     
//     const tokenData: CSRFTokenData = {
//       token,
//       createdAt: Date.now()
//     };
// 
//     const result = await this.redis.execute(async () => {
//       const client = this.redis.getClient();
//       await client.setEx(key, this.tokenExpiry, JSON.stringify(tokenData));
//       return true;
//     });
// 
//     if (!result) {
//       console.error('[CSRF] Failed to store token in Redis, using in-memory fallback');
//       // Return token anyway for fallback handling
//       return token;
//     }
// 
//     console.log(`[CSRF] Generated token for session: ${sessionId.substring(0, 8)}...`);
//     return token;
//   }
// 
//   /**
//    * Validate CSRF token
//    */
//   async validateToken(sessionId: string, providedToken: string): Promise<boolean> {
//     const key = this.redis.createKey(this.keyPrefix, sessionId);
//     
//     const data = await this.redis.execute(async () => {
//       const client = this.redis.getClient();
//       return await client.get(key);
//     });
// 
//     if (!data) {
//       console.error(`[CSRF] No token found for session: ${sessionId.substring(0, 8)}...`);
//       return false;
//     }
// 
//     try {
//       const tokenData: CSRFTokenData = JSON.parse(data);
//       
//       if (tokenData.token !== providedToken) {
//         console.error(`[CSRF] Invalid token for session: ${sessionId.substring(0, 8)}...`);
//         return false;
//       }
// 
//       console.log(`[CSRF] Valid token for session: ${sessionId.substring(0, 8)}...`);
//       return true;
//     } catch (error) {
//       console.error('[CSRF] Error parsing token data:', error);
//       return false;
//     }
//   }
// 
//   /**
//    * Delete CSRF token
//    */
//   async deleteToken(sessionId: string): Promise<void> {
//     const key = this.redis.createKey(this.keyPrefix, sessionId);
//     
//     await this.redis.execute(async () => {
//       const client = this.redis.getClient();
//       await client.del(key);
//     });
//   }
// 
//   /**
//    * Clean up expired tokens (handled automatically by Redis TTL)
//    */
//   async cleanup(): Promise<void> {
//     // Redis automatically expires keys, so this is a no-op
//     console.log('[CSRF] Cleanup not needed - Redis handles expiration');
//   }
}

/**
 * Redis-backed rate limit store for express-rate-limit
 */
export class RedisRateLimitStore {
  private redis: RedisClient;
  private readonly keyPrefix = 'ratelimit:';

  constructor(redis?: RedisClient) {
    this.redis = redis || getRedisClient();
  }

  /**
   * Increment rate limit counter with sliding window
   */
  async increment(key: string, windowMs: number): Promise<RateLimitData | null> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    return await this.redis.execute(async () => {
      const client = this.redis.getClient();
      const multi = client.multi();
      
      // Remove old entries outside the window
      multi.zRemRangeByScore(redisKey, '-inf', windowStart.toString());
      
      // Add current request
      multi.zAdd(redisKey, { score: now, value: `${now}-${crypto.randomBytes(4).toString('hex')}` });
      
      // Count requests in window
      multi.zCount(redisKey, windowStart.toString(), '+inf');
      
      // Set expiry
      multi.expire(redisKey, Math.ceil(windowMs / 1000));
      
      const results = await multi.exec();
      
      if (!results || results.length < 3) {
        throw new Error('Rate limit transaction failed');
      }

      const count = results[2] as number;
      
      return {
        count,
        resetAt: now + windowMs
      };
    });
  }

  /**
   * Get current rate limit status
   */
  async get(key: string, windowMs: number): Promise<RateLimitData | null> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    const now = Date.now();
    const windowStart = now - windowMs;
    
    return await this.redis.execute(async () => {
      const client = this.redis.getClient();
      const count = await client.zCount(redisKey, windowStart.toString(), '+inf');
      
      return {
        count,
        resetAt: now + windowMs
      };
    });
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<void> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    
    await this.redis.execute(async () => {
      const client = this.redis.getClient();
      await client.del(redisKey);
    });
  }

  /**
   * Create express-rate-limit compatible store
   */
  createExpressStore() {
    return {
      increment: async (key: string, callback: (err: Error | null, current: number, resetTime: Date) => void) => {
        try {
          const result = await this.increment(key, 60000); // Default 1 minute window
          if (result) {
            callback(null, result.count, new Date(result.resetAt));
          } else {
            callback(new Error('Redis operation failed'), 0, new Date());
          }
        } catch (error) {
          callback(error as Error, 0, new Date());
        }
      },
      
      decrement: async (key: string) => {
        // Not typically used in rate limiting
      },
      
      resetKey: async (key: string) => {
        await this.reset(key);
      }
    };
  }
}

/**
 * Redis-backed session store
 */
export class RedisSessionStore {
  private redis: RedisClient;
  private readonly keyPrefix = 'session:';
  private readonly defaultExpiry = 86400; // 24 hours in seconds

  constructor(redis?: RedisClient) {
    this.redis = redis || getRedisClient();
  }

  /**
   * Store session data
   */
  async set(sessionId: string, data: any, expirySeconds?: number): Promise<boolean> {
    const key = this.redis.createKey(this.keyPrefix, sessionId);
    const expiry = expirySeconds || this.defaultExpiry;
    
    const result = await this.redis.execute(async () => {
      const client = this.redis.getClient();
      await client.setEx(key, expiry, JSON.stringify(data));
      return true;
    });

    return result || false;
  }

  /**
   * Get session data
   */
  async get(sessionId: string): Promise<any | null> {
    const key = this.redis.createKey(this.keyPrefix, sessionId);
    
    const data = await this.redis.execute(async () => {
      const client = this.redis.getClient();
      return await client.get(key);
    });

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('[Session] Error parsing session data:', error);
      return null;
    }
  }

  /**
   * Update session expiry
   */
  async touch(sessionId: string, expirySeconds?: number): Promise<boolean> {
    const key = this.redis.createKey(this.keyPrefix, sessionId);
    const expiry = expirySeconds || this.defaultExpiry;
    
    const result = await this.redis.execute(async () => {
      const client = this.redis.getClient();
      return await client.expire(key, expiry);
    });

    return result || false;
  }

  /**
   * Delete session
   */
  async delete(sessionId: string): Promise<void> {
    const key = this.redis.createKey(this.keyPrefix, sessionId);
    
    await this.redis.execute(async () => {
      const client = this.redis.getClient();
      await client.del(key);
    });
  }
}

/**
 * General cache utilities
 */
export class RedisCacheStore {
  private redis: RedisClient;
  private readonly keyPrefix: string;
  private readonly defaultExpiry: number;

  constructor(prefix: string, defaultExpirySeconds: number = 300, redis?: RedisClient) {
    this.redis = redis || getRedisClient();
    this.keyPrefix = prefix;
    this.defaultExpiry = defaultExpirySeconds;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    
    const data = await this.redis.execute(async () => {
      const client = this.redis.getClient();
      return await client.get(redisKey);
    });

    if (!data) return null;

    try {
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`[Cache] Error parsing data for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached value
   */
  async set<T>(key: string, value: T, expirySeconds?: number): Promise<boolean> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    const expiry = expirySeconds || this.defaultExpiry;
    
    const result = await this.redis.execute(async () => {
      const client = this.redis.getClient();
      await client.setEx(redisKey, expiry, JSON.stringify(value));
      return true;
    });

    return result || false;
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    
    await this.redis.execute(async () => {
      const client = this.redis.getClient();
      await client.del(redisKey);
    });
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const redisKey = this.redis.createKey(this.keyPrefix, key);
    
    const result = await this.redis.execute(async () => {
      const client = this.redis.getClient();
      return await client.exists(redisKey);
    });

    return result === 1;
  }

  /**
   * Get or set with factory function
   */
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    expirySeconds?: number
  ): Promise<T | null> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Generate new value
    try {
      const value = await factory();
      await this.set(key, value, expirySeconds);
      return value;
    } catch (error) {
      console.error(`[Cache] Error in factory function for key ${key}:`, error);
      return null;
    }
  }
}

// Export singleton instances
// let csrfStore: RedisCSRFStore | null = null;
let rateLimitStore: RedisRateLimitStore | null = null;
let sessionStore: RedisSessionStore | null = null;

// export function getCSRFStore(): RedisCSRFStore {
//   if (!csrfStore) {
//     csrfStore = new RedisCSRFStore();
//   }
//   return csrfStore;
// }

export function getRateLimitStore(): RedisRateLimitStore {
  if (!rateLimitStore) {
    rateLimitStore = new RedisRateLimitStore();
  }
  return rateLimitStore;
}

export function getSessionStore(): RedisSessionStore {
  if (!sessionStore) {
    sessionStore = new RedisSessionStore();
  }
  return sessionStore;
}