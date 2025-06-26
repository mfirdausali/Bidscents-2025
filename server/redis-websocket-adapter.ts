import { WebSocket } from 'ws';
import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';

// Redis-based WebSocket adapter for horizontal scaling
export class RedisWebSocketAdapter extends EventEmitter {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private nodeId: string;
  private localClients = new Map<string, WebSocket>();
  private readonly REDIS_PREFIX = 'bidscents:ws:';

  constructor(redisUrl: string) {
    super();
    this.nodeId = `node-${process.pid}-${Date.now()}`;
    this.initializeRedis(redisUrl);
  }

  private async initializeRedis(redisUrl: string) {
    // Create publisher client
    this.publisher = createClient({ url: redisUrl });
    this.publisher.on('error', (err) => console.error('Redis Publisher Error:', err));
    await this.publisher.connect();

    // Create subscriber client
    this.subscriber = createClient({ url: redisUrl });
    this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
    await this.subscriber.connect();

    // Subscribe to channels
    await this.subscriber.subscribe(this.REDIS_PREFIX + 'broadcast', (message) => {
      this.handleBroadcast(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.REDIS_PREFIX + 'room', (message) => {
      this.handleRoomMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.REDIS_PREFIX + 'direct', (message) => {
      this.handleDirectMessage(JSON.parse(message));
    });

    // Node presence tracking
    await this.registerNode();
    setInterval(() => this.updateNodePresence(), 30000);
  }

  // Register this node in Redis
  private async registerNode() {
    await this.publisher.setEx(
      `${this.REDIS_PREFIX}nodes:${this.nodeId}`,
      60, // 60 second TTL
      JSON.stringify({
        nodeId: this.nodeId,
        timestamp: Date.now(),
        clientCount: this.localClients.size
      })
    );
  }

  private async updateNodePresence() {
    await this.registerNode();
  }

  // Add client to local tracking
  public addClient(userId: string, ws: WebSocket) {
    this.localClients.set(userId, ws);
    
    // Register client in Redis for cross-node lookup
    this.publisher.setEx(
      `${this.REDIS_PREFIX}clients:${userId}`,
      300, // 5 minute TTL
      this.nodeId
    );
  }

  // Remove client
  public removeClient(userId: string) {
    this.localClients.delete(userId);
    this.publisher.del(`${this.REDIS_PREFIX}clients:${userId}`);
  }

  // Broadcast to all connected clients across all nodes
  public async broadcast(data: any) {
    await this.publisher.publish(
      this.REDIS_PREFIX + 'broadcast',
      JSON.stringify({
        nodeId: this.nodeId,
        data,
        timestamp: Date.now()
      })
    );
  }

  // Send to specific room across all nodes
  public async sendToRoom(roomId: string, data: any) {
    await this.publisher.publish(
      this.REDIS_PREFIX + 'room',
      JSON.stringify({
        nodeId: this.nodeId,
        roomId,
        data,
        timestamp: Date.now()
      })
    );
  }

  // Send to specific user (may be on different node)
  public async sendToUser(userId: string, data: any) {
    // Check if user is local
    const localClient = this.localClients.get(userId);
    if (localClient && localClient.readyState === WebSocket.OPEN) {
      localClient.send(JSON.stringify(data));
      return;
    }

    // User might be on another node, publish to Redis
    await this.publisher.publish(
      this.REDIS_PREFIX + 'direct',
      JSON.stringify({
        nodeId: this.nodeId,
        userId,
        data,
        timestamp: Date.now()
      })
    );
  }

  // Handle broadcast from other nodes
  private handleBroadcast(message: any) {
    if (message.nodeId === this.nodeId) return; // Skip own messages

    // Send to all local clients
    this.localClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message.data));
      }
    });
  }

  // Handle room messages from other nodes
  private handleRoomMessage(message: any) {
    if (message.nodeId === this.nodeId) return;

    // This would need room membership tracking
    // For now, simplified implementation
    this.emit('room-message', message);
  }

  // Handle direct messages from other nodes
  private handleDirectMessage(message: any) {
    if (message.nodeId === this.nodeId) return;

    const client = this.localClients.get(message.userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message.data));
    }
  }

  // Auction room management with Redis
  public async joinAuctionRoom(userId: string, auctionId: number) {
    await this.publisher.sAdd(
      `${this.REDIS_PREFIX}auction:${auctionId}:members`,
      userId
    );
    
    // Set expiry on auction room (24 hours after auction ends)
    await this.publisher.expire(
      `${this.REDIS_PREFIX}auction:${auctionId}:members`,
      86400
    );
  }

  public async leaveAuctionRoom(userId: string, auctionId: number) {
    await this.publisher.sRem(
      `${this.REDIS_PREFIX}auction:${auctionId}:members`,
      userId
    );
  }

  // Get all members of an auction room across all nodes
  public async getAuctionRoomMembers(auctionId: number): Promise<string[]> {
    const members = await this.publisher.sMembers(
      `${this.REDIS_PREFIX}auction:${auctionId}:members`
    );
    return members;
  }

  // Distributed rate limiting
  public async checkRateLimit(userId: string, limit: number, window: number): Promise<boolean> {
    const key = `${this.REDIS_PREFIX}ratelimit:${userId}`;
    const current = await this.publisher.incr(key);
    
    if (current === 1) {
      await this.publisher.expire(key, window);
    }
    
    return current <= limit;
  }

  // Cleanup
  public async destroy() {
    await this.publisher.del(`${this.REDIS_PREFIX}nodes:${this.nodeId}`);
    await this.publisher.quit();
    await this.subscriber.quit();
  }
}

// Usage example:
/*
const adapter = new RedisWebSocketAdapter('redis://localhost:6379');

// When a client connects
adapter.addClient(userId, ws);

// Send message to specific user (works across nodes)
adapter.sendToUser(userId, { type: 'notification', message: 'Hello' });

// Broadcast to all users
adapter.broadcast({ type: 'announcement', message: 'Server maintenance' });

// Send to auction room
adapter.sendToRoom(`auction-${auctionId}`, { type: 'bid', amount: 100 });
*/