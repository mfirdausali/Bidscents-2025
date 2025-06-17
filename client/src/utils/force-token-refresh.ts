/**
 * Force JWT Token Refresh Utility
 * 
 * This utility handles clearing old JWT tokens that don't have the required
 * audience and issuer claims, forcing users to re-authenticate with new tokens.
 */

import { removeAuthToken } from '../lib/queryClient';
import { supabase } from '../lib/supabase';

export async function forceTokenRefresh(): Promise<void> {
  try {
    console.log('🔄 Forcing JWT token refresh - clearing old token');
    
    // Clear the application JWT token
    removeAuthToken();
    
    // Clear any cached user data
    localStorage.removeItem('app_token');
    localStorage.removeItem('user');
    
    // Force refresh the Supabase session to trigger token exchange
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Trigger a fresh token exchange by refreshing the session
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('❌ Session refresh failed:', error);
        // Force sign out if refresh fails
        await supabase.auth.signOut();
      } else {
        console.log('✅ Session refreshed successfully');
      }
    } else {
      console.log('ℹ️ No active session found - user needs to sign in');
    }
    
    // Reload the page to start fresh
    window.location.reload();
  } catch (error) {
    console.error('❌ Force token refresh failed:', error);
    // As a fallback, just reload the page
    window.location.reload();
  }
}

// Auto-detect old tokens and force refresh if needed
export function checkTokenAndRefreshIfNeeded(): void {
  const token = localStorage.getItem('app_token');
  
  if (token) {
    try {
      // Decode the JWT payload without verification
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      
      const payload = JSON.parse(jsonPayload);
      
      // Check if token is missing required claims
      if (!payload.aud || !payload.iss) {
        console.log('🔍 Detected old JWT token format - forcing refresh');
        forceTokenRefresh();
        return;
      }
      
      // Check if token has correct audience and issuer
      if (payload.aud !== 'bidscents-users' || payload.iss !== 'bidscents-marketplace') {
        console.log('🔍 Detected JWT token with wrong audience/issuer - forcing refresh');
        forceTokenRefresh();
        return;
      }
      
      console.log('✅ JWT token format is valid');
    } catch (error) {
      console.error('❌ Error checking token format:', error);
      // If we can't decode the token, it's probably invalid
      forceTokenRefresh();
    }
  }
}