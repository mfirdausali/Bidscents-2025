require('dotenv').config();
const crypto = require('crypto');

const BILLPLZ_XSIGN_KEY = process.env.BILLPLZ_XSIGN_KEY;

function verifyWebhookSignature(payload, xSignature) {
  if (!BILLPLZ_XSIGN_KEY) {
    console.error('🔴 Missing BILLPLZ_XSIGN_KEY environment variable for webhook verification');
    return false;
  }
  
  if (!xSignature) {
    console.error('🔴 Missing X-Signature for webhook verification');
    return false;
  }
  
  if (!payload) {
    console.error('🔴 Missing payload for webhook signature verification');
    return false;
  }

  console.log('🔐 WEBHOOK SIGNATURE VERIFICATION START 🔐');
  console.log('-------------------------------------');
  console.log('X-Signature:', xSignature);
  console.log('BILLPLZ_XSIGN_KEY exists:', !!BILLPLZ_XSIGN_KEY);
  console.log('BILLPLZ_XSIGN_KEY length:', BILLPLZ_XSIGN_KEY?.length);
  console.log('-------------------------------------');

  try {
    // Remove x_signature from the payload if present
    const payloadForSignature = { ...payload };
    delete payloadForSignature.x_signature;

    // Sort keys alphabetically and concatenate key=value pairs with pipe separator
    const keys = Object.keys(payloadForSignature).sort();
    const concatenatedString = keys.map(key => `${key}${payloadForSignature[key]}`).join('|');

    console.log('Source string for HMAC:', concatenatedString);

    // Create HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
    hmac.update(concatenatedString);
    const calculatedSignature = hmac.digest('hex');

    console.log('Calculated signature:', calculatedSignature);
    console.log('Expected signature:', xSignature);

    // Use constant-time comparison for security
    try {
      const calcBuffer = Buffer.from(calculatedSignature, 'hex');
      const expectedBuffer = Buffer.from(xSignature, 'hex');
      
      if (calcBuffer.length !== expectedBuffer.length) {
        console.warn('⚠️ Buffer length mismatch for webhook signature');
        const isEqual = calculatedSignature === xSignature;
        console.log(`RESULT (fallback string comparison): ${isEqual ? 'VALID ✅' : 'INVALID ❌'}`);
        return isEqual;
      }

      const isValid = crypto.timingSafeEqual(calcBuffer, expectedBuffer);
      console.log(`RESULT (timing-safe comparison): ${isValid ? 'VALID ✅' : 'INVALID ❌'}`);
      
      return isValid;
    } catch (e) {
      console.error('🔴 Error in timing-safe comparison for webhook:', e);
      const isEqual = calculatedSignature === xSignature;
      console.log(`RESULT (exception fallback): ${isEqual ? 'VALID ✅' : 'INVALID ❌'}`);
      return isEqual;
    }
  } catch (e) {
    console.error('🔴 Error processing webhook signature verification:', e);
    return false;
  }
}

function testWebhookSignature() {
  console.log('🧪 Testing Webhook Signature Verification');
  console.log('==========================================');
  
  // Test payload - simulating a typical Billplz webhook
  const testPayload = {
    id: 'inbmmepb',
    collection_id: 'xwykvh3e',
    paid: true,
    state: 'paid',
    amount: 500,
    paid_amount: 500,
    due_at: '2025-06-26 06:52:00 +0800',
    email: 'test@example.com',
    mobile: null,
    name: 'Test User',
    url: 'https://www.billplz-sandbox.com/bills/inbmmepb',
    paid_at: '2025-06-25 23:52:00 +0800'
  };
  
  // Generate a test signature
  const keys = Object.keys(testPayload).sort();
  const concatenatedString = keys.map(key => `${key}${testPayload[key]}`).join('|');
  const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
  hmac.update(concatenatedString);
  const testSignature = hmac.digest('hex');
  
  console.log('Test payload:', JSON.stringify(testPayload, null, 2));
  console.log('Generated test signature:', testSignature);
  
  // Test with correct signature
  console.log('\n📝 Test 1: Valid signature');
  const result1 = verifyWebhookSignature(testPayload, testSignature);
  
  // Test with invalid signature
  console.log('\n📝 Test 2: Invalid signature');
  const result2 = verifyWebhookSignature(testPayload, 'invalid_signature');
  
  console.log('\n🎯 Test Results:');
  console.log('Valid signature test:', result1 ? 'PASSED ✅' : 'FAILED ❌');
  console.log('Invalid signature test:', !result2 ? 'PASSED ✅' : 'FAILED ❌');
  
  if (result1 && !result2) {
    console.log('\n🎉 WEBHOOK SIGNATURE VERIFICATION WORKING PERFECTLY!');
  } else {
    console.log('\n❌ WEBHOOK SIGNATURE VERIFICATION HAS ISSUES!');
  }
}

testWebhookSignature();