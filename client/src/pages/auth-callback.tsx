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
        // Get auth data from URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        
        if (!accessToken) {
          // Check for error in the URL
          const urlParams = new URLSearchParams(window.location.search);
          const errorParam = urlParams.get('error');
          const errorDescription = urlParams.get('error_description');
          
          if (errorParam) {
            setError(`Authentication failed: ${errorDescription || errorParam}`);
            return;
          }
          
          setError('No authentication data found in the URL');
          return;
        }

        // Get session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          setError(`Failed to get session: ${sessionError?.message || 'Unknown error'}`);
          return;
        }
        
        // Get user data
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          setError(`Failed to get user data: ${userError?.message || 'Unknown error'}`);
          return;
        }
        
        setMessage('Authentication successful! Syncing with our system...');

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