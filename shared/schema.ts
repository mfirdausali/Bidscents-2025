import { float } from "drizzle-orm/mysql-core";
import { pgTable, text, serial, integer, boolean, doublePrecision, timestamp, jsonb, pgEnum, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enum types
export const messageTypeEnum = pgEnum('message_type', ['TEXT', 'ACTION', 'FILE']);
export const actionTypeEnum = pgEnum('action_type', ['INITIATE', 'CONFIRM_PAYMENT', 'CONFIRM_DELIVERY', 'REVIEW']);
export const transactionStatusEnum = pgEnum('transaction_status', ['WAITING_PAYMENT', 'WAITING_DELIVERY', 'WAITING_REVIEW', 'COMPLETED', 'CANCELLED']);

// Users table - CORRECTED to match actual database schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  // Removed password field as we'll use Supabase auth.users for password management
  email: text("email").notNull().unique(), // Used as foreign key to link with auth.users
  firstName: text("first_name"),
  lastName: text("last_name"),
  address: text("address"),
  profileImage: text("profile_image"),
  avatarUrl: text("avatar_url"), // Profile photo stored in object storage
  coverPhoto: text("cover_photo"), // Cover photo stored in object storage
  walletBalance: decimal("wallet_balance", { precision: 12, scale: 2 }).default("0").notNull(),
  isSeller: boolean("is_seller").default(true).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isBanned: boolean("is_banned").default(false).notNull(),
  isVerified: boolean("is_verified").default(false),
  shopName: text("shop_name"),
  location: text("location"),
  bio: text("bio"),
  providerId: text("provider_id"), // Stores the ID from the auth provider (e.g., Supabase user UUID)
  provider: text("provider").default("supabase"), // The authentication provider used (e.g., 'supabase', 'facebook')
  supabaseUserId: text("supabase_user_id"), // Direct reference to auth.users.id for faster lookups
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Security fields
  accountLocked: boolean("account_locked").default(false).notNull(),
  accountLockedAt: timestamp("account_locked_at", { withTimezone: true }),
  accountLockedReason: text("account_locked_reason"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  role: text("role").default("user").notNull(), // user, seller, admin
});

// Categories table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

// Boost Packages table
export const boostPackages = pgTable("boost_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  packageType: text("package_type").notNull(), // "standard" or "premium"
  itemCount: integer("item_count").notNull(), // 1, 3, 5, or 10
  price: integer("price").notNull(), // Price in sen (e.g., RM 5 = 500 sen)
  durationHours: integer("duration_hours").notNull(), // 15 or 36 hours
  effectivePrice: decimal("effective_price", { precision: 10, scale: 2 }), // Price per item
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// Products table - CORRECTED financial precision
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  imageUrl: text("image_url"), // OBSOLETE: This field is no longer used. Images stored in product_images table
  stockQuantity: integer("stock_quantity").notNull().default(1), // Most secondhand items have quantity 1
  categoryId: integer("category_id").references(() => categories.id),
  sellerId: integer("seller_id").references(() => users.id).notNull(),
  isNew: boolean("is_new").default(false), // In secondhand context: like new condition
  isFeatured: boolean("is_featured").default(false),
  featuredAt: timestamp("featured_at", { withTimezone: true }), // When the product was featured
  featuredUntil: timestamp("featured_until", { withTimezone: true }), // When the featured status expires
  featuredDurationHours: integer("featured_duration_hours"), // Duration in hours
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Secondhand perfume specific fields
  remainingPercentage: integer("remaining_percentage").default(100), // How full is the bottle (1-100%)
  batchCode: text("batch_code"), // Authenticity batch code
  purchaseYear: integer("purchase_year"), // When was it originally purchased
  boxCondition: text("box_condition"), // Condition of the box/packaging
  listingType: text("listing_type").default("fixed"), // fixed, negotiable, auction
  status: text("status").default("active"), // active, featured, sold, archived
  volume: integer("volume"), // Bottle size (e.g., "50ml", "100ml", "3.4oz")
  // New fields for boost packages
  boostPackageId: integer("boost_package_id").references(() => boostPackages.id),
  boostGroupId: text("boost_group_id")
});

