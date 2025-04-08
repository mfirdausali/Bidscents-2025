import { QueryClient } from "@tanstack/react-query";

async function apiRequest<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
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

  // For empty responses (like 204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json();
  return data as T;
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
        
        return apiRequest(finalUrl);
      },
    },
  },
});

export { queryClient, apiRequest };