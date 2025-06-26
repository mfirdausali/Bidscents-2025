// Message batching and throttling for WebSocket optimization

export class MessageOptimizer {
  private messageQueues = new Map<string, QueuedMessage[]>();
  private flushTimers = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL = 100; // ms

  interface QueuedMessage {
    type: string;
    data: any;
    priority: number;
    timestamp: number;
  }

  // Queue message for batching
  public queueMessage(clientId: string, message: any, priority: number = 0) {
    if (!this.messageQueues.has(clientId)) {
      this.messageQueues.set(clientId, []);
    }

    const queue = this.messageQueues.get(clientId)!;
    queue.push({
      type: message.type,
      data: message,
      priority,
      timestamp: Date.now()
    });

    // Sort by priority (higher first)
    queue.sort((a, b) => b.priority - a.priority);

    // Check if we should flush immediately
    if (queue.length >= this.BATCH_SIZE) {
      this.flushMessages(clientId);
    } else {
      // Schedule flush if not already scheduled
      if (!this.flushTimers.has(clientId)) {
        const timer = setTimeout(() => {
          this.flushMessages(clientId);
        }, this.FLUSH_INTERVAL);
        this.flushTimers.set(clientId, timer);
      }
    }
  }

  // Flush queued messages
  private flushMessages(clientId: string) {
    const queue = this.messageQueues.get(clientId);
    if (!queue || queue.length === 0) return;

    // Clear the timer
    const timer = this.flushTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(clientId);
    }

    // Get messages to send
    const messagesToSend = queue.splice(0, this.BATCH_SIZE);
    
    // Send batched message
    return {
      type: 'batch',
      messages: messagesToSend.map(m => m.data),
      count: messagesToSend.length,
      timestamp: Date.now()
    };
  }

  // Message compression for large payloads
  public compressMessage(message: any): any {
    // Remove null/undefined fields
    const compressed = JSON.parse(JSON.stringify(message));
    
    // Truncate long strings in non-critical fields
    if (compressed.type === 'auctionUpdate' && compressed.description) {
      compressed.description = compressed.description.substring(0, 100) + '...';
    }

    // Convert dates to timestamps
    this.convertDatesToTimestamps(compressed);

    return compressed;
  }

  private convertDatesToTimestamps(obj: any) {
    for (const key in obj) {
      if (obj[key] instanceof Date) {
        obj[key] = obj[key].getTime();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.convertDatesToTimestamps(obj[key]);
      }
    }
  }

  // Throttle high-frequency updates
  private throttledUpdates = new Map<string, any>();
  private throttleTimers = new Map<string, NodeJS.Timeout>();

  public throttleUpdate(key: string, data: any, delay: number = 1000): boolean {
    const existing = this.throttledUpdates.get(key);
    
    // Update the data
    this.throttledUpdates.set(key, data);

    // If no timer exists, create one
    if (!this.throttleTimers.has(key)) {
      this.throttleTimers.set(key, setTimeout(() => {
        this.throttleTimers.delete(key);
        this.throttledUpdates.delete(key);
      }, delay));
      return true; // Send this update
    }

    return false; // Skip this update (throttled)
  }
}

// Event deduplication for auction updates
export class EventDeduplicator {
  private sentEvents = new Map<string, number>();
  private readonly DEDUP_WINDOW = 5000; // 5 seconds

  public isDuplicate(eventKey: string): boolean {
    const lastSent = this.sentEvents.get(eventKey);
    const now = Date.now();

    if (lastSent && (now - lastSent) < this.DEDUP_WINDOW) {
      return true;
    }

    this.sentEvents.set(eventKey, now);
    
    // Clean old entries periodically
    if (this.sentEvents.size > 1000) {
      this.cleanup();
    }

    return false;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.sentEvents.entries()) {
      if (now - timestamp > this.DEDUP_WINDOW * 2) {
        this.sentEvents.delete(key);
      }
    }
  }
}