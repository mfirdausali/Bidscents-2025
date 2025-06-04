import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient, setAuthToken, removeAuthToken } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { supabase, signInWithFacebook } from "@/lib/supabase";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<any, Error, LoginData>;
  loginWithEmailMutation: UseMutationResult<any, Error, EmailLoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  registerWithVerificationMutation: UseMutationResult<{ message: string; user: any }, Error, RegisterWithVerificationData>;
  resetPasswordMutation: UseMutationResult<void, Error, { email: string }>;
  loginWithFacebookMutation: UseMutationResult<any, Error, void>;
  isEmailVerified: boolean;
  setIsEmailVerified: (value: boolean) => void;
};

type LoginData = { username: string; password: string };
type EmailLoginData = { email: string; password: string };

type RegisterWithVerificationData = { 
  username: string;
  email: string;
  password: string;
  firstName?: string | null;
  lastName?: string | null;
};
type RegisterWithVerificationResponse = { 
  message: string; 
  user: any; // Supabase User type which has different structure
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  
  // Check for verification success in URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('verified') === 'true') {
      toast({
        title: "Email verified",
        description: "Your email has been successfully verified. You can now log in.",
      });
      setIsEmailVerified(true);
      
      // Remove the query parameter
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  
  // Updated to handle the security-enhanced API response
  const {
    data: authResponse,
    error,
    isLoading,
  } = useQuery<{ user: SelectUser, authenticated: boolean } | SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Extract user data from the response, handling both formats
  const user = authResponse && 'user' in authResponse ? authResponse.user : authResponse;
  
  // If we got the enhanced security response and authentication is required
  useEffect(() => {
    if (authResponse && 'authenticated' in authResponse && authResponse.authenticated === false) {
      // Authenticated with Supabase but not fully verified
      console.log("User found but additional authentication required");
      toast({
        title: "Authentication needed",
        description: "Please log in to continue.",
        variant: "default",
      });
      // Navigate to auth page to complete authentication
      setLocation("/auth");
    }
  }, [authResponse, toast, setLocation]);

  // Original login with username
  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (response: { user: SelectUser; token: string }) => {
      // Store the JWT token
      setAuthToken(response.token);
      // Cache the user data
      queryClient.setQueryData(["/api/user"], response.user);
      toast({
        title: "Login successful",
        description: `Welcome back, ${response.user.username}!`,
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

  // JWT-based login with email
  const loginWithEmailMutation = useMutation({
    mutationFn: async (credentials: EmailLoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Login failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      // Store JWT token
      if (data.token) {
        setAuthToken(data.token);
      }
      // Update user data in cache
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Login successful",
        description: `Welcome back, ${data.user.username}!`,
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

  // JWT-based register
  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (data) => {
      // Store JWT token
      if (data.token) {
        setAuthToken(data.token);
      }
      // Update user data in cache
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Registration successful",
        description: `Welcome, ${data.user.username}!`,
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

  // New register with email verification using Supabase
  const registerWithVerificationMutation = useMutation({
    mutationFn: async (registrationData: RegisterWithVerificationData) => {
      const { email, password, username, firstName, lastName } = registrationData;

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
