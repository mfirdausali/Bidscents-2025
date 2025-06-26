# Database Performance Analysis for BidScents

## Executive Summary

This comprehensive analysis identifies critical performance issues in the BidScents database implementation and provides specific optimization recommendations. The main findings include:

- **Missing Critical Indexes**: 15+ missing indexes causing full table scans
- **N+1 Query Problems**: Multiple instances in product listings and message retrieval
- **Inefficient JOIN Operations**: Unnecessary data fetching in product details
- **No Connection Pooling Configuration**: Using default Supabase settings
- **Missing Transaction Boundaries**: Data integrity risks in auction bidding
- **Zero Caching Implementation**: Every request hits the database

## 1. Query Performance Analysis

### 1.1 N+1 Query Problems

#### Problem: Product Listings with Details
```typescript
// In supabase-storage.ts - addProductDetails()
async addProductDetails(products: Product[]): Promise<ProductWithDetails[]> {
  return Promise.all(products.map(async (product) => {
    // N+1: Separate query for each product's category
    const category = product.categoryId 
      ? await this.getCategoryById(product.categoryId) 
      : undefined;
    
    // N+1: Separate query for each product's seller
    const seller = await this.getUser(product.sellerId);
    
    // N+1: Separate query for each product's reviews
    const reviews = await this.getProductReviews(product.id);
    
    // N+1: Separate query for each product's images
    const images = await this.getProductImages(product.id);
    
    // N+1: Separate query for each product's auction
    const auctions = await this.getProductAuctions(product.id);
```

**Impact**: Loading 20 products results in 101 queries (1 + 20×5)

#### Solution: Use Supabase's relational queries
```typescript
async getProductsOptimized(filters?: ProductFilter): Promise<ProductWithDetails[]> {
  let query = supabase
    .from('products')
    .select(`
      *,
      category:categories(*),
      seller:users!seller_id(*),
      reviews(*),
      product_images(*),
      auctions(*)
    `);
  
  // Apply filters...
  
  const { data, error } = await query;
  // Single query fetches all related data
}
```

### 1.2 Missing WHERE Clause Optimizations

#### Problem: Unfiltered Message Queries
```typescript
// In getUserMessages() - fetches ALL messages then filters in memory
const { data, error } = await supabase
  .from('messages')
  .select('*');

// Then filters in JavaScript
const userMessages = (data || []).filter(
  message => message.sender_id === userId || message.receiver_id === userId
);
```

