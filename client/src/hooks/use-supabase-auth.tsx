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
  signInMutation: UseMutationResult<SelectUser, Error, SignInData>;
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
  email: string; 
  password: string;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Check for authentication state and get user profile
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/v1/auth/me"],
    queryFn: async () => {
      try {
        // First check if we have a Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          return null;
        }

        // Exchange Supabase JWT for application JWT
        const response = await apiRequest("POST", "/api/v1/auth/session", {
          supabaseToken: session.access_token
        });

        if (!response.ok) {
          throw new Error("Failed to authenticate");
        }

        const data = await response.json();
        
        // Store application JWT
        setAuthToken(data.token);
        
        return data.user;
      } catch (error) {
        console.error("Authentication error:", error);
        return null;
      }
    },
    retry: false,
  });

  // Listen for Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Supabase auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
          // Exchange Supabase JWT for application JWT
          try {
            const response = await apiRequest("POST", "/api/v1/auth/session", {
              supabaseToken: session.access_token
            });

            if (response.ok) {
              const data = await response.json();
              setAuthToken(data.token);
              queryClient.setQueryData(["/api/v1/auth/me"], data.user);
              queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/me"] });
            }
          } catch (error) {
            console.error("Failed to exchange tokens:", error);
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
  }, []);

  // Sign up with email and password
  const signUpMutation = useMutation({
    mutationFn: async (credentials: SignUpData) => {
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            username: credentials.username,
            first_name: credentials.firstName,
            last_name: credentials.lastName,
          }
        }
      });

      if (error) {
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Registration successful",
        description: "Please check your email to verify your account.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Sign in with email and password
  const signInMutation = useMutation({
    mutationFn: async (credentials: SignInData) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}