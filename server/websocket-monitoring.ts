// WebSocket monitoring and memory leak prevention

export class WebSocketMonitor {
  private metrics = {
    connectionsTotal: 0,
    connectionsActive: 0,
    messagesReceived: 0,
    messagesSent: 0,
    errors: 0,
    bytesReceived: 0,
    bytesSent: 0,
    reconnections: 0,
    memoryUsage: {} as NodeJS.MemoryUsage
  };

  private clientMetrics = new Map<string, ClientMetrics>();
  private readonly MAX_CLIENT_HISTORY = 1000;
  private readonly METRICS_INTERVAL = 60000; // 1 minute

  interface ClientMetrics {
    userId: string;
    connectedAt: number;
    messagesReceived: number;
    messagesSent: number;
    bytesReceived: number;
    bytesSent: number;
    errors: number;
    lastActivity: number;
  }

  constructor() {
    // Periodic metrics logging
    setInterval(() => {
      this.logMetrics();
      this.checkMemoryLeaks();
    }, this.METRICS_INTERVAL);
  }

  // Track new connection
  public trackConnection(userId: string) {
    this.metrics.connectionsTotal++;
    this.metrics.connectionsActive++;

    this.clientMetrics.set(userId, {
      userId,
      connectedAt: Date.now(),
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      errors: 0,
      lastActivity: Date.now()
    });

    // Cleanup old metrics to prevent memory leak
    if (this.clientMetrics.size > this.MAX_CLIENT_HISTORY) {
      this.cleanupOldMetrics();
    }
  }

  // Track disconnection
  public trackDisconnection(userId: string) {
    this.metrics.connectionsActive--;
    const client = this.clientMetrics.get(userId);
    
    if (client) {
      // Log session summary
      const sessionDuration = Date.now() - client.connectedAt;
      console.log(`Session summary for ${userId}:`, {
        duration: sessionDuration,
        messages: client.messagesReceived + client.messagesSent,
        bytes: client.bytesReceived + client.bytesSent,
        errors: client.errors
      });
    }
  }

  // Track message
  public trackMessage(userId: string, direction: 'in' | 'out', bytes: number) {
    const client = this.clientMetrics.get(userId);
    if (!client) return;

    if (direction === 'in') {
      this.metrics.messagesReceived++;
      this.metrics.bytesReceived += bytes;
      client.messagesReceived++;
      client.bytesReceived += bytes;
    } else {
      this.metrics.messagesSent++;
      this.metrics.bytesSent += bytes;
      client.messagesSent++;
      client.bytesSent += bytes;
    }

    client.lastActivity = Date.now();
  }

  // Track error
  public trackError(userId: string, error: any) {
    this.metrics.errors++;
    const client = this.clientMetrics.get(userId);
    if (client) {
      client.errors++;
    }

    console.error(`WebSocket error for ${userId}:`, error);
  }

  // Memory leak detection
  private checkMemoryLeaks() {
    const usage = process.memoryUsage();
    this.metrics.memoryUsage = usage;

    // Check for increasing memory usage
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > 500) {
      console.warn(`High memory usage detected: ${heapUsedMB.toFixed(2)}MB`);
      
      // Force garbage collection if available
      if (global.gc) {
        console.log('Running garbage collection...');
        global.gc();
      }
    }

    // Check for inactive connections
    const now = Date.now();
    const INACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    for (const [userId, metrics] of this.clientMetrics.entries()) {
      if (now - metrics.lastActivity > INACTIVE_THRESHOLD) {
        console.warn(`Inactive connection detected: ${userId}`);
      }
    }
  }

  // Cleanup old metrics
  private cleanupOldMetrics() {
    const entries = Array.from(this.clientMetrics.entries());
    entries.sort((a, b) => a[1].connectedAt - b[1].connectedAt);
    
    // Remove oldest 10%
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.clientMetrics.delete(entries[i][0]);
    }
  }

  // Log metrics
  private logMetrics() {
    console.log('WebSocket Metrics:', {
      connections: {
        total: this.metrics.connectionsTotal,
        active: this.metrics.connectionsActive
      },
      messages: {
        received: this.metrics.messagesReceived,
        sent: this.metrics.messagesSent
      },
      bandwidth: {
        received: `${(this.metrics.bytesReceived / 1024 / 1024).toFixed(2)}MB`,
        sent: `${(this.metrics.bytesSent / 1024 / 1024).toFixed(2)}MB`
      },
      errors: this.metrics.errors,
      memory: {
        heapUsed: `${(this.metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        external: `${(this.metrics.memoryUsage.external / 1024 / 1024).toFixed(2)}MB`
      }
    });
  }

  // Get current metrics
  public getMetrics() {
    return {
      ...this.metrics,
      clientCount: this.clientMetrics.size
    };
  }
}

// Connection pool to prevent resource exhaustion
export class ConnectionPool {
  private pools = new Map<string, Set<any>>();
  private readonly MAX_POOL_SIZE = 1000;
  private readonly MAX_CONNECTIONS_PER_IP = 10;

  public canAcceptConnection(ip: string): boolean {
    const pool = this.pools.get(ip) || new Set();
    return pool.size < this.MAX_CONNECTIONS_PER_IP;
  }

  public addConnection(ip: string, connection: any): boolean {
    if (!this.canAcceptConnection(ip)) {
      return false;
    }

    if (!this.pools.has(ip)) {
      this.pools.set(ip, new Set());
    }

    this.pools.get(ip)!.add(connection);
    return true;
  }

  public removeConnection(ip: string, connection: any) {
    const pool = this.pools.get(ip);
    if (pool) {
      pool.delete(connection);
      if (pool.size === 0) {
        this.pools.delete(ip);
      }
    }
  }

  public getTotalConnections(): number {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.size;
    }
    return total;
  }
}