import { pgTable, text, serial, integer, boolean, doublePrecision, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
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
  walletBalance: doublePrecision("wallet_balance").default(0).notNull(),
  isSeller: boolean("is_seller").default(true).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isBanned: boolean("is_banned").default(false).notNull(),
  isVerified: boolean("is_verified").default(false),
  shopName: text("shop_name"),
  location: text("location"),
  bio: text("bio"),
  providerId: text("provider_id"), // Stores the ID from the auth provider (e.g., Supabase user UUID)
  provider: text("provider"), // The authentication provider used (e.g., 'supabase', 'facebook')
});

// Categories table
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
});

// Products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull(),
  imageUrl: text("image_url"), // OBSOLETE: This field is no longer used. Images stored in product_images table
  stockQuantity: integer("stock_quantity").notNull().default(1), // Most secondhand items have quantity 1
  categoryId: integer("category_id").references(() => categories.id),
  sellerId: integer("seller_id").references(() => users.id).notNull(),
  isNew: boolean("is_new").default(false), // In secondhand context: like new condition
  isFeatured: boolean("is_featured").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  // Secondhand perfume specific fields
  remainingPercentage: integer("remaining_percentage").default(100), // How full is the bottle (1-100%)
  batchCode: text("batch_code"), // Authenticity batch code
  purchaseYear: integer("purchase_year"), // When was it originally purchased
  boxCondition: text("box_condition"), // Condition of the box/packaging
  listingType: text("listing_type").default("fixed"), // fixed, negotiable, auction
  volume: integer("volume") // Bottle size (e.g., "50ml", "100ml", "3.4oz")
});

// Product Images table
export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  imageUrl: text("image_url").notNull(),
  imageOrder: integer("image_order").default(0).notNull(), // The order/position of the image
  imageName: text("image_name"), // Original file name or generated name
  createdAt: timestamp("created_at").defaultNow(),
});

// Reviews table
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  total: doublePrecision("total").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Order items table
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  price: doublePrecision("price").notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  receiverId: integer("receiver_id").references(() => users.id).notNull(),
  content: text("content").notNull(), // Encrypted message content
  productId: integer("product_id").references(() => products.id), // Optional reference to product
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Auctions table
export const auctions = pgTable("auctions", {
  id: bigint("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  productId: bigint("product_id", { mode: "number" }).references(() => products.id, { onDelete: "cascade" }).notNull(),
  startingPrice: doublePrecision("starting_price").notNull(),
  reservePrice: doublePrecision("reserve_price"),
  buyNowPrice: doublePrecision("buy_now_price"),
  currentBid: doublePrecision("current_bid"),
  currentBidderId: bigint("current_bidder_id", { mode: "number" }).references(() => users.id),
  bidIncrement: doublePrecision("bid_increment").default(5.0).notNull(),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  endsAt: timestamp("ends_at").notNull(),
  status: text("status").default("active").notNull(), // 'active', 'pending', 'completed', 'cancelled', 'reserve_not_met'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bids table
export const bids = pgTable("bids", {
  id: bigint("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  auctionId: bigint("auction_id", { mode: "number" }).references(() => auctions.id, { onDelete: "cascade" }).notNull(),
  bidderId: bigint("bidder_id", { mode: "number" }).references(() => users.id).notNull(),
  amount: doublePrecision("amount").notNull(),
  placedAt: timestamp("placed_at").defaultNow().notNull(),
  isWinning: boolean("is_winning").default(false),
});

// Zod schemas for data validation
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
  remainingPercentage: true,
  batchCode: true,
  purchaseYear: true,
  boxCondition: true,
  listingType: true,
  volume: true,
});

export const insertCategorySchema = createInsertSchema(categories).pick({
  name: true,
  description: true,
});

export const insertReviewSchema = createInsertSchema(reviews).pick({
  userId: true,
  productId: true,
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
});

export const insertAuctionSchema = createInsertSchema(auctions).pick({
  productId: true,
  startingPrice: true,
  reservePrice: true,
  buyNowPrice: true,
  bidIncrement: true,
  startsAt: true,
  endsAt: true,
  status: true,
});

export const insertBidSchema = createInsertSchema(bids).pick({
  auctionId: true,
  bidderId: true,
  amount: true,
  isWinning: true,
});

// Types for TypeScript
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

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

// Extended types
export type ProductWithDetails = Product & {
  category?: Category;
  seller?: User;
  reviews?: Review[];
  averageRating?: number;
  images?: ProductImage[]; // Added images array
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

// Note: Relations are handled through joins in the DatabaseStorage implementation
