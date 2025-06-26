import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Unified token management
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
  async ({ queryKey, signal }) => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
      signal, // Add abort signal support
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Optimized query client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // Optimized cache settings
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false, // Disable for most queries
      refetchOnReconnect: 'always',
      refetchInterval: false,
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors
        if (error?.status >= 400 && error?.status < 500) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Query key factory for consistent cache keys
export const queryKeys = {
  all: [''] as const,
  products: () => [...queryKeys.all, 'products'] as const,
  product: (id: string) => [...queryKeys.products(), id] as const,
  productDetails: (id: string) => [...queryKeys.product(id), 'details'] as const,
  
  auctions: () => [...queryKeys.all, 'auctions'] as const,
  auction: (id: string) => [...queryKeys.auctions(), id] as const,
  auctionBids: (id: string) => [...queryKeys.auction(id), 'bids'] as const,
  
  users: () => [...queryKeys.all, 'users'] as const,
  user: (id: string) => [...queryKeys.users(), id] as const,
  currentUser: () => [...queryKeys.users(), 'me'] as const,
  
  messages: () => [...queryKeys.all, 'messages'] as const,
  conversation: (userId: string) => [...queryKeys.messages(), 'conversation', userId] as const,
  
  featured: () => [...queryKeys.all, 'featured'] as const,
  boosts: () => [...queryKeys.all, 'boosts'] as const,
} as const;

// Prefetch utilities
export const prefetchProduct = (productId: string) => {
  return queryClient.prefetchQuery({
    queryKey: [`/api/products/${productId}`],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const prefetchAuction = (auctionId: string) => {
  return queryClient.prefetchQuery({
    queryKey: [`/api/auctions/${auctionId}`],
    staleTime: 30 * 1000, // 30 seconds for real-time data
  });
};

// Optimistic update utilities
export const optimisticUpdate = <T>(
  queryKey: readonly unknown[],
  updater: (old: T) => T
) => {
  queryClient.setQueryData(queryKey, updater);
};

// Global error handler for unhandled rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    console.error('Handled previously unhandled promise rejection:', event.reason);
    return true;
  });
}