import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';

/**
 * Configure security middleware for the Express application
 * @param app Express application instance
 */
export function configureSecurityMiddleware(app: Application) {
  // Health check middleware - bypass CORS for health checks
  app.use('/api/health*', (req, res, next) => {
    // Set permissive CORS headers for health checks
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    // If this is an OPTIONS request, respond immediately
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });

  // Configure CORS
  const corsOptions: cors.CorsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin for health checks and server-side requests
      if (!origin) {
        if (process.env.NODE_ENV === 'development') {
          // In development, allow requests with no origin (e.g., server-side requests)
          return callback(null, true);
        } else {
          // In production, allow requests with no origin for health checks
          // DigitalOcean health checks may not include origin header
          console.log('[SECURITY] Allowing request with no origin header (likely health check)');
          return callback(null, true);
        }
      }
      
      const allowedOrigins = [
        process.env.APP_URL || 'http://localhost:5000',
        'https://bidscents.replit.app',
        'https://bidscents-2025-scsjl.ondigitalocean.app',
      ];

      // Add current Replit domain dynamically
      if (process.env.REPLIT_DOMAINS) {
        allowedOrigins.push(`https://${process.env.REPLIT_DOMAINS}`);
      }
      
      // In development or non-production, allow localhost origins and be more permissive
      if (process.env.NODE_ENV !== 'production') {
        allowedOrigins.push(
          'http://localhost:3000',
          'http://localhost:5000',
          'http://localhost:5173',
          'http://127.0.0.1:5000',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:5173'
        );
        
        // Allow any .replit.dev domain in development
        if (origin && origin.includes('.replit.dev')) {
          return callback(null, true);
        }
      }
      
      // Allow DigitalOcean App Platform domains
      if (origin && origin.includes('.ondigitalocean.app')) {
        console.log(`[SECURITY] Allowed DigitalOcean origin: ${origin}`);
        return callback(null, true);
      }
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        // console.log(`[SECURITY] Allowed CORS origin: ${origin}`); // Commented to reduce log noise
        callback(null, true);
      } else {
        console.error(`[SECURITY] Rejected CORS origin: ${origin}`);
        console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-CSRF-Token'],
    maxAge: 86400 // 24 hours
  };
  
  app.use(cors(corsOptions));
  
  // Configure cookie parser for CSRF double-submit pattern
  app.use(cookieParser());
  
  // Configure Helmet for security headers
  const helmetOptions: any = {
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
          "data:", // Allow base64 encoded fonts
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
  };

  // Add upgradeInsecureRequests only in production to avoid CSP directive value errors
  if (process.env.NODE_ENV === 'production') {
    helmetOptions.contentSecurityPolicy.directives.upgradeInsecureRequests = [];
  }

  app.use(helmet(helmetOptions));
  
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