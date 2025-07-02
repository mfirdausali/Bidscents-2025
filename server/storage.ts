import { users, products, categories, reviews, orders, orderItems, productImages, messages, auctions, bids, payments, boostPackages, transactions } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  BoostPackage, InsertBoostPackage,
  Review, InsertReview,
  Order, InsertOrder, OrderItem, InsertOrderItem, OrderWithItems,
  ProductImage, InsertProductImage,
  Message, InsertMessage, MessageWithDetails,
  Auction, InsertAuction, AuctionWithDetails,
  Bid, InsertBid, BidWithDetails,
  Payment, InsertPayment,
  Transaction, InsertTransaction, TransactionWithDetails
} from "@shared/schema";
import { supabase } from './supabase';

// Define cart types since they're removed from schema but still required by the interface
interface CartItem {
  id: number;
  userId: number;
  productId: number;
  quantity: number;
}

interface InsertCartItem {
  userId: number;
  productId: number;
  quantity: number;
}

interface CartItemWithProduct extends CartItem {
  product: Product;
}
// Removed session dependencies - using Supabase as sole IdP
import { db } from "./db";
import { eq, and, gte, lte, like, ilike, asc, desc, sql, or, isNull } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type ProductFilter = {
  categoryId?: number;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
};

// Custom error types for boost validation
export class BoostValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'BoostValidationError';
  }
}

