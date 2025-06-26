import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  FCP?: number; // First Contentful Paint
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  TTFB?: number; // Time to First Byte
  TTI?: number; // Time to Interactive
}

export const usePerformanceMonitor = (componentName?: string) => {
  const metricsRef = useRef<PerformanceMetrics>({});
  const reportedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('performance' in window)) return;

    const logMetric = (metric: string, value: number) => {
      console.log(`[Performance] ${componentName || 'App'} - ${metric}: ${value.toFixed(2)}ms`);
      
      // You can send these metrics to your analytics service
      if (window.gtag) {
        window.gtag('event', 'web_vitals', {
          event_category: 'Performance',
          event_label: metric,
          value: Math.round(value),
          component: componentName || 'App',
        });
      }
    };

    // Observe paint metrics
    const paintObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          metricsRef.current.FCP = entry.startTime;
          logMetric('FCP', entry.startTime);
        }
      }
    });

    // Observe largest contentful paint
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      metricsRef.current.LCP = lastEntry.startTime;
      logMetric('LCP', lastEntry.startTime);
    });

    // Observe first input delay
    const fidObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if ('processingStart' in entry) {
          const fid = entry.processingStart - entry.startTime;
          metricsRef.current.FID = fid;
          logMetric('FID', fid);
        }
      }
    });

    // Observe layout shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
          metricsRef.current.CLS = clsValue;
        }
      }
    });

    try {
      paintObserver.observe({ type: 'paint', buffered: true });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      fidObserver.observe({ type: 'first-input', buffered: true });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      console.error('[Performance] Failed to observe metrics:', e);
    }

    // Measure TTFB
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigationEntry) {
      const ttfb = navigationEntry.responseStart - navigationEntry.requestStart;
      metricsRef.current.TTFB = ttfb;
      logMetric('TTFB', ttfb);
    }

    // Custom marks for component-specific metrics
    if (componentName) {
      performance.mark(`${componentName}-mounted`);
      
      // Measure time from navigation to component mount
      try {
        const measure = performance.measure(
          `${componentName}-mount-time`,
          'navigationStart',
          `${componentName}-mounted`
        );
        logMetric(`${componentName} Mount Time`, measure.duration);
      } catch (e) {
        // Ignore if marks don't exist
      }
    }

    // Report all metrics after page load
    const reportMetrics = () => {
      if (!reportedRef.current) {
        reportedRef.current = true;
        console.log('[Performance] Final Metrics:', metricsRef.current);
        
        // Log CLS when page is about to unload
        logMetric('CLS', metricsRef.current.CLS || 0);
      }
    };

    // Report on page hide
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        reportMetrics();
      }
    });

    // Cleanup
    return () => {
      paintObserver.disconnect();
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  }, [componentName]);

  // Return current metrics
  return metricsRef.current;
};

// Hook for measuring component render performance
export const useRenderPerformance = (componentName: string) => {
  const renderCount = useRef(0);
  const renderStartTime = useRef<number>();

  useEffect(() => {
    renderCount.current += 1;
    const renderEndTime = performance.now();
    
    if (renderStartTime.current) {
      const renderDuration = renderEndTime - renderStartTime.current;
      
      if (renderDuration > 16) { // Log slow renders (> 1 frame)
        console.warn(
          `[Performance] ${componentName} slow render #${renderCount.current}: ${renderDuration.toFixed(2)}ms`
        );
      }
    }
  });

  // Mark render start
  renderStartTime.current = performance.now();
  
  return {
    renderCount: renderCount.current,
  };
};

// Hook for monitoring memory usage
export const useMemoryMonitor = (threshold = 50 * 1024 * 1024) => { // 50MB default
  useEffect(() => {
    if (!('memory' in performance)) return;

    const checkMemory = () => {
      const memory = (performance as any).memory;
      const usedMemory = memory.usedJSHeapSize;
      const totalMemory = memory.totalJSHeapSize;
      const limit = memory.jsHeapSizeLimit;
      
      const percentUsed = (usedMemory / limit) * 100;
      
      if (usedMemory > threshold) {
        console.warn(
          `[Performance] High memory usage: ${(usedMemory / 1024 / 1024).toFixed(2)}MB ` +
          `(${percentUsed.toFixed(1)}% of limit)`
        );
      }
      
      return {
        used: usedMemory,
        total: totalMemory,
        limit: limit,
        percentUsed,
      };
    };

    // Check memory every 10 seconds
    const interval = setInterval(checkMemory, 10000);
    
    // Initial check
    checkMemory();
    
    return () => clearInterval(interval);
  }, [threshold]);
};