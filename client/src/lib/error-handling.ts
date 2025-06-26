import { toast } from '../hooks/use-toast';
import { AxiosError } from 'axios';

// Error response type from server
export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    requestId: string;
    timestamp: string;
    details?: any;
  };
}

// Custom error class for API errors
export class ApiError extends Error {
  code: string;
  statusCode: number;
  requestId: string;
  details?: any;

  constructor(response: ApiErrorResponse) {
    super(response.error.message);
    this.code = response.error.code;
    this.statusCode = response.error.statusCode;
    this.requestId = response.error.requestId;
    this.details = response.error.details;
  }
}

// Parse error from various sources
export function parseError(error: unknown): {
  message: string;
  code?: string;
  statusCode?: number;
  details?: any;
} {
  // Handle Axios errors
  if (error instanceof AxiosError) {
    if (error.response?.data?.error) {
      const apiError = error.response.data as ApiErrorResponse;
      return {
        message: apiError.error.message,
        code: apiError.error.code,
        statusCode: apiError.error.statusCode,
        details: apiError.error.details
      };
    }
    
    // Network or timeout errors
    if (error.code === 'ECONNABORTED') {
      return {
        message: 'Request timed out. Please try again.',
        code: 'TIMEOUT',
        statusCode: 408
      };
    }
    
    if (!error.response) {
      return {
        message: 'Unable to connect to the server. Please check your connection.',
        code: 'NETWORK_ERROR',
        statusCode: 0
      };
    }
    
    // Generic HTTP errors
    return {
      message: error.response.statusText || 'An error occurred',
      statusCode: error.response.status
    };
  }
  
  // Handle ApiError
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details
    };
  }
  
  // Handle standard errors
  if (error instanceof Error) {
    return {
      message: error.message
    };
  }
  
  // Unknown error
  return {
    message: 'An unexpected error occurred'
  };
}

// User-friendly error messages
const friendlyMessages: Record<string, string> = {
  AUTHENTICATION_ERROR: 'Please log in to continue',
  AUTHORIZATION_ERROR: "You don't have permission to do that",
  VALIDATION_ERROR: 'Please check your input and try again',
  NOT_FOUND: 'The requested resource was not found',
  CONFLICT: 'This action conflicts with existing data',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please slow down',
  PAYMENT_REQUIRED: 'Payment is required to continue',
  NETWORK_ERROR: 'Connection error. Please check your internet',
  TIMEOUT: 'Request timed out. Please try again',
  SERVER_ERROR: "Something went wrong on our end. We're working on it"
};

// Get user-friendly error message
export function getFriendlyErrorMessage(error: unknown): string {
  const parsed = parseError(error);
  
  if (parsed.code && friendlyMessages[parsed.code]) {
    return friendlyMessages[parsed.code];
  }
  
  // Special handling for validation errors with details
  if (parsed.code === 'VALIDATION_ERROR' && parsed.details?.errors) {
    const errors = parsed.details.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors[0].message || parsed.message;
    }
  }
  
  return parsed.message;
}

// Show error toast
export function showErrorToast(error: unknown, customMessage?: string): void {
  const message = customMessage || getFriendlyErrorMessage(error);
  
  toast({
    title: 'Error',
    description: message,
    variant: 'destructive'
  });
}

// Show success toast
export function showSuccessToast(message: string): void {
  toast({
    title: 'Success',
    description: message
  });
}

// Retry configuration
export interface RetryConfig {
  maxAttempts?: number;
  delay?: number;
  backoff?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

// Default retry configuration
const defaultRetryConfig: Required<RetryConfig> = {
  maxAttempts: 3,
  delay: 1000,
  backoff: true,
  shouldRetry: (error: unknown) => {
    const parsed = parseError(error);
    const statusCode = parsed.statusCode || 0;
    
    // Retry on network errors or 5xx errors
    return statusCode === 0 || (statusCode >= 500 && statusCode < 600);
  }
};

// Retry helper
export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxAttempts, delay, backoff, shouldRetry } = {
    ...defaultRetryConfig,
    ...config
  };
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      
      const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
}

// Error recovery strategies
export const errorRecovery = {
  // Refresh auth token and retry
  async refreshAuth<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const parsed = parseError(error);
      
      if (parsed.code === 'AUTHENTICATION_ERROR') {
        // Attempt to refresh token
        try {
          await api.post('/api/auth/refresh');
          // Retry original request
          return await fn();
        } catch (refreshError) {
          // Redirect to login
          window.location.href = '/login';
          throw refreshError;
        }
      }
      
      throw error;
    }
  },
  
  // Handle rate limiting with exponential backoff
  async handleRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    return retry(fn, {
      maxAttempts: 5,
      delay: 2000,
      backoff: true,
      shouldRetry: (error) => {
        const parsed = parseError(error);
        return parsed.code === 'RATE_LIMIT_EXCEEDED';
      }
    });
  },
  
  // Fallback to cached data
  async withCache<T>(
    fn: () => Promise<T>,
    getCached: () => T | null
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const cached = getCached();
      
      if (cached) {
        console.warn('Using cached data due to error:', error);
        return cached;
      }
      
      throw error;
    }
  }
};

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Log to server
  fetch('/api/client-errors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'unhandledRejection',
      message: event.reason?.message || 'Unhandled promise rejection',
      stack: event.reason?.stack,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }),
  }).catch(console.error);
  
  // Show user-friendly error
  showErrorToast(event.reason);
  
  // Prevent default browser error handling
  event.preventDefault();
});

// Import api client (assuming it exists)
import api from './api';