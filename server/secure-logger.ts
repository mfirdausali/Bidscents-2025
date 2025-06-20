/**
 * Secure logging utility that filters out sensitive information
 * Use this instead of console.log for production-safe logging
 */

const SENSITIVE_FIELDS = [
  'password',
  'token',
  'email',
  'creditCard',
  'ssn',
  'bankAccount',
  'apiKey',
  'secret',
  'authorization',
  'cookie'
];

/**
 * Sanitizes an object by removing sensitive fields
 */
function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized: any = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();
      
      // Check if field name contains sensitive keywords
      const isSensitive = SENSITIVE_FIELDS.some(field => 
        lowerKey.includes(field)
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitized[key] = sanitizeObject(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }
  }
  
  return sanitized;
}

/**
 * Secure logging function that filters sensitive data
 */
export function secureLog(message: string, ...args: any[]) {
  if (process.env.NODE_ENV === 'production') {
    // In production, sanitize all logged data
    const sanitizedArgs = args.map(arg => sanitizeObject(arg));
    console.log(message, ...sanitizedArgs);
  } else {
    // In development, show warnings but still log
    console.log(`[DEV] ${message}`, ...args);
  }
}

/**
 * Log errors without exposing sensitive data
 */
export function secureError(message: string, error?: any) {
  if (process.env.NODE_ENV === 'production') {
    // In production, only log error type and message
    console.error(message, error?.name || 'Unknown error');
  } else {
    console.error(`[DEV] ${message}`, error);
  }
}

/**
 * Create a logger instance for a specific module
 */
export function createLogger(moduleName: string) {
  return {
    log: (message: string, ...args: any[]) => 
      secureLog(`[${moduleName}] ${message}`, ...args),
    error: (message: string, error?: any) => 
      secureError(`[${moduleName}] ${message}`, error),
    debug: (message: string, ...args: any[]) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[${moduleName}] ${message}`, ...args);
      }
    }
  };
}

// Usage example:
// const logger = createLogger('AUTH');
// logger.log('User authenticated', { id: user.id, username: user.username });
// logger.error('Authentication failed', error);