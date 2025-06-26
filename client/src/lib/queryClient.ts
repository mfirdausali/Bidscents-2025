import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Unified token management - using consistent key name
const TOKEN_KEY = 'app_token';
const CSRF_TOKEN_KEY = 'csrf_token';

function getAuthToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  console.log('[JWT] Getting token from localStorage:', token ? 'token present' : 'no token');
  return token;
}

function getCSRFToken(): string | null {
  return localStorage.getItem(CSRF_TOKEN_KEY);
}

function setCSRFToken(token: string): void {
  localStorage.setItem(CSRF_TOKEN_KEY, token);
}

async function fetchCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/csrf-token');
    if (response.ok) {
      const data = await response.json();
      setCSRFToken(data.token);
      return data.token;
    }
  } catch (error) {
    console.error('[CSRF] Failed to fetch CSRF token:', error);
  }
  return null;
}

function setAuthToken(token: string): void {
  console.log('[JWT] Storing token in localStorage');
  localStorage.setItem(TOKEN_KEY, token);
  // Clean up any legacy token keys for security
  localStorage.removeItem('auth_token');
  localStorage.removeItem('supabase_token');
}

function removeAuthToken(): void {
  console.log('[JWT] Removing token from localStorage');
  localStorage.removeItem(TOKEN_KEY);
  // Clean up any legacy token keys
  localStorage.removeItem('auth_token');
  localStorage.removeItem('supabase_token');
}

export { setAuthToken, removeAuthToken };

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Add CSRF token for state-changing operations
  if (method !== 'GET' && method !== 'HEAD') {
    let csrfToken = getCSRFToken();
    if (!csrfToken) {
      csrfToken = await fetchCSRFToken();
    }
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Add global error handler for unhandled rejections
// This prevents the browser console from showing unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    // Prevent the default browser behavior which shows error in console
    event.preventDefault();
    
    // Log the error in a more controlled way
    console.error('Handled previously unhandled promise rejection:', event.reason);
    
    // The error is now considered "handled" and won't show as an unhandled rejection
    return true;
  });
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
