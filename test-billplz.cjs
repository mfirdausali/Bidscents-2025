require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

// Base URL for Billplz API
const BILLPLZ_BASE_URL = process.env.BILLPLZ_BASE_URL || 'https://www.billplz-sandbox.com/api';
const BILLPLZ_SECRET_KEY = process.env.BILLPLZ_SECRET_KEY;
const BILLPLZ_XSIGN_KEY = process.env.BILLPLZ_XSIGN_KEY;
const BILLPLZ_COLLECTION_ID = process.env.BILLPLZ_COLLECTION_ID;

// Determine if we're using sandbox or production
const IS_SANDBOX = BILLPLZ_BASE_URL.includes('sandbox');

// Use appropriate view URL based on environment
const BILLPLZ_VIEW_BASE_URL = IS_SANDBOX 
  ? 'https://www.billplz-sandbox.com' 
  : 'https://www.billplz.com';

function createAuthHeader() {
  // Format should be "API_KEY:" (note the colon at the end with no password)
  const auth = Buffer.from(`${BILLPLZ_SECRET_KEY}:`).toString('base64');
  return `Basic ${auth}`;
}

async function billplzRequest(endpoint, method = 'GET', body, contentType = 'application/json') {
  const url = `${BILLPLZ_BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': createAuthHeader(),
    'Content-Type': contentType,
  };

  console.log(`🚀 Billplz API Request: ${method} ${endpoint}`);
  
  // Handle different content types
  let processedBody;
  if (body) {
    if (contentType === 'application/json') {
      processedBody = JSON.stringify(body);
    } else if (contentType === 'application/x-www-form-urlencoded') {
      const formData = new URLSearchParams();
      for (const key in body) {
        if (body[key] !== undefined && body[key] !== null) {
          formData.append(key, body[key].toString());
        }
      }
      processedBody = formData;
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: processedBody,
    });

    console.log(`🔄 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Billplz API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Billplz API error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log(`✅ Response data:`, JSON.stringify(responseData, null, 2));
    return responseData;
  } catch (error) {
    console.error('❌ Error making Billplz API request:', error);
    throw error;
  }
}

async function createBill(params) {
  // Ensure amount is an integer in sen
  const amount = Math.round(params.amount);

  console.log('🔔 Creating Billplz bill with params:', {
    name: params.name,
    email: params.email,
    amount,
    description: params.description,
    ref1: params.reference_1,
    ref2: params.reference_2
  });

  const payload = {
    collection_id: BILLPLZ_COLLECTION_ID,
    name: params.name,
    email: params.email,
    amount,
    description: params.description,
    callback_url: params.callback_url,
    redirect_url: params.redirect_url,
  };

  // Add optional references if provided
  if (params.reference_1) {
    payload.reference_1 = params.reference_1;
  }
  if (params.reference_2) {
    payload.reference_2 = params.reference_2;
  }

  return billplzRequest(
    '/v3/bills', 
    'POST', 
    payload, 
    'application/x-www-form-urlencoded'
  );
}

function getBillURL(billId) {
  const url = `${BILLPLZ_VIEW_BASE_URL}/bills/${billId}`;
  console.log(`🔗 Generated Billplz payment URL: ${url}`);
  
  return url;
}

async function testBillplz() {
  try {
    console.log('🧪 Testing Billplz API Integration');
    console.log('==================================');
    console.log('BILLPLZ_BASE_URL:', BILLPLZ_BASE_URL);
    console.log('BILLPLZ_COLLECTION_ID:', BILLPLZ_COLLECTION_ID);
    console.log('Environment:', IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION');
    console.log('==================================');
    
    const testBill = await createBill({
      name: 'Test User',
      email: 'test@example.com',
      amount: 500, // RM 5.00 in sen
      description: 'Test Boost Package: Standard Boost (1 item for 24 hours)',
      reference_1: 'test-order-123',
      reference_2: 'boost_25',
      callback_url: 'http://localhost:3000/api/payments/billplz/webhook',
      redirect_url: 'http://localhost:3000/boost/payment-result'
    });
    
    console.log('✅ Bill created successfully:');
    console.log('Bill ID:', testBill.id);
    console.log('Amount:', testBill.amount);
    console.log('State:', testBill.state);
    
    const paymentUrl = getBillURL(testBill.id);
    console.log('💳 Payment URL:', paymentUrl);
    
    console.log('🎯 Test Result: BILLPLZ API WORKING PERFECTLY!');
    
  } catch (error) {
    console.error('❌ Billplz API Error:', error.message);
    console.error('Full error:', error);
  }
}

testBillplz();