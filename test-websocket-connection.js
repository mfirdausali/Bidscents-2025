#!/usr/bin/env node

/**
 * Test WebSocket Connection
 * 
 * This script tests the WebSocket connection to the server
 */

import WebSocket from 'ws';

async function testWebSocketConnection() {
  console.log('🧪 WebSocket Connection Test');
  console.log('============================');
  
  const wsUrl = 'ws://localhost:3000/ws';
  console.log(`🔗 Connecting to: ${wsUrl}`);
  
  try {
    const ws = new WebSocket(wsUrl);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connection opened successfully!');
      
      // Test authentication (this will fail but shows the connection works)
      const authMessage = {
        type: 'auth',
        token: 'test-token'
      };
      
      console.log('📤 Sending auth message:', authMessage);
      ws.send(JSON.stringify(authMessage));
      
      // Close after a short delay
      setTimeout(() => {
        ws.close();
      }, 2000);
    });
    
    ws.on('message', (data) => {
      console.log('📨 Received message:', data.toString());
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: ${code} ${reason}`);
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to create WebSocket connection:', error.message);
    process.exit(1);
  }
}

// Test HTTP endpoint first
async function testHttpEndpoint() {
  console.log('\n🌐 Testing HTTP endpoint first...');
  
  try {
    const response = await fetch('http://localhost:3000/api/v1/auth/me');
    console.log(`✅ HTTP server responding: ${response.status}`);
    return true;
  } catch (error) {
    console.error('❌ HTTP server not responding:', error.message);
    return false;
  }
}

// Run tests
testHttpEndpoint().then((httpWorks) => {
  if (httpWorks) {
    console.log('\n🚀 Proceeding to WebSocket test...');
    testWebSocketConnection();
  } else {
    console.log('❌ HTTP server not working, skipping WebSocket test');
    process.exit(1);
  }
});