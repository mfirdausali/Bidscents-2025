import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// Schema for the new password form
const resetPasswordSchema = z.object({
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// IMPORTANT: We use a direct Supabase client for password reset
// This avoids conflicts with any other Supabase instances
// We need hardcoded values here since env vars aren't available client-side
const SUPABASE_URL = 'https://rjazuitnzsximznfcbfw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYXp1aXRuenN4aW16bmZjYmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyNTY4MzgsImV4cCI6MjA1NDgzMjgzOH0.7I6R0fOmUvM-GKYpT1aT9vfIVkgdp8XESSRDwYPFu3k';

// A function to parse the token from the URL hash
function parseHashFragment() {
  if (typeof window === 'undefined') return null;
  
  // The Supabase recovery hash looks like:
  // #access_token=xxx&refresh_token=xxx&expires_in=yyy&token_type=bearer&type=recovery
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#')) return null;
  
  try {
    // Parse the hash parameters
    const hashParams = new URLSearchParams(hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const type = hashParams.get('type');
    
    // Only handle recovery flows
    if (type === 'recovery' && accessToken) {
      return {
        accessToken,
        refreshToken: refreshToken || '',
        type
      };
    }
  } catch (error) {
    console.error('Failed to parse hash fragment:', error);
  }
  
  return null;
}

// Create a dedicated client with hash detection disabled - we'll handle it manually
const passwordResetClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // We handle URL parsing ourselves for better control
    storageKey: 'supabase-password-reset' // Unique storage key to avoid conflicts
  }
});