// Product Images table
export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  imageUrl: text("image_url").notNull(),
  imageOrder: integer("image_order").default(0).notNull(), // The order/position of the image
  imageName: text("image_name"), // Original file name or generated name
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Reviews table - CORRECTED financial precision
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  sellerId: integer("seller_id").references(() => users.id),
  rating: decimal("rating", { precision: 3, scale: 2 }).notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Orders table - CORRECTED financial precision and timestamps
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Order items table - CORRECTED financial precision
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
});

// Messages table - CORRECTED timestamps
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  content: text("content"), // Encrypted message content (nullable)
  productId: integer("product_id").references(() => products.id), // Optional reference to product
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  messageType: messageTypeEnum("message_type").notNull().default('TEXT'),
  actionType: actionTypeEnum("action_type"),
  isClicked: boolean("is_clicked").default(false),
  fileUrl: text("file_url").default('NULL'),
});

// Auctions table - CORRECTED financial precision and timestamps to match actual database
export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  startingPrice: decimal("starting_price", { precision: 12, scale: 2 }).notNull(),
  reservePrice: decimal("reserve_price", { precision: 12, scale: 2 }),
  buyNowPrice: decimal("buy_now_price", { precision: 12, scale: 2 }),
  currentBid: decimal("current_bid", { precision: 12, scale: 2 }),
  currentBidderId: integer("current_bidder_id").references(() => users.id),
  bidIncrement: decimal("bid_increment", { precision: 8, scale: 2 }).notNull().default("5.00"), // Corrected default to match DB
  startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Bids table - CORRECTED financial precision and timestamps
export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").references(() => auctions.id).notNull(),
  bidderId: integer("bidder_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
  isWinning: boolean("is_winning").default(false),
});

// Bid audit trail for tracking all bid attempts - CORRECTED financial precision and timestamps
export const bidAuditTrail = pgTable("bid_audit_trail", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").references(() => auctions.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  attemptedAmount: decimal("attempted_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull(), // success, failed, rate_limited, invalid_amount, auction_ended, etc.
  reason: text("reason"), // Detailed reason for failure
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Payments table for Billplz - CORRECTED timestamps
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  orderId: text("order_id").notNull().unique(), // Our internal order ID (UUID)
  billId: text("bill_id"), // Billplz bill ID
  amount: integer("amount").notNull(), // Amount in sen (smallest unit)
  status: text("status").notNull().default("pending"), // pending, paid, failed
  paymentType: text("payment_type").notNull().default("boost"), // Type of payment (boost, order, etc.)
  featureDuration: integer("feature_duration"), // Duration in days for featured products (legacy)
  boost_option_id: integer("boost_option_id"), // Reference to the selected boost option
  productIds: text("product_ids").array(), // Product IDs to boost
  paymentChannel: text("payment_channel"), // Payment channel used (from Billplz)
  paidAt: timestamp("paid_at", { withTimezone: true }), // When payment was completed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata"), // Additional data related to the payment
});

// Transactions table - CORRECTED financial precision and timestamps
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  sellerId: integer("seller_id").references(() => users.id).notNull(),
  buyerId: integer("buyer_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  status: transactionStatusEnum("status").notNull().default('WAITING_PAYMENT'),
});

// Audit logs table for security and compliance tracking
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(), // Type of event (login, resource_update, etc.)
  severity: text("severity").notNull(), // INFO, WARNING, ERROR, CRITICAL
  userId: integer("user_id").references(() => users.id), // User who performed the action (nullable for anonymous)
  userEmail: text("user_email"), // Store email separately for audit trail even if user is deleted
  ipAddress: text("ip_address"), // IP address of the request
  userAgent: text("user_agent"), // User agent string
  action: text("action").notNull(), // Human-readable description of the action
  resourceType: text("resource_type"), // Type of resource affected (product, user, payment, etc.)
  resourceId: text("resource_id"), // ID of the affected resource
  details: jsonb("details"), // Additional context and metadata
  success: boolean("success").notNull(), // Whether the action succeeded
  errorMessage: text("error_message"), // Error message if action failed
  requestId: text("request_id"), // Unique request ID for correlation
  sessionId: text("session_id"), // Session ID for user tracking
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  entityType: text("entity_type"), // For compatibility with security dashboard
  entityId: text("entity_id"), // For compatibility with security dashboard
  changes: jsonb("changes"), // Track changes made
});

