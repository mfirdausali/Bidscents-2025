#!/usr/bin/env node

/**
 * Test script for Redis integration in BidScents
 * Tests CSRF store, rate limiting, and session storage
 */

import { initializeRedisStores, shutdownRedisStores, getRedisHealth } from './server/redis-init.js';
import { getCSRFStore, getRateLimitStore, getSessionStore, RedisCacheStore } from './server/redis-stores.js';
import { getRedisClient } from './server/redis-client.js';

async function testRedisIntegration() {
  console.log('🚀 Testing Redis Integration for BidScents\n');

  try {
    // 1. Initialize Redis
    console.log('1. Initializing Redis connection...');
    const initialized = await initializeRedisStores({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    if (!initialized) {
      console.error('❌ Failed to initialize Redis - running with fallback');
    } else {
      console.log('✅ Redis initialized successfully');
    }

    // 2. Check Redis health
    console.log('\n2. Checking Redis health...');
    const health = await getRedisHealth();
    console.log('Redis health:', JSON.stringify(health, null, 2));

    // 3. Test CSRF Store
    console.log('\n3. Testing CSRF Store...');
    const csrfStore = getCSRFStore();
    
    const sessionId = 'test-session-123';
    const token = await csrfStore.generateToken(sessionId);
    console.log(`✅ Generated CSRF token: ${token.substring(0, 20)}...`);

    const isValid = await csrfStore.validateToken(sessionId, token);
    console.log(`✅ Token validation: ${isValid ? 'PASSED' : 'FAILED'}`);

    const invalidToken = await csrfStore.validateToken(sessionId, 'invalid-token');
    console.log(`✅ Invalid token rejection: ${!invalidToken ? 'PASSED' : 'FAILED'}`);

    await csrfStore.deleteToken(sessionId);
    console.log('✅ Token deleted');

    // 4. Test Rate Limit Store
    console.log('\n4. Testing Rate Limit Store...');
    const rateLimitStore = getRateLimitStore();
    
    const rateLimitKey = 'test-user-456';
    const windowMs = 60000; // 1 minute

    // Simulate multiple requests
    for (let i = 1; i <= 5; i++) {
      const result = await rateLimitStore.increment(rateLimitKey, windowMs);
      if (result) {
        console.log(`Request ${i}: Count = ${result.count}`);
      }
    }

    const status = await rateLimitStore.get(rateLimitKey, windowMs);
    console.log(`✅ Current rate limit status:`, status);

    await rateLimitStore.reset(rateLimitKey);
    console.log('✅ Rate limit reset');

    // 5. Test Session Store
    console.log('\n5. Testing Session Store...');
    const sessionStore = getSessionStore();
    
    const sessionData = {
      userId: 789,
      email: 'test@example.com',
      roles: ['user'],
      createdAt: new Date().toISOString()
    };

    const stored = await sessionStore.set('session-789', sessionData, 300); // 5 min expiry
    console.log(`✅ Session stored: ${stored}`);

    const retrieved = await sessionStore.get('session-789');
    console.log('✅ Session retrieved:', JSON.stringify(retrieved, null, 2));

    const touched = await sessionStore.touch('session-789', 600); // Extend to 10 min
    console.log(`✅ Session expiry extended: ${touched}`);

    await sessionStore.delete('session-789');
    console.log('✅ Session deleted');

    // 6. Test Cache Store
    console.log('\n6. Testing Cache Store...');
    const productCache = new RedisCacheStore('test:products:', 60); // 1 min expiry

    // Test set and get
    await productCache.set('product-123', { id: 123, name: 'Test Product', price: 99.99 });
    const cachedProduct = await productCache.get('product-123');
    console.log('✅ Cached product:', cachedProduct);

    // Test getOrSet with factory
    const product = await productCache.getOrSet(
      'product-456',
      async () => {
        console.log('  Factory function called (cache miss)');
        return { id: 456, name: 'New Product', price: 149.99 };
      },
      120 // 2 min expiry
    );
    console.log('✅ Product from getOrSet:', product);

    // Test cache hit
    const cachedAgain = await productCache.getOrSet(
      'product-456',
      async () => {
        console.log('  Factory function called (should not see this)');
        return null;
      }
    );
    console.log('✅ Product from cache (hit):', cachedAgain);

    // 7. Test Redis Client directly
    console.log('\n7. Testing Redis Client...');
    const redis = getRedisClient();
    
    const pong = await redis.ping();
    console.log(`✅ Redis PING: ${pong}`);

    const memStats = await redis.getMemoryStats();
    if (memStats) {
      console.log('✅ Memory stats:', {
        usedMemory: memStats.usedMemoryHuman,
        connectedClients: memStats.connectedClients
      });
    }

    // 8. Test error handling
    console.log('\n8. Testing error handling...');
    try {
      // Test with invalid session ID
      const result = await csrfStore.validateToken('', 'token');
      console.log('Empty session handling:', !result ? 'PASSED' : 'FAILED');
    } catch (error) {
      console.log('✅ Error properly caught:', error.message);
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\nShutting down Redis connection...');
    await shutdownRedisStores();
    console.log('✅ Redis connection closed');
    process.exit(0);
  }
}

// Run tests
testRedisIntegration().catch(console.error);