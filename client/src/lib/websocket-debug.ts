// WebSocket debugging utility to track down the incorrect URL issue

// Store the original WebSocket constructor
const OriginalWebSocket = window.WebSocket;

// Override the WebSocket constructor
window.WebSocket = function(url: string | URL, protocols?: string | string[]) {
  console.log('🔍 [WebSocket Debug] New WebSocket connection attempt:', {
    url: url.toString(),
    protocols,
    stackTrace: new Error().stack
  });
  
  // Check if this is the problematic URL pattern
  const urlString = url.toString();
  if (urlString.includes('?token=') && !urlString.includes('/ws')) {
    console.warn('⚠️ [WebSocket Debug] Incorrect WebSocket URL detected!');
    console.warn('Expected format: ws://localhost:5000/ws');
    console.warn('Actual format:', urlString);
    console.trace('Stack trace for incorrect URL:');
  }
  
  // Create the actual WebSocket with the original constructor
  return new OriginalWebSocket(url, protocols);
} as any;

// Preserve all properties from the original WebSocket
Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
Object.setPrototypeOf(window.WebSocket.prototype, OriginalWebSocket.prototype);

export function enableWebSocketDebugging() {
  console.log('✅ WebSocket debugging enabled');
}