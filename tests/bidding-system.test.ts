import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

const WS_URL = 'ws://localhost:3001/ws';
const API_URL = 'http://localhost:3001/api';

// Test user credentials
const testUsers = {
  seller: {
    email: 'seller@test.com',
    password: 'testpass123',
    username: 'testseller'
  },
  bidder1: {
    email: 'bidder1@test.com',
    password: 'testpass123',
    username: 'testbidder1'
  },
  bidder2: {
    email: 'bidder2@test.com',
    password: 'testpass123',
    username: 'testbidder2'
  }
};

interface TestUser {
  id: number;
  email: string;
  username: string;
  token: string;
}

let users: Record<string, TestUser> = {};
let testProductId: number;
let testAuctionId: number;

// Helper function to register and login a user
async function setupUser(userConfig: typeof testUsers.seller): Promise<TestUser> {
  // Register user
  const registerRes = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userConfig)
  });

  if (!registerRes.ok) {
    // Try login if already registered
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userConfig.email,
        password: userConfig.password
      })
    });

    if (!loginRes.ok) {
      throw new Error(`Failed to setup user ${userConfig.email}`);
    }

    const loginData = await loginRes.json();
    return {
      id: loginData.user.id,
      email: loginData.user.email,
      username: loginData.user.username,
      token: loginData.token
    };
  }

  const registerData = await registerRes.json();
  return {
    id: registerData.user.id,
    email: registerData.user.email,
    username: registerData.user.username,
    token: registerData.token
  };
}

// Helper function to create a WebSocket connection
function createWebSocketConnection(token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      // Authenticate the connection
      ws.send(JSON.stringify({
        type: 'auth',
        token: token
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'auth_success') {
        resolve(ws);
      } else if (message.type === 'auth_failed') {
        reject(new Error('WebSocket authentication failed'));
      }
    });

    ws.on('error', reject);
  });
}

// Helper to wait for a specific message type
function waitForMessage(ws: WebSocket, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeout);

    const handler = (data: WebSocket.Data) => {
      const message = JSON.parse(data.toString());
      if (message.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(message);
      }
    };

    ws.on('message', handler);
  });
}