export default function ResetPasswordPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>('checking');
  
  // Extract token from URL hash or query parameters
  const [token, setToken] = useState('');
  
  // This effect is no longer needed since we've consolidated all token detection in the second effect
  // The code has been merged with the other useEffect
  
  // This function is no longer needed as we have a cleaner implementation with parseHashFragment

  // Handle the URL parameters and tokens when the component mounts
  useEffect(() => {
    console.log('RESET PAGE: Initializing password reset page');
    
    // First, try to parse the hash from the URL (recovery flow)
    const hashData = parseHashFragment();
    
    if (hashData) {
      console.log('RESET PAGE: Found recovery token in URL hash, setting up session...');
      
      // Set up a session with the token from the hash
      (async () => {
        try {
          // Step 1: Try setting the session with the extracted token
          const { error: sessionError } = await passwordResetClient.auth.setSession({
            access_token: hashData.accessToken,
            refresh_token: hashData.refreshToken
          });
          
          if (sessionError) {
            console.error('RESET PAGE: Error setting session with hash tokens:', sessionError);
            // If session can't be set, store the token for later use with updatePassword
            setToken(hashData.accessToken);
            setSessionStatus('token-extracted');
          } else {
            console.log('RESET PAGE: Successfully set session with hash tokens!');
            setSessionStatus('session-from-hash');
            setToken('SESSION_FROM_HASH');
          }
        } catch (err) {
          console.error('RESET PAGE: Exception setting session from hash:', err);
          setSessionStatus('error-hash');
          // Still store the token for later use
          setToken(hashData.accessToken);
        }
      })();
      
      return; // Skip further checks if we found and processed hash tokens
    }
    
    console.log('RESET PAGE: No hash token found, checking for existing session...');
    
    // Check if there's already an active session in the client
    (async () => {
      try {
        const { data, error } = await passwordResetClient.auth.getSession();
        
        if (error) {
          console.error('RESET PAGE: Error getting session:', error);
          setSessionStatus('no-session');
        } else if (data?.session) {
          console.log('RESET PAGE: Found active session!');
          setSessionStatus('existing-session');
          setToken('EXISTING_SESSION');
        } else {
          console.log('RESET PAGE: No active session found');
          
          // Fallback to checking query parameters
          const params = new URLSearchParams(window.location.search);
          const queryToken = params.get("token");
          
          if (queryToken) {
            console.log('RESET PAGE: Found token in query parameters');
            setToken(queryToken);
            setSessionStatus('token-from-query');
          } else {
            console.log('RESET PAGE: No token or session available');
            setSessionStatus('no-token');
          }
        }
      } catch (err) {
        console.error('RESET PAGE: Exception in session check:', err);
        setSessionStatus('error-session');
      }
    })();
    
    // Listen for auth state changes
    const { data: { subscription } } = passwordResetClient.auth.onAuthStateChange((event, session) => {
      console.log(`RESET PAGE: Auth state changed - Event: ${event}, Session exists: ${!!session}`);
      
      if (session) {
        setSessionStatus(`auth-${event.toLowerCase()}`);
        setToken('AUTH_STATE_CHANGE');
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array means this runs once on component mount
  
  const resetPasswordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });
  
  const onSubmit = async (data: ResetPasswordFormValues) => {
    if (!token) {
      toast({
        title: "Error",
        description: "Missing reset token. Please use the password reset link from your email.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('RESET PAGE: Starting password reset with token type:', token.startsWith('eyJ') ? 'JWT Token' : token);
      
      // Different approaches based on the token status
      
      // CASE 1: We have a session marker from our detection logic
      if (token === 'SESSION_FROM_HASH' || token === 'EXISTING_SESSION' || 
          token === 'AUTH_STATE_CHANGE' || sessionStatus.startsWith('auth-')) {
        
        console.log('RESET PAGE: Using existing session for password update');
        
        // If we have a session, just call updateUser directly
        const { error } = await passwordResetClient.auth.updateUser({
          password: data.password
        });
        
        if (error) {
          console.error('RESET PAGE: Error updating password with existing session:', error);
          throw new Error(`Password update failed: ${error.message}`);
        }
        
        console.log('RESET PAGE: Password updated successfully with existing session');
        toast({
          title: "Success",
          description: "Your password has been reset successfully",
        });
        
        navigate("/auth");
        return;
      }
      
      // CASE 2: We have an actual token string extracted from URL
      if (token.startsWith('ey')) { // JWT tokens start with 'ey'
        try {
          console.log('RESET PAGE: Using extracted token to set session first');
          
          // Set the session using the extracted token
          const { error: sessionError } = await passwordResetClient.auth.setSession({
            access_token: token,
            refresh_token: '' // We may not have a refresh token
          });
          
          if (sessionError) {
            console.error('RESET PAGE: Failed to set session with token:', sessionError);
            // Continue to server-side approach
          } else {
            console.log('RESET PAGE: Session set successfully, updating password');
            
            // Now update the password
            const { error } = await passwordResetClient.auth.updateUser({
              password: data.password
            });
            
            if (!error) {
              console.log('RESET PAGE: Password updated successfully after setting session');
              toast({
                title: "Success",
                description: "Your password has been reset successfully",
              });
              navigate("/auth");
              return;
            }
            
            console.error('RESET PAGE: Failed to update password after setting session:', error);
          }
        } catch (err) {
          console.error('RESET PAGE: Exception in token-based update:', err);
        }
      }
      
      // CASE 3: Try direct updateUser as a fallback
      try {
        console.log('RESET PAGE: Trying direct password update as fallback');
        const { error } = await passwordResetClient.auth.updateUser({
          password: data.password
        });
        
        if (!error) {
          console.log('RESET PAGE: Password updated successfully with direct approach');
          toast({
            title: "Success",
            description: "Your password has been reset successfully",
          });
          navigate("/auth");
          return;
        }
        
        console.error('RESET PAGE: Direct password update failed:', error);
      } catch (err) {
        console.error('RESET PAGE: Exception in direct update:', err);
      }
      
      // CASE 4: Server-side API as last resort
      console.log('RESET PAGE: All client-side approaches failed, trying server API');
      
      try {
        // Use our custom server-side endpoint to handle the token
        console.log('RESET PAGE: Sending token to server-side API, length:', token.length);
        
        const response = await fetch("/api/update-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: token, // Send whatever token we have
            password: data.password,
          }),
        });
        
        const responseData = await response.json();
        console.log('RESET PAGE: Server API response status:', response.status);
        
        if (response.ok) {
          console.log('RESET PAGE: Password reset successful via server API');
          toast({
            title: "Success",
            description: "Your password has been reset successfully",
          });
          navigate("/auth");
        } else {
          console.error('RESET PAGE: Server API error:', responseData.message);
          throw new Error(responseData.message || "Failed to reset password via server");
        }
      } catch (serverError: any) {
        console.error('RESET PAGE: Server API exception:', serverError);
        
        // Check if there's a details array in the response that has more info
        if (serverError.details && Array.isArray(serverError.details)) {
          console.error('RESET PAGE: Error details:', serverError.details);
          throw new Error(`Password reset failed: ${serverError.message}. Please request a new reset link.`);
        } else {
          throw new Error(`Password reset failed. Please try again or request a new reset link.`);
        }
      }
    } catch (error: any) {
      console.error('RESET PAGE: Password reset failed:', error);
      toast({
        title: "Password Reset Failed",
        description: error.message || "An unexpected error occurred. Please try again or request a new reset link.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Reset Your Password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={resetPasswordForm.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {!token && (
              <div className="p-3 bg-red-50 text-red-700 rounded-md">
                Error: Missing reset token. Please use the link from your email.
              </div>
            )}
            
            {/* Debug info - show session status */}
            <div className="p-2 bg-gray-100 text-xs text-gray-600 rounded">
              <div>Session Status: {sessionStatus}</div>
              <div>Token Type: {token.startsWith('eyJ') ? 'JWT Token' : token}</div>
              <div>URL Hash: {window.location.hash ? '✓ Present' : '✗ Missing'}</div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                {...resetPasswordForm.register("password")}
                placeholder="Enter your new password"
              />
              {resetPasswordForm.formState.errors.password && (
                <p className="text-sm text-red-500">
                  {resetPasswordForm.formState.errors.password.message}
                </p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                {...resetPasswordForm.register("confirmPassword")}
                placeholder="Confirm your new password"
              />
              {resetPasswordForm.formState.errors.confirmPassword && (
                <p className="text-sm text-red-500">
                  {resetPasswordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
          </CardContent>
          
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full bg-amber-500 text-black font-semibold hover:bg-amber-600"
              disabled={isSubmitting || !token}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting Password...
                </span>
              ) : (
                "Reset Password"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}