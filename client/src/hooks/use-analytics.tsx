import { useEffect } from 'react';
import { useLocation } from 'wouter';

declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

/**
 * Google Analytics tracking hook for SPA route changes
 * Automatically tracks page views when routes change
 */
export function useAnalytics() {
  const [location] = useLocation();

  useEffect(() => {
    // Track page view on route change
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'G-QTQMZPNL13', {
        page_path: location,
        page_title: document.title,
        page_location: window.location.href
      });

      // Send page view event
      window.gtag('event', 'page_view', {
        page_path: location,
        page_title: document.title,
        page_location: window.location.href
      });
    }
  }, [location]);

  return { location };
}

/**
 * Enhanced e-commerce tracking functions for marketplace
 */
export const analytics = {
  // Product interaction events
  viewItem: (product: {
    item_id: string;
    item_name: string;
    item_category: string;
    price: number;
    item_brand?: string;
  }) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'view_item', {
        currency: 'MYR',
        value: product.price,
        items: [{
          item_id: product.item_id,
          item_name: product.item_name,
          item_category: product.item_category,
          price: product.price,
          item_brand: product.item_brand || 'Unknown',
          quantity: 1
        }]
      });
    }
  },

  // Search tracking
  search: (searchTerm: string, resultsCount?: number) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'search', {
        search_term: searchTerm,
        ...(resultsCount !== undefined && { search_results_count: resultsCount })
      });
    }
  },

  // User engagement
  selectItem: (product: {
    item_id: string;
    item_name: string;
    item_category: string;
    price: number;
    item_list_name?: string;
    index?: number;
  }) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'select_item', {
        currency: 'MYR',
        value: product.price,
        items: [{
          item_id: product.item_id,
          item_name: product.item_name,
          item_category: product.item_category,
          price: product.price,
          quantity: 1,
          ...(product.item_list_name && { item_list_name: product.item_list_name }),
          ...(product.index !== undefined && { index: product.index })
        }]
      });
    }
  },

  // Auction interactions
  placeBid: (auctionId: string, bidAmount: number) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'place_bid', {
        custom_parameter: {
          auction_id: auctionId,
          bid_amount: bidAmount,
          currency: 'MYR'
        }
      });
    }
  },

  // Messaging events
  sendMessage: (recipientType: 'buyer' | 'seller') => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'send_message', {
        custom_parameter: {
          recipient_type: recipientType
        }
      });
    }
  },

  // User registration and authentication
  signUp: (method: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'sign_up', {
        method: method
      });
    }
  },

  login: (method: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'login', {
        method: method
      });
    }
  },

  // Purchase and transaction events
  beginCheckout: (items: any[], value: number) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'begin_checkout', {
        currency: 'MYR',
        value: value,
        items: items
      });
    }
  },

  purchase: (transactionId: string, items: any[], value: number) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'purchase', {
        transaction_id: transactionId,
        currency: 'MYR',
        value: value,
        items: items
      });
    }
  },

  // Content engagement
  shareContent: (contentType: string, contentId: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'share', {
        content_type: contentType,
        content_id: contentId
      });
    }
  },

  // Boost package events (specific to your marketplace)
  viewBoostPackages: () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'view_boost_packages', {
        custom_parameter: {
          feature: 'product_boost'
        }
      });
    }
  },

  purchaseBoost: (packageType: string, duration: number, price: number) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'purchase_boost', {
        currency: 'MYR',
        value: price,
        custom_parameter: {
          package_type: packageType,
          duration_hours: duration
        }
      });
    }
  },

  // Filter and sort events
  applyFilter: (filterType: string, filterValue: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'apply_filter', {
        custom_parameter: {
          filter_type: filterType,
          filter_value: filterValue
        }
      });
    }
  },

  // Error tracking
  trackError: (errorMessage: string, errorType: string, page?: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'exception', {
        description: errorMessage,
        fatal: false,
        custom_parameter: {
          error_type: errorType,
          page: page || window.location.pathname
        }
      });
    }
  },

  // Performance tracking
  trackTiming: (name: string, value: number, category?: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'timing_complete', {
        name: name,
        value: value,
        event_category: category || 'Performance'
      });
    }
  }
};

/**
 * Hook for tracking user interactions with enhanced error handling
 */
export function useTrackEvent() {
  const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
    try {
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', eventName, parameters);
      }
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  };

  return { trackEvent };
}