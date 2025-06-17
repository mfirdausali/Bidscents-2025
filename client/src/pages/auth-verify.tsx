import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

export function AuthVerifyPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleEmailVerification = async () => {
      try {
        console.log('🔍 Full verification URL:', window.location.href);
        console.log('🔍 URL hash:', window.location.hash);
        console.log('🔍 URL search:', window.location.search);
        
        // Supabase sends auth tokens in the URL hash/fragment, not search params
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        
        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
        const type = hashParams.get('type') || searchParams.get('type');
        const token = searchParams.get('token'); // For legacy API endpoint support
        const code = searchParams.get('code'); // Supabase verification code

        console.log('🔄 Processing email verification:', { 
          type, 
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasToken: !!token,
          hasCode: !!code,
          hashKeys: Array.from(hashParams.keys()),
          searchKeys: Array.from(searchParams.keys())
        });

        // Method 1: Modern Supabase token flow (preferred)
        if (type === 'signup' && accessToken && refreshToken) {
          console.log('🔄 Using Supabase token flow...');
          
          // Set the session with the tokens from the email link
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (error) {
            console.error('❌ Error setting session:', error);
            setVerificationStatus('error');
            setErrorMessage(error.message);
            return;
          }

          console.log('✅ Email verification successful via Supabase:', data);
          
          // Now create or update local user profile
          try {
            const response = await fetch('/api/v1/auth/session', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                supabaseToken: accessToken
              })
            });

            if (response.ok) {
              const sessionData = await response.json();
              console.log('✅ Local user profile created/updated:', sessionData);
              
              // Store the application token
              localStorage.setItem('token', sessionData.token);
              
              setVerificationStatus('success');
              toast({
                title: "Email verified successfully",
                description: "Your account has been verified and is ready to use.",
              });

              // Redirect to home page after 2 seconds
              setTimeout(() => {
                setLocation('/');
              }, 2000);
            } else {
              const errorData = await response.json();
              console.error('❌ Failed to create local user profile:', errorData);
              setVerificationStatus('error');
              setErrorMessage('Email verified but failed to complete profile setup');
            }
          } catch (profileError) {
            console.error('❌ Error creating local user profile:', profileError);
            setVerificationStatus('error');
            setErrorMessage('Email verified but failed to complete profile setup');
          }
        } 
        // Method 2: Supabase verification code flow
        else if (code) {
          console.log('🔄 Using Supabase verification code flow...');
          
          try {
            // Use API verification for code parameter
            const response = await fetch(`/api/verify-email?code=${code}`);
            
            if (response.ok) {
              const apiData = await response.json();
              console.log('✅ API verification successful:', apiData);
              
              // Check if this requires manual sign-in
              if (apiData.requiresSignIn) {
                setVerificationStatus('success');
                toast({
                  title: "Email verified successfully",
                  description: "Your account has been verified. Please sign in to continue.",
                });
                
                setTimeout(() => {
                  setLocation('/auth?verified=true');
                }, 2000);
              } else {
                setVerificationStatus('success');
                toast({
                  title: "Email verified successfully",
                  description: "Your account has been verified and is ready to use.",
                });
                
                setTimeout(() => {
                  setLocation('/');
                }, 2000);
              }
            } else {
              const errorData = await response.json();
              console.error('❌ API verification failed:', errorData);
              setVerificationStatus('error');
              setErrorMessage(errorData.message || 'Email verification failed');
            }
          } catch (apiError) {
            console.error('❌ API verification error:', apiError);
            setVerificationStatus('error');
            setErrorMessage('Unable to verify email at this time');
          }
        }
        // Method 3: Legacy API endpoint flow (fallback)
        else if (token) {
          console.log('🔄 Using legacy API endpoint flow...');
          
          try {
            const response = await fetch(`/api/verify-email?token=${token}`);
            
            if (response.ok) {
              const data = await response.json();
              console.log('✅ Email verification successful via API:', data);
              
              setVerificationStatus('success');
              toast({
                title: "Email verified successfully",
                description: "Your account has been verified. You can now sign in.",
              });
              
              // Redirect to auth page after 2 seconds
              setTimeout(() => {
                setLocation('/auth?verified=true');
              }, 2000);
            } else {
              const errorData = await response.json();
              console.error('❌ API verification failed:', errorData);
              setVerificationStatus('error');
              setErrorMessage(errorData.message || 'Email verification failed');
            }
          } catch (apiError) {
            console.error('❌ API verification error:', apiError);
            setVerificationStatus('error');
            setErrorMessage('An unexpected error occurred during verification');
          }
        } else {
          console.log('❌ No valid verification parameters found');
          setVerificationStatus('error');
          setErrorMessage('Invalid verification link or missing parameters');
        }
      } catch (error) {
        console.error('❌ Error during email verification:', error);
        setVerificationStatus('error');
        setErrorMessage('An unexpected error occurred during verification');
      }
    };

    handleEmailVerification();
  }, [toast, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Email Verification
          </CardTitle>
          <CardDescription>
            Processing your email verification...
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {verificationStatus === 'loading' && (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-gray-600">Verifying your email address...</p>
            </div>
          )}

          {verificationStatus === 'success' && (
            <div className="flex flex-col items-center space-y-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="text-green-600 font-medium">Email verified successfully!</p>
                <p className="text-gray-600 text-sm mt-2">
                  Redirecting you to the homepage...
                </p>
              </div>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="flex flex-col items-center space-y-4">
              <XCircle className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-red-600 font-medium">Verification failed</p>
                <p className="text-gray-600 text-sm mt-2">{errorMessage}</p>
              </div>
              <Button 
                onClick={() => setLocation('/auth')}
                variant="outline"
                className="mt-4"
              >
                Return to Sign In
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}