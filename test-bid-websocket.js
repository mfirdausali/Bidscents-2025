// Test script for WebSocket bid handling
const WebSocket = require('ws');

async function testBidHandling() {
  console.log('Testing WebSocket bid handling...\n');
  
  // Connect to the WebSocket server
  const ws = new WebSocket('ws://localhost:5000/ws');
  
  ws.on('open', () => {
    console.log('Connected to WebSocket server');
    
    // Test 1: Join an auction room
    console.log('\nTest 1: Joining auction room...');
    ws.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: '1'
    }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('Received:', message);
    
    if (message.type === 'joinedAuction') {
      // Test 2: Place a bid
      console.log('\nTest 2: Placing a bid...');
      ws.send(JSON.stringify({
        type: 'placeBid',
        auctionId: '1',
        amount: '100.00',
        userId: 1 // This would normally come from authentication
      }));
    }
    
    if (message.type === 'bidAccepted') {
      // Test 3: Leave auction room
      console.log('\nTest 3: Leaving auction room...');
      ws.send(JSON.stringify({
        type: 'leaveAuction',
        auctionId: '1'
      }));
    }
    
    if (message.type === 'leftAuction') {
      console.log('\nAll tests completed!');
      ws.close();
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
  
  ws.on('close', () => {
    console.log('Disconnected from WebSocket server');
  });
}

// Run the test
testBidHandling().catch(console.error);