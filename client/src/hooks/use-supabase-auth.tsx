import { createContext, ReactNode, useContext, useState, useEffect, useRef } from "react";
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
  
  // Track if we're currently exchanging tokens to prevent duplicates
  const isExchangingTokenRef = useRef(false);
  
  // Check for authentication state and get user profile
  const {
    data: user,
    error,
    isLoading,
    refetch: refetchUser,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/v1/auth/me"],
    enabled: !!localStorage.getItem('app_token'),
    retry: false,
    queryFn: async () => {
      try {
        const response = await apiRequest("GET", "/api/v1/auth/me");
        const userData = await response.json();
        console.log('✅ [Auth] User data fetched successfully:', userData);
        return userData;
      } catch (error: any) {
        console.error('❌ [Auth] Failed to fetch user data:', error);
        
        // If authentication fails (401/403), clear invalid token
        if (error.message?.includes('401') || error.message?.includes('403')) {
          console.log('🧹 [Auth] Clearing invalid token due to auth failure');
          removeAuthToken();
          queryClient.setQueryData(["/api/v1/auth/me"], null);
          // Also check if Supabase session exists and clear it if needed
          supabase.auth.signOut();
        }
        
        // Return null for auth failures to show logged out state
        if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('404')) {
          return null;
        }
        
        // Re-throw other errors
        throw error;
      }
    },
  });

  // Listen for localStorage changes and refetch user when token changes
  useEffect(() => {
    const checkTokenAndRefetch = () => {
      const token = localStorage.getItem('app_token');
      console.log('🔍 [Auth] Checking token state:', token ? 'token exists' : 'no token');
      
      if (!token) {
        // No token means user should be logged out
        console.log('🚪 [Auth] No token found, setting user to null');
        queryClient.setQueryData(["/api/v1/auth/me"], null);
      } else if (!user && !isLoading) {
        // Token exists but no user data - refetch
        console.log('🔄 [Auth] Token exists but no user data, refetching...');
        refetchUser();
      }
    };

    // Check immediately
    checkTokenAndRefetch();

    // Listen for storage changes (e.g., from other tabs)
    window.addEventListener('storage', checkTokenAndRefetch);
    
    return () => {
      window.removeEventListener('storage', checkTokenAndRefetch);
    };
  }, [user, isLoading, refetchUser]);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Supabase auth state changed:', event);
        
        if (event === 'SIGNED_IN' && session) {
          // Skip if we're already exchanging tokens (e.g., from sign-in mutation)
          if (isExchangingTokenRef.current) {
            console.log('🔄 Frontend: Token exchange already in progress, skipping...');
            return;
          }
          
          // Skip if we already have an app token
          const existingToken = localStorage.getItem('app_token');
          if (existingToken) {
            console.log('✅ Frontend: App token already exists, skipping exchange');
            return;
          }
          
          // Exchange Supabase JWT for application JWT
          console.log('🔄 Frontend: Starting token exchange from auth state change');
          isExchangingTokenRef.current = true;
          
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
          } finally {
            isExchangingTokenRef.current = false;
          }
        } else if (event === 'SIGNED_OUT') {
          // Clear application JWT and user data
          console.log('🚪 [Auth] Supabase signed out, clearing local auth state');
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

      // Exchange Supabase JWT for application JWT immediately
      if (data.session) {
        console.log('🔄 Frontend: Starting immediate token exchange from sign-in');
        isExchangingTokenRef.current = true;
        
        try {
          const response = await apiRequest("POST", "/api/v1/auth/session", {
            supabaseToken: data.session.access_token
          });

          if (response.ok) {
            const tokenData = await response.json();
            console.log('✅ Frontend: Token exchange successful');
            setAuthToken(tokenData.token);
            queryClient.setQueryData(["/api/v1/auth/me"], tokenData.user);
            // Force immediate refetch to ensure auth state is up to date
            await queryClient.invalidateQueries({ queryKey: ["/api/v1/auth/me"] });
          } else {
            const errorData = await response.json();
            console.error('❌ Frontend: Token exchange failed:', errorData);
            throw new Error('Failed to establish session');
          }
        } catch (error) {
          console.error("❌ Frontend: Token exchange error:", error);
          throw error;
        } finally {
          isExchangingTokenRef.current = false;
        }
      }

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

  // Facebook Sign In
  const signInWithFacebookMutation = useMutation({
    mutationFn: async () => {
      console.log('🔄 Starting Facebook authentication');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
          scopes: 'email public_profile'
        }
      });

      if (error) {
        console.error('❌ Facebook authentication error:', error);
        throw error;
      }

      console.log('✅ Facebook OAuth initiated successfully');
      return data;
    },
    onSuccess: () => {
      console.log('Facebook OAuth redirect initiated');
      // Note: The actual authentication completion will be handled by the auth callback
    },
    onError: (error: Error) => {
      console.error('Facebook authentication failed:', error);
      toast({
        title: "Facebook Login Failed",
        description: error.message || "Unable to authenticate with Facebook. Please try again.",
        variant: "destructive",
      });
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

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}