export const BOOST_ERROR_CODES = {
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
  INVALID_PRODUCT_OWNERSHIP: 'INVALID_PRODUCT_OWNERSHIP', 
  PRODUCTS_ALREADY_FEATURED: 'PRODUCTS_ALREADY_FEATURED',
  PRODUCT_COUNT_MISMATCH: 'PRODUCT_COUNT_MISMATCH'
} as const;

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByProviderId(providerId: string): Promise<User | undefined>;
  updateUserProviderId(userId: number, providerId: string, provider: string): Promise<User>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  getAllUsers(): Promise<User[]>;
  banUser(id: number, isBanned: boolean): Promise<User>;
  
  // Category methods
  getAllCategories(): Promise<Category[]>;
  getCategoryById(id: number): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  
  // Product methods
  getProducts(filters?: ProductFilter): Promise<ProductWithDetails[]>;
  getProductById(id: number): Promise<ProductWithDetails | undefined>;
  getFeaturedProducts(): Promise<ProductWithDetails[]>;
  getSellerProducts(sellerId: number): Promise<ProductWithDetails[]>;
  getAllProductsWithDetails(): Promise<ProductWithDetails[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: InsertProduct): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  
  // Cart methods
  getCartItems(userId: number): Promise<CartItemWithProduct[]>;
  getCartItemById(id: number): Promise<CartItem | undefined>;
  getCartItemByProductId(userId: number, productId: number): Promise<CartItem | undefined>;
  addToCart(cartItem: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: number, quantity: number): Promise<CartItem>;
  removeFromCart(id: number): Promise<void>;
  clearCart(userId: number): Promise<void>;
  
  // Review methods
  getProductReviews(productId: number): Promise<Review[]>;
  getUserProductReview(userId: number, productId: number): Promise<Review | undefined>;
  createReview(review: InsertReview): Promise<Review>;
  
  // Order methods
  createOrder(order: InsertOrder): Promise<Order>;
  addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem>;
  getOrderById(id: number): Promise<OrderWithItems | undefined>;
  getUserOrders(userId: number): Promise<OrderWithItems[]>;
  getAllOrders(): Promise<OrderWithItems[]>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  
  // Product Image methods
  getProductImages(productId: number): Promise<ProductImage[]>;
  createProductImage(productImage: InsertProductImage): Promise<ProductImage>;
  updateProductImage(id: number, productImage: Partial<InsertProductImage>): Promise<ProductImage>;
  deleteProductImage(id: number): Promise<void>;
  
  // Auction methods
  getAuctions(): Promise<Auction[]>;
  getAuctionById(id: number): Promise<Auction | undefined>;
  getProductAuctions(productId: number): Promise<Auction[]>;
  createAuction(auction: InsertAuction): Promise<Auction>;
  updateAuction(id: number, auction: Partial<InsertAuction>): Promise<Auction>;
  deleteAuction(id: number): Promise<void>;
  
  // Bid methods
  getBidsForAuction(auctionId: number): Promise<Bid[]>;
  createBid(bid: InsertBid): Promise<Bid>;
  updatePreviousBids(auctionId: number, newBidderId: number): Promise<void>;
  
  // Message methods
  getUserMessages(userId: number): Promise<MessageWithDetails[]>;
  getConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]>;
  getConversationForProduct(userId1: number, userId2: number, productId: number): Promise<MessageWithDetails[]>;
  sendMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<Message>;
  markAllMessagesAsRead(receiverId: number, senderId: number): Promise<void>;
  getUnreadMessageCount(userId: number): Promise<number>;
  
  // Payment methods
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  getPaymentByOrderId(orderId: string): Promise<Payment | undefined>;
  getPaymentByBillId(billId: string): Promise<Payment | undefined>;
  getUserPayments(userId: number): Promise<Payment[]>;
  updatePaymentStatus(id: number, status: string, billId?: string, paymentChannel?: string, paidAt?: Date): Promise<Payment>;
  updatePaymentProductIds(id: number, productIds: string[]): Promise<Payment>;
  updateSingleProductPayment(paymentId: number, productId: number): Promise<void>;
  createProductPaymentRecord(params: {
    userId: number;
    billId: string;
    productId: number;
    amount: number;
    status: string;
    paidAt?: Date;
    paymentType: string;
    featureDuration?: number;
  }): Promise<any>;
  
  // Transaction methods
  createTransaction(data: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: number): Promise<TransactionWithDetails[]>;
  getProductTransactions(productId: number): Promise<TransactionWithDetails[]>;
  updateTransactionStatus(id: number, status: string): Promise<Transaction>;
  
  // Boost methods
  getBoostPackageById(id: number): Promise<BoostPackage | null>;
  createBoostPayment(userId: number, orderId: string, boostPackageId: number, productIds: number[], amount: number): Promise<number>;
  getUserProductsForBoosting(userId: number, productIds: number[]): Promise<Product[]>;
  validateBoostOrder(userId: number, boostPackageId: number, productIds: number[]): Promise<void>;
  activateBoostForProducts(productIds: number[], durationHours: number): Promise<void>;
  
  // Removed session storage - using Supabase as sole IdP
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private categories: Map<number, Category>;
  private products: Map<number, Product>;
  private cartItems: Map<number, CartItem>;
  private reviews: Map<number, Review>;
  private orders: Map<number, Order>;
  private orderItems: Map<number, OrderItem>;
  private productImages: Map<number, ProductImage>;
  private messages: Map<number, Message>;
  // Removed session store - using Supabase authentication
  currentIds: {
    users: number;
    categories: number;
    products: number;
    cartItems: number;
    reviews: number;
    orders: number;
    orderItems: number;
    productImages: number;
    messages: number;
  };

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.products = new Map();
    this.cartItems = new Map();
    this.reviews = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.productImages = new Map();
    this.messages = new Map();
    this.currentIds = {
      users: 1,
      categories: 1,
      products: 1,
      cartItems: 1,
      reviews: 1,
      orders: 1,
      orderItems: 1,
      productImages: 1,
      messages: 1
    };
    // Removed session store initialization - using Supabase authentication
    
    // Initialize with default categories
    this.initializeDefaultData();
  }

  private initializeDefaultData() {
    // Add default categories
    const defaultCategories: InsertCategory[] = [
      { name: "Women's Fragrances", description: "Perfumes for women" },
      { name: "Men's Fragrances", description: "Perfumes for men" },
      { name: "Unisex", description: "Fragrances for everyone" },
      { name: "Niche", description: "Exclusive and unique fragrances" },
      { name: "New Arrivals", description: "Latest additions to our collection" },
    ];
    
    defaultCategories.forEach(category => {
      this.createCategory(category);
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase(),
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const user: User = { 
      ...insertUser, 
      id,
      isAdmin: insertUser.isAdmin || false,
      isBanned: insertUser.isBanned || false
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("User not found");
    }
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
  
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async banUser(id: number, isBanned: boolean): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error("User not found");
    }
    
    const updatedUser = { ...user, isBanned };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Category methods
  async getAllCategories(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }

  async getCategoryById(id: number): Promise<Category | undefined> {
    return this.categories.get(id);
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const id = this.currentIds.categories++;
    const category: Category = { ...insertCategory, id };
    this.categories.set(id, category);
    return category;
  }

  // Product methods
  async getProducts(filters?: ProductFilter): Promise<ProductWithDetails[]> {
    let filteredProducts = Array.from(this.products.values());
    
    if (filters) {
      if (filters.categoryId) {
        filteredProducts = filteredProducts.filter(p => p.categoryId === filters.categoryId);
      }
      
      if (filters.brand) {
        filteredProducts = filteredProducts.filter(p => 
          p.brand.toLowerCase().includes(filters.brand!.toLowerCase())
        );
      }
      
      if (filters.minPrice !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.price >= filters.minPrice!);
      }
      
      if (filters.maxPrice !== undefined) {
        filteredProducts = filteredProducts.filter(p => p.price <= filters.maxPrice!);
      }
      
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredProducts = filteredProducts.filter(p => 
          p.name.toLowerCase().includes(searchTerm) || 
          p.brand.toLowerCase().includes(searchTerm) ||
          (p.description && p.description.toLowerCase().includes(searchTerm))
        );
      }
    }
    
    return this.addProductDetails(filteredProducts);
  }

  async getProductById(id: number): Promise<ProductWithDetails | undefined> {
    const product = this.products.get(id);
    if (!product) return undefined;
    
    const products = await this.addProductDetails([product]);
    return products[0];
  }

  async getFeaturedProducts(): Promise<ProductWithDetails[]> {
    const featuredProducts = Array.from(this.products.values()).filter(p => p.isFeatured);
    return this.addProductDetails(featuredProducts);
  }

  async getSellerProducts(sellerId: number): Promise<ProductWithDetails[]> {
    const sellerProducts = Array.from(this.products.values()).filter(p => p.sellerId === sellerId);
    return this.addProductDetails(sellerProducts);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.currentIds.products++;
    const createdAt = new Date();
    const product: Product = { ...insertProduct, id, createdAt };
    this.products.set(id, product);
    return product;
  }

  async updateProduct(id: number, updateProduct: InsertProduct): Promise<Product> {
    const product = this.products.get(id);
    if (!product) {
      throw new Error("Product not found");
    }
    
    const updatedProduct: Product = { ...product, ...updateProduct, id };
    this.products.set(id, updatedProduct);
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<void> {
    try {
      // Import the object storage module for image deletion
      const objectStorage = await import('./object-storage');
      
      // Delete associated images from object storage first
      for (const [imageId, image] of this.productImages.entries()) {
        if (image.productId === id) {
          try {
            const deleted = await objectStorage.deleteProductImage(image.imageUrl);
            if (deleted) {
              console.log(`Image ${image.imageUrl} removed from object storage`);
            } else {
              console.log(`Failed to delete image ${image.imageUrl} from object storage`);
            }
          } catch (error: any) {
            console.error(`Error trying to delete image ${image.imageUrl} from object storage:`, error);
          }
        }
      }
      
      // Delete associated reviews
      for (const [reviewId, review] of this.reviews.entries()) {
        if (review.productId === id) {
          this.reviews.delete(reviewId);
        }
      }
      
      // Delete associated images from database
      for (const [imageId, image] of this.productImages.entries()) {
        if (image.productId === id) {
          this.productImages.delete(imageId);
        }
      }
      
      // Finally delete the product
      this.products.delete(id);
      
      console.log(`Successfully deleted product ${id} and all associated images`);
    } catch (error: any) {
      console.error(`Error deleting product ${id}:`, error);
      throw error;
    }
  }

  // Cart methods - These methods are kept for interface compatibility but will throw errors if called
  async getCartItems(userId: number): Promise<CartItemWithProduct[]> {
    console.warn("Cart functionality has been removed");
    return [];
  }

  async getCartItemById(id: number): Promise<CartItem | undefined> {
    console.warn("Cart functionality has been removed");
    return undefined;
  }

  async getCartItemByProductId(userId: number, productId: number): Promise<CartItem | undefined> {
    console.warn("Cart functionality has been removed");
    return undefined;
  }

  async addToCart(insertCartItem: InsertCartItem): Promise<CartItem> {
    console.warn("Cart functionality has been removed");
    throw new Error("Cart functionality has been removed");
  }

  async updateCartItem(id: number, quantity: number): Promise<CartItem> {
    console.warn("Cart functionality has been removed");
    throw new Error("Cart functionality has been removed");
  }

  async removeFromCart(id: number): Promise<void> {
    console.warn("Cart functionality has been removed");
  }
  
  async clearCart(userId: number): Promise<void> {
    console.warn("Cart functionality has been removed");
  }

  // Review methods
  async getProductReviews(productId: number): Promise<Review[]> {
    return Array.from(this.reviews.values()).filter(
      review => review.productId === productId
    );
  }

  async getUserProductReview(userId: number, productId: number): Promise<Review | undefined> {
    return Array.from(this.reviews.values()).find(
      review => review.userId === userId && review.productId === productId
    );
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const id = this.currentIds.reviews++;
    const createdAt = new Date();
    const review: Review = { ...insertReview, id, createdAt };
    this.reviews.set(id, review);
    return review;
  }
  
  // Order methods
  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    const id = this.currentIds.orders++;
    const createdAt = new Date();
    const order: Order = { ...insertOrder, id, createdAt };
    this.orders.set(id, order);
    return order;
  }
  
  async addOrderItem(insertOrderItem: InsertOrderItem): Promise<OrderItem> {
    const id = this.currentIds.orderItems++;
    const orderItem: OrderItem = { ...insertOrderItem, id };
    this.orderItems.set(id, orderItem);
    return orderItem;
  }
  
  async getOrderById(id: number): Promise<OrderWithItems | undefined> {
    const order = this.orders.get(id);
    if (!order) return undefined;
    
    const items = Array.from(this.orderItems.values())
      .filter(item => item.orderId === id)
      .map(item => {
        const product = this.products.get(item.productId);
        if (!product) {
          throw new Error(`Product not found for order item: ${item.id}`);
        }
        return { ...item, product };
      });
    
    const user = this.users.get(order.userId);
    if (!user) {
      throw new Error(`User not found for order: ${order.id}`);
    }
    
    return {
      ...order,
      items,
      user
    };
  }
  
  async getUserOrders(userId: number): Promise<OrderWithItems[]> {
    const userOrders = Array.from(this.orders.values())
      .filter(order => order.userId === userId);
    
    return Promise.all(
      userOrders.map(order => this.getOrderById(order.id))
    ) as Promise<OrderWithItems[]>;
  }
  
  async getAllOrders(): Promise<OrderWithItems[]> {
    const allOrders = Array.from(this.orders.values());
    
    return Promise.all(
      allOrders.map(order => this.getOrderById(order.id))
    ) as Promise<OrderWithItems[]>;
  }
  
  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const order = this.orders.get(id);
    if (!order) {
      throw new Error("Order not found");
    }
    
    const updatedOrder: Order = { ...order, status };
    this.orders.set(id, updatedOrder);
    return updatedOrder;
  }

  // Product Image methods
  async getProductImages(productId: number): Promise<ProductImage[]> {
    return Array.from(this.productImages.values())
      .filter(image => image.productId === productId)
      .sort((a, b) => a.imageOrder - b.imageOrder);
  }

  async createProductImage(productImage: InsertProductImage): Promise<ProductImage> {
    const id = this.currentIds.productImages++;
    const createdAt = new Date();
    const newImage: ProductImage = { 
      ...productImage, 
      id, 
      createdAt 
    };
    this.productImages.set(id, newImage);
    return newImage;
  }

  async updateProductImage(id: number, productImage: Partial<InsertProductImage>): Promise<ProductImage> {
    const existing = this.productImages.get(id);
    if (!existing) {
      throw new Error("Product image not found");
    }
    const updated = { ...existing, ...productImage };
    this.productImages.set(id, updated);
    return updated;
  }

  async deleteProductImage(id: number): Promise<void> {
    this.productImages.delete(id);
  }

  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    const userMessages = Array.from(this.messages.values()).filter(
      message => message.senderId === userId || message.receiverId === userId
    );
    
    return this.addMessageDetails(userMessages);
  }
  
  async getConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    const conversation = Array.from(this.messages.values()).filter(
      message => 
        (message.senderId === userId1 && message.receiverId === userId2) || 
        (message.senderId === userId2 && message.receiverId === userId1)
    );
    
    return this.addMessageDetails(conversation);
  }
  
  async getConversationForProduct(userId1: number, userId2: number, productId: number): Promise<MessageWithDetails[]> {
    const conversation = Array.from(this.messages.values()).filter(
      message => 
        ((message.senderId === userId1 && message.receiverId === userId2) || 
        (message.senderId === userId2 && message.receiverId === userId1)) &&
        message.productId === productId
    );
    
    return this.addMessageDetails(conversation);
  }
  
  async sendMessage(message: InsertMessage): Promise<Message> {
    const id = this.currentIds.messages++;
    const createdAt = new Date();
    
    // Import encryption utility
    const { encryptMessage } = await import('./encryption');
    
    // Encrypt the message content
    const encryptedMessage: Message = {
      ...message,
      id,
      createdAt,
      isRead: message.isRead || false,
      // Encrypt the content before storing
      content: encryptMessage(message.content)
    };
    
    this.messages.set(id, encryptedMessage);
    return encryptedMessage;
  }
  
  async markMessageAsRead(id: number): Promise<Message> {
    const message = this.messages.get(id);
    if (!message) {
      throw new Error("Message not found");
    }
    
    const updatedMessage: Message = { ...message, isRead: true };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }
  
  async markAllMessagesAsRead(receiverId: number, senderId: number): Promise<void> {
    for (const [messageId, message] of this.messages.entries()) {
      if (message.receiverId === receiverId && message.senderId === senderId) {
        this.messages.set(messageId, { ...message, isRead: true });
      }
    }
  }
  
  async getUnreadMessageCount(userId: number): Promise<number> {
    const unreadMessages = Array.from(this.messages.values()).filter(
      message => message.receiverId === userId && !message.isRead
    );
    return unreadMessages.length;
  }
  
  private async addMessageDetails(messages: Message[]): Promise<MessageWithDetails[]> {
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    return Promise.all(
      messages.map(async (message) => {
        const sender = this.users.get(message.senderId);
        const receiver = this.users.get(message.receiverId);
        
        let product;
        if (message.productId) {
          product = await this.getProductById(message.productId);
        }
        
        // Decrypt message content if it's encrypted
        let content = message.content;
        if (isEncrypted(content)) {
          content = decryptMessage(content);
        }
        
        return {
          ...message,
          content,  // Replace with decrypted content
          sender,
          receiver,
          product
        };
      })
    );
  }

  // Helper methods
  private async addProductDetails(products: Product[]): Promise<ProductWithDetails[]> {
    return Promise.all(products.map(async product => {
      const category = product.categoryId ? await this.getCategoryById(product.categoryId) : undefined;
      const seller = await this.getUser(product.sellerId);
      const reviews = await this.getProductReviews(product.id);
      const images = await this.getProductImages(product.id);
      
      // Calculate average rating
      let averageRating: number | undefined = undefined;
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = totalRating / reviews.length;
      }
      
      // Get auction data if product is an auction
      let auction: (Auction & { bidCount?: number }) | undefined = undefined;
      if (product.listingType === 'auction') {
        // For in-memory storage, find the auction by productId
        const productAuctions = Array.from(this.auctions.values()).filter(a => a.productId === product.id);
        if (productAuctions.length > 0) {
          const auctionData = productAuctions[0];
          // Count bids for this auction
          const bidCount = Array.from(this.bids.values()).filter(b => b.auctionId === auctionData.id).length;
          auction = {
            ...auctionData,
            bidCount
          };
        }
      }
      
      return {
        ...product,
        category,
        seller,
        reviews,
        averageRating,
        images,
        auction,
      };
    }));
  }

  // Boost methods - stub implementations for MemStorage
  async getBoostPackageById(id: number): Promise<BoostPackage | null> {
    console.warn("Boost functionality not implemented in MemStorage");
    return null;
  }

  async createBoostPayment(userId: number, orderId: string, boostPackageId: number, productIds: number[], amount: number): Promise<number> {
    console.warn("Boost functionality not implemented in MemStorage");
    throw new Error("Boost functionality not implemented in MemStorage");
  }

  async getUserProductsForBoosting(userId: number, productIds: number[]): Promise<Product[]> {
    console.warn("Boost functionality not implemented in MemStorage");
    return [];
  }

  async validateBoostOrder(userId: number, boostPackageId: number, productIds: number[]): Promise<void> {
    console.warn("Boost functionality not implemented in MemStorage");
    throw new BoostValidationError(BOOST_ERROR_CODES.PACKAGE_NOT_FOUND, "Boost functionality not implemented in MemStorage");
  }

  async activateBoostForProducts(productIds: number[], durationHours: number): Promise<void> {
    console.warn("Boost functionality not implemented in MemStorage");
    throw new Error("Boost functionality not implemented in MemStorage");
  }
}

