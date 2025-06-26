#!/usr/bin/env node

/**
 * Test runner that starts the server and runs transaction simulations
 */

import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

let serverProcess = null;

async function waitForServer(maxAttempts = 30) {
  console.log('Waiting for server to start...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:3001/api/health', { timeout: 1000 });
      if (response.ok) {
        console.log('✅ Server is running!');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.stdout.write('.');
  }
  
  console.log('\n❌ Server failed to start in time');
  return false;
}

async function startServer() {
  console.log('Starting development server...');
  
  serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd()
  });
  
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Server listening on')) {
      console.log('📡 Server output:', output.trim());
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });
  
  const serverReady = await waitForServer();
  return serverReady;
}

function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill();
    serverProcess = null;
  }
}

async function runTransactionTests() {
  console.log('🧪 Running transaction end-to-end tests...\n');
  
  try {
    // Import and run the transaction simulation
    const { default: runSimulation } = await import('./test-transaction-e2e.js');
    const results = await runSimulation();
    return results;
  } catch (error) {
    console.error('Test execution failed:', error);
    return null;
  }
}

async function validateDatabaseSetup() {
  console.log('🔍 Validating database setup...');
  
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  try {
    // Check required tables exist
    const tables = ['users', 'products', 'conversations', 'messages', 'transactions'];
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.error(`❌ Table ${table} not accessible:`, error.message);
        return false;
      }
    }
    
    // Check test users exist
    const { data: seller } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', 32)
      .single();
    
    const { data: buyer } = await supabase
      .from('users')
      .select('id, username') 
      .eq('id', 34)
      .single();
    
    if (!seller || !buyer) {
      console.error('❌ Test users (seller ID 32, buyer ID 34) not found');
      return false;
    }
    
    console.log('✅ Database validation passed');
    console.log(`  Seller: ${seller.username} (ID: ${seller.id})`);
    console.log(`  Buyer: ${buyer.username} (ID: ${buyer.id})`);
    
    return true;
  } catch (error) {
    console.error('❌ Database validation failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('=== TRANSACTION TESTING SUITE ===\n');
  
  try {
    // Step 1: Validate database setup
    const dbValid = await validateDatabaseSetup();
    if (!dbValid) {
      console.error('Database validation failed. Exiting.');
      process.exit(1);
    }
    
    // Step 2: Start server
    const serverStarted = await startServer();
    if (!serverStarted) {
      console.error('Failed to start server. Exiting.');
      process.exit(1);
    }
    
    // Step 3: Run tests
    const testResults = await runTransactionTests();
    
    // Step 4: Generate report
    if (testResults) {
      console.log('\n=== FINAL TEST RESULTS ===');
      console.log(`Success Rate: ${testResults.successRate.toFixed(1)}%`);
      console.log(`Total Runs: ${testResults.totalRuns}`);
      console.log(`Successful: ${testResults.successfulRuns}`);
      console.log(`Failed: ${testResults.failedRuns}`);
      console.log(`Average Time: ${testResults.averageTime.toFixed(0)}ms`);
      
      if (testResults.successRate >= 80) {
        console.log('✅ Transaction system is reliable!');
      } else {
        console.log('⚠️ Transaction system needs improvement');
      }
    }
    
  } catch (error) {
    console.error('Test suite failed:', error);
  } finally {
    stopServer();
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  stopServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopServer();
  process.exit(0);
});

// Run the test suite
main();