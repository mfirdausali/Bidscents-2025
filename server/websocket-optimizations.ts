import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';

// WebSocket connection management with heartbeat
export class OptimizedWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientInfo>();
  private heartbeatInterval: NodeJS.Timeout;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 10000; // 10 seconds to respond
  private readonly MAX_CONNECTIONS_PER_IP = 5;
  private readonly CONNECTION_LIMITS = new Map<string, number>();

  interface ClientInfo {
    userId?: number;
    username?: string;
    isAlive: boolean;
    lastActivity: number;
    ip: string;
    joinedAuctions: Set<number>;
    messageQueue: any[];
    pingTimeout?: NodeJS.Timeout;
  }

  constructor(server: any) {
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      maxPayload: 1024 * 1024, // 1MB max message size
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 6, // Compression level (0-9)
        },
        threshold: 1024, // Compress messages > 1KB
      }
    });

    this.setupHeartbeat();
    this.setupConnectionHandler();
  }

  private setupHeartbeat() {
    // Periodic heartbeat check
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const client = this.clients.get(ws);
        if (!client) return;

        if (!client.isAlive) {
          // Client didn't respond to last ping, terminate
          console.log(`Terminating unresponsive client: ${client.userId || 'anonymous'}`);
          ws.terminate();
          return;
        }

        // Send ping and mark as not alive
        client.isAlive = false;
        ws.ping();

        // Set timeout for pong response
        client.pingTimeout = setTimeout(() => {
          console.log(`Client ${client.userId} failed to respond to ping`);
          ws.terminate();
        }, this.PONG_TIMEOUT);
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  private setupConnectionHandler() {
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const ip = req.socket.remoteAddress || '';
      
      // Connection limiting per IP
      const currentConnections = this.CONNECTION_LIMITS.get(ip) || 0;
      if (currentConnections >= this.MAX_CONNECTIONS_PER_IP) {
        ws.close(1008, 'Connection limit exceeded');
        return;
      }
      this.CONNECTION_LIMITS.set(ip, currentConnections + 1);

      // Initialize client info
      const clientInfo: ClientInfo = {
        isAlive: true,
        lastActivity: Date.now(),
        ip,
        joinedAuctions: new Set(),
        messageQueue: []
      };
      this.clients.set(ws, clientInfo);

      // Handle pong responses
      ws.on('pong', () => {
        const client = this.clients.get(ws);
        if (client) {
          client.isAlive = true;
          client.lastActivity = Date.now();
          if (client.pingTimeout) {
            clearTimeout(client.pingTimeout);
          }
        }
      });

      // Handle close
      ws.on('close', () => {
        this.cleanupClient(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.cleanupClient(ws);
      });
    });
  }

  private cleanupClient(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (client) {
      // Clean up connection limit
      const currentCount = this.CONNECTION_LIMITS.get(client.ip) || 0;
      if (currentCount > 0) {
        this.CONNECTION_LIMITS.set(client.ip, currentCount - 1);
      }

      // Clean up ping timeout
      if (client.pingTimeout) {
        clearTimeout(client.pingTimeout);
      }

      // Clean up auction rooms
      client.joinedAuctions.forEach(auctionId => {
        // Remove from auction room logic
      });

      this.clients.delete(ws);
    }
  }

  // Batch message sending for efficiency
  public batchSend(messages: Array<{ws: WebSocket, data: any}>) {
    const messageGroups = new Map<WebSocket, any[]>();
    
    // Group messages by recipient
    messages.forEach(({ ws, data }) => {
      if (!messageGroups.has(ws)) {
        messageGroups.set(ws, []);
      }
      messageGroups.get(ws)!.push(data);
    });

    // Send batched messages
    messageGroups.forEach((messages, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'batch',
          messages
        }));
      }
    });
  }

  public destroy() {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}