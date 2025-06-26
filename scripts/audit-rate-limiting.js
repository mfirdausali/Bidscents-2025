#!/usr/bin/env node

/**
 * Rate Limiting Audit Script
 * 
 * This script analyzes the routes.ts file to identify which endpoints
 * have rate limiting applied and which ones are missing it.
 */

const fs = require('fs');
const path = require('path');

// Rate limiters defined in rate-limiter.ts
const rateLimiters = [
  'authLimiter',
  'passwordResetLimiter',
  'userLookupLimiter',
  'resourceCreationLimiter',
  'reviewLimiter',
  'paymentLimiter',
  'webhookLimiter',
  'fileUploadLimiter',
  'profileImageLimiter',
  'messagingLimiter',
  'apiLimiter',
  'publicReadLimiter',
  'authenticatedReadLimiter',
  'adminLimiter',
  'biddingLimiter',
  'searchLimiter',
  'boostLimiter',
  'cartLimiter',
  'socialPreviewLimiter',
  'messageFileLimiter'
];

// Read routes.ts file
const routesPath = path.join(__dirname, '..', 'server', 'routes.ts');
const routesContent = fs.readFileSync(routesPath, 'utf8');

// Extract all route definitions
const routePattern = /app\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*([^)]+)\)/g;
const routes = [];
let match;

while ((match = routePattern.exec(routesContent)) !== null) {
  const method = match[1].toUpperCase();
  const path = match[2];
  const middlewares = match[3];
  
  // Check which rate limiters are applied
  const appliedLimiters = rateLimiters.filter(limiter => 
    middlewares.includes(limiter)
  );
  
  routes.push({
    method,
    path,
    middlewares: middlewares.trim(),
    hasRateLimiting: appliedLimiters.length > 0,
    limiters: appliedLimiters
  });
}

// Categorize routes
const routesWithLimiting = routes.filter(r => r.hasRateLimiting);
const routesWithoutLimiting = routes.filter(r => !r.hasRateLimiting);

// Generate report
console.log('=== BidScents Rate Limiting Audit Report ===\n');
console.log(`Total Routes: ${routes.length}`);
console.log(`Routes with Rate Limiting: ${routesWithLimiting.length} (${((routesWithLimiting.length / routes.length) * 100).toFixed(1)}%)`);
console.log(`Routes without Rate Limiting: ${routesWithoutLimiting.length} (${((routesWithoutLimiting.length / routes.length) * 100).toFixed(1)}%)\n`);

console.log('=== Routes WITH Rate Limiting ===\n');
routesWithLimiting.forEach(route => {
  console.log(`✓ ${route.method} ${route.path}`);
  console.log(`  Limiters: ${route.limiters.join(', ')}`);
});

console.log('\n=== Routes WITHOUT Rate Limiting ===\n');
routesWithoutLimiting.forEach(route => {
  console.log(`✗ ${route.method} ${route.path}`);
  
  // Suggest appropriate rate limiter based on path
  let suggestion = '';
  
  if (route.path.includes('/auth/')) {
    suggestion = 'authLimiter';
  } else if (route.path.includes('/admin/')) {
    suggestion = 'adminLimiter';
  } else if (route.path.includes('/messages')) {
    suggestion = 'messagingLimiter';
  } else if (route.path.includes('/webhook')) {
    suggestion = 'webhookLimiter';
  } else if (route.path.includes('/boost')) {
    suggestion = 'boostLimiter';
  } else if (route.path.includes('/payment')) {
    suggestion = 'paymentLimiter';
  } else if (route.path.includes('/upload') || route.path.includes('/images') || route.path.includes('/avatar') || route.path.includes('/cover')) {
    suggestion = 'fileUploadLimiter';
  } else if (route.path.includes('/review')) {
    suggestion = 'reviewLimiter';
  } else if (route.method === 'POST' && (route.path.includes('/products') || route.path.includes('/auctions'))) {
    suggestion = 'resourceCreationLimiter';
  } else if (route.method === 'GET') {
    // Check if it requires authentication
    if (route.middlewares.includes('requireAuth')) {
      suggestion = 'authenticatedReadLimiter';
    } else {
      suggestion = 'publicReadLimiter';
    }
  } else {
    suggestion = 'apiLimiter';
  }
  
  console.log(`  Suggested: ${suggestion}`);
});

console.log('\n=== Summary by Endpoint Type ===\n');

// Group routes by type
const routeTypes = {
  auth: routes.filter(r => r.path.includes('/auth/')),
  admin: routes.filter(r => r.path.includes('/admin/')),
  products: routes.filter(r => r.path.includes('/products')),
  auctions: routes.filter(r => r.path.includes('/auctions')),
  messages: routes.filter(r => r.path.includes('/messages')),
  payments: routes.filter(r => r.path.includes('/payment') || r.path.includes('/billplz')),
  boost: routes.filter(r => r.path.includes('/boost')),
  sellers: routes.filter(r => r.path.includes('/sellers')),
  other: routes.filter(r => 
    !r.path.includes('/auth/') &&
    !r.path.includes('/admin/') &&
    !r.path.includes('/products') &&
    !r.path.includes('/auctions') &&
    !r.path.includes('/messages') &&
    !r.path.includes('/payment') &&
    !r.path.includes('/billplz') &&
    !r.path.includes('/boost') &&
    !r.path.includes('/sellers')
  )
};

Object.entries(routeTypes).forEach(([type, typeRoutes]) => {
  if (typeRoutes.length > 0) {
    const withLimiting = typeRoutes.filter(r => r.hasRateLimiting).length;
    const percentage = ((withLimiting / typeRoutes.length) * 100).toFixed(1);
    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}: ${withLimiting}/${typeRoutes.length} (${percentage}%) have rate limiting`);
  }
});

console.log('\n=== Recommendations ===\n');
console.log('1. Apply rate limiters to all endpoints without rate limiting');
console.log('2. Review suggested rate limiters and adjust based on specific endpoint requirements');
console.log('3. Consider adding custom rate limiters for specialized endpoints');
console.log('4. Test rate limits thoroughly before deploying to production');
console.log('5. Monitor rate limit violations and adjust limits based on usage patterns');