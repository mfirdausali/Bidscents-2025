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

// Create a dedicated client just for password reset operations
const passwordResetClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Important! Tells Supabase to extract token from URL
    storageKey: 'supabase.reset.auth.token' // Use a dedicated storage key to avoid conflicts
  }
});

export default function ResetPasswordPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>('checking');
  
  // Extract token from URL hash or query parameters
  const [token, setToken] = useState('');
  
  // Check if Supabase already has an active session in the dedicated client
  useEffect(() => {
    const checkSession = async () => {
      try {
        console.log("DEBUG: Checking for existing password reset session...");
        const { data, error } = await passwordResetClient.auth.getSession();
        
        if (error) {
          console.error("DEBUG: Error getting session:", error);
          setSessionStatus('no-session');
        } else if (data?.session) {
          console.log("DEBUG: Found active reset session:", data.session.access_token.substring(0, 10) + '...');
          setSessionStatus('has-session');
          // If we have a session, store its token
          setToken('ACTIVE_SESSION');
        } else {
          console.log("DEBUG: No active password reset session found");
          setSessionStatus('no-session');
          
          // Special case: Check if we have URL parameters that passwordResetClient should process
          setTimeout(() => {
            // The timeout is to let Supabase's detectSessionInUrl work first
            passwordResetClient.auth.getSession().then(({ data }) => {
              if (data?.session) {
                console.log("DEBUG: Session established from URL by passwordResetClient!");
                setSessionStatus('session-from-url');
                setToken('SESSION_FROM_URL');
              }
            });
          }, 500);
        }
      } catch (err) {
        console.error("DEBUG: Exception checking session:", err);
        setSessionStatus('error');
      }
    };
    
    checkSession();
    
    // Listen for auth state changes from the password reset client
    const { data: { subscription } } = passwordResetClient.auth.onAuthStateChange((event, session) => {
      console.log("DEBUG: Auth state changed:", event, !!session);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        console.log("DEBUG: User signed in or token refreshed via auth state change");
        setSessionStatus('auth-state-change');
        setToken('AUTH_STATE_CHANGE');
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  // We don't need to manually extract the token from the URL
  // Supabase handles this automatically from the hash fragment
  
  // Process hash params manually if Supabase doesn't do it automatically
  const processHashParams = async () => {
    const hash = window.location.hash;
    
    // Remove the # and parse parameters
    if (hash && hash.startsWith('#')) {
      try {
        // Handle hash fragment in different formats
        const hashContent = hash.substring(1);
        let accessToken = '';
        
        // Try URLSearchParams first
        try {
          const params = new URLSearchParams(hashContent);
          accessToken = params.get('access_token') || '';
        } catch (e) {
          // If that fails, try manual parsing
          const parts = hashContent.split('&');
          for (const part of parts) {
            if (part.startsWith('access_token=')) {
              accessToken = part.split('=')[1];
              break;
            }
          }
        }
        
        if (accessToken) {
          console.log('Manually extracted access token from hash');
          
          // Try to manually set the session with the extracted token
          try {
            const { error } = await passwordResetClient.auth.setSession({
              access_token: accessToken,
              refresh_token: '',
            });
            
            if (!error) {
              console.log('Successfully set session manually with token from hash');
              setSessionStatus('manual-session-set');
              return true;
            } else {
              console.error('Failed to manually set session:', error);
            }
          } catch (err) {
            console.error('Error setting session manually:', err);
          }
        }
      } catch (err) {
        console.error('Error processing hash parameters:', err);
      }
    }
    return false;
  };

  // Check if we have a recovery flow in progress
  useEffect(() => {
    console.log('Checking URL for reset token parameters...');
    
    // Helper function to extract the access token from the hash
    const getAccessTokenFromHash = (hash: string): string | null => {
      if (!hash || !hash.includes('access_token=')) return null;
      
      try {
        // Try URLSearchParams first
        try {
          const params = new URLSearchParams(hash.substring(1));
          return params.get('access_token');
        } catch (e) {
          // If that fails, try regex
          const match = hash.match(/access_token=([^&]+)/);
          return match ? match[1] : null;
        }
      } catch (err) {
        console.error('Error extracting access token:', err);
        return null;
      }
    };
    
    const hash = window.location.hash;
    if (hash) {
      console.log('Found hash in URL, checking format');
      
      // First, try to manually process it
      processHashParams().then(success => {
        if (!success) {
          // If not successful, continue with normal flow
          
          // Check if we have a valid Supabase recovery hash fragment
          // Format is: #access_token=xxx&refresh_token=xxx&expires_in=xxx&token_type=bearer&type=recovery
          if (hash.includes('access_token=') && hash.includes('type=recovery')) {
            console.log('Found Supabase recovery parameters in URL hash');
            
            // Extract access token directly, don't rely on Supabase
            const accessToken = getAccessTokenFromHash(hash);
            if (accessToken) {
              console.log('Extracted access token from hash');
              setToken(accessToken);
            } else {
              setToken('SUPABASE_RECOVERY_FLOW');
            }
            return;
          }
          
          // Try to parse the hash parameters anyway
          const accessToken = getAccessTokenFromHash(hash);
          if (accessToken) {
            console.log('Found access_token in hash parameters');
            setToken(accessToken);
            return;
          }
        }
      });
    }
    
    // Fallback to checking query parameters
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("token");
    if (queryToken) {
      console.log('Found token in query parameters');
      setToken(queryToken);
    } else {
      // If no token in URL, check localStorage for a session
      // If Supabase auth already processed the recovery token, we should still be able to reset
      const session = localStorage.getItem('supabase.auth.token');
      if (session) {
        console.log('Found existing Supabase session in localStorage');
        // We don't need the token itself, just a marker that we can reset
        setToken('EXISTING_SESSION');
      } else {
        console.log('No token or session found');
      }
    }
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
        description: "Missing reset token",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log("Starting password update with token type:", token);
      
      // CASE 1: When we have a recovery flow directly from Supabase's email link
      //         The Supabase SDK already has the token in the hash
      if (token === 'SUPABASE_RECOVERY_FLOW' || token === 'EXISTING_SESSION') {
        console.log("Using Supabase recovery flow to update password");
        
        // Simply call updateUser - Supabase SDK already has the session from the URL hash
        const { error } = await passwordResetClient.auth.updateUser({
          password: data.password
        });
        
        if (error) {
          console.error("Error updating password with Supabase recovery flow:", error);
          throw error;
        }
        
        console.log("Password updated successfully with Supabase recovery flow");
        toast({
          title: "Success",
          description: "Your password has been reset successfully",
        });
        
        // Redirect to login page
        navigate("/auth");
        return;
      }
      
      // CASE 2: We have an actual token string from the URL/parameters
      if (token !== 'SUPABASE_AUTH_FLOW' && token !== 'SUPABASE_RECOVERY_FLOW' && token !== 'EXISTING_SESSION') {
        try {
          console.log("Attempting to set session with token first");
          
          // Set the session using the token from the URL
          const { error: sessionError } = await passwordResetClient.auth.setSession({
            access_token: token,
            refresh_token: '',
          });
          
          if (!sessionError) {
            console.log("Session set successfully, updating password");
            
            // Now update the password
            const { error } = await passwordResetClient.auth.updateUser({
              password: data.password,
            });
            
            if (!error) {
              console.log("Password updated successfully with extracted token");
              toast({
                title: "Success",
                description: "Your password has been reset successfully",
              });
              navigate("/auth");
              return;
            }
            
            console.log("Failed to update password after setting session:", error);
          }
        } catch (err) {
          console.log("Error trying to set session with token:", err);
        }
      }
      
      // CASE 3: Fallback - Just try directly (might work if browser already has the session)
      console.log("Trying to update password directly");
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });
      
      if (!error) {
        console.log("Password updated successfully with direct approach");
        toast({
          title: "Success",
          description: "Your password has been reset successfully",
        });
        navigate("/auth");
        return;
      }
      
      // CASE 4: Last resort - try server-side API if all client-side attempts fail
      console.log("Direct approach failed, trying server API");
      const response = await fetch("/api/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      });
      
      if (response.ok) {
        console.log("Password updated successfully via server API");
        toast({
          title: "Success",
          description: "Your password has been reset successfully",
        });
        navigate("/auth");
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to reset password");
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
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