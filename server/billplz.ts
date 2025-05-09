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

  // Sort keys alphabetically and concatenate key=value pairs
  const keys = Object.keys(payloadForSignature).sort();
  const concatenatedString = keys.map(key => `${key}${payloadForSignature[key]}`).join('');

  // Create HMAC-SHA256 signature
  const hmac = crypto.createHmac('sha256', BILLPLZ_XSIGN_KEY);
  hmac.update(concatenatedString);
  const generatedSignature = hmac.digest('hex');

  return generatedSignature === xSignature;
}

/**
 * Format a URL for the Billplz bill payment page
 */
export function getBillURL(billId: string): string {
  return `https://www.billplz-sandbox.com/bills/${billId}`;
}

export default {
  createBill,
  getBill,
  deleteBill,
  verifyWebhookSignature,
  getBillURL,
};