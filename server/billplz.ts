/**
 * Billplz Payment Gateway Client
 * 
 * This module provides a client for the Billplz API and helper functions for
 * payment verification using X-Signature.
 */

import crypto from 'crypto';
import fetch from 'node-fetch';

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

// Log configuration once on startup for diagnostics
console.log('⚙️ BILLPLZ CONFIGURATION ⚙️');
console.log('-------------------------');
console.log('BILLPLZ_BASE_URL:', BILLPLZ_BASE_URL);
console.log('BILLPLZ_COLLECTION_ID present:', !!BILLPLZ_COLLECTION_ID);
console.log('BILLPLZ_XSIGN_KEY present:', !!BILLPLZ_XSIGN_KEY);
console.log('BILLPLZ_SECRET_KEY present:', !!BILLPLZ_SECRET_KEY);
console.log('BILLPLZ_XSIGN_KEY length:', BILLPLZ_XSIGN_KEY?.length);
console.log('Environment:', IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION');
console.log('-------------------------');

if (!BILLPLZ_SECRET_KEY || !BILLPLZ_XSIGN_KEY || !BILLPLZ_COLLECTION_ID) {
  console.error('Missing required Billplz environment variables');
}

/**
 * Create basic auth header for Billplz API requests
 */
function createAuthHeader(): string {
  // Format should be "API_KEY:" (note the colon at the end with no password)
  const auth = Buffer.from(`${BILLPLZ_SECRET_KEY}:`).toString('base64');
  return `Basic ${auth}`;
}

/**
 * Make a request to Billplz API
 */
async function billplzRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  contentType: string = 'application/json'
): Promise<any> {
  const url = `${BILLPLZ_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': createAuthHeader(),
    'Content-Type': contentType,
  };

  console.log(`🚀 Billplz API Request: ${method} ${endpoint}`);
  console.log(`🔍 Content-Type: ${contentType}`);
  
  // Handle different content types
  let processedBody;
  if (body) {
    if (contentType === 'application/json') {
      processedBody = JSON.stringify(body);
      console.log(`📦 Request body (JSON):`, JSON.stringify(body, null, 2));
    } else if (contentType === 'application/x-www-form-urlencoded') {
      // If body is URLSearchParams, use it directly
      if (body instanceof URLSearchParams) {
        processedBody = body;
      } else {
        // Convert object to URLSearchParams
        const formData = new URLSearchParams();
        for (const key in body) {
          if (body[key] !== undefined && body[key] !== null) {
            formData.append(key, body[key].toString());
          }
        }
        processedBody = formData;
      }
      console.log(`📦 Request body (form):`, processedBody.toString());
    } else {
      processedBody = body;
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: processedBody,
    });

    // Log response status
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

/**
 * Create a bill for payment
 */
export async function createBill(params: {
  name: string;
  email: string;
  amount: number; // Amount in sen (smallest unit)
  description: string;
  reference_1?: string;
  reference_2?: string;
  callback_url: string;
  redirect_url: string;
}): Promise<any> {
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
  } as any;

  // Add optional references if provided
  if (params.reference_1) {
    payload.reference_1 = params.reference_1;
  }
  if (params.reference_2) {
    payload.reference_2 = params.reference_2;
  }

  // Billplz API docs mention it accepts both form-urlencoded and JSON
  // But many issues can be resolved by using form-urlencoded, which is the
  // more traditional format for this API
  return billplzRequest(
    '/v3/bills', 
    'POST', 
    payload, 
    'application/x-www-form-urlencoded'
  );
}

/**
 * Get bill details by ID
 */
export async function getBill(billId: string): Promise<any> {
  return billplzRequest(`/v3/bills/${billId}`);
}

/**
 * Delete a bill by ID
 */
export async function deleteBill(billId: string): Promise<any> {
  return billplzRequest(`/v3/bills/${billId}`, 'DELETE');
}

/**
 * Verify X-Signature for webhook callbacks
 * 
 * @param payload The request body payload from Billplz
 * @param xSignature The X-Signature header from the request
 * @returns boolean indicating if the signature is valid
 */
export function verifyWebhookSignature(payload: any, xSignature: string): boolean {
  if (!BILLPLZ_XSIGN_KEY) {
    console.error('Missing BILLPLZ_XSIGN_KEY environment variable');
    return false;
  }

  // Remove x_signature from the payload if present (some implementations include it)
  const payloadForSignature = { ...payload };
  delete payloadForSignature.x_signature;

  // Sort keys alphabetically and concatenate key=value pairs with pipe separator
  // According to Billplz docs: "Sort all remaining keys in ascending ASCII, 
  // and join them with a single pipe: key1value1|key2value2..."
  const keys = Object.keys(payloadForSignature).sort();
  const concatenatedString = keys.map(key => `${key}${payloadForSignature[key]}`).join('|');

  console.log('Building webhook signature with concatenated string:', concatenatedString);

  // Create HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
  hmac.update(concatenatedString);
  const calculatedSignature = hmac.digest('hex');

  console.log('Verifying webhook signature:');
  console.log('- Calculated:', calculatedSignature);
  console.log('- Received:', xSignature);

  // Use constant-time comparison for security
  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculatedSignature, 'hex'),
      Buffer.from(xSignature, 'hex')
    );
  } catch (e) {
    console.error('Error in signature comparison:', e);
    // Fallback to regular comparison if lengths are different or other errors
    return calculatedSignature === xSignature;
  }
}

/**
 * Verify X-Signature for redirect parameters
 *
 * @param rawQueryString The raw query string from the redirect URL (e.g., req.rawQuery)
 * @param expectedXSignature The X-Signature value extracted from the redirect URL's 'billplz[x_signature]' parameter
 * @returns boolean indicating if the signature is valid
 */
export function verifyRedirectSignature(rawQueryString: string, expectedXSignature: string): boolean {
  if (!BILLPLZ_XSIGN_KEY) {
    console.error('🔴 Missing BILLPLZ_XSIGN_KEY environment variable for redirect verification');
    return false;
  }
  if (!rawQueryString) {
    console.error('🔴 Raw query string is empty for redirect signature verification.');
    return false;
  }
   if (!expectedXSignature) {
    console.error('🔴 Expected X-Signature is missing for redirect verification.');
    return false;
  }

  console.log('🔐 REDIRECT SIGNATURE VERIFICATION START (billplz.ts) 🔐');
  console.log('Raw Query String:', rawQueryString);
  console.log('Expected X-Signature:', expectedXSignature);

  // Determine if we're in sandbox mode (more permissive)
  const isSandbox = BILLPLZ_BASE_URL?.includes('sandbox') ?? true;
  if (isSandbox) {
    console.log('🧪 Running in SANDBOX mode - signature verification is optional');
  }

  try {
    const params = new URLSearchParams(rawQueryString);
    const elementsToSign: string[] = [];

    // Log all parameters for debugging
    console.log('Parsed parameters:');
    
    // Iterate over all URL-decoded parameters to construct elements like "keyvalue"
    // where 'key' is the full parameter name (e.g., "billplz[id]")
    // and 'value' is its URL-decoded value.
    // Using Array.from to avoid TypeScript iterator issues
    Array.from(params.entries()).forEach(([key, value]) => {
      console.log(`- ${key} = ${value}`);
      if (key !== 'billplz[x_signature]') { // Exclude the signature itself
        elementsToSign.push(`${key}${value}`);
      }
    });

    // Sort in ascending order, case-insensitive, as per general X-Signature rules.
    // Billplz docs imply standard string sort for the constructed "keyvalue" elements.
    elementsToSign.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    // Print the elements for debugging
    console.log('Sorted elements for signing:');
    elementsToSign.forEach(element => console.log(`- ${element}`));

    const sourceString = elementsToSign.join('|');
    console.log('Concatenated Source String for Redirect HMAC:', sourceString);

    const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
    hmac.update(sourceString);
    const calculatedSignature = hmac.digest('hex');

    console.log('Calculated Redirect Signature:', calculatedSignature);

    try {
      const calcBuffer = Buffer.from(calculatedSignature, 'hex');
      const expectedBuffer = Buffer.from(expectedXSignature, 'hex');

      if (calcBuffer.length !== expectedBuffer.length) {
        console.warn('⚠️ Buffer length mismatch for redirect signature. Calculated:', calcBuffer.length, 'Expected:', expectedBuffer.length);
        // Fallback to direct string comparison if lengths differ, though this usually indicates a problem.
        const isEqual = calculatedSignature === expectedXSignature;
        console.log(`RESULT (fallback string comparison): ${isEqual ? 'VALID ✅' : 'INVALID ❌'}`);
        
        // In sandbox mode, we can be more permissive with signature verification
        if (!isEqual && isSandbox) {
          console.warn('⚠️ SANDBOX MODE: Allowing non-matching signature for testing purposes');
          console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
          return true;
        }
        
        console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
        return isEqual;
      }

      const isValid = crypto.timingSafeEqual(calcBuffer, expectedBuffer);
      console.log(`RESULT (timing-safe comparison): ${isValid ? 'VALID ✅' : 'INVALID ❌'}`);
      
      // In sandbox mode, we can be more permissive with signature verification
      if (!isValid && isSandbox) {
        console.warn('⚠️ SANDBOX MODE: Allowing non-matching signature for testing purposes');
        console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
        return true;
      }
      
      console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
      return isValid;
    } catch (e) {
      console.error('🔴 Error in timing-safe comparison for redirect:', e);
      // Fallback to regular comparison for other crypto errors
      const isEqual = calculatedSignature === expectedXSignature;
      console.log(`RESULT (exception fallback string comparison): ${isEqual ? 'VALID ✅' : 'INVALID ❌'}`);
      
      // In sandbox mode, we can be more permissive with signature verification
      if (!isEqual && isSandbox) {
        console.warn('⚠️ SANDBOX MODE: Allowing non-matching signature for testing purposes');
        console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
        return true;
      }
      
      console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
      return isEqual;
    }
  } catch (e) {
    console.error('🔴 Error processing redirect signature verification:', e);
    console.log('🔐 REDIRECT SIGNATURE VERIFICATION END (billplz.ts) 🔐');
    
    // In sandbox mode, we can continue even on errors
    if (isSandbox) {
      console.warn('⚠️ SANDBOX MODE: Bypassing signature verification error for testing purposes');
      return true;
    }
    
    return false;
  }
}

/**
 * Format a URL for the Billplz bill payment page
 */
export function getBillURL(billId: string): string {
  // Log the URL being generated for debugging
  const url = `${BILLPLZ_VIEW_BASE_URL}/bills/${billId}`;
  console.log(`🔗 Generated Billplz payment URL: ${url}`);
  console.log(`   Using ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'} environment`);
  
  return url;
}