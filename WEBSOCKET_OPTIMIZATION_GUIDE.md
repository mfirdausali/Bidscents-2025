# WebSocket Performance & Scalability Optimization Guide

## Current Issues Identified

### 1. **Connection Management**
- ❌ No heartbeat/ping-pong mechanism
- ❌ No connection pooling or limits per IP
- ❌ Memory leaks from uncleaned event listeners
- ❌ No automatic cleanup of inactive connections
- ❌ Rate limiting is only for bids, not general messages

### 2. **Message Efficiency**
- ❌ No message batching
- ❌ No compression for large payloads
- ❌ All messages sent immediately without throttling
- ❌ No deduplication of events
- ❌ Large auction updates sent to all room members

### 3. **Scalability Issues**
- ❌ Single-server architecture
- ❌ In-memory state (clients, rooms, rate limits)
- ❌ No horizontal scaling capability
- ❌ Memory usage grows with connections
- ❌ No connection distribution

### 4. **Error Handling**
- ⚠️ Basic error handling exists but no recovery
- ❌ No circuit breaker pattern
- ❌ No graceful degradation
- ❌ Connection errors not properly tracked

## Recommended Optimizations

### Phase 1: Immediate Improvements (1-2 days)

1. **Add Heartbeat Mechanism**
```typescript
// In server/routes.ts, add to WebSocket setup:
const HEARTBEAT_INTERVAL = 30000;
const clients = new Map<WebSocket, { 
  userId: number; 
  username: string; 
  isAlive: boolean;
  lastPing: number;
}>();

// Heartbeat interval
setInterval(() => {
  wss.clients.forEach((ws: WebSocket) => {
    const client = clients.get(ws);
    if (!client) return;
    
    if (!client.isAlive) {
      ws.terminate();
      return;
    }
    
    client.isAlive = false;
    client.lastPing = Date.now();
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// In connection handler:
ws.on('pong', () => {
  const client = clients.get(ws);
  if (client) {
    client.isAlive = true;
  }
});
```

2. **Implement Message Batching**
```typescript
// Add message queue per client
const messageQueues = new Map<WebSocket, any[]>();
const flushTimers = new Map<WebSocket, NodeJS.Timeout>();

function queueMessage(ws: WebSocket, message: any) {
  if (!messageQueues.has(ws)) {
    messageQueues.set(ws, []);
  }
  
  messageQueues.get(ws)!.push(message);
  
  // Flush after 100ms or 10 messages
  if (messageQueues.get(ws)!.length >= 10) {
    flushMessages(ws);
  } else if (!flushTimers.has(ws)) {
    flushTimers.set(ws, setTimeout(() => flushMessages(ws), 100));
  }
}

function flushMessages(ws: WebSocket) {
  const messages = messageQueues.get(ws);
  if (!messages || messages.length === 0) return;
  
  ws.send(JSON.stringify({
    type: 'batch',
    messages: messages.splice(0)
  }));
  
  flushTimers.delete(ws);
}
```

3. **Add Connection Limits**
```typescript
const connectionsByIP = new Map<string, number>();
const MAX_CONNECTIONS_PER_IP = 5;

wss.on('connection', (ws: WebSocket, req: any) => {
  const ip = req.socket.remoteAddress;
  const currentConnections = connectionsByIP.get(ip) || 0;
  
  if (currentConnections >= MAX_CONNECTIONS_PER_IP) {
    ws.close(1008, 'Connection limit exceeded');
    return;
  }
  
  connectionsByIP.set(ip, currentConnections + 1);
  
  ws.on('close', () => {
    const count = connectionsByIP.get(ip) || 0;
    if (count > 0) {
      connectionsByIP.set(ip, count - 1);
    }
  });
});
```

### Phase 2: Redis Integration (3-5 days)

1. **Install Redis Dependencies**
```bash
npm install redis
npm install @types/redis --save-dev
```

2. **Update Environment Variables**
```env
REDIS_URL=redis://localhost:6379
```

