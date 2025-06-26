import express from 'express';

// Minimal health check server for DigitalOcean
const app = express();

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Start server
const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
const host = '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Health check server running on port ${port} (host: ${host})`);
});

// Try to start the main application after health check is running
setTimeout(async () => {
  try {
    console.log('Starting main application...');
    await import('./index');
  } catch (error) {
    console.error('Main application failed to start, but health check is still available:', error);
  }
}, 1000);