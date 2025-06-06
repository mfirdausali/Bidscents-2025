import { createContext, useContext, useEffect, ReactNode } from 'react';
import { analytics } from '@/hooks/use-analytics';

interface AnalyticsContextType {
  trackEvent: (eventName: string, parameters?: Record<string, any>) => void;
  trackPurchase: (transactionData: any) => void;
  trackSearch: (searchTerm: string, resultsCount?: number) => void;
  trackProductView: (product: any) => void;
  trackUserAction: (action: string, details?: any) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

interface AnalyticsProviderProps {
  children: ReactNode;
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      analytics.trackError(
        event.message || 'Unknown error',
        'javascript_error',
        window.location.pathname
      );
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      analytics.trackError(
        event.reason?.toString() || 'Unhandled promise rejection',
        'promise_rejection',
        window.location.pathname
      );
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    if ('performance' in window && 'getEntriesByType' in performance) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            analytics.trackTiming('page_load_time', navigation.loadEventEnd - navigation.fetchStart, 'Performance');
          }
        }, 0);
      });
    }

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  const contextValue: AnalyticsContextType = {
    trackEvent: (eventName: string, parameters?: Record<string, any>) => {
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', eventName, parameters);
      }
    },

    trackPurchase: (transactionData: any) => {
      analytics.purchase(
        transactionData.transactionId,
        transactionData.items,
        transactionData.value
      );
    },

    trackSearch: (searchTerm: string, resultsCount?: number) => {
      analytics.search(searchTerm, resultsCount);
    },

    trackProductView: (product: any) => {
      analytics.viewItem({
        item_id: product.id?.toString() || '',
        item_name: product.name || '',
        item_category: product.category || 'Perfume',
        price: product.price || 0,
        item_brand: product.brand || 'Unknown'
      });
    },

    trackUserAction: (action: string, details?: any) => {
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', action, {
          custom_parameter: details,
          page_path: window.location.pathname
        });
      }
    }
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalyticsContext must be used within AnalyticsProvider');
  }
  return context;
}