/**
 * Centralized WebSocket URL utilities to ensure consistent URL construction
 * across the entire application and prevent undefined host/port issues.
 */

/**
 * Get the correct WebSocket URL for the current environment
 * This function handles both development and production environments
 * and ensures we never have undefined values in the URL.
 */
export function getWebSocketUrl(): string {
  // Determine protocol based on current page protocol
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  
  // Environment detection - use multiple checks for reliability
  const isDevelopment = 
    import.meta.env.DEV || 
    import.meta.env.MODE === 'development' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  
  let host: string;
  
  if (isDevelopment) {
    // In development, use localhost:3000 (the server port)
    host = 'localhost:3000';
  } else {
    // In production, use the current host
    host = window.location.host;
  }
  
  // Ensure host is never undefined or empty
  if (!host || host === 'undefined' || host === 'null') {
    console.error('❌ WebSocket host is invalid:', host);
    // Fallback to current location host
    host = window.location.host || 'localhost:3000';
  }
  
  const wsUrl = `${protocol}//${host}/ws`;
  
  // Log for debugging purposes
  console.log('🔗 [WebSocketUtils] Generated WebSocket URL:', wsUrl);
  console.log('🔗 [WebSocketUtils] Environment details:', {
    isDevelopment,
    protocol,
    host,
    currentLocation: window.location.href
  });
  
  return wsUrl;
}

/**
 * Create a WebSocket connection with proper error handling
 * @param url Optional URL override, otherwise uses getWebSocketUrl()
 * @returns WebSocket instance
 */
export function createWebSocket(url?: string): WebSocket {
  const wsUrl = url || getWebSocketUrl();
  
  // Final validation before creating WebSocket
  if (!wsUrl || wsUrl.includes('undefined') || wsUrl.includes('null')) {
    throw new Error(`Invalid WebSocket URL: ${wsUrl}`);
  }
  
  console.log('🚀 [WebSocketUtils] Creating WebSocket connection to:', wsUrl);
  
  try {
    return new WebSocket(wsUrl);
  } catch (error) {
    console.error('❌ [WebSocketUtils] Failed to create WebSocket:', error);
    throw error;
  }
}

/**
 * Validate a WebSocket URL to ensure it doesn't contain undefined values
 * @param url The URL to validate
 * @returns true if valid, false otherwise
 */
export function validateWebSocketUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('undefined')) return false;
  if (url.includes('null')) return false;
  if (!url.startsWith('ws://') && !url.startsWith('wss://')) return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}