import { useState, useEffect, useCallback } from "react";
import { User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const fetchUser = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const user = await apiRequest<User>("/api/auth/me");
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error as Error,
      });
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (username: string, password: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: { username, password },
      });
      
      await fetchUser();
      queryClient.invalidateQueries();
      return true;
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: error as Error,
      });
      return false;
    }
  };

  const logout = async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
      queryClient.invalidateQueries();
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error as Error 
      }));
      return false;
    }
  };

  const register = async (userData: any) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: userData,
      });
      
      await fetchUser();
      queryClient.invalidateQueries();
      return true;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error as Error 
      }));
      return false;
    }
  };

  return {
    ...state,
    login,
    logout,
    register,
    refreshUser: fetchUser,
  };
}