// Login attempts table for authentication tracking
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  email: text("email").notNull(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  successful: boolean("successful").notNull(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Sessions table for active session tracking
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address").notNull(),
  userAgent: text("user_agent"),
  active: boolean("active").default(true).notNull(),
  lastActivity: timestamp("last_activity", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Security alerts table
export const securityAlerts = pgTable("security_alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // failed_login, rate_limit, suspicious_activity, geographic_anomaly
  severity: text("severity").notNull(), // critical, high, medium, low
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("new"), // new, acknowledged, resolved
  metadata: jsonb("metadata"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  acknowledgedBy: text("acknowledged_by"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Rate limit violations table
export const rateLimitViolations = pgTable("rate_limit_violations", {
  id: serial("id").primaryKey(),
  ipAddress: text("ip_address").notNull(),
  userId: integer("user_id").references(() => users.id),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  violationCount: integer("violation_count").default(1).notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Zod schemas for data validation - Updated to include new fields
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  // password removed as it's now managed in auth.users
  email: true,
  firstName: true,
  lastName: true,
  address: true,
  profileImage: true,
  avatarUrl: true, // New field for avatar/profile picture
  coverPhoto: true, // New field for cover photo
  walletBalance: true,
  isSeller: true,
  isAdmin: true,
  isBanned: true,
  isVerified: true,
  shopName: true,
  location: true,
  bio: true,
  providerId: true, // Auth provider's user ID for secure linking
  provider: true, // The authentication provider used
  supabaseUserId: true, // Direct Supabase reference
  // Security fields
  accountLocked: true,
  accountLockedAt: true,
  accountLockedReason: true,
  lastLoginAt: true,
  lastLoginIp: true,
  failedLoginAttempts: true,
  role: true,
});

export const insertProductSchema = createInsertSchema(products).pick({
  name: true,
  brand: true,
  description: true,
  price: true,
  // imageUrl is obsolete but kept in schema for compatibility
  imageUrl: true, 
  stockQuantity: true,
  categoryId: true,
  sellerId: true,
  isNew: true,
  isFeatured: true,
  featuredAt: true,
  featuredUntil: true,
  remainingPercentage: true,
  batchCode: true,
  purchaseYear: true,
  boxCondition: true,
  listingType: true,
  status: true,
  volume: true,
});

export const insertCategorySchema = createInsertSchema(categories).pick({
  name: true,
  description: true,
});

export const insertReviewSchema = createInsertSchema(reviews).pick({
  userId: true,
  productId: true,
  sellerId: true,
  rating: true,
  comment: true,
});

export const insertOrderSchema = createInsertSchema(orders).pick({
  userId: true,
  total: true,
  status: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).pick({
  orderId: true,
  productId: true,
  quantity: true,
  price: true,
});

export const insertProductImageSchema = createInsertSchema(productImages).pick({
  productId: true,
  imageUrl: true,
  imageOrder: true,
  imageName: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  senderId: true,
  receiverId: true,
  content: true,
  productId: true,
  isRead: true,
  messageType: true,
  actionType: true,
  isClicked: true,
  fileUrl: true,
});

// Create the base schema first
const baseInsertAuctionSchema = createInsertSchema(auctions).pick({
  productId: true,
  startingPrice: true,
  reservePrice: true,
  buyNowPrice: true,
  currentBid: true,
  currentBidderId: true,
  bidIncrement: true,
  startsAt: true,
  status: true,
});

// Create a modified schema with string for endsAt to match Supabase's expected format
export const insertAuctionSchema = baseInsertAuctionSchema.extend({
  endsAt: z.string(), // Override to expect ISO string format
});

export const insertBidSchema = createInsertSchema(bids).pick({
  auctionId: true,
  bidderId: true,
  amount: true,
  isWinning: true,
});

export const insertBoostPackageSchema = createInsertSchema(boostPackages).pick({
  name: true,
  packageType: true,
  itemCount: true,
  price: true,
  durationHours: true,
  effectivePrice: true,
  isActive: true,
});

export const insertPaymentSchema = createInsertSchema(payments).pick({
  userId: true,
  orderId: true,
  billId: true,
  amount: true,
  status: true,
  paymentType: true,
  featureDuration: true,
  boost_option_id: true,
  productIds: true,
  paymentChannel: true,
  paidAt: true,
  metadata: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  productId: true,
  sellerId: true,
  buyerId: true,
  amount: true,
  status: true,
});

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).pick({
  userId: true,
  email: true,
  ipAddress: true,
  userAgent: true,
  successful: true,
  failureReason: true,
});

export const insertSessionSchema = createInsertSchema(sessions).pick({
  userId: true,
  token: true,
  ipAddress: true,
  userAgent: true,
  active: true,
  lastActivity: true,
  expiresAt: true,
});

export const insertSecurityAlertSchema = createInsertSchema(securityAlerts).pick({
  type: true,
  severity: true,
  title: true,
  description: true,
  status: true,
  metadata: true,
  acknowledgedAt: true,
  acknowledgedBy: true,
  notes: true,
});

export const insertRateLimitViolationSchema = createInsertSchema(rateLimitViolations).pick({
  ipAddress: true,
  userId: true,
  endpoint: true,
  method: true,
  violationCount: true,
  windowStart: true,
});

// Schema for creating boost orders
export const createBoostOrderSchema = z.object({
  boostPackageId: z.number().int().positive("Boost package ID must be a positive integer"),
  productIds: z.array(z.number().int().positive("Product ID must be a positive integer")).min(1, "At least one product must be selected"),
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type BoostPackage = typeof boostPackages.$inferSelect;
export type InsertBoostPackage = z.infer<typeof insertBoostPackageSchema>;

export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type ProductImage = typeof productImages.$inferSelect;
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Auction = typeof auctions.$inferSelect;
export type InsertAuction = z.infer<typeof insertAuctionSchema>;

export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;

export type BidAuditTrail = typeof bidAuditTrail.$inferSelect;
export type InsertBidAuditTrail = typeof bidAuditTrail.$inferInsert;

export type Payment = typeof payments.$inferSelect & {
  product_id?: string | number | null; // Added for compatibility with database structure
};
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;

export type Session = typeof sessions.$inferSelect;
export type InsertSession = z.infer<typeof insertSessionSchema>;

export type SecurityAlert = typeof securityAlerts.$inferSelect;
export type InsertSecurityAlert = z.infer<typeof insertSecurityAlertSchema>;

export type RateLimitViolation = typeof rateLimitViolations.$inferSelect;
export type InsertRateLimitViolation = z.infer<typeof insertRateLimitViolationSchema>;

export type CreateBoostOrder = z.infer<typeof createBoostOrderSchema>;

// Extended types
export type ProductWithDetails = Product & {
  category?: Category;
  seller?: User;
  reviews?: Review[];
  averageRating?: number;
  images?: ProductImage[]; // Added images array
  auction?: Auction & { bidCount?: number }; // Added auction data with optional bid count
  status?: string;
  
  // Support both database field names and TypeScript conventions for featured status
  // This ensures compatibility between database and frontend code
  is_featured?: boolean;  // Database field name
  featured_at?: Date | string | null;  // Database field name
  featured_until?: Date | string | null;  // Database field name
  featured_duration_hours?: number | null;  // Database field name
  boost_option_id?: number | null;  // Database field name
  boost_package_id?: number | null;  // Database field name
  boost_group_id?: string | null;  // Database field name
  boostPackage?: BoostPackage;  // Related boost package
};

export type OrderWithItems = Order & {
  items: (OrderItem & { product: Product })[];
  user: User;
};

export type MessageWithDetails = Message & {
  sender?: User;
  receiver?: User;
  product?: ProductWithDetails;
};

export type AuctionWithDetails = Auction & {
  product?: ProductWithDetails;
  currentBidder?: User;
  bids?: Bid[];
};

export type BidWithDetails = Bid & {
  auction?: Auction;
  bidder?: User;
};

export type TransactionWithDetails = Transaction & {
  product?: Product;
  seller?: User;
  buyer?: User;
};

// Note: Relations are handled through joins in the DatabaseStorage implementation