import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// JWT token management
function getAuthToken(): string | null {
  const token = localStorage.getItem('auth_token');
  console.log('[JWT] Getting token from localStorage:', token ? 'token present' : 'no token');
  return token;
}

function setAuthToken(token: string): void {
  console.log('[JWT] Storing token in localStorage');
  localStorage.setItem('auth_token', token);
}

function removeAuthToken(): void {
  console.log('[JWT] Removing token from localStorage');
  localStorage.removeItem('auth_token');
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
