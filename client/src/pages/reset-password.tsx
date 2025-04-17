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

// Initialize Supabase client using environment variables
// Public Supabase URL and anon key are safe to include in client-side code
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rjazuitnzsximznfcbfw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYXp1aXRuenN4aW16bmZjYmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyNTY4MzgsImV4cCI6MjA1NDgzMjgzOH0.7I6R0fOmUvM-GKYpT1aT9vfIVkgdp8XESSRDwYPFu3k';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function ResetPasswordPage() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Extract token from URL hash or query parameters
  const [token, setToken] = useState('');
  
  // We don't need to manually extract the token from the URL
  // Supabase handles this automatically from the hash fragment
  
  // Check if we have a recovery flow in progress
  useEffect(() => {
    console.log('Checking URL for Supabase recovery parameters...');
    
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      console.log('Found recovery parameters in URL hash, setting token to "SUPABASE_AUTH_FLOW"');
      // We just need to know recovery is in progress, the actual token handling is done by Supabase
      setToken('SUPABASE_AUTH_FLOW');
    } else {
      // Fallback for any custom token parameter 
      const params = new URLSearchParams(window.location.search);
      const queryToken = params.get("token");
      if (queryToken) {
        console.log('Found token in query parameters');
        setToken(queryToken);
      } else {
        console.log('No token found in URL');
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
      console.log("Starting password update directly with Supabase client");
      
      // For SUPABASE_AUTH_FLOW, use the client directly - it will use the recovery token in the URL
      if (token === 'SUPABASE_AUTH_FLOW') {
        // Update user's password directly with Supabase client
        const { error } = await supabase.auth.updateUser({
          password: data.password
        });
        
        if (error) {
          console.error("Error updating password with Supabase client:", error);
          throw error;
        }
        
        console.log("Password updated successfully with Supabase client");
        toast({
          title: "Success",
          description: "Your password has been reset successfully",
        });
        
        // Redirect to login page
        navigate("/auth");
      } else {
        // Fallback to using our API endpoint
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
          toast({
            title: "Success",
            description: "Your password has been reset successfully",
          });
          // Redirect to login page
          navigate("/auth");
        } else {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to reset password");
        }
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