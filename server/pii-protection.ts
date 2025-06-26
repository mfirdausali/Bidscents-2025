import { Request, Response, NextFunction } from 'express';

// Comprehensive PII field list
const PII_FIELDS = new Set([
  // Authentication
  'password', 'token', 'apiKey', 'secret', 'authorization',
  'cookie', 'session', 'refreshToken', 'accessToken',
  
  // Personal Information
  'email', 'emailAddress', 'phone', 'phoneNumber', 'mobile',
  'ssn', 'socialSecurityNumber', 'nationalId', 'passportNumber',
  'driverLicense', 'birthDate', 'dateOfBirth', 'dob',
  
  // Financial
  'creditCard', 'cardNumber', 'cvv', 'cvc', 'bankAccount',
  'accountNumber', 'routingNumber', 'iban', 'swift',
  
  // Address
  'address', 'streetAddress', 'zipCode', 'postalCode',
  'latitude', 'longitude', 'coordinates',
  
  // Biometric
  'fingerprint', 'faceId', 'biometric',
  
  // Medical
  'medicalRecord', 'healthInfo', 'prescription'
]);

export class PIIProtection {
  // Mask email addresses
  static maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return '***@***.***';
    
    const maskedLocal = localPart.length > 2
      ? localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1]
      : '*'.repeat(localPart.length);
    
    return `${maskedLocal}@${domain}`;
  }
  
  // Mask phone numbers
  static maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '*'.repeat(digits.length);
    
    return digits.slice(0, -4).replace(/./g, '*') + digits.slice(-4);
  }
  
  // Generic PII masking
  static maskValue(value: any, fieldName: string): any {
    if (value === null || value === undefined) return value;
    
    const lowerFieldName = fieldName.toLowerCase();
    
    // Email masking
    if (lowerFieldName.includes('email')) {
      return typeof value === 'string' ? this.maskEmail(value) : '[REDACTED]';
    }
    
    // Phone masking
    if (lowerFieldName.includes('phone') || lowerFieldName.includes('mobile')) {
      return typeof value === 'string' ? this.maskPhone(value) : '[REDACTED]';
    }
    
    // Complete redaction for highly sensitive fields
    if (PII_FIELDS.has(lowerFieldName)) {
      return '[REDACTED]';
    }
    
    // Partial masking for other potentially sensitive fields
    if (typeof value === 'string' && value.length > 4) {
      for (const piiField of PII_FIELDS) {
        if (lowerFieldName.includes(piiField)) {
          return value.slice(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2);
        }
      }
    }
    
    return value;
  }
  
  // Recursively sanitize objects
  static sanitizeObject(obj: any, options: { deep?: boolean } = {}): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized: any = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        // Check if field should be masked
        const shouldMask = Array.from(PII_FIELDS).some(field =>
          key.toLowerCase().includes(field)
        );
        
        if (shouldMask) {
          sanitized[key] = this.maskValue(value, key);
        } else if (options.deep && typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeObject(value, options);
        } else {
          sanitized[key] = value;
        }
      }
    }
    
    return sanitized;
  }
  
  // Middleware to sanitize request logging
  static requestLogger() {
    return (req: Request, _res: Response, next: NextFunction) => {
      // Create sanitized copies for logging
      const sanitizedBody = this.sanitizeObject(req.body, { deep: true });
      const sanitizedQuery = this.sanitizeObject(req.query, { deep: true });
      const sanitizedParams = this.sanitizeObject(req.params, { deep: true });
      
      // Store sanitized versions for logging
      (req as any).sanitizedForLogging = {
        body: sanitizedBody,
        query: sanitizedQuery,
        params: sanitizedParams,
        headers: this.sanitizeHeaders(req.headers)
      };
      
      next();
    };
  }
  
  // Sanitize headers
  static sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    
    // Redact sensitive headers
    const sensitiveHeaders = [
      'authorization', 'cookie', 'x-api-key', 'x-auth-token'
    ];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
  
  // Response interceptor to mask PII in responses
  static responseInterceptor() {
    return (_req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json;
      
      res.json = function(data: any) {
        // Only sanitize in production
        if (process.env.NODE_ENV === 'production') {
          const sanitized = PIIProtection.sanitizeObject(data, { deep: true });
          return originalJson.call(this, sanitized);
        }
        
        return originalJson.call(this, data);
      };
      
      next();
    };
  }
}

// Export middleware
export const piiProtectionMiddleware = PIIProtection.requestLogger();
export const piiResponseMiddleware = PIIProtection.responseInterceptor();