export class DatabaseStorage implements IStorage {
  // Removed session store - using Supabase authentication

  constructor() {
    // Using Supabase as sole authentication provider
    this.initializeDefaultData();
  }

  private async initializeDefaultData() {
    // Only add default categories if none exist
    const existingCategories = await this.getAllCategories();
    if (existingCategories.length === 0) {
      const defaultCategories: InsertCategory[] = [
        { name: "Women's Fragrances", description: "Perfumes for women" },
        { name: "Men's Fragrances", description: "Perfumes for men" },
        { name: "Unisex", description: "Fragrances for everyone" },
        { name: "Niche", description: "Exclusive and unique fragrances" },
        { name: "New Arrivals", description: "Latest additions to our collection" },
      ];
      
      for (const category of defaultCategories) {
        await this.createCategory(category);
      }
    }
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByProviderId(providerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.providerId, providerId));
    return user;
  }

  async updateUserProviderId(userId: number, providerId: string, provider: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ providerId, provider })
      .where(eq(users.id, userId))
      .returning();
    
    if (!updatedUser) {
      throw new Error("User not found");
    }
    
    return updatedUser;
  }

  async createUser(user: InsertUser): Promise<User> {
    // Ensure boolean values are correctly set
    const userData = {
      ...user,
      isAdmin: user.isAdmin === true,
      isSeller: user.isSeller === true,
      isBanned: user.isBanned === true || false
    };
    
    const [newUser] = await db.insert(users).values(userData).returning();
    return newUser;
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    
    if (!updatedUser) {
      throw new Error("User not found");
    }
    
    return updatedUser;
  }
  
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }
  
  async banUser(id: number, isBanned: boolean): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ isBanned })
      .where(eq(users.id, id))
      .returning();
    
    if (!updatedUser) {
      throw new Error("User not found");
    }
    
    return updatedUser;
  }

  // Category methods
  async getAllCategories(): Promise<Category[]> {
    return db.select().from(categories).orderBy(categories.name);
  }

  async getCategoryById(id: number): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  // Product methods
  async getProducts(filters?: ProductFilter): Promise<ProductWithDetails[]> {
    let query = db.select().from(products);
    
    if (filters) {
      const conditions = [];
      
      if (filters.categoryId) {
        conditions.push(eq(products.categoryId, filters.categoryId));
      }
      
      if (filters.brand) {
        conditions.push(ilike(products.brand, `%${filters.brand}%`));
      }
      
      if (filters.minPrice !== undefined) {
        conditions.push(gte(products.price, filters.minPrice));
      }
      
      if (filters.maxPrice !== undefined) {
        conditions.push(lte(products.price, filters.maxPrice));
      }
      
      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        conditions.push(
          or(
            ilike(products.name, searchTerm),
            ilike(products.brand, searchTerm),
            ilike(products.description, searchTerm)
          )
        );
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    const productsResult = await query;
    return this.addProductDetails(productsResult);
  }

  async getProductById(id: number): Promise<ProductWithDetails | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) return undefined;
    
    const productsWithDetails = await this.addProductDetails([product]);
    return productsWithDetails[0];
  }

  async getFeaturedProducts(): Promise<ProductWithDetails[]> {
    const featuredProducts = await db.select().from(products).where(eq(products.isFeatured, true));
    return this.addProductDetails(featuredProducts);
  }

  async getSellerProducts(sellerId: number): Promise<ProductWithDetails[]> {
    const sellerProducts = await db.select().from(products).where(eq(products.sellerId, sellerId));
    return this.addProductDetails(sellerProducts);
  }

  async getAllProductsWithDetails(): Promise<ProductWithDetails[]> {
    const allProducts = await db.select().from(products);
    return this.addProductDetails(allProducts);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async updateProduct(id: number, product: InsertProduct): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set(product)
      .where(eq(products.id, id))
      .returning();
    
    if (!updatedProduct) {
      throw new Error("Product not found");
    }
    
    return updatedProduct;
  }

  async deleteProduct(id: number): Promise<void> {
    try {
      // First retrieve all product images to delete them from object storage
      const images = await db.select()
        .from(productImages)
        .where(eq(productImages.productId, id));
      
      // Import the object storage module for image deletion
      const objectStorage = await import('./object-storage');
      
      // Delete each image from object storage
      for (const image of images) {
        try {
          // The imageUrl field contains the ID used in object storage
          const deleted = await objectStorage.deleteProductImage(image.imageUrl);
          if (deleted) {
            console.log(`Image ${image.imageUrl} removed from object storage`);
          } else {
            console.log(`Failed to delete image ${image.imageUrl} from object storage`);
          }
        } catch (error: any) {
          console.error(`Error trying to delete image ${image.imageUrl} from object storage:`, error);
          // Continue with other deletions even if one fails
        }
      }
      
      // Delete associated records using try-catch for each operation
      // Note: cart_items table has been removed, so we don't need to delete from it
      
      try {
        await db.delete(reviews).where(eq(reviews.productId, id));
        console.log(`Deleted reviews for product ${id}`);
      } catch (error: any) {
        console.log(`Skipping reviews deletion: ${error.message || 'Unknown error'}`);
      }
      
      try {
        await db.delete(productImages).where(eq(productImages.productId, id));
        console.log(`Deleted product images from database for product ${id}`);
      } catch (error: any) {
        console.log(`Skipping product_images deletion: ${error.message || 'Unknown error'}`);
      }
      
      // Finally delete the product
      await db.delete(products).where(eq(products.id, id));
      
      console.log(`Successfully deleted product ${id} and all associated images`);
    } catch (error: any) {
      console.error(`Error deleting product ${id}:`, error);
      throw error;
    }
  }

  // Cart methods - These methods are kept for interface compatibility but will throw errors if called
  async getCartItems(userId: number): Promise<CartItemWithProduct[]> {
    console.warn("Cart functionality has been removed");
    return [];
  }

  async getCartItemById(id: number): Promise<CartItem | undefined> {
    console.warn("Cart functionality has been removed");
    return undefined;
  }

  async getCartItemByProductId(userId: number, productId: number): Promise<CartItem | undefined> {
    console.warn("Cart functionality has been removed");
    return undefined;
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    console.warn("Cart functionality has been removed");
    throw new Error("Cart functionality has been removed");
  }

  async updateCartItem(id: number, quantity: number): Promise<CartItem> {
    console.warn("Cart functionality has been removed");
    throw new Error("Cart functionality has been removed");
  }

  async removeFromCart(id: number): Promise<void> {
    console.warn("Cart functionality has been removed");
  }
  
  async clearCart(userId: number): Promise<void> {
    console.warn("Cart functionality has been removed");
  }

  // Review methods
  async getProductReviews(productId: number): Promise<Review[]> {
    return db.select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));
  }

  async getUserProductReview(userId: number, productId: number): Promise<Review | undefined> {
    const [review] = await db.select()
      .from(reviews)
      .where(and(
        eq(reviews.userId, userId),
        eq(reviews.productId, productId)
      ));
    
    return review;
  }

  async createReview(review: InsertReview): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    return newReview;
  }
  
  // Order methods
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }
  
  async addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const [newItem] = await db.insert(orderItems).values(orderItem).returning();
    return newItem;
  }
  
  async getOrderById(id: number): Promise<OrderWithItems | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return undefined;
    
    // Get order items with products
    const orderItemsResult = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    
    const items = await Promise.all(orderItemsResult.map(async (item) => {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      
      if (!product) {
        throw new Error(`Product not found for order item: ${item.id}`);
      }
      
      return { ...item, product };
    }));
    
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, order.userId));
    
    if (!user) {
      throw new Error(`User not found for order: ${order.id}`);
    }
    
    return {
      ...order,
      items,
      user
    };
  }
  
  async getUserOrders(userId: number): Promise<OrderWithItems[]> {
    const userOrders = await db.select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
    
    return Promise.all(
      userOrders.map(order => this.getOrderById(order.id))
    ) as Promise<OrderWithItems[]>;
  }
  
  async getAllOrders(): Promise<OrderWithItems[]> {
    const allOrders = await db.select()
      .from(orders)
      .orderBy(desc(orders.createdAt));
    
    return Promise.all(
      allOrders.map(order => this.getOrderById(order.id))
    ) as Promise<OrderWithItems[]>;
  }
  
  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    
    if (!updatedOrder) {
      throw new Error("Order not found");
    }
    
    return updatedOrder;
  }

  // Product Image methods
  async getProductImages(productId: number): Promise<ProductImage[]> {
    return db.select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(productImages.imageOrder);
  }

  async createProductImage(productImage: InsertProductImage): Promise<ProductImage> {
    const [newImage] = await db.insert(productImages).values(productImage).returning();
    return newImage;
  }

  async updateProductImage(id: number, productImage: Partial<InsertProductImage>): Promise<ProductImage> {
    const [updatedImage] = await db
      .update(productImages)
      .set(productImage)
      .where(eq(productImages.id, id))
      .returning();
    
    if (!updatedImage) {
      throw new Error("Product image not found");
    }
    
    return updatedImage;
  }

  async deleteProductImage(id: number): Promise<void> {
    await db.delete(productImages).where(eq(productImages.id, id));
  }

  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    // Use JOIN queries to fetch all related data in a single optimized request
    const userMessages = await db.select({
      message: messages,
      sender: users,
      receiver: {
        id: sql<number>`receiver_user.id`,
        username: sql<string>`receiver_user.username`,
        firstName: sql<string>`receiver_user.first_name`,
        lastName: sql<string>`receiver_user.last_name`,
        profileImage: sql<string>`receiver_user.profile_image`
      },
      product: products
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .leftJoin(sql`users as receiver_user`, sql`messages.receiver_id = receiver_user.id`)
    .leftJoin(products, eq(messages.productId, products.id))
    .where(
      or(
        eq(messages.senderId, userId),
        eq(messages.receiverId, userId)
      )
    )
    .orderBy(desc(messages.createdAt));

    // Group by conversation and keep only the latest message per conversation
    const conversationMap = new Map<string, any>();
    
    userMessages.forEach(row => {
      const msg = row.message;
      // Create conversation key by sorting user IDs to ensure consistency
      const conversationKey = [msg.senderId, msg.receiverId].sort().join('-') + 
                             (msg.productId ? `-${msg.productId}` : '');
      
      // Keep only the latest message (first one due to order by created_at desc)
      if (!conversationMap.has(conversationKey)) {
        conversationMap.set(conversationKey, row);
      }
    });
    
    return await this.processJoinedMessageData(Array.from(conversationMap.values()));
  }

  private async processJoinedMessageData(joinedData: any[]): Promise<MessageWithDetails[]> {
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    return joinedData.map(row => {
      const msg = row.message;
      
      // Decrypt message content if it's encrypted
      let content = msg.content;
      if (content && isEncrypted(content)) {
        content = decryptMessage(content);
      }
      
      return {
        id: msg.id,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        content: content, // Decrypted content
        isRead: msg.isRead,
        createdAt: msg.createdAt,
        productId: msg.productId,
        messageType: msg.messageType || 'TEXT',
        fileUrl: msg.fileUrl || null,
        actionType: msg.actionType || null,
        isClicked: msg.isClicked || false,
        // Map joined user and product data directly from the JOIN results
        sender: row.sender ? {
          id: row.sender.id,
          username: row.sender.username,
          firstName: row.sender.firstName,
          lastName: row.sender.lastName,
          profileImage: row.sender.profileImage
        } : undefined,
        receiver: row.receiver ? {
          id: row.receiver.id,
          username: row.receiver.username,
          firstName: row.receiver.firstName,
          lastName: row.receiver.lastName,
          profileImage: row.receiver.profileImage
        } : undefined,
        product: row.product ? {
          id: row.product.id,
          name: row.product.name,
          brand: row.product.brand,
          price: row.product.price,
          imageUrl: row.product.imageUrl,
          sellerId: row.product.sellerId
        } : undefined
      };
    }) as MessageWithDetails[];
  }
  
  async getConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    // Use JOIN queries to fetch all data in a single optimized request
    const conversation = await db.select({
      message: messages,
      sender: users,
      receiver: {
        id: sql<number>`receiver_user.id`,
        username: sql<string>`receiver_user.username`,
        firstName: sql<string>`receiver_user.first_name`,
        lastName: sql<string>`receiver_user.last_name`,
        profileImage: sql<string>`receiver_user.profile_image`
      },
      product: products
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .leftJoin(sql`users as receiver_user`, sql`messages.receiver_id = receiver_user.id`)
    .leftJoin(products, eq(messages.productId, products.id))
    .where(
      or(
        and(
          eq(messages.senderId, userId1),
          eq(messages.receiverId, userId2)
        ),
        and(
          eq(messages.senderId, userId2),
          eq(messages.receiverId, userId1)
        )
      )
    )
    .orderBy(messages.createdAt);
    
    return await this.processJoinedMessageData(conversation);
  }
  
  async getConversationForProduct(userId1: number, userId2: number, productId: number): Promise<MessageWithDetails[]> {
    // Use JOIN queries to fetch all data in a single optimized request
    const conversation = await db.select({
      message: messages,
      sender: users,
      receiver: {
        id: sql<number>`receiver_user.id`,
        username: sql<string>`receiver_user.username`,
        firstName: sql<string>`receiver_user.first_name`,
        lastName: sql<string>`receiver_user.last_name`,
        profileImage: sql<string>`receiver_user.profile_image`
      },
      product: products
    })
    .from(messages)
    .leftJoin(users, eq(messages.senderId, users.id))
    .leftJoin(sql`users as receiver_user`, sql`messages.receiver_id = receiver_user.id`)
    .leftJoin(products, eq(messages.productId, products.id))
    .where(
      and(
        or(
          and(
            eq(messages.senderId, userId1),
            eq(messages.receiverId, userId2)
          ),
          and(
            eq(messages.senderId, userId2),
            eq(messages.receiverId, userId1)
          )
        ),
        eq(messages.productId, productId)
      )
    )
    .orderBy(messages.createdAt);
    
    return await this.processJoinedMessageData(conversation);
  }
  
  async sendMessage(message: InsertMessage): Promise<Message> {
    // Import encryption utility
    const { encryptMessage } = await import('./encryption');
    
    // Encrypt the message content before storing
    const encryptedMessage = {
      ...message,
      content: encryptMessage(message.content)
    };
    
    const [newMessage] = await db.insert(messages).values(encryptedMessage).returning();
    return newMessage;
  }
  
  async markMessageAsRead(id: number): Promise<Message> {
    const [updatedMessage] = await db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id))
      .returning();
    
    if (!updatedMessage) {
      throw new Error("Message not found");
    }
    
    return updatedMessage;
  }
  
  async markAllMessagesAsRead(receiverId: number, senderId: number): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(
          eq(messages.receiverId, receiverId),
          eq(messages.senderId, senderId)
        )
      );
  }
  
  // Payment methods
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const result = await db
      .insert(payments)
      .values({
        ...insertPayment,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()
      .execute();
      
    return result[0];
  }
  
  // Helper method to convert Supabase payment data to interface format
  private convertPaymentToInterface(data: any): Payment {
    // Parse metadata from webhook_payload if it exists
    let parsedMetadata = {};
    try {
      if (data.webhook_payload) {
        parsedMetadata = JSON.parse(data.webhook_payload);
      }
    } catch (e) {
      console.warn('Failed to parse webhook_payload as JSON:', e);
    }
    
    return {
      id: data.id,
      userId: parseInt(data.user_id),
      orderId: data.order_id,
      billId: data.bill_id,
      amount: data.amount,
      status: data.status,
      paymentType: parsedMetadata.payment_type || 'boost',
      boostOptionId: data.boost_option_id,
      productIds: parsedMetadata.product_ids || (data.product_id ? [data.product_id] : []),
      paymentChannel: data.payment_channel,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
      metadata: parsedMetadata
    };
  }

  async getPaymentById(id: number): Promise<Payment | undefined> {
    const result = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .execute();
      
    return result[0];
  }
  
  async getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
    // Use Supabase directly since the schema column names don't match Drizzle
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .single();
      
    if (error) {
      console.error('Error fetching payment by order ID:', error);
      return undefined;
    }
    
    // Convert snake_case to camelCase to match interface
    return data ? this.convertPaymentToInterface(data) : undefined;
  }
  
  async getPaymentByBillId(billId: string): Promise<Payment | undefined> {
    // Use Supabase directly since the schema column names don't match Drizzle
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('bill_id', billId)
      .single();
      
    if (error) {
      console.error('Error fetching payment by bill ID:', error);
      return undefined;
    }
    
    // Convert snake_case to camelCase to match interface
    return data ? this.convertPaymentToInterface(data) : undefined;
  }
  
  async getUserPayments(userId: number): Promise<Payment[]> {
    const result = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .execute();
      
    return result;
  }
  
  async updatePaymentStatus(id: number, status: string, billId?: string, paymentChannel?: string, paidAt?: Date): Promise<Payment> {
    const updateValues: Partial<Payment> = {
      status,
      updatedAt: new Date(),
    };
    
    if (billId) {
      updateValues.billId = billId;
    }
    
    if (paymentChannel) {
      updateValues.paymentChannel = paymentChannel;
    }
    
    if (paidAt) {
      updateValues.paidAt = paidAt;
    }
    
    const result = await db
      .update(payments)
      .set(updateValues)
      .where(eq(payments.id, id))
      .returning()
      .execute();
      
    return result[0];
  }
  
  /**
   * Update payment with product IDs
   * This ensures product IDs are stored in the payment record
   * even if they were only sent via the Billplz reference fields
   */
  async updatePaymentProductIds(id: number, productIds: string[]): Promise<Payment> {
    const updateValues: Partial<Payment> = {
      productIds,
      updatedAt: new Date(),
    };
    
    const result = await db
      .update(payments)
      .set(updateValues)
      .where(eq(payments.id, id))
      .returning()
      .execute();
      
    return result[0];
  }
  
  /**
   * Update a payment record to associate it with a single product
   * Used for creating individual payment records per product
   */
  async updateSingleProductPayment(paymentId: number, productId: number): Promise<void> {
    console.log(`Updating payment ${paymentId} with single product ID ${productId}`);
    
    try {
      const result = await db
        .update(payments)
        .set({ product_id: productId })
        .where(eq(payments.id, paymentId))
        .returning()
        .execute();
        
      if (!result || result.length === 0) {
        throw new Error(`Payment update failed: No result returned`);
      }
      
      console.log(`✅ Successfully updated payment ${paymentId} with product ID ${productId}`);
    } catch (err) {
      console.error(`❌ Failed to update payment ${paymentId} with product ID:`, err);
      throw err;
    }
  }

  /**
   * Create a new payment record for a specific product
   * Used when multiple products share the same bill_id
   */
  async createProductPaymentRecord(params: {
    userId: number;
    billId: string;
    productId: number;
    amount: number;
    status: string;
    paidAt?: Date;
    paymentType: string;
    featureDuration?: number;
  }): Promise<any> {
    console.log(`Creating new payment record for product ID ${params.productId} with bill_id ${params.billId}`);
    
    try {
      const newPayment = {
        user_id: params.userId,
        bill_id: params.billId,
        product_id: params.productId,
        amount: params.amount,
        status: params.status,
        paid_at: params.paidAt,
        payment_type: params.paymentType,
        feature_duration: params.featureDuration,
        created_at: new Date()
      };
      
      const result = await db
        .insert(payments)
        .values(newPayment)
        .returning()
        .execute();
        
      if (!result || result.length === 0) {
        throw new Error(`Payment creation failed: No result returned`);
      }
      
      console.log(`✅ Successfully created payment record for product ID ${params.productId}`);
      return result[0];
    } catch (err) {
      console.error(`❌ Failed to create payment record for product ${params.productId}:`, err);
      throw err;
    }
  }
  
  private async addMessageDetails(messagesList: Message[]): Promise<MessageWithDetails[]> {
    if (messagesList.length === 0) return [];
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Get all unique user IDs and product IDs in batch
    const userIds = new Set<number>();
    const productIds = new Set<number>();
    
    messagesList.forEach(message => {
      if (message.senderId) userIds.add(message.senderId);
      if (message.receiverId) userIds.add(message.receiverId);
      if (message.productId) productIds.add(message.productId);
    });
    
    // Fetch all users in one query
    const usersMap = new Map<number, User>();
    if (userIds.size > 0) {
      const usersResult = await db.select()
        .from(users)
        .where(inArray(users.id, Array.from(userIds)));
      
      usersResult.forEach(user => {
        usersMap.set(user.id, user);
      });
    }
    
    // Fetch all products in one query (basic product info only)
    const productsMap = new Map<number, Product>();
    if (productIds.size > 0) {
      const productsResult = await db.select()
        .from(products)
        .where(inArray(products.id, Array.from(productIds)));
      
      productsResult.forEach(product => {
        productsMap.set(product.id, product);
      });
    }
    
    // Map messages with their details
    return messagesList.map(message => {
      // Decrypt message content if it's encrypted
      let content = message.content;
      if (content && isEncrypted(content)) {
        content = decryptMessage(content);
      }
      
      return {
        ...message,
        content,
        sender: message.senderId ? usersMap.get(message.senderId) : undefined,
        receiver: message.receiverId ? usersMap.get(message.receiverId) : undefined,
        product: message.productId ? productsMap.get(message.productId) : undefined
      };
    });
  }

  // Helper methods
  private async addProductDetails(products: Product[]): Promise<ProductWithDetails[]> {
    return Promise.all(products.map(async (product) => {
      // Get category
      let category: Category | undefined = undefined;
      if (product.categoryId) {
        const [categoryResult] = await db.select()
          .from(categories)
          .where(eq(categories.id, product.categoryId));
        category = categoryResult;
      }
      
      // Get seller
      const [seller] = await db.select()
        .from(users)
        .where(eq(users.id, product.sellerId));
      
      // Get reviews
      const reviewsResult = await db.select()
        .from(reviews)
        .where(eq(reviews.productId, product.id));
      
      // Get product images
      const images = await this.getProductImages(product.id);
      
      // Calculate average rating
      let averageRating: number | undefined = undefined;
      if (reviewsResult.length > 0) {
        const totalRating = reviewsResult.reduce((sum, review) => sum + review.rating, 0);
        averageRating = totalRating / reviewsResult.length;
      }
      
      // Get auction data if product is an auction
      let auction: (Auction & { bidCount?: number }) | undefined = undefined;
      if (product.listingType === 'auction') {
        const [auctionResult] = await db.select()
          .from(auctions)
          .where(eq(auctions.productId, product.id));
        
        if (auctionResult) {
          // Get bid count for this auction
          const bidCountResult = await db.select({ count: sql<number>`count(*)` })
            .from(bids)
            .where(eq(bids.auctionId, auctionResult.id));
          
          auction = {
            ...auctionResult,
            bidCount: Number(bidCountResult[0]?.count || 0)
          };
        }
      }
      
      return {
        ...product,
        category,
        seller,
        reviews: reviewsResult,
        averageRating,
        images,
        auction,
      };
    }));
  }

  // Transaction methods
  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(data).returning();
    return newTransaction;
  }

  async getUserTransactions(userId: number): Promise<TransactionWithDetails[]> {
    const userTransactions = await db.select()
      .from(transactions)
      .where(or(eq(transactions.sellerId, userId), eq(transactions.buyerId, userId)))
      .orderBy(desc(transactions.createdAt));
    
    return this.addTransactionDetails(userTransactions);
  }

  async getProductTransactions(productId: number): Promise<TransactionWithDetails[]> {
    const productTransactions = await db.select()
      .from(transactions)
      .where(eq(transactions.productId, productId))
      .orderBy(desc(transactions.createdAt));
    
    return this.addTransactionDetails(productTransactions);
  }

  async updateTransactionStatus(id: number, status: string): Promise<Transaction> {
    const [updatedTransaction] = await db
      .update(transactions)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(transactions.id, id))
      .returning();
    
    if (!updatedTransaction) {
      throw new Error("Transaction not found");
    }
    
    return updatedTransaction;
  }

  private async addTransactionDetails(transactionsList: Transaction[]): Promise<TransactionWithDetails[]> {
    return Promise.all(transactionsList.map(async (transaction) => {
      // Get product
      const [product] = await db.select()
        .from(products)
        .where(eq(products.id, transaction.productId));
      
      // Get seller
      const [seller] = await db.select()
        .from(users)
        .where(eq(users.id, transaction.sellerId));
      
      // Get buyer
      const [buyer] = await db.select()
        .from(users)
        .where(eq(users.id, transaction.buyerId));
      
      return {
        ...transaction,
        product,
        seller,
        buyer
      };
    }));
  }

  // Auction methods - stub implementations for now since they may be implemented elsewhere
  async getAuctions(): Promise<Auction[]> {
    return db.select().from(auctions);
  }

  async getAuctionById(id: number): Promise<Auction | undefined> {
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, id));
    return auction;
  }

  async getProductAuctions(productId: number): Promise<Auction[]> {
    return db.select().from(auctions).where(eq(auctions.productId, productId));
  }

  async createAuction(auction: InsertAuction): Promise<Auction> {
    const [newAuction] = await db.insert(auctions).values(auction).returning();
    return newAuction;
  }

  async updateAuction(id: number, auction: Partial<InsertAuction>): Promise<Auction> {
    const [updatedAuction] = await db
      .update(auctions)
      .set(auction)
      .where(eq(auctions.id, id))
      .returning();
    
    if (!updatedAuction) {
      throw new Error("Auction not found");
    }
    
    return updatedAuction;
  }

  async deleteAuction(id: number): Promise<void> {
    await db.delete(auctions).where(eq(auctions.id, id));
  }

  // Bid methods - stub implementations for now
  async getBidsForAuction(auctionId: number): Promise<Bid[]> {
    return db.select().from(bids).where(eq(bids.auctionId, auctionId));
  }

  async createBid(bid: InsertBid): Promise<Bid> {
    const [newBid] = await db.insert(bids).values(bid).returning();
    return newBid;
  }

  async updatePreviousBids(auctionId: number, newBidderId: number): Promise<void> {
    await db
      .update(bids)
      .set({ isWinning: false })
      .where(
        and(
          eq(bids.auctionId, auctionId),
          sql`bidder_id != ${newBidderId}`
        )
      );
  }

  // Boost methods
  async getBoostPackageById(id: number): Promise<BoostPackage | null> {
    try {
      const [boostPackage] = await db.select()
        .from(boostPackages)
        .where(eq(boostPackages.id, id));
      
      return boostPackage || null;
    } catch (error) {
      console.error('Error getting boost package:', error);
      return null;
    }
  }

  async createBoostPayment(userId: number, orderId: string, boostPackageId: number, productIds: number[], amount: number): Promise<number> {
    try {
      const [payment] = await db.insert(payments).values({
        userId,
        orderId,
        amount,
        status: 'pending',
        paymentType: 'boost',
        boost_option_id: boostPackageId,
        productIds: productIds.map(id => id.toString())
      }).returning();
      
      return payment.id;
    } catch (error) {
      console.error('Error creating boost payment:', error);
      throw error;
    }
  }

  async getUserProductsForBoosting(userId: number, productIds: number[]): Promise<Product[]> {
    try {
      if (productIds.length === 0) {
        return [];
      }

      const userProducts = await db.select()
        .from(products)
        .where(
          and(
            eq(products.sellerId, userId),
            inArray(products.id, productIds)
          )
        );
      
      return userProducts;
    } catch (error) {
      console.error('Error getting user products for boosting:', error);
      throw error;
    }
  }


  async validateBoostOrder(userId: number, boostPackageId: number, productIds: number[]): Promise<void> {
    try {
      // Check if package exists and is active
      const boostPackage = await this.getBoostPackageById(boostPackageId);
      if (!boostPackage) {
        throw new BoostValidationError(
          BOOST_ERROR_CODES.PACKAGE_NOT_FOUND,
          'Boost package not found or inactive'
        );
      }

      if (!boostPackage.isActive) {
        throw new BoostValidationError(
          BOOST_ERROR_CODES.PACKAGE_NOT_FOUND,
          'Boost package is not active'
        );
      }

      // Validate product count matches package limits
      if (productIds.length !== boostPackage.itemCount) {
        throw new BoostValidationError(
          BOOST_ERROR_CODES.PRODUCT_COUNT_MISMATCH,
          `Expected ${boostPackage.itemCount} products, but received ${productIds.length}`
        );
      }

      // Verify user owns all selected products
      const userProducts = await this.getUserProductsForBoosting(userId, productIds);
      if (userProducts.length !== productIds.length) {
        const ownedProductIds = userProducts.map(p => p.id);
        const notOwnedIds = productIds.filter(id => !ownedProductIds.includes(id));
        throw new BoostValidationError(
          BOOST_ERROR_CODES.INVALID_PRODUCT_OWNERSHIP,
          `User does not own products with IDs: ${notOwnedIds.join(', ')}`
        );
      }

      // Check if any products are already featured
      const featuredProducts = userProducts.filter(product => product.isFeatured);
      if (featuredProducts.length > 0) {
        const featuredIds = featuredProducts.map(p => p.id);
        throw new BoostValidationError(
          BOOST_ERROR_CODES.PRODUCTS_ALREADY_FEATURED,
          `Products with IDs ${featuredIds.join(', ')} are already featured`
        );
      }

    } catch (error) {
      if (error instanceof BoostValidationError) {
        throw error;
      }
      console.error('Error validating boost order:', error);
      throw new Error('Failed to validate boost order');
    }
  }

  async activateBoostForProducts(productIds: number[], durationHours: number): Promise<void> {
    console.log(`🚀 Activating boost for products ${productIds.join(', ')} for ${durationHours} hours`);

    if (productIds.length === 0) {
      console.warn('No product IDs provided for boost activation');
      return;
    }

    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + (durationHours * 60 * 60 * 1000));

    console.log(`Featured period: ${currentTime.toISOString()} to ${expirationTime.toISOString()}`);

    try {
      // NOTE: Bypassing db.transaction due to role permission issues
      // Update products individually without transaction wrapper
      for (const productId of productIds) {
        const [updatedProduct] = await db
          .update(products)
          .set({
            isFeatured: true,
            featuredAt: currentTime,
            featuredUntil: expirationTime,
            featuredDurationHours: durationHours,
            status: 'featured',
            updatedAt: currentTime
          })
          .where(eq(products.id, productId))
          .returning();

        if (!updatedProduct) {
          throw new Error(`Failed to update product ${productId} - product not found`);
        }

        console.log(`✅ Product ${productId} successfully boosted until ${expirationTime.toISOString()}`);
      }

      console.log(`🎉 Successfully activated boost for ${productIds.length} products`);
    } catch (error) {
      console.error('❌ Error activating boost for products:', error);
      throw new Error(`Failed to activate boost for products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Import the SupabaseStorage implementation
import { SupabaseStorage } from "./supabase-storage";

// Use the SupabaseStorage implementation for persistence
export const storage = new SupabaseStorage();