3. **Implement Redis Adapter**
- Use the provided `redis-websocket-adapter.ts`
- Replace in-memory maps with Redis operations
- Enable pub/sub for cross-server communication

4. **Migrate Rate Limiting to Redis**
```typescript
// Replace bidRateLimiter with Redis-based implementation
async function checkBidRateLimit(userId: number): Promise<boolean> {
  const key = `ratelimit:bid:${userId}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60); // 1 minute window
  }
  
  return count <= 5; // 5 bids per minute
}
```

### Phase 3: Advanced Optimizations (1 week)

1. **Implement Message Compression**
- Enable WebSocket compression in server config
- Compress large auction updates
- Use binary protocols for high-frequency data

2. **Add Monitoring & Metrics**
- Implement the provided `websocket-monitoring.ts`
- Add Prometheus metrics
- Set up alerts for memory/connection issues

3. **Optimize Auction Room Broadcasting**
```typescript
// Instead of sending full auction data on every bid
function sendAuctionUpdate(auctionId: number, update: any) {
  const room = auctionRooms.get(auctionId);
  if (!room) return;
  
  // Send only changed fields
  const minimalUpdate = {
    type: 'auctionUpdate',
    auctionId,
    currentBid: update.currentBid,
    currentBidderId: update.currentBidderId,
    bidCount: update.bidCount,
    timeExtended: update.timeExtended
  };
  
  room.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      queueMessage(ws, minimalUpdate);
    }
  });
}
```

## Implementation Priority

1. **Week 1**: Heartbeat, connection limits, message batching
2. **Week 2**: Redis integration for state management
3. **Week 3**: Monitoring, compression, advanced optimizations

## Testing Strategy

1. **Load Testing**
```javascript
// Create test script for WebSocket load
const WebSocket = require('ws');

async function loadTest() {
  const connections = [];
  
  // Create 1000 connections
  for (let i = 0; i < 1000; i++) {
    const ws = new WebSocket('ws://localhost:3000/ws');
    connections.push(ws);
    
    ws.on('open', () => {
      // Simulate auction room join
      ws.send(JSON.stringify({
        type: 'joinAuction',
        auctionId: Math.floor(Math.random() * 10) + 1
      }));
    });
  }
  
  // Simulate bidding
  setInterval(() => {
    const ws = connections[Math.floor(Math.random() * connections.length)];
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'bid',
        auctionId: Math.floor(Math.random() * 10) + 1,
        amount: Math.random() * 1000
      }));
    }
  }, 100);
}
```

2. **Memory Leak Testing**
- Monitor heap usage over time
- Check for growing data structures
- Verify cleanup on disconnection

3. **Scalability Testing**
- Test with multiple server instances
- Verify Redis pub/sub functionality
- Check message delivery across nodes

## Monitoring Dashboard

Create a simple monitoring endpoint:

```typescript
app.get('/api/websocket/metrics', requireAuth, (req, res) => {
  res.json({
    connections: {
      active: wss.clients.size,
      byUser: connectedUsers.size,
      byIP: connectionsByIP.size
    },
    rooms: {
      auctions: auctionRooms.size,
      totalConnections: Array.from(auctionRooms.values())
        .reduce((sum, room) => sum + room.size, 0)
    },
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});
```

## Expected Improvements

- **Connection Handling**: 10x more concurrent connections
- **Message Throughput**: 5x improvement with batching
- **Memory Usage**: 50% reduction with proper cleanup
- **Scalability**: Horizontal scaling with Redis
- **Reliability**: 99.9% uptime with health checks

## Migration Checklist

- [ ] Backup current WebSocket implementation
- [ ] Implement heartbeat mechanism
- [ ] Add connection pooling
- [ ] Enable message batching
- [ ] Set up Redis infrastructure
- [ ] Migrate state to Redis
- [ ] Implement monitoring
- [ ] Load test improvements
- [ ] Deploy with feature flags
- [ ] Monitor production metrics