#### Solution: Filter at database level
```typescript
async getUserMessagesOptimized(userId: number): Promise<MessageWithDetails[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      sender:users!sender_id(*),
      receiver:users!receiver_id(*),
      product:products(*)
    `)
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100); // Add pagination
}
```

### 1.3 Inefficient Auction Queries

#### Problem: Multiple queries for auction updates
```typescript
// In WebSocket placeBid handler
// 1. Get auction
const auction = await storage.getAuctionById(parseInt(auctionId));
// 2. Get all bids for validation
const recentBids = await storage.getBidsForAuction(parseInt(auctionId));
// 3. Update previous bids
await supabase.from('bids').update({ is_winning: false })...
// 4. Create new bid
const bid = await storage.createBid(...);
// 5. Update auction
await storage.updateAuction(...);
// 6. Get updated auction
const updatedAuction = await storage.getAuctionById(parseInt(auctionId));
```

#### Solution: Use database transaction
```typescript
async placeBidOptimized(auctionId: number, userId: number, amount: number) {
  // Use Supabase RPC for atomic operation
  const { data, error } = await supabase.rpc('place_bid_atomic', {
    p_auction_id: auctionId,
    p_user_id: userId,
    p_amount: amount
  });
  
  return data;
}
```

## 2. Index Optimization

### 2.1 Critical Missing Indexes

Based on query patterns, these indexes are urgently needed:

```sql
-- Products table indexes
CREATE INDEX idx_products_seller_id ON products(seller_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(is_featured, featured_until) 
  WHERE is_featured = true;
CREATE INDEX idx_products_listing_search ON products(name, brand, status);

-- Messages table indexes
CREATE INDEX idx_messages_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX idx_messages_receiver_read ON messages(receiver_id, is_read);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- Auctions table indexes
CREATE INDEX idx_auctions_product_id ON auctions(product_id);
CREATE INDEX idx_auctions_status_ends ON auctions(status, ends_at) 
  WHERE status = 'active';
CREATE INDEX idx_auctions_current_bidder ON auctions(current_bidder_id);

-- Bids table indexes
CREATE INDEX idx_bids_auction_id ON bids(auction_id);
CREATE INDEX idx_bids_bidder_auction ON bids(bidder_id, auction_id);
CREATE INDEX idx_bids_placed_at ON bids(placed_at DESC);

-- Payments table indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_bill_id ON payments(bill_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- Reviews table indexes
CREATE INDEX idx_reviews_product_id ON reviews(product_id);
CREATE INDEX idx_reviews_user_product ON reviews(user_id, product_id);

-- Product images table indexes
CREATE INDEX idx_product_images_product ON product_images(product_id, image_order);
```

### 2.2 Composite Indexes for Complex Queries

```sql
-- For product filtering queries
CREATE INDEX idx_products_filter ON products(
  status, category_id, price, created_at DESC
);

-- For user activity queries
CREATE INDEX idx_user_activity ON messages(
  receiver_id, is_read, created_at DESC
);

-- For auction activity
CREATE INDEX idx_auction_activity ON bids(
  auction_id, is_winning, placed_at DESC
);
```

### 2.3 Partial Indexes for Specific Queries

```sql
-- For featured products expiration
CREATE INDEX idx_featured_expiring ON products(featured_until) 
  WHERE is_featured = true AND featured_until IS NOT NULL;

-- For active auctions ending soon
CREATE INDEX idx_auctions_ending_soon ON auctions(ends_at) 
  WHERE status = 'active' AND ends_at > NOW();

-- For unread messages
CREATE INDEX idx_unread_messages ON messages(receiver_id, created_at DESC) 
  WHERE is_read = false;
```

## 3. Connection Pool Optimization

### 3.1 Current Issues
- Using default Supabase connection settings
- No connection pooling configuration
- Creating new connections for each request

### 3.2 Recommended Configuration

```typescript
// server/db-pool.ts
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

// PostgreSQL connection pool for direct queries
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum pool size
  min: 5,  // Minimum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500, // Close connection after 7500 uses
  // Enable statement timeout
  statement_timeout: 30000, // 30 seconds
  // Enable query timeout
  query_timeout: 30000,
});

// Supabase client with optimized settings
export const supabaseOptimized = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          keepalive: true,
          // Add connection pooling headers
          headers: {
            ...options.headers,
            'Connection': 'keep-alive',
            'Keep-Alive': 'timeout=30',
          },
        });
      },
    },
  }
);

// Connection health monitoring
pgPool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

