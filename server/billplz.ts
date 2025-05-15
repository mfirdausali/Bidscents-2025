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
 * Billplz redirect uses different format than webhook for query parameters
 * Query parameters are in format 'billplz[param]=value'
 * 
 * @param rawQueryString The raw query string from the redirect URL
 * @param expectedSignature The X-Signature value to verify against
 * @returns boolean indicating if the signature is valid
 */
export function verifyRedirectSignature(rawQueryString: string, expectedSignature: string): boolean {
  if (!BILLPLZ_XSIGN_KEY) {
    console.error('Missing BILLPLZ_XSIGN_KEY environment variable');
    return false;
  }
  
  if (!rawQueryString) {
    console.error('Raw query string is empty for redirect signature verification');
    return false;
  }

  console.log('🔐 REDIRECT SIGNATURE VERIFICATION START 🔐');
  console.log('-------------------------------------');
  console.log('Raw query string:', rawQueryString);
  console.log('Expected signature:', expectedSignature);
  console.log('BILLPLZ_XSIGN_KEY exists:', !!BILLPLZ_XSIGN_KEY);
  console.log('BILLPLZ_XSIGN_KEY length:', BILLPLZ_XSIGN_KEY?.length);
  console.log('-------------------------------------');

  try {
    // Split the raw query string into parts
    const parts = rawQueryString.split('&');
    
    // Create a list of key-value pairs in the format "keyvalue" (without the =)
    const elementsToSign: string[] = [];
    
    // Log all parameters for debugging
    console.log('Parsed parameters:');
    
    for (const part of parts) {
      // Skip empty parts
      if (!part) continue;
      
      // Split into key and value
      const [key, value] = part.split('=');
      
      if (key && key !== 'billplz[x_signature]') {
        const decodedValue = decodeURIComponent(value || '');
        console.log(`- ${key} = ${decodedValue}`);
        
        // Add to elements to sign
        elementsToSign.push(`${key}${decodedValue}`);
      }
    }
    
    // Sort elements alphabetically as per Billplz requirements
    elementsToSign.sort();
    
    // Print the elements for debugging
    console.log('Sorted elements for signing:');
    elementsToSign.forEach(element => console.log(`- ${element}`));
    
    // Join with pipe character
    const sourceString = elementsToSign.join('|');
    console.log('Source string for HMAC:', sourceString);
    
    // Create HMAC signature
    const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
    hmac.update(sourceString);
    const calculatedSignature = hmac.digest('hex');
    
    console.log('Calculated signature:', calculatedSignature);
    console.log('Expected signature:', expectedSignature);
    
    // Use timing-safe comparison for security
    try {
      const bufCalc = Buffer.from(calculatedSignature, 'hex');
      const bufExpected = Buffer.from(expectedSignature, 'hex');
      
      if (bufCalc.length !== bufExpected.length) {
        console.error('Buffer lengths do not match, cannot use timing-safe comparison');
        const isValid = calculatedSignature === expectedSignature;
        console.log(`Signature verification result: ${isValid ? 'VALID ✅' : 'INVALID ❌'} (string comparison)`);
        console.log('🔐 REDIRECT SIGNATURE VERIFICATION END 🔐');
        return isValid;
      }
      
      const isValid = crypto.timingSafeEqual(bufCalc, bufExpected);
      console.log(`Signature verification result: ${isValid ? 'VALID ✅' : 'INVALID ❌'} (timing-safe comparison)`);
      console.log('🔐 REDIRECT SIGNATURE VERIFICATION END 🔐');
      return isValid;
    } catch (error) {
      console.error('Error in timing-safe comparison:', error);
      const isValid = calculatedSignature === expectedSignature;
      console.log(`Signature verification result: ${isValid ? 'VALID ✅' : 'INVALID ❌'} (fallback string comparison)`);
      console.log('🔐 REDIRECT SIGNATURE VERIFICATION END 🔐');
      return isValid;
    }
  } catch (error) {
    console.error('Error processing redirect signature verification:', error);
    console.log('🔐 REDIRECT SIGNATURE VERIFICATION END 🔐');
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