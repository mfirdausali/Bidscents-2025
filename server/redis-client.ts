import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

/**
 * Redis client configuration for BidScents distributed security stores
 * Provides connection pooling, error handling, and health monitoring
 */

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | void;
}

export class RedisClient extends EventEmitter {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private readonly reconnectDelay: number = 5000; // 5 seconds
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly config: RedisConfig;

  constructor(config: RedisConfig = {}) {
    super();
    
    // Default configuration
    this.config = {
      url: config.url || process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: config.keyPrefix || 'bidscents:',
      enableReadyCheck: config.enableReadyCheck !== false,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      ...config
    };

    // Create Redis client
    this.client = createClient({
      url: this.config.url,
      socket: {
        reconnectStrategy: this.config.retryStrategy || this.defaultRetryStrategy.bind(this)
      }
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Default retry strategy with exponential backoff
   */
  private defaultRetryStrategy(retries: number): number | void {
    if (retries > this.maxReconnectAttempts) {
      console.error('[Redis] Max reconnection attempts reached. Giving up.');
      this.emit('max-retries-reached');
      return;
    }

    const delay = Math.min(retries * 1000, this.reconnectDelay);
    console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries}/${this.maxReconnectAttempts})`);
    return delay;
  }

  /**
   * Set up Redis event handlers
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connect');
    });

    this.client.on('ready', () => {
      console.log('[Redis] Redis client ready');
      this.emit('ready');
      this.startHealthCheck();
    });

    this.client.on('error', (err) => {
      console.error('[Redis] Redis client error:', err);
      this.emit('error', err);
    });

    this.client.on('end', () => {
      console.log('[Redis] Redis connection closed');
      this.isConnected = false;
      this.stopHealthCheck();
      this.emit('disconnect');
    });

    this.client.on('reconnecting', () => {
      this.reconnectAttempts++;
      console.log(`[Redis] Reconnecting... (attempt ${this.reconnectAttempts})`);
      this.emit('reconnecting', this.reconnectAttempts);
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('[Redis] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis gracefully
   */
  async disconnect(): Promise<void> {
    try {
      this.stopHealthCheck();
      await this.client.quit();
      console.log('[Redis] Disconnected gracefully');
    } catch (error) {
      console.error('[Redis] Error during disconnect:', error);
      // Force disconnect if graceful quit fails
      await this.client.disconnect();
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.ping();
      } catch (error) {
        console.error('[Redis] Health check failed:', error);
        this.emit('health-check-failed', error);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop health check monitoring
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client.isReady;
  }

  /**
   * Get the raw Redis client for advanced operations
   */
  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Execute Redis command with error handling
   */
  async execute<T>(operation: () => Promise<T>): Promise<T | null> {
    if (!this.isReady()) {
      console.error('[Redis] Client not ready for operation');
      return null;
    }

    try {
      return await operation();
    } catch (error) {
      console.error('[Redis] Operation failed:', error);
      this.emit('operation-error', error);
      return null;
    }
  }

  /**
   * Get server info for monitoring
   */
  async getInfo(): Promise<string | null> {
    return this.execute(() => this.client.info());
  }

  /**
   * Get memory usage statistics
   */
  async getMemoryStats(): Promise<Record<string, any> | null> {
    const info = await this.getInfo();
    if (!info) return null;

    const stats: Record<string, any> = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line.startsWith('used_memory:')) {
        const [, value] = line.split(':');
        stats.usedMemory = parseInt(value);
      } else if (line.startsWith('used_memory_human:')) {
        const [, value] = line.split(':');
        stats.usedMemoryHuman = value;
      } else if (line.startsWith('used_memory_peak:')) {
        const [, value] = line.split(':');
        stats.usedMemoryPeak = parseInt(value);
      } else if (line.startsWith('connected_clients:')) {
        const [, value] = line.split(':');
        stats.connectedClients = parseInt(value);
      }
    }

    return stats;
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('flushAll is disabled in production');
    }
    await this.client.flushAll();
  }

  /**
   * Get key prefix for namespacing
   */
  getKeyPrefix(): string {
    return this.config.keyPrefix || 'bidscents:';
  }

  /**
   * Create a prefixed key
   */
  createKey(...parts: string[]): string {
    return this.getKeyPrefix() + parts.join(':');
  }
}

// Singleton instance
let redisClient: RedisClient | null = null;

/**
 * Get or create Redis client singleton
 */
export function getRedisClient(config?: RedisConfig): RedisClient {
  if (!redisClient) {
    redisClient = new RedisClient(config);
  }
  return redisClient;
}

/**
 * Initialize Redis connection
 */
export async function initializeRedis(config?: RedisConfig): Promise<RedisClient> {
  const client = getRedisClient(config);
  
  if (!client.isReady()) {
    await client.connect();
  }
  
  return client;
}

/**
 * Gracefully shutdown Redis connection
 */
export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.disconnect();
    redisClient = null;
  }
}

// Export types
export type { RedisClientType };