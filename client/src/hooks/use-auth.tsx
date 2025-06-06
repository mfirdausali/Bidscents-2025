/**
 * Unified Supabase-Only Authentication Hook
 * 
 * This is the consolidated authentication system using Supabase as the sole identity provider.
 * Replaces the previous dual authentication system for enhanced security.
 */

import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser } from "@shared/schema";
import { apiRequest, queryClient, setAuthToken, removeAuthToken } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  signUpMutation: UseMutationResult<any, Error, SignUpData>;
  signInMutation: UseMutationResult<any, Error, SignInData>;
  signOutMutation: UseMutationResult<void, Error, void>;
  resetPasswordMutation: UseMutationResult<void, Error, { email: string }>;
  signInWithFacebookMutation: UseMutationResult<any, Error, void>;
};

type SignUpData = { 
  email: string;
  password: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

type SignInData = { 
  email?: string;
  username?: string;
  password: string;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Check for authentication state and get user profile using the secure endpoint
  const {
    data: user,
    error,
    isLoading,
    refetch: refetchUser,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/v1/auth/me"],
    enabled: !!localStorage.getItem('app_token'),
    retry: false,
  });

  // Listen for Supabase auth state changes
  useEffect(() => {
    console.log('🔧 Creating new Supabase client instance');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Supabase auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
          // Exchange Supabase JWT for application JWT
          console.log('🔄 Frontend: Starting token exchange with Supabase token');
          try {
            const response = await apiRequest("POST", "/api/v1/auth/session", {
              supabaseToken: session.access_token
            });

            console.log('🔄 Frontend: Token exchange response status:', response.status);
            
            if (response.ok) {
              const data = await response.json();
              console.log('✅ Frontend: Token exchange successful, setting auth token');
              setAuthToken(data.token);
              queryClient.setQueryData(["/api/v1/auth/me"], data.user);
              refetchUser();
            } else {
              const errorData = await response.json();
              console.error('❌ Frontend: Token exchange failed with error:', errorData);
            }
          } catch (error) {
            console.error("❌ Frontend: Token exchange request failed:", error);
          }
        } else if (event === 'SIGNED_OUT') {
          // Clear application JWT and user data
          removeAuthToken();
          queryClient.setQueryData(["/api/v1/auth/me"], null);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/me"] });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [refetchUser]);

  // Sign up with email and password
  const signUpMutation = useMutation({
    mutationFn: async (credentials: SignUpData) => {
      console.log('🔄 Starting Supabase registration for:', credentials.email);
      
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            username: credentials.username,
            first_name: credentials.firstName,
            last_name: credentials.lastName,
          },
          emailRedirectTo: `${window.location.origin}/auth/verify`
        }
      });

      console.log('📧 Supabase signup response:', { data, error });

      if (error) {
        console.error('❌ Supabase signup error:', error);
        throw error;
      }

      // Check if email confirmation is required
      if (data.user && !data.user.email_confirmed_at) {
        console.log('📬 Email confirmation required for user:', data.user.email);
      } else {
        console.log('✅ User email already confirmed:', data.user?.email);
      }

      return data;
    },
    onSuccess: (data) => {
      if (data.user && !data.user.email_confirmed_at) {
        toast({
          title: "Registration successful",
          description: "Please check your email to verify your account. If you don't receive an email, check your spam folder or contact support.",
        });
      } else {
        toast({
          title: "Registration successful",
          description: "Your account has been created and verified.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sign in with email/username and password
  const signInMutation = useMutation({
    mutationFn: async (credentials: SignInData) => {
      let email: string | undefined = credentials.email;
      
      // If username is provided instead of email, look up the email
      if (credentials.username && !credentials.email) {
        const response = await apiRequest("POST", "/api/v1/auth/lookup-email", {
          username: credentials.username
        });
        
        if (!response.ok) {
          throw new Error("Username not found");
        }
        
        const data = await response.json();
        email = data.email;
      }

      if (!email) {
        throw new Error("Email or username is required");
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: credentials.password,
      });

      if (error) {
        throw error;
      }

      // The onAuthStateChange listener will handle the token exchange
      return data.user;
    },
    onSuccess: () => {
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });
      
      // Redirect to homepage after successful login
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sign out
  const signOutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      // Also call our application logout endpoint
      try {
        await apiRequest("POST", "/api/v1/auth/logout");
      } catch (error) {
        // Non-critical if this fails
        console.warn("Application logout failed:", error);
      }
    },
    onSuccess: () => {
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      // Even if server logout fails, clear local state
      removeAuthToken();
      queryClient.setQueryData(["/api/v1/auth/me"], null);
      toast({
        title: "Logged out",
        description: "You have been logged out.",
      });
      setLocation("/");
    },
  });

  // Password reset
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Password reset email sent",
        description: "Please check your email for password reset instructions.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Password reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Facebook login
  const signInWithFacebookMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
        }
      });

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Redirecting to Facebook",
        description: "You'll be redirected to Facebook to complete the login process.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Facebook login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        signUpMutation,
        signInMutation,
        signOutMutation,
        resetPasswordMutation,
        signInWithFacebookMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

      // Determine the base URL for email redirection dynamically
      const siteURL = import.meta.env.VITE_SITE_URL || window.location.origin;
      const redirectURL = `${siteURL}/auth-verify`;

      console.log(`Attempting Supabase signUp with email: ${email}, redirectURL: ${redirectURL}`);

      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: redirectURL,
          data: {
            username: username,
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) {
        console.error('Supabase signUp error:', error);
        throw error;
      }

      console.log('Supabase signUp successful (email verification pending):', data);
      return { 
        message: "Registration successful! Please check your email to verify your account.", 
        user: data.user 
      };
    },
    onSuccess: (response) => {
      toast({
        title: "Registration Initiated",
        description: response.message,
      });
      // Navigate to login page with registration success indicator
      setLocation("/auth?tab=login&registration=success");
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message || "An unknown error occurred.",
        variant: "destructive",
      });
    },
  });

  // Password reset request
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const res = await apiRequest("POST", "/api/reset-password", { email });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Password reset failed");
      }
    },
    onSuccess: () => {
      toast({
        title: "Password reset email sent",
        description: "Please check your email for password reset instructions.",
      });
      // Redirect to login page
      setLocation("/login?reset=requested");
    },
    onError: (error: Error) => {
      toast({
        title: "Password reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // JWT-based logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      // Remove JWT token from storage
      removeAuthToken();
      // Clear user data from cache
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    },
    onError: (error: Error) => {
      // Even if server logout fails, remove token locally
      removeAuthToken();
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logged out",
        description: "You have been logged out.",
      });
    },
  });
  
  // Facebook login mutation
  const loginWithFacebookMutation = useMutation({
    mutationFn: async () => {
      return await signInWithFacebook();
    },
    onSuccess: () => {
      toast({
        title: "Redirecting to Facebook",
        description: "You'll be redirected to Facebook to complete the login process.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Facebook login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        loginWithEmailMutation,
        logoutMutation,
        registerMutation,
        registerWithVerificationMutation,
        resetPasswordMutation,
        loginWithFacebookMutation,
        isEmailVerified,
        setIsEmailVerified,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
