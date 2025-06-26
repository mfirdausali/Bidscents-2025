#!/usr/bin/env node

// Minimal health check server for DigitalOcean deployment health checks
import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

// Health check endpoint - must respond immediately for DigitalOcean
app.get('/api/health', (req, res) => {
  console.log('[HEALTH-ONLY] Health check requested from:', req.headers.origin || 'no-origin');
  
  // Set CORS headers for all origins
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    server: 'health-only'
  });
});

// Handle OPTIONS for health check
app.options('/api/health', (req, res) => {
  console.log('[HEALTH-ONLY] OPTIONS request for health check');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// Basic route to serve static files in production
app.use(express.static('public'));

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile('public/index.html', { root: process.cwd() });
});

// Use PORT environment variable for DigitalOcean, fallback to 5000
const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const host = '0.0.0.0';

server.listen(port, host, () => {
  console.log(`🚀 Health-only server running on port ${port} (host: ${host})`);
  console.log(`📊 Health check available at: http://${host}:${port}/api/health`);
  console.log(`🌟 This server ensures health checks pass while main app initializes`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');  
  server.close(() => process.exit(0));
});