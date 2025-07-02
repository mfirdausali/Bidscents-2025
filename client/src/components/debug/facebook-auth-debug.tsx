import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Info } from 'lucide-react';

export function FacebookAuthDebug() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkAuthStatus = async () => {
    setIsChecking(true);
    const info: any = {
      timestamp: new Date().toISOString(),
      url: {
        full: window.location.href,
        hash: window.location.hash,
        search: window.location.search,
        origin: window.location.origin,
        protocol: window.location.protocol
      },
      supabase: {
        session: null,
        user: null,
        error: null
      },
      environment: {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        hasSupabaseKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
        nodeEnv: import.meta.env.NODE_ENV
      },
      localStorage: {
        hasAppToken: !!localStorage.getItem('app_token'),
        hasSupabaseAuth: !!localStorage.getItem('supabase.auth.token')
      }
    };

    try {
      // Check Supabase session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      info.supabase.session = session ? {
        accessToken: session.access_token ? '✓ Present' : '✗ Missing',
        refreshToken: session.refresh_token ? '✓ Present' : '✗ Missing',
        expiresAt: session.expires_at,
        provider: session.user?.app_metadata?.provider
      } : null;
      info.supabase.sessionError = sessionError?.message;

      // Check Supabase user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      info.supabase.user = user ? {
        id: user.id,
        email: user.email || 'Not provided',
        provider: user.app_metadata?.provider,
        emailConfirmed: user.email_confirmed_at ? '✓ Yes' : '✗ No',
        identities: user.identities?.map(id => ({
          provider: id.provider,
          hasEmail: !!id.email
        }))
      } : null;
      info.supabase.userError = userError?.message;

    } catch (error: any) {
      info.error = error.message;
    }

    setDebugInfo(info);
    setIsChecking(false);
  };

  const testFacebookLogin = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
          scopes: 'email public_profile',
          queryParams: {
            auth_type: 'rerequest',
            display: 'popup'
          }
        }
      });

      if (error) {
        console.error('Facebook login error:', error);
        alert(`Facebook login failed: ${error.message}`);
      } else {
        console.log('Facebook login initiated:', data);
      }
    } catch (error: any) {
      console.error('Facebook login exception:', error);
      alert(`Facebook login exception: ${error.message}`);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Facebook Authentication Debug Tool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={checkAuthStatus} disabled={isChecking}>
            {isChecking ? 'Checking...' : 'Check Auth Status'}
          </Button>
          <Button onClick={testFacebookLogin} variant="outline">
            Test Facebook Login
          </Button>
        </div>

        {debugInfo && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Debug information as of {new Date(debugInfo.timestamp).toLocaleString()}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <h3 className="font-semibold">URL Information</h3>
              <div className="text-sm space-y-1 font-mono bg-gray-100 p-2 rounded">
                <div>Full URL: {debugInfo.url.full}</div>
                <div>Hash: {debugInfo.url.hash || '(empty)'}</div>
                <div>Search: {debugInfo.url.search || '(empty)'}</div>
                <div>Protocol: {debugInfo.url.protocol}</div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Environment</h3>
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  {debugInfo.environment.supabaseUrl ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  Supabase URL: {debugInfo.environment.supabaseUrl || 'Not configured'}
                </div>
                <div className="flex items-center gap-2">
                  {debugInfo.environment.hasSupabaseKey ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  Supabase Key: {debugInfo.environment.hasSupabaseKey ? 'Configured' : 'Missing'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Supabase Session</h3>
              {debugInfo.supabase.sessionError ? (
                <Alert variant="destructive">
                  <AlertDescription>Error: {debugInfo.supabase.sessionError}</AlertDescription>
                </Alert>
              ) : debugInfo.supabase.session ? (
                <div className="text-sm space-y-1">
                  <div>Access Token: {debugInfo.supabase.session.accessToken}</div>
                  <div>Refresh Token: {debugInfo.supabase.session.refreshToken}</div>
                  <div>Provider: {debugInfo.supabase.session.provider}</div>
                  <div>Expires: {new Date(debugInfo.supabase.session.expiresAt * 1000).toLocaleString()}</div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No active session</div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Supabase User</h3>
              {debugInfo.supabase.userError ? (
                <Alert variant="destructive">
                  <AlertDescription>Error: {debugInfo.supabase.userError}</AlertDescription>
                </Alert>
              ) : debugInfo.supabase.user ? (
                <div className="text-sm space-y-1">
                  <div>ID: {debugInfo.supabase.user.id}</div>
                  <div>Email: {debugInfo.supabase.user.email}</div>
                  <div>Provider: {debugInfo.supabase.user.provider}</div>
                  <div>Email Confirmed: {debugInfo.supabase.user.emailConfirmed}</div>
                  {debugInfo.supabase.user.identities && (
                    <div>
                      Identities: {debugInfo.supabase.user.identities.map((id: any) => 
                        `${id.provider} (${id.hasEmail ? 'has email' : 'no email'})`
                      ).join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No user data</div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Local Storage</h3>
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-2">
                  {debugInfo.localStorage.hasAppToken ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  App Token: {debugInfo.localStorage.hasAppToken ? 'Present' : 'Missing'}
                </div>
                <div className="flex items-center gap-2">
                  {debugInfo.localStorage.hasSupabaseAuth ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  Supabase Auth: {debugInfo.localStorage.hasSupabaseAuth ? 'Present' : 'Missing'}
                </div>
              </div>
            </div>

            {debugInfo.error && (
              <Alert variant="destructive">
                <AlertDescription>General Error: {debugInfo.error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p className="font-semibold">Common Issues:</p>
            <ul className="list-disc list-inside text-sm space-y-1">
              <li>Ensure redirect URLs in Supabase match exactly: {window.location.origin}/auth-callback</li>
              <li>Check Facebook App settings for correct OAuth redirect URIs</li>
              <li>Verify email permission is requested in Facebook Login settings</li>
              <li>Make sure popups are not blocked in your browser</li>
              <li>In production, HTTPS is required for OAuth flows</li>
            </ul>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}