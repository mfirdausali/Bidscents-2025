import { QueryClient } from "@tanstack/react-query";

// Type for options to getQueryFn
interface QueryFnOptions {
  on401?: "throw" | "returnNull";
  throwAllErrors?: boolean;
}

async function apiRequest<T = any>(
  method: string = "GET", 
  url: string, 
  body?: any, 
  options?: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = new Error(`HTTP error! status: ${response.status}`);
    throw error;
  }

  return response;
}

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      queryFn: async ({ queryKey }) => {
        const [url, params] = Array.isArray(queryKey) ? queryKey : [queryKey];
        
        if (typeof url !== "string") {
          throw new Error(`Invalid query key: ${String(url)}`);
        }
        
        // If params is an object, transform it to a query string
        let finalUrl = url;
        if (params && typeof params === "object") {
          const searchParams = new URLSearchParams();
          
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              searchParams.append(key, String(value));
            }
          });
          
          const queryString = searchParams.toString();
          if (queryString) {
            finalUrl = `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
          }
        }
        
        const response = await fetch(finalUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // For empty responses (like 204 No Content)
        if (response.status === 204) {
          return {};
        }
        
        return response.json();
      },
    },
  },
});

// Function to get a custom query function with options
function getQueryFn(options: QueryFnOptions = {}) {
  return async ({ queryKey }: { queryKey: any }) => {
    const [url, params] = Array.isArray(queryKey) ? queryKey : [queryKey];
    
    if (typeof url !== "string") {
      throw new Error(`Invalid query key: ${String(url)}`);
    }
    
    // If params is an object, transform it to a query string
    let finalUrl = url;
    if (params && typeof params === "object") {
      const searchParams = new URLSearchParams();
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      
      const queryString = searchParams.toString();
      if (queryString) {
        finalUrl = `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
      }
    }
    
    const response = await fetch(finalUrl);
    
    // Handle 401 according to options
    if (response.status === 401 && options.on401 === "returnNull") {
      return null;
    }
    
    // If we should throw all errors or the response isn't ok and we haven't already handled it
    if (!response.ok && (options.throwAllErrors || response.status !== 401)) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // For empty responses (like 204 No Content)
    if (response.status === 204) {
      return {};
    }
    
    return response.json();
  };
}

export { queryClient, apiRequest, getQueryFn };