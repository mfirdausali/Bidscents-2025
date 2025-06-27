import cookieParser from 'cookie-parser';
import type { Application } from 'express';

/**
 * Configure security middleware for the Express application
 * @param app Express application instance
 */
export function configureSecurityMiddleware(app: Application) {
  // Ultra-permissive CORS - no restrictions whatsoever
  app.use((req, res, next) => {
    // Set permissive CORS headers manually
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Expose-Headers', '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });
  
  // Keep cookie parser for session handling
  app.use(cookieParser());
  
  // Minimal security headers - no restrictive CSP or strict policies
  app.use((req, res, next) => {
    // Only set minimal, non-restrictive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    next();
  });
}