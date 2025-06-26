#!/usr/bin/env node

/**
 * Manual health check utility
 * Run this to check for and fix stuck auctions manually
 */

import { checkForStuckAuctions } from './server/auction-health-monitor.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Running manual auction health check...\n');

checkForStuckAuctions()
  .then(() => {
    console.log('\nHealth check completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Health check failed:', error);
    process.exit(1);
  });