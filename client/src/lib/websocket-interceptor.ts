/**
 * WebSocket interceptor to ensure all WebSocket connections use proper URLs
 * This fixes issues with undefined ports and incorrect WebSocket URLs
 */

import { getWebSocketUrl, validateWebSocketUrl } from './websocket-utils';

// Store the original WebSocket constructor
const OriginalWebSocket = window.WebSocket;

// Track whether we've already applied the interceptor
let isInterceptorActive = false;

export function setupWebSocketInterceptor() {
  if (isInterceptorActive) {
    console.log('🔄 WebSocket interceptor already active');
    return;
  }

  console.log('🛡️ Setting up WebSocket interceptor...');

  // Override the WebSocket constructor globally
  window.WebSocket = function(url: string | URL, protocols?: string | string[]) {
    const urlString = url.toString();
    
    console.log('🔍 [Interceptor] WebSocket connection attempt:', {
      originalUrl: urlString,
      protocols,
      stack: new Error().stack?.split('\n')[1]?.trim()
    });

    // Check if this is our application WebSocket vs other WebSockets (like Vite HMR)
    const isApplicationWebSocket = 
      urlString.includes('/ws') || 
      (!urlString.includes('__vite_ping') && 
       !urlString.includes('vite-hmr') && 
       !urlString.includes('__vite_'));

    if (isApplicationWebSocket) {
      // If this looks like our application WebSocket, ensure it uses the correct URL
      if (urlString.includes('undefined') || !validateWebSocketUrl(urlString)) {
        console.warn('⚠️ [Interceptor] Invalid WebSocket URL detected, using corrected URL');
        console.warn('   Original URL:', urlString);
        
        const correctedUrl = getWebSocketUrl();
        console.warn('   Corrected URL:', correctedUrl);
        
        // Use our utility to get the correct URL
        return new OriginalWebSocket(correctedUrl, protocols);
      }
    } else {
      // For non-application WebSockets (like Vite HMR), let them pass through
      // but log them for debugging
      console.log('🔗 [Interceptor] Non-application WebSocket detected:', {
        url: urlString,
        type: urlString.includes('__vite') ? 'Vite HMR' : 'Unknown'
      });
    }

    // Use the original URL if it's valid
    return new OriginalWebSocket(url, protocols);
  } as any;

  // Preserve all properties from the original WebSocket
  Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
  Object.setPrototypeOf(window.WebSocket.prototype, OriginalWebSocket.prototype);

  // Copy static properties
  Object.getOwnPropertyNames(OriginalWebSocket).forEach(name => {
    if (name !== 'length' && name !== 'name' && name !== 'prototype') {
      try {
        (window.WebSocket as any)[name] = (OriginalWebSocket as any)[name];
      } catch (e) {
        // Some properties might not be configurable
      }
    }
  });

  isInterceptorActive = true;
  console.log('✅ WebSocket interceptor setup complete');
}

export function removeWebSocketInterceptor() {
  if (!isInterceptorActive) {
    return;
  }

  console.log('🔄 Removing WebSocket interceptor...');
  window.WebSocket = OriginalWebSocket;
  isInterceptorActive = false;
  console.log('✅ WebSocket interceptor removed');
}

// Auto-setup in development
if (import.meta.env.DEV) {
  setupWebSocketInterceptor();
}