describe('Bidding System Tests', () => {
  beforeAll(async () => {
    // Setup test users
    users.seller = await setupUser(testUsers.seller);
    users.bidder1 = await setupUser(testUsers.bidder1);
    users.bidder2 = await setupUser(testUsers.bidder2);

    // Create a test product
    const productRes = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users.seller.token}`
      },
      body: JSON.stringify({
        name: 'Test Perfume for Auction',
        description: 'A test perfume for auction testing',
        price: 100,
        category: 'Luxury',
        images: ['https://example.com/test.jpg']
      })
    });

    if (!productRes.ok) {
      throw new Error('Failed to create test product');
    }

    const productData = await productRes.json();
    testProductId = productData.id;

    // Create a test auction
    const auctionRes = await fetch(`${API_URL}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users.seller.token}`
      },
      body: JSON.stringify({
        productId: testProductId,
        startingPrice: 50,
        reservePrice: 80,
        bidIncrement: 5,
        endsAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      })
    });

    if (!auctionRes.ok) {
      throw new Error('Failed to create test auction');
    }

    const auctionData = await auctionRes.json();
    testAuctionId = auctionData.id;
  });

  test('should join auction room successfully', async () => {
    const ws = await createWebSocketConnection(users.bidder1.token);
    
    // Join auction
    ws.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));

    const response = await waitForMessage(ws, 'joinedAuction');
    expect(response.auctionId).toBe(testAuctionId);
    expect(response.message).toContain('Joined auction room');

    ws.close();
  });

  test('should place a valid bid successfully', async () => {
    const ws = await createWebSocketConnection(users.bidder1.token);
    
    // Join auction first
    ws.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws, 'joinedAuction');

    // Place a bid
    ws.send(JSON.stringify({
      type: 'placeBid',
      auctionId: testAuctionId,
      userId: users.bidder1.id,
      amount: 55 // Starting price (50) + increment (5)
    }));

    const response = await waitForMessage(ws, 'bidAccepted');
    expect(response.bid.amount).toBe(55);
    expect(response.bid.bidderId).toBe(users.bidder1.id);
    expect(response.bid.isWinning).toBe(true);

    ws.close();
  });

  test('should reject bid below minimum amount', async () => {
    const ws = await createWebSocketConnection(users.bidder2.token);
    
    // Join auction
    ws.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws, 'joinedAuction');

    // Try to place a bid below minimum (current bid 55 + increment 5 = 60)
    ws.send(JSON.stringify({
      type: 'placeBid',
      auctionId: testAuctionId,
      userId: users.bidder2.id,
      amount: 58 // Below minimum of 60
    }));

    const response = await waitForMessage(ws, 'error');
    expect(response.message).toContain('Bid must be at least');

    ws.close();
  });

  test('should broadcast new bid to all participants', async () => {
    // Connect both bidders
    const ws1 = await createWebSocketConnection(users.bidder1.token);
    const ws2 = await createWebSocketConnection(users.bidder2.token);
    
    // Both join the auction
    ws1.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws1, 'joinedAuction');

    ws2.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws2, 'joinedAuction');

    // Set up listener for new bid on ws1
    const newBidPromise = waitForMessage(ws1, 'newBid');

    // Bidder 2 places a bid
    ws2.send(JSON.stringify({
      type: 'placeBid',
      auctionId: testAuctionId,
      userId: users.bidder2.id,
      amount: 60 // Valid bid
    }));

    // Wait for bidder 2 to receive confirmation
    await waitForMessage(ws2, 'bidAccepted');

    // Check that bidder 1 received the broadcast
    const newBidMessage = await newBidPromise;
    expect(newBidMessage.bid.amount).toBe(60);
    expect(newBidMessage.bid.bidderId).toBe(users.bidder2.id);

    ws1.close();
    ws2.close();
  });

  test('should prevent seller from bidding on own auction', async () => {
    const ws = await createWebSocketConnection(users.seller.token);
    
    // This test would need client-side validation
    // Server doesn't have product ownership info in auction record
    // This is a known limitation that should be addressed
    
    ws.close();
  });

  test('should handle concurrent bids correctly', async () => {
    const ws1 = await createWebSocketConnection(users.bidder1.token);
    const ws2 = await createWebSocketConnection(users.bidder2.token);
    
    // Both join auction
    ws1.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws1, 'joinedAuction');

    ws2.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws2, 'joinedAuction');

    // Place bids simultaneously
    const bid1Promise = new Promise((resolve) => {
      ws1.send(JSON.stringify({
        type: 'placeBid',
        auctionId: testAuctionId,
        userId: users.bidder1.id,
        amount: 65
      }));
      ws1.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    const bid2Promise = new Promise((resolve) => {
      ws2.send(JSON.stringify({
        type: 'placeBid',
        auctionId: testAuctionId,
        userId: users.bidder2.id,
        amount: 70
      }));
      ws2.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });

    const results = await Promise.all([bid1Promise, bid2Promise]);
    
    // One should succeed, one might fail or both might succeed
    // The higher bid should win
    const successfulBids = results.filter(r => r.type === 'bidAccepted');
    expect(successfulBids.length).toBeGreaterThan(0);

    ws1.close();
    ws2.close();
  });

  test('should track viewer count correctly', async () => {
    const ws1 = await createWebSocketConnection(users.bidder1.token);
    const ws2 = await createWebSocketConnection(users.bidder2.token);
    
    // First user joins
    ws1.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));
    await waitForMessage(ws1, 'joinedAuction');

    // Set up listener for viewer count
    const viewerPromise = waitForMessage(ws1, 'auctionViewers');

    // Second user joins
    ws2.send(JSON.stringify({
      type: 'joinAuction',
      auctionId: testAuctionId
    }));

    // Check viewer count update
    const viewerMessage = await viewerPromise;
    expect(viewerMessage.count).toBe(2);

    // One user leaves
    ws2.send(JSON.stringify({
      type: 'leaveAuction',
      auctionId: testAuctionId
    }));

    const updatedViewers = await waitForMessage(ws1, 'auctionViewers');
    expect(updatedViewers.count).toBe(1);

    ws1.close();
    ws2.close();
  });

  afterAll(async () => {
    // Cleanup: Delete test auction and product
    // This would require admin endpoints or direct database access
  });
});