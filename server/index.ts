import dotenv from 'dotenv';
dotenv.config();

// CRITICAL: Set server timezone to UTC to prevent auction expiry issues
// This must be set before any date operations
process.env.TZ = 'UTC';

// Initialize production safety checks
ensureProductionSafety();

if (isProduction()) {
  logger.info('Server timezone set to UTC for production');
  logger.info('Current UTC time', { time: new Date().toISOString() });
} else {
  console.log('[TIMEZONE] Server timezone set to UTC');
  console.log('[TIMEZONE] Current UTC time:', new Date().toISOString());
  console.log('[TIMEZONE] Timezone offset:', new Date().getTimezoneOffset(), 'minutes (should be 0)');
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { secureRoutes } from "./secure-routes";
import { serveStatic, log } from "./vite";
import { configureSecurityMiddleware } from "./security-middleware";
import { ensureProductionSafety, isProduction } from "./production-config";
import { logger } from "./logger";

const app = express();

// Health check endpoint FIRST - before any middleware
// This MUST be before configureSecurityMiddleware to avoid CORS issues
app.get('/api/health', (req, res) => {
  if (!isProduction()) {
    console.log('[HEALTH] Health check requested from:', req.headers.origin || 'no-origin');
  }
  
  // Set CORS headers explicitly for health checks
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Handle OPTIONS requests for health check
app.options('/api/health', (req, res) => {
  console.log('[HEALTH] Health check OPTIONS requested');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// Configure security middleware AFTER health check
configureSecurityMiddleware(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

async function startServer() {
  try {
    // Test database connections
    const { testConnection } = await import("./db");
    const { testSupabaseConnection } = await import("./supabase");
    
    await testConnection();
    await testSupabaseConnection();
    
    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "development") {
      console.log('🔄 Setting up Vite development server...');
      // Dynamic import to avoid bundling Vite in production
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
      console.log('✅ Vite development server configured');
    } else {
      console.log('📦 Setting up static file serving for production...');
      serveStatic(app);
    }

    // Use PORT environment variable for DigitalOcean, fallback to 5000
    // In production, DigitalOcean will provide the PORT environment variable
    const port = process.env.PORT ? parseInt(process.env.PORT) : (process.env.NODE_ENV === 'development' ? 3000 : 5000);
    const host = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
    server.listen(port, host, () => {
      log(`serving on port ${port} (host: ${host})`);
    });
  } catch (error) {
    console.error('Server initialization failed, but health check is still available:', error);
    
    // Start minimal server with just health check
    const port = process.env.PORT ? parseInt(process.env.PORT) : (process.env.NODE_ENV === 'development' ? 3000 : 5000);
    const host = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
    
    app.listen(port, host, () => {
      console.log(`Health check server running on port ${port} (host: ${host})`);
    });
  }
}

startServer();