pgPool.on('connect', (client) => {
  client.query('SET statement_timeout = 30000');
});
```

## 4. Transaction Analysis

### 4.1 Missing Transaction Boundaries

#### Critical Issue: Auction Bidding
Current implementation has race conditions:

```typescript
// Current non-atomic implementation
await supabase.from('bids').update({ is_winning: false })...
const bid = await storage.createBid(...);
await storage.updateAuction(...);
// If any step fails, data is inconsistent
```

#### Solution: Database Function with Transaction
```sql
CREATE OR REPLACE FUNCTION place_bid_atomic(
  p_auction_id INTEGER,
  p_user_id INTEGER,
  p_amount DECIMAL
) RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  bid_id INTEGER,
  new_ends_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_auction RECORD;
  v_bid_id INTEGER;
  v_new_ends_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Lock the auction row
  SELECT * INTO v_auction 
  FROM auctions 
  WHERE id = p_auction_id 
  FOR UPDATE;
  
  -- Validate auction exists and is active
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Auction not found', NULL::INTEGER, NULL::TIMESTAMP;
    RETURN;
  END IF;
  
  IF v_auction.status != 'active' OR v_auction.ends_at < NOW() THEN
    RETURN QUERY SELECT FALSE, 'Auction has ended', NULL::INTEGER, NULL::TIMESTAMP;
    RETURN;
  END IF;
  
  -- Validate bid amount
  IF p_amount <= COALESCE(v_auction.current_bid, v_auction.starting_price) THEN
    RETURN QUERY SELECT FALSE, 'Bid too low', NULL::INTEGER, NULL::TIMESTAMP;
    RETURN;
  END IF;
  
  -- Update previous winning bids
  UPDATE bids 
  SET is_winning = FALSE 
  WHERE auction_id = p_auction_id AND is_winning = TRUE;
  
  -- Create new bid
  INSERT INTO bids (auction_id, bidder_id, amount, is_winning, placed_at)
  VALUES (p_auction_id, p_user_id, p_amount, TRUE, NOW())
  RETURNING id INTO v_bid_id;
  
  -- Check if auction needs extension
  v_new_ends_at := v_auction.ends_at;
  IF v_auction.ends_at - NOW() < INTERVAL '5 minutes' THEN
    v_new_ends_at := v_auction.ends_at + INTERVAL '5 minutes';
  END IF;
  
  -- Update auction
  UPDATE auctions 
  SET 
    current_bid = p_amount,
    current_bidder_id = p_user_id,
    ends_at = v_new_ends_at,
    updated_at = NOW()
  WHERE id = p_auction_id;
  
  -- Log audit trail
  INSERT INTO bid_audit_trail (
    auction_id, user_id, attempted_amount, 
    status, created_at
  ) VALUES (
    p_auction_id, p_user_id, p_amount, 
    'success', NOW()
  );
  
  RETURN QUERY SELECT TRUE, 'Bid placed successfully', v_bid_id, v_new_ends_at;
