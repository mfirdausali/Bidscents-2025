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
        // Get the URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');
        const type = urlParams.get('type');

        console.log('🔄 Processing email verification:', { type, hasAccessToken: !!accessToken });

        if (type === 'signup' && accessToken && refreshToken) {
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

          console.log('✅ Email verification successful:', data);
          setVerificationStatus('success');
          
          toast({
            title: "Email verified successfully",
            description: "Your account has been verified. You can now sign in.",
          });

          // Redirect to home page after 2 seconds
          setTimeout(() => {
            setLocation('/');
          }, 2000);
        } else {
          console.log('❌ Invalid verification parameters');
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