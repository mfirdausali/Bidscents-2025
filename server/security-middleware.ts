import helmet from 'helmet';
import cors from 'cors';
import type { Application } from 'express';

/**
 * Configure security middleware for the Express application
 * @param app Express application instance
 */
export function configureSecurityMiddleware(app: Application) {
  // Configure CORS
  const corsOptions: cors.CorsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        process.env.APP_URL || 'http://localhost:5000',
        'https://bidscents.replit.app',
        // Add any other allowed origins here
      ];
      
      // In development, allow localhost origins
      if (process.env.NODE_ENV === 'development') {
        allowedOrigins.push(
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5000',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:5173'
        );
      }
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400 // 24 hours
  };
  
  app.use(cors(corsOptions));
  
  // Configure Helmet for security headers
  app.use(helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for React in development
          "'unsafe-eval'", // Required for some build tools in development
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://cdn.jsdelivr.net", // For any CDN scripts
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for styled components and inline styles
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https:",
          // Add specific image CDNs if needed
        ],
        connectSrc: [
          "'self'",
          "https://www.google-analytics.com",
          "https://rjazuitnzsximznfcbfw.supabase.co",
          "wss://rjazuitnzsximznfcbfw.supabase.co",
          "https://www.billplz.com",
          "https://www.billplz-sandbox.com",
          // WebSocket connections for development
          process.env.NODE_ENV === 'development' ? "ws://localhost:*" : "",
          process.env.NODE_ENV === 'development' ? "wss://localhost:*" : "",
        ].filter(Boolean),
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        childSrc: ["'self'"],
        workerSrc: ["'self'", "blob:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : undefined,
      },
    },
    
    // Strict Transport Security
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    
    // Other security headers
    crossOriginEmbedderPolicy: false, // May need to be false for some third-party integrations
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: true },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }));
  
  // Additional security headers not covered by Helmet
  app.use((req, res, next) => {
    // Permissions Policy (formerly Feature Policy)
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );
    
    // X-Content-Type-Options (redundant with helmet but explicit)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // X-Frame-Options (redundant with helmet but explicit)
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Remove sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    next();
  });
}