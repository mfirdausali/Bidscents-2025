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

// Log configuration once on startup for diagnostics
console.log('⚙️ BILLPLZ CONFIGURATION ⚙️');
console.log('-------------------------');
console.log('BILLPLZ_BASE_URL:', BILLPLZ_BASE_URL);
console.log('BILLPLZ_COLLECTION_ID present:', !!BILLPLZ_COLLECTION_ID);
console.log('BILLPLZ_XSIGN_KEY present:', !!BILLPLZ_XSIGN_KEY);
console.log('BILLPLZ_SECRET_KEY present:', !!BILLPLZ_SECRET_KEY);
console.log('BILLPLZ_XSIGN_KEY length:', BILLPLZ_XSIGN_KEY?.length);
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
  body?: any
): Promise<any> {
  const url = `${BILLPLZ_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': createAuthHeader(),
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Billplz API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Billplz API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error making Billplz API request:', error);
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

  return billplzRequest('/v3/bills', 'POST', payload);
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
 * @param queryParams The redirect query parameters
 * @param xSignature The X-Signature value from the redirect URL
 * @returns boolean indicating if the signature is valid
 */
export function verifyRedirectSignature(queryParams: Record<string, any>, xSignature: string): boolean {
  if (!BILLPLZ_XSIGN_KEY) {
    console.error('Missing BILLPLZ_XSIGN_KEY environment variable');
    return false;
  }

  console.log('🔐 SIGNATURE VERIFICATION START 🔐');
  console.log('-------------------------------------');
  console.log('Input query params:', JSON.stringify(queryParams, null, 2));
  console.log('X-Signature to verify:', xSignature);
  console.log('BILLPLZ_XSIGN_KEY exists:', !!BILLPLZ_XSIGN_KEY);
  console.log('BILLPLZ_XSIGN_KEY length:', BILLPLZ_XSIGN_KEY?.length);
  console.log('-------------------------------------');

  // 1. Check if we have a nested billplz object (Express 4.18+) or flat structure
  const qp = queryParams.billplz || queryParams;
  
  // 2. Find the x_signature either in the nested object or as a flat key
  let receivedSignature;
  
  // Debug all available signatures in different formats
  if (qp.x_signature) {
    console.log('Found qp.x_signature:', qp.x_signature);
    receivedSignature = qp.x_signature;
  } else if (queryParams['billplz[x_signature]']) {
    console.log('Found billplz[x_signature]:', queryParams['billplz[x_signature]']);
    receivedSignature = queryParams['billplz[x_signature]'];
  } else {
    // Look for any key containing 'x_signature'
    console.log('Searching for signature in all keys...');
    Object.entries(queryParams).forEach(([key, value]) => {
      if (key.includes('x_signature') || key.includes('signature')) {
        console.log(`Found possible signature in key '${key}':`, value);
      }
    });
    
    console.error('Missing x_signature in query parameters');
    return false;
  }
  
  // Make sure the provided xSignature matches what's in the query params
  if (receivedSignature !== xSignature) {
    console.error(`Signature mismatch: Provided ${xSignature} but found ${receivedSignature} in query params`);
    return false;
  }
  
  // 3. Create payload for signature verification - properly extract keys
  const payloadForSignature: Record<string, any> = {};
  
  // Create debug info for request structure
  let requestStructureDebug = {
    hasNestedBillplz: !!queryParams.billplz && typeof queryParams.billplz === 'object',
    flatKeysFound: [] as string[],
    nestedKeysFound: [] as string[],
    allQueryKeys: Object.keys(queryParams)
  };
  
  // Handle nested object case first
  if (requestStructureDebug.hasNestedBillplz) {
    console.log('QUERY STRUCTURE: Using nested billplz object format');
    // If using Express 4.18+ with nested objects
    const billplzParams = { ...queryParams.billplz };
    delete billplzParams.x_signature;
    Object.assign(payloadForSignature, billplzParams);
    
    // For debugging
    requestStructureDebug.nestedKeysFound = Object.keys(billplzParams);
    console.log('Keys found in nested billplz object:', requestStructureDebug.nestedKeysFound);
  } else {
    console.log('QUERY STRUCTURE: Using flat billplz[param]=value format');
    // Handle flat keys case (older Express or custom query parser)
    for (const [key, value] of Object.entries(queryParams)) {
      // Skip the signature parameter itself
      if (key === 'billplz[x_signature]') continue;
      
      // Extract the parameter name from the format 'billplz[param]'
      const match = key.match(/billplz\[(.*)\]/);
      if (match && match[1]) {
        const paramName = match[1];
        payloadForSignature[paramName] = value;
        requestStructureDebug.flatKeysFound.push(paramName);
      }
    }
    console.log('Extracted parameters from flat keys:', requestStructureDebug.flatKeysFound);
  }
  
  console.log('PAYLOAD EXTRACTION: Complete payload for signature verification:', payloadForSignature);
  
  // Handle special case if payload is empty - this is usually a bug!
  if (Object.keys(payloadForSignature).length === 0) {
    console.error('⚠️ CRITICAL ERROR: Empty payload for signature verification');
    console.log('This usually means the query parameters format is not recognized.');
    console.log('Attempting fallback extraction method...');
    
    // Fallback extraction for any structure
    // Direct extraction for nested format
    if (queryParams.billplz && typeof queryParams.billplz === 'object') {
      for (const [key, value] of Object.entries(queryParams.billplz)) {
        if (key !== 'x_signature') {
          payloadForSignature[key] = value;
        }
      }
    } else {
      // Try to find any 'billplz[XXX]' style param and extract XXX as key
      for (const [key, value] of Object.entries(queryParams)) {
        if (key !== 'billplz[x_signature]' && key.startsWith('billplz[') && key.endsWith(']')) {
          const paramName = key.substring(8, key.length - 1);
          payloadForSignature[paramName] = value;
        }
      }
    }
    
    console.log('FALLBACK EXTRACTION: Updated payload:', payloadForSignature);
  }
  
  // 4. Sort keys alphabetically and pipe-concatenate key+value pairs according to Billplz docs
  const keys = Object.keys(payloadForSignature).sort();
  
  // Handle case where values are arrays (Express query parser might create these)
  const normalizedPayload: Record<string, string> = {};
  for (const key of keys) {
    let value = payloadForSignature[key];
    
    // If value is an array with one item, use that item instead
    if (Array.isArray(value) && value.length === 1) {
      console.log(`Converting array value for key '${key}' to string:`, value[0]);
      normalizedPayload[key] = value[0].toString();
    } else {
      normalizedPayload[key] = value?.toString() || '';
    }
  }
  
  // Re-sort keys after normalization
  const sortedKeys = Object.keys(normalizedPayload).sort();
  const concatenatedString = sortedKeys.map(key => `${key}${normalizedPayload[key]}`).join('|');
  
  console.log('SIGNATURE BUILDING: Normalized payload:', normalizedPayload);
  console.log('SIGNATURE BUILDING: Concatenated string for signature:', concatenatedString);

  // 5. Create HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
  hmac.update(concatenatedString);
  const calculatedSignature = hmac.digest('hex');

  console.log('SIGNATURE VERIFICATION:');
  console.log('- Calculated signature:', calculatedSignature);
  console.log('- Received signature:', xSignature);
  console.log('- Signatures match?', calculatedSignature === xSignature);
  
  // 6. Use constant-time comparison for security
  try {
    const bufCalc = Buffer.from(calculatedSignature, 'hex');
    const bufReceived = Buffer.from(xSignature, 'hex');
    
    console.log('- Buffer lengths match?', bufCalc.length === bufReceived.length);
    
    if (bufCalc.length !== bufReceived.length) {
      console.error('⚠️ Buffer lengths do not match! Cannot use timing-safe comparison');
      console.log('- Calculated buffer length:', bufCalc.length);
      console.log('- Received buffer length:', bufReceived.length);
      // Fallback to regular string comparison
      const isValid = calculatedSignature === xSignature;
      console.log(`RESULT: ${isValid ? 'VALID ✅' : 'INVALID ❌'} (string comparison)`);
      return isValid;
    }
    
    const isValid = crypto.timingSafeEqual(bufCalc, bufReceived);
    console.log(`RESULT: ${isValid ? 'VALID ✅' : 'INVALID ❌'} (timing-safe comparison)`);
    return isValid;
  } catch (e) {
    console.error('Error in timing-safe signature comparison:', e);
    // Fallback to regular comparison if lengths are different or other errors
    const isValid = calculatedSignature === xSignature;
    console.log(`RESULT: ${isValid ? 'VALID ✅' : 'INVALID ❌'} (fallback string comparison)`);
    return isValid;
  } finally {
    console.log('🔐 SIGNATURE VERIFICATION END 🔐');
  }
}

/**
 * Format a URL for the Billplz bill payment page
 */
export function getBillURL(billId: string): string {
  return `https://www.billplz-sandbox.com/bills/${billId}`;
}