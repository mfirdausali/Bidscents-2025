/**
 * Production-safe logging utility
 * Provides different log levels and filters sensitive information in production
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  maskSensitiveData: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor() {
    this.config = {
      level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
      enableConsole: true,
      maskSensitiveData: process.env.NODE_ENV === 'production'
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  private maskSensitive(data: any): any {
    if (!this.config.maskSensitiveData) {
      return data;
    }

    if (typeof data === 'string') {
      // Mask potential tokens, passwords, secrets
      return data.replace(/(?:token|password|secret|key|auth)[\s:=]["']?([^"',\s]+)/gi, '$1***');
    }

    if (typeof data === 'object' && data !== null) {
      const masked = { ...data };
      const sensitiveKeys = ['token', 'password', 'secret', 'key', 'auth', 'jwt', 'authorization'];
      
      for (const key of Object.keys(masked)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          masked[key] = '***';
        }
      }
      return masked;
    }

    return data;
  }

  private formatMessage(level: string, message: string, data?: any): void {
    if (!this.config.enableConsole) return;

    const timestamp = new Date().toISOString();
    const maskedData = data ? this.maskSensitive(data) : undefined;
    
    if (maskedData) {
      console.log(`[${timestamp}] ${level}: ${message}`, maskedData);
    } else {
      console.log(`[${timestamp}] ${level}: ${message}`);
    }
  }

  error(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.formatMessage('ERROR', message, data);
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.formatMessage('WARN', message, data);
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.formatMessage('INFO', message, data);
    }
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.formatMessage('DEBUG', message, data);
    }
  }

  // WebSocket specific logging with reduced verbosity in production
  websocket(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.debug(`[WebSocket] ${message}`, data);
    } else {
      // Only log important WebSocket events in production
      if (message.includes('error') || message.includes('failed') || message.includes('disconnect')) {
        this.warn(`[WebSocket] ${message}`, data);
      }
    }
  }

  // Payment specific logging with extra security
  payment(message: string, data?: any): void {
    const safeData = data ? {
      ...this.maskSensitive(data),
      // Always mask payment-specific sensitive fields
      billId: data.billId ? data.billId.slice(0, 8) + '***' : undefined,
      amount: data.amount,
      status: data.status,
      timestamp: data.timestamp || new Date().toISOString()
    } : undefined;
    
    this.info(`[Payment] ${message}`, safeData);
  }

  // Auction logging with minimal data exposure
  auction(message: string, data?: any): void {
    if (process.env.NODE_ENV === 'development') {
      this.debug(`[Auction] ${message}`, data);
    } else {
      // Only log essential auction events in production
      const safeData = data ? {
        auctionId: data.auctionId,
        productId: data.productId,
        status: data.status,
        // Don't log bid amounts or user IDs in production
      } : undefined;
      this.info(`[Auction] ${message}`, safeData);
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for backward compatibility with existing code
export const log = {
  error: (msg: string, data?: any) => logger.error(msg, data),
  warn: (msg: string, data?: any) => logger.warn(msg, data),
  info: (msg: string, data?: any) => logger.info(msg, data),
  debug: (msg: string, data?: any) => logger.debug(msg, data),
  websocket: (msg: string, data?: any) => logger.websocket(msg, data),
  payment: (msg: string, data?: any) => logger.payment(msg, data),
  auction: (msg: string, data?: any) => logger.auction(msg, data)
};