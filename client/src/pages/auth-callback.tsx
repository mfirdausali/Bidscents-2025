import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState('Processing your authentication...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        console.log('🔄 Auth callback started');
        console.log('Full URL:', window.location.href);
        console.log('URL hash:', window.location.hash);
        console.log('URL search:', window.location.search);
        
        // First, check if Supabase has already processed the auth callback
        // This handles cases where the hash fragment was processed and removed
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (session && !sessionError) {
          console.log('✅ Found existing Supabase session, processing...');
          setMessage('Authentication successful! Syncing with our system...');
          
          // Get user data from the existing session
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          
          if (userError || !user) {
            setError(`Failed to get user data: ${userError?.message || 'Unknown error'}`);
            return;
          }
          
          // Process the user data as normal
          if (!user.email) {
            const facebookIdentity = user.identities?.find(id => id.provider === 'facebook');
            const fallbackEmail = facebookIdentity?.email || user.user_metadata?.email;
            
            if (!fallbackEmail) {
              setError('Error getting user email from external provider. Please ensure you grant email permission when logging in with Facebook.');
              console.error('Facebook OAuth: No email returned', {
                userId: user.id,
                userMetadata: user.user_metadata,
                identities: user.identities,
                appMetadata: user.app_metadata
              });
              return;
            }
            
            user.email = fallbackEmail;
            console.log('📧 Using fallback email from identity:', fallbackEmail);
          }
          
          // Sync with backend
          const res = await apiRequest('POST', '/api/auth/sync-oauth-user', {
            email: user.email,
            providerId: user.id,
            provider: 'facebook'
          });
          
          if (!res.ok) {
            const errorData = await res.json();
            setError(`Failed to sync user: ${errorData.message || 'Unknown error'}`);
            return;
          }
          
          // Success
          toast({
            title: 'Authentication successful',
            description: 'You have been successfully signed in with Facebook',
          });
          
          navigate('/');
          return;
        }
        
        // If no existing session, try to get auth data from URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const tokenType = hashParams.get('token_type');
        const refreshToken = hashParams.get('refresh_token');
        
        console.log('Auth tokens found:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          tokenType
        });
        
        if (!accessToken) {
          // Check for error in the URL
          const urlParams = new URLSearchParams(window.location.search);
          const errorParam = urlParams.get('error');
          const errorDescription = urlParams.get('error_description');
          
          if (errorParam) {
            console.error('OAuth error in URL:', { error: errorParam, description: errorDescription });
            
            // Provide more specific error messages
            if (errorParam === 'access_denied') {
              setError('You cancelled the Facebook login or denied permissions. Please try again and grant the required permissions.');
            } else if (errorDescription?.includes('email')) {
              setError('Email permission is required to create an account. Please try again and grant email access when prompted.');
            } else {
              setError(`Authentication failed: ${errorDescription || errorParam}`);
            }
            return;
          }
          
          // If no tokens and no error, this might be a redirect issue
          console.error('No auth data found. Checking for common issues...');
          
          // Check if we're on HTTPS in production
          if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
            setError('Authentication requires HTTPS. Please use a secure connection.');
            return;
          }
          
          setError('No authentication data found in the URL. This might be due to a configuration issue. Please try again or contact support.');
          return;
        }

        // Get session with URL tokens
        const { data: { session: urlSession }, error: urlSessionError } = await supabase.auth.getSession();
        
        console.log('Session result:', {
          hasSession: !!urlSession,
          sessionError: urlSessionError?.message,
          provider: urlSession?.user?.app_metadata?.provider
        });
        
        if (urlSessionError || !urlSession) {
          setError(`Failed to get session: ${urlSessionError?.message || 'Unknown error'}`);
          return;
        }
        
        // Get user data
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        console.log('User data:', {
          hasUser: !!user,
          userError: userError?.message,
          email: user?.email,
          provider: user?.app_metadata?.provider,
          identities: user?.identities?.map(id => ({ provider: id.provider, email: id.email }))
        });
        
        if (userError || !user) {
          setError(`Failed to get user data: ${userError?.message || 'Unknown error'}`);
          return;
        }
        
        setMessage('Authentication successful! Syncing with our system...');

        // Check if we got email from the provider
        if (!user.email) {
          // Try to get email from identities (Facebook might store it there)
          const facebookIdentity = user.identities?.find(id => id.provider === 'facebook');
          const fallbackEmail = facebookIdentity?.email || user.user_metadata?.email;
          
          if (!fallbackEmail) {
            setError('Error getting user email from external provider. Please ensure you grant email permission when logging in with Facebook.');
            console.error('Facebook OAuth: No email returned', {
              userId: user.id,
              userMetadata: user.user_metadata,
              identities: user.identities,
              appMetadata: user.app_metadata
            });
            return;
          }
          
          // Use the fallback email
          user.email = fallbackEmail;
          console.log('📧 Using fallback email from identity:', fallbackEmail);
        }

        // Sync Supabase user with our backend
        const res = await apiRequest('POST', '/api/auth/sync-oauth-user', {
          email: user.email,
          providerId: user.id,
          provider: 'facebook'
        });

        if (!res.ok) {
          const errorData = await res.json();
          setError(`Failed to sync user: ${errorData.message || 'Unknown error'}`);
          return;
        }

        // Success - redirect to home page
        toast({
          title: 'Authentication successful',
          description: 'You have been successfully signed in with Facebook',
        });
        
        navigate('/');
      } catch (err: any) {
        console.error('Auth callback error:', err);
        setError(`An unexpected error occurred: ${err.message}`);
      }
    }

    handleAuthCallback();
  }, [navigate, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto max-w-md text-center">
        {error ? (
          <div className="p-6 rounded-lg bg-destructive/10 text-destructive">
            <h1 className="text-2xl font-bold mb-4">Authentication Error</h1>
            <p>{error}</p>
            <button
              className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              onClick={() => navigate('/auth')}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <h1 className="text-2xl font-bold">Processing Authentication</h1>
            <p className="text-muted-foreground">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}