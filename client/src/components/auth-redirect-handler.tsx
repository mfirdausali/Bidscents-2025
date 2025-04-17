import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * Component to handle Supabase auth redirects that might go to localhost:3000
 * This runs in the browser and detects if we're being redirected from Supabase auth
 * with access_token in the URL hash, then redirects to our verification page
 */
export function AuthRedirectHandler() {
  const [_, setLocation] = useLocation();

  useEffect(() => {
    // Detect if we're on localhost:3000 or have a hash with access_token (in development)
    const isLocalhost = window.location.hostname === 'localhost' && window.location.port === '3000';
    const hash = window.location.hash;
    const hasAuthToken = hash.includes('access_token=');
    
    if ((isLocalhost || hasAuthToken) && (hash.includes('type=signup') || hash.includes('type=recovery'))) {
      console.log('Detected auth redirect to localhost, redirecting to app...');
      
      // Parse the hash fragment to get the auth parameters
      const hashParams = new URLSearchParams(hash.substring(1));
      const type = hashParams.get('type');
      
      // Determine where to redirect based on the auth action type
      let redirectPath = '/';
      if (type === 'signup' || type === 'email_change') {
        redirectPath = '/verify-email';
      } else if (type === 'recovery') {
        redirectPath = '/reset-password';
      }
      
      // Preserve the hash fragment for the verification pages to use
      setLocation(`${redirectPath}${hash}`);
    }
  }, [setLocation]);

  return null;
}