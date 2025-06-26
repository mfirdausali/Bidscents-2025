import dotenv from 'dotenv';
dotenv.config();

// CRITICAL: Set server timezone to UTC to prevent auction expiry issues
// This must be set before any date operations
process.env.TZ = 'UTC';
console.log('[TIMEZONE] Server timezone set to UTC');
console.log('[TIMEZONE] Current UTC time:', new Date().toISOString());
console.log('[TIMEZONE] Timezone offset:', new Date().getTimezoneOffset(), 'minutes (should be 0)');

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { secureRoutes } from "./secure-routes";
import { serveStatic, log } from "./vite";
import { testConnection } from "./db";
import { testSupabaseConnection } from "./supabase";
import { configureSecurityMiddleware } from "./security-middleware";

const app = express();

// Configure security middleware BEFORE other middleware
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

(async () => {
  // Test database connections
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
  if (app.get("env") === "development") {
    // Dynamic import to avoid bundling Vite in production
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.NODE_ENV === 'development' ? 3000 : 5000;
  const host = process.env.NODE_ENV === 'development' ? '127.0.0.1' : '0.0.0.0';
  server.listen(port, host, () => {
    log(`serving on port ${port} (host: ${host})`);
  });
})();
