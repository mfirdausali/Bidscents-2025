import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { signInWithFacebook } from "@/lib/supabase";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  loginWithEmailMutation: UseMutationResult<SelectUser, Error, EmailLoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  registerWithVerificationMutation: UseMutationResult<RegisterWithVerificationResponse, Error, RegisterWithVerificationData>;
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
  user: { 
    id: number; 
    username: string; 
    email: string;
  } 
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
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.username}!`,
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

  // New login with email
  const loginWithEmailMutation = useMutation({
    mutationFn: async (credentials: EmailLoginData) => {
      const res = await apiRequest("POST", "/api/login-with-email", credentials);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Login failed");
      }
      return await res.json();
    },
    onSuccess: (data) => {
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

  // Original register
  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Registration successful",
        description: `Welcome, ${user.username}!`,
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

  // New register with email verification
  const registerWithVerificationMutation = useMutation({
    mutationFn: async (data: RegisterWithVerificationData) => {
      console.log("📤 Starting registration request with data:", { ...data, password: "[REDACTED]" });
      
      const res = await apiRequest("POST", "/api/register-with-verification", data);
      console.log("📨 Registration response status:", res.status);
      console.log("📨 Registration response headers:", Object.fromEntries(res.headers.entries()));
      
      // Get response text first to debug what's being returned
      const responseText = await res.text();
      console.log("📨 Raw response text:", responseText);
      
      if (!res.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("❌ Failed to parse error response as JSON:", parseError);
          throw new Error("Registration failed with invalid response");
        }
        console.error("❌ Registration failed with error:", errorData);
        throw new Error(errorData.message || "Registration failed");
      }
      
      // Try to parse the successful response
      let responseData;
      try {
        responseData = JSON.parse(responseText);
        console.log("✅ Registration successful with response:", responseData);
      } catch (parseError) {
        console.error("❌ Failed to parse success response as JSON:", parseError);
        throw new Error("Registration succeeded but response was invalid");
      }
      
      return responseData;
    },
    onSuccess: (data: RegisterWithVerificationResponse) => {
      toast({
        title: "Registration successful",
        description: data.message || "Please check your email to verify your account.",
      });
      // Redirect to login page after successful registration
      setLocation("/login?registration=success");
    },
    onError: (error: Error) => {
      console.error("❌ Registration mutation error:", error);
      console.error("❌ Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
      toast({
        title: "Registration failed",
        description: error.message,
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

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
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
