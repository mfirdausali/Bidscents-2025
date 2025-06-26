import DOMPurify from 'isomorphic-dompurify';
import { Request, Response, NextFunction } from 'express';

export class XSSProtection {
  // Sanitize HTML content
  static sanitizeHTML(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
      ALLOWED_ATTR: []
    });
  }
  
  // Sanitize plain text (escape HTML entities)
  static sanitizeText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  // Sanitize URLs to prevent javascript: and data: protocols
  static sanitizeURL(url: string): string {
    const cleaned = url.trim().toLowerCase();
    
    const dangerousProtocols = [
      'javascript:', 'data:', 'vbscript:', 'file:', 'about:'
    ];
    
    if (dangerousProtocols.some(proto => cleaned.startsWith(proto))) {
      return '#';
    }
    
    // Ensure protocol is present
    if (!cleaned.match(/^https?:\/\//)) {
      return `https://${url}`;
    }
    
    return url;
  }
  
  // Sanitize JSON data recursively
  static sanitizeJSON(data: any): any {
    if (typeof data === 'string') {
      return this.sanitizeText(data);
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeJSON(item));
    }
    
    if (data && typeof data === 'object') {
      const sanitized: any = {};
      
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          // Sanitize both key and value
          const sanitizedKey = this.sanitizeText(key);
          sanitized[sanitizedKey] = this.sanitizeJSON(data[key]);
        }
      }
      
      return sanitized;
    }
    
    return data;
  }
  
  // Middleware for input sanitization
  static inputSanitizer() {
    return (req: Request, _res: Response, next: NextFunction) => {
      // Sanitize body
      if (req.body) {
        req.body = this.sanitizeJSON(req.body);
      }
      
      // Sanitize query parameters
      if (req.query) {
        req.query = this.sanitizeJSON(req.query) as any;
      }
      
      // Sanitize URL parameters
      if (req.params) {
        req.params = this.sanitizeJSON(req.params) as any;
      }
      
      next();
    };
  }
  
  // Content Security Policy enhancements
  static enhancedCSP() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Generate nonce for inline scripts
      const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
      
      // Store nonce on response for use in templates
      res.locals.nonce = nonce;
      
      // Enhanced CSP with nonce
      const cspDirectives = [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'nonce-${nonce}'`,
        `img-src 'self' data: https:`,
        `font-src 'self'`,
        `connect-src 'self' wss: https:`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `frame-ancestors 'none'`,
        `upgrade-insecure-requests`
      ].join('; ');
      
      res.setHeader('Content-Security-Policy', cspDirectives);
      next();
    };
  }
}

// Specific sanitizers for different content types
export const sanitizers = {
  productName: (name: string) => XSSProtection.sanitizeText(name).slice(0, 100),
  productDescription: (desc: string) => XSSProtection.sanitizeHTML(desc).slice(0, 1000),
  username: (username: string) => XSSProtection.sanitizeText(username).slice(0, 50),
  message: (msg: string) => XSSProtection.sanitizeText(msg).slice(0, 500),
  url: (url: string) => XSSProtection.sanitizeURL(url)
};

// Export middleware
export const xssInputSanitizer = XSSProtection.inputSanitizer();
export const xssEnhancedCSP = XSSProtection.enhancedCSP();