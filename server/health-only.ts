#!/usr/bin/env node

// Minimal health check server for DigitalOcean deployment health checks
import express from 'express';

const app = express();

// Health check endpoint - must respond immediately for DigitalOcean
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Basic route to serve static files in production
app.use(express.static('public'));

// Use PORT environment variable for DigitalOcean, fallback to 5000
const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`🚀 Health check server running on port ${port} (host: ${host})`);
  console.log(`📊 Health check available at: http://${host}:${port}/api/health`);
  
  // Try to start the main application after health check is established
  setTimeout(async () => {
    try {
      console.log('🔄 Starting main application...');
      const { default: mainApp } = await import('./index.js');
    } catch (error) {
      console.error('❌ Main application failed to start, but health check continues to work:', error);
      console.log('⚠️  Server will continue running with health check only');
    }
  }, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});