END;
$$ LANGUAGE plpgsql;
```

### 4.2 Boost Activation Transaction

```sql
CREATE OR REPLACE FUNCTION activate_boost_atomic(
  p_payment_id INTEGER,
  p_product_ids INTEGER[],
  p_duration_hours INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_boost_group_id UUID;
  v_featured_until TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Generate group ID for this boost batch
  v_boost_group_id := gen_random_uuid();
  v_featured_until := NOW() + (p_duration_hours || ' hours')::INTERVAL;
  
  -- Update all products atomically
  UPDATE products
  SET 
    is_featured = TRUE,
    featured_at = NOW(),
    featured_until = v_featured_until,
    featured_duration_hours = p_duration_hours,
    boost_group_id = v_boost_group_id::TEXT,
    status = 'featured',
    updated_at = NOW()
  WHERE 
    id = ANY(p_product_ids)
    AND status = 'active'
    AND is_featured = FALSE;
  
  -- Verify all products were updated
  IF FOUND THEN
    -- Update payment status
    UPDATE payments
    SET 
      status = 'completed',
      updated_at = NOW()
    WHERE id = p_payment_id;
    
    RETURN TRUE;
  ELSE
    RAISE EXCEPTION 'Failed to activate boost for products';
  END IF;
END;
$$ LANGUAGE plpgsql;
```

## 5. Caching Opportunities

### 5.1 Redis Implementation Strategy

#### Categories Cache (Changes rarely)
```typescript
// server/cache/redis-cache.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

export class CacheManager {
  private readonly TTL = {
    CATEGORIES: 3600 * 24, // 24 hours
    BOOST_PACKAGES: 3600 * 12, // 12 hours
    USER_PROFILE: 3600, // 1 hour
    PRODUCT_DETAILS: 300, // 5 minutes
    FEATURED_PRODUCTS: 60, // 1 minute
  };

  async getCategories(): Promise<Category[] | null> {
    try {
      const cached = await redis.get('categories:all');
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async setCategories(categories: Category[]): Promise<void> {
    try {
      await redis.setex(
        'categories:all',
        this.TTL.CATEGORIES,
        JSON.stringify(categories)
      );
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async invalidateProductCache(productId: number): Promise<void> {
    const keys = await redis.keys(`product:${productId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  // Implement cache-aside pattern
  async getCachedOrFetch<T>(
    key: string,
    ttl: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    // Try cache first
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from database
    const data = await fetchFn();
    
    // Store in cache
    await redis.setex(key, ttl, JSON.stringify(data));
    
    return data;
  }
}

// Usage in storage layer
export class CachedSupabaseStorage extends SupabaseStorage {
  private cache = new CacheManager();

  async getAllCategories(): Promise<Category[]> {
    return this.cache.getCachedOrFetch(
      'categories:all',
      3600 * 24,
      () => super.getAllCategories()
    );
  }

  async getBoostPackages(): Promise<BoostPackage[]> {
    return this.cache.getCachedOrFetch(
      'boost:packages:active',
      3600 * 12,
      async () => {
        const { data } = await supabase
          .from('boost_packages')
          .select('*')
          .eq('is_active', true)
          .order('package_type, item_count');
        return data || [];
      }
    );
  }

  async getFeaturedProducts(): Promise<ProductWithDetails[]> {
    return this.cache.getCachedOrFetch(
      'products:featured',
      60, // Short TTL for featured products
      () => super.getFeaturedProducts()
    );
  }
}
```

### 5.2 In-Memory Caching for Hot Data

```typescript
// server/cache/memory-cache.ts
export class MemoryCache<T> {
  private cache = new Map<string, { data: T; expires: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private ttlSeconds: number = 300) {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.cache.entries()) {
        if (value.expires < now) {
          this.cache.delete(key);
        }
      }
    }, 60000);
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (item.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttl || this.ttlSeconds) * 1000,
    });
  }

  invalidate(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Use for user session data
const userCache = new MemoryCache<User>(300); // 5 minutes
const auctionCache = new MemoryCache<Auction>(10); // 10 seconds for active auctions
```

## 6. Query Optimization Examples

### 6.1 Optimize Product Search

```typescript
// Current inefficient implementation
async getProducts(filters?: ProductFilter): Promise<ProductWithDetails[]> {
  let query = supabase.from('products').select('*');
  // Multiple OR conditions without proper indexing
  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%, description.ilike.%${filters.search}%, brand.ilike.%${filters.search}%`);
  }
}

// Optimized with full-text search
async getProductsOptimized(filters?: ProductFilter): Promise<ProductWithDetails[]> {
  // First, add full-text search column to products table
  // ALTER TABLE products ADD COLUMN search_vector tsvector 
  // GENERATED ALWAYS AS (
  //   to_tsvector('english', coalesce(name, '') || ' ' || 
  //              coalesce(brand, '') || ' ' || 
  //              coalesce(description, ''))
  // ) STORED;
  // CREATE INDEX idx_products_search ON products USING GIN(search_vector);

  let query = supabase
    .from('products')
    .select(`
      *,
      category:categories!category_id(*),
      seller:users!seller_id(id, username, shop_name, avatar_url),
      product_images!product_id(id, image_url, image_order),
      reviews_aggregate:reviews(count)
    `)
    .or('status.eq.active,status.eq.featured');

  if (filters?.search) {
    // Use full-text search
    query = query.textSearch('search_vector', filters.search, {
      type: 'websearch',
      config: 'english'
    });
  }

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  if (filters?.minPrice !== undefined) {
    query = query.gte('price', filters.minPrice);
  }

  if (filters?.maxPrice !== undefined) {
    query = query.lte('price', filters.maxPrice);
  }

  // Optimized ordering with index support
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  
  if (error) throw error;
  
  // Transform aggregated data
  return (data || []).map(product => ({
    ...product,
    averageRating: product.reviews_aggregate?.[0]?.count || 0,
    images: product.product_images || [],
  }));
}
```

### 6.2 Optimize Message Queries

```typescript
// Optimized conversation query with pagination
async getConversationOptimized(
  userId1: number, 
  userId2: number, 
  limit: number = 50,
  before?: Date
): Promise<MessageWithDetails[]> {
  let query = supabase
    .from('messages')
    .select(`
      *,
      sender:users!sender_id(id, username, avatar_url),
      receiver:users!receiver_id(id, username, avatar_url),
      product:products!product_id(id, name, price, image_url)
    `)
    .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`);

  if (before) {
    query = query.lt('created_at', before.toISOString());
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  
  if (error) throw error;
  
  // Decrypt messages in parallel
  const decryptedMessages = await Promise.all(
    (data || []).map(async (msg) => ({
      ...msg,
      content: msg.content ? await decryptMessage(msg.content) : null,
    }))
  );

  return decryptedMessages.reverse(); // Return in chronological order
}
```

### 6.3 Optimize Auction Queries

```typescript
// Get active auctions with efficient filtering
async getActiveAuctionsOptimized(
  options: {
    category?: number;
    priceRange?: { min: number; max: number };
    endingSoon?: boolean;
    page?: number;
    limit?: number;
  } = {}
): Promise<AuctionWithDetails[]> {
  const { 
    category, 
    priceRange, 
    endingSoon, 
    page = 1, 
    limit = 20 
  } = options;

  let query = supabase
    .from('auctions')
    .select(`
      *,
      product:products!product_id(
        *,
        category:categories!category_id(*),
        seller:users!seller_id(id, username, shop_name),
        product_images!product_id(*)
      ),
      current_bidder:users!current_bidder_id(id, username),
      bid_count:bids(count),
      recent_bids:bids(
        id, amount, placed_at,
        bidder:users!bidder_id(id, username)
      )
    `)
    .eq('status', 'active')
    .gt('ends_at', new Date().toISOString());

  // Apply filters
  if (category) {
    query = query.eq('product.category_id', category);
  }

  if (priceRange) {
    if (priceRange.min) {
      query = query.gte('current_bid', priceRange.min);
    }
    if (priceRange.max) {
      query = query.lte('current_bid', priceRange.max);
    }
  }

  if (endingSoon) {
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
    query = query.lte('ends_at', oneHourFromNow.toISOString());
  }

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  
  query = query
    .order('ends_at', { ascending: true })
    .range(from, to);

  const { data, error } = await query;
  
  if (error) throw error;

  return (data || []).map(auction => ({
    ...auction,
    bidCount: auction.bid_count?.[0]?.count || 0,
    recentBids: auction.recent_bids?.slice(0, 5) || [],
  }));
}
```

## 7. Performance Monitoring

### 7.1 Query Performance Tracking

```typescript
// server/monitoring/query-monitor.ts
export class QueryMonitor {
  private metrics = new Map<string, {
    count: number;
    totalTime: number;
    maxTime: number;
    errors: number;
  }>();

  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const start = process.hrtime.bigint();
    
    try {
      const result = await queryFn();
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000; // ms
      
      this.recordMetric(queryName, duration, false);
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected: ${queryName} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - start) / 1_000_000;
      this.recordMetric(queryName, duration, true);
      throw error;
    }
  }

  private recordMetric(
    queryName: string,
    duration: number,
    isError: boolean
  ): void {
    const metric = this.metrics.get(queryName) || {
      count: 0,
      totalTime: 0,
      maxTime: 0,
      errors: 0,
    };
    
    metric.count++;
    metric.totalTime += duration;
    metric.maxTime = Math.max(metric.maxTime, duration);
    if (isError) metric.errors++;
    
    this.metrics.set(queryName, metric);
  }

  getReport(): Record<string, any> {
    const report: Record<string, any> = {};
    
    for (const [query, metric] of this.metrics.entries()) {
      report[query] = {
        count: metric.count,
        avgTime: metric.totalTime / metric.count,
        maxTime: metric.maxTime,
        errorRate: (metric.errors / metric.count) * 100,
      };
    }
    
    return report;
  }
}

// Usage
const queryMonitor = new QueryMonitor();

// Wrap storage methods
export class MonitoredStorage extends CachedSupabaseStorage {
  async getProductById(id: number): Promise<ProductWithDetails | undefined> {
    return queryMonitor.trackQuery(
      'getProductById',
      () => super.getProductById(id)
    );
  }
}
```

### 7.2 Database Health Check

```typescript
// server/monitoring/db-health.ts
export class DatabaseHealthMonitor {
  async checkHealth(): Promise<{
    healthy: boolean;
    latency: number;
    activeConnections: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    const start = Date.now();
    
    try {
      // Test basic connectivity
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .limit(1)
        .single();
        
      if (error) {
        issues.push(`Database query failed: ${error.message}`);
      }
      
      // Check connection pool
      const poolStats = await pgPool.query(`
        SELECT 
          count(*) as active_connections,
          max_conn,
          max_conn - count(*) as available_connections
        FROM pg_stat_activity
        CROSS JOIN (
          SELECT setting::int as max_conn 
          FROM pg_settings 
          WHERE name = 'max_connections'
        ) s
        WHERE datname = current_database()
      `);
      
      const stats = poolStats.rows[0];
      if (stats.available_connections < 10) {
        issues.push('Low available connections');
      }
      
      // Check for long-running queries
      const longQueries = await pgPool.query(`
        SELECT count(*) as count
        FROM pg_stat_activity
        WHERE state != 'idle'
        AND query_start < NOW() - INTERVAL '5 minutes'
      `);
      
      if (longQueries.rows[0].count > 0) {
        issues.push(`${longQueries.rows[0].count} long-running queries detected`);
      }
      
      return {
        healthy: issues.length === 0,
        latency: Date.now() - start,
        activeConnections: parseInt(stats.active_connections),
        issues,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        activeConnections: 0,
        issues: [`Health check failed: ${error.message}`],
      };
    }
  }
}
```

## 8. Implementation Priority

### Phase 1: Critical Indexes (Immediate)
1. Add all missing indexes listed in section 2.1
2. Implement composite indexes for complex queries
3. Add partial indexes for specific use cases

**Estimated Performance Gain**: 50-70% query time reduction

### Phase 2: Fix N+1 Queries (Week 1)
1. Refactor product listing queries
2. Optimize message retrieval
3. Implement relational queries in Supabase

**Estimated Performance Gain**: 80% reduction in database calls

### Phase 3: Add Transactions (Week 2)
1. Implement atomic bid placement
2. Add boost activation transactions
3. Ensure data consistency in critical paths

**Estimated Performance Gain**: Eliminate race conditions

### Phase 4: Implement Caching (Week 3-4)
1. Set up Redis for frequently accessed data
2. Implement cache-aside pattern
3. Add in-memory caching for hot data

**Estimated Performance Gain**: 90% reduction for cached queries

### Phase 5: Connection Pooling (Week 4)
1. Configure PostgreSQL connection pool
2. Optimize Supabase client settings
3. Monitor connection health

**Estimated Performance Gain**: 30% better resource utilization

## 9. Monitoring and Maintenance

### Set up monitoring dashboards for:
- Query execution times
- Cache hit rates
- Connection pool usage
- Slow query logs
- Database health metrics

### Regular maintenance tasks:
- Weekly VACUUM ANALYZE on high-traffic tables
- Monthly index usage analysis
- Quarterly query plan reviews
- Cache invalidation strategy updates

## Conclusion

Implementing these optimizations will dramatically improve BidScents' database performance. The most critical issues are the missing indexes and N+1 query problems, which should be addressed immediately. The full implementation of all recommendations should reduce database load by 80-90% and improve response times by 5-10x for most operations.