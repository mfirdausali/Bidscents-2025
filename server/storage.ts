import { 
  users, products, categories, cartItems, reviews, orders, orderItems,
  bookmarks, bids, messages, notifications 
} from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  CartItem, InsertCartItem, CartItemWithProduct,
  Review, InsertReview,
  Order, InsertOrder, OrderItem, InsertOrderItem, OrderWithItems,
  Bookmark, InsertBookmark, BookmarkWithProduct,
  Bid, InsertBid, BidWithProduct,
  Message, InsertMessage, MessageWithDetails,
  Notification, InsertNotification
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { eq, and, or, desc, asc, gte, lte, ilike, like, sql, isNull } from "drizzle-orm";
import pkg from "pg";
const { Pool } = pkg;

const MemoryStore = createMemoryStore(session);
const PgSessionStore = connectPg(session);
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

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  
  // Bookmark methods
  getUserBookmarks(userId: number): Promise<BookmarkWithProduct[]>;
  getBookmarkById(id: number): Promise<Bookmark | undefined>;
  getBookmarkByProductId(userId: number, productId: number): Promise<Bookmark | undefined>;
  addBookmark(bookmark: InsertBookmark): Promise<Bookmark>;
  removeBookmark(id: number): Promise<void>;
  
  // Bid methods
  getUserBids(userId: number, status?: string): Promise<BidWithProduct[]>;
  getBidById(id: number): Promise<Bid | undefined>;
  createBid(bid: InsertBid): Promise<Bid>;
  updateBidStatus(id: number, status: string): Promise<Bid>;
  getProductBids(productId: number): Promise<BidWithProduct[]>;
  
  // Message methods
  getUserMessages(userId: number): Promise<MessageWithDetails[]>;
  getMessagesByConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<Message>;
  
  // Notification methods
  getUserNotifications(userId: number): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<Notification>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  
  // Session storage
  sessionStore: any;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private categories: Map<number, Category>;
  private products: Map<number, Product>;
  private cartItems: Map<number, CartItem>;
  private reviews: Map<number, Review>;
  private orders: Map<number, Order>;
  private orderItems: Map<number, OrderItem>;
  private bookmarks: Map<number, Bookmark>;
  private bids: Map<number, Bid>;
  private messages: Map<number, Message>;
  private notifications: Map<number, Notification>;
  sessionStore: any;
  currentIds: {
    users: number;
    categories: number;
    products: number;
    cartItems: number;
    reviews: number;
    orders: number;
    orderItems: number;
    bookmarks: number;
    bids: number;
    messages: number;
    notifications: number;
  };

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.products = new Map();
    this.cartItems = new Map();
    this.reviews = new Map();
    this.orders = new Map();
    this.orderItems = new Map();
    this.bookmarks = new Map();
    this.bids = new Map();
    this.messages = new Map();
    this.notifications = new Map();
    this.currentIds = {
      users: 1,
      categories: 1,
      products: 1,
      cartItems: 1,
      reviews: 1,
      orders: 1,
      orderItems: 1,
      bookmarks: 1,
      bids: 1,
      messages: 1,
      notifications: 1
    };
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 1 day
    });
    
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
    this.products.delete(id);
    
    // Delete associated cart items and reviews
    for (const [cartItemId, cartItem] of this.cartItems.entries()) {
      if (cartItem.productId === id) {
        this.cartItems.delete(cartItemId);
      }
    }
    
    for (const [reviewId, review] of this.reviews.entries()) {
      if (review.productId === id) {
        this.reviews.delete(reviewId);
      }
    }
  }

  // Cart methods
  async getCartItems(userId: number): Promise<CartItemWithProduct[]> {
    const items = Array.from(this.cartItems.values()).filter(item => item.userId === userId);
    
    return Promise.all(items.map(async item => {
      const product = this.products.get(item.productId);
      if (!product) {
        throw new Error(`Product not found for cart item: ${item.id}`);
      }
      
      return {
        ...item,
        product,
      };
    }));
  }

  async getCartItemById(id: number): Promise<CartItem | undefined> {
    return this.cartItems.get(id);
  }

  async getCartItemByProductId(userId: number, productId: number): Promise<CartItem | undefined> {
    return Array.from(this.cartItems.values()).find(
      item => item.userId === userId && item.productId === productId
    );
  }

  async addToCart(insertCartItem: InsertCartItem): Promise<CartItem> {
    const id = this.currentIds.cartItems++;
    const cartItem: CartItem = { ...insertCartItem, id };
    this.cartItems.set(id, cartItem);
    return cartItem;
  }

  async updateCartItem(id: number, quantity: number): Promise<CartItem> {
    const cartItem = this.cartItems.get(id);
    if (!cartItem) {
      throw new Error("Cart item not found");
    }
    
    const updatedItem: CartItem = { ...cartItem, quantity };
    this.cartItems.set(id, updatedItem);
    return updatedItem;
  }

  async removeFromCart(id: number): Promise<void> {
    this.cartItems.delete(id);
  }
  
  async clearCart(userId: number): Promise<void> {
    // Find all cart items for this user and remove them
    for (const [cartItemId, cartItem] of this.cartItems.entries()) {
      if (cartItem.userId === userId) {
        this.cartItems.delete(cartItemId);
      }
    }
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

  // Bookmark methods
  async getUserBookmarks(userId: number): Promise<BookmarkWithProduct[]> {
    const bookmarks = Array.from(this.bookmarks.values()).filter(
      bookmark => bookmark.userId === userId
    );
    
    return Promise.all(bookmarks.map(async bookmark => {
      const product = await this.getProductById(bookmark.productId);
      if (!product) {
        throw new Error(`Product not found for bookmark: ${bookmark.id}`);
      }
      
      return {
        ...bookmark,
        product,
      };
    }));
  }
  
  async getBookmarkById(id: number): Promise<Bookmark | undefined> {
    return this.bookmarks.get(id);
  }
  
  async getBookmarkByProductId(userId: number, productId: number): Promise<Bookmark | undefined> {
    return Array.from(this.bookmarks.values()).find(
      bookmark => bookmark.userId === userId && bookmark.productId === productId
    );
  }
  
  async addBookmark(insertBookmark: InsertBookmark): Promise<Bookmark> {
    const id = this.currentIds.bookmarks++;
    const bookmark: Bookmark = { ...insertBookmark, id };
    this.bookmarks.set(id, bookmark);
    return bookmark;
  }
  
  async removeBookmark(id: number): Promise<void> {
    this.bookmarks.delete(id);
  }
  
  // Bid methods
  async getUserBids(userId: number, status?: string): Promise<BidWithProduct[]> {
    let bids = Array.from(this.bids.values()).filter(
      bid => bid.userId === userId
    );
    
    if (status) {
      bids = bids.filter(bid => bid.status === status);
    }
    
    return Promise.all(bids.map(async bid => {
      const product = await this.getProductById(bid.productId);
      if (!product) {
        throw new Error(`Product not found for bid: ${bid.id}`);
      }
      
      return {
        ...bid,
        product,
      };
    }));
  }
  
  async getBidById(id: number): Promise<Bid | undefined> {
    return this.bids.get(id);
  }
  
  async createBid(insertBid: InsertBid): Promise<Bid> {
    const id = this.currentIds.bids++;
    const createdAt = new Date();
    const bid: Bid = { ...insertBid, id, createdAt };
    this.bids.set(id, bid);
    return bid;
  }
  
  async updateBidStatus(id: number, status: string): Promise<Bid> {
    const bid = this.bids.get(id);
    if (!bid) {
      throw new Error("Bid not found");
    }
    
    const updatedBid: Bid = { ...bid, status };
    this.bids.set(id, updatedBid);
    return updatedBid;
  }
  
  async getProductBids(productId: number): Promise<BidWithProduct[]> {
    const bids = Array.from(this.bids.values()).filter(
      bid => bid.productId === productId
    );
    
    return Promise.all(bids.map(async bid => {
      const product = await this.getProductById(bid.productId);
      if (!product) {
        throw new Error(`Product not found for bid: ${bid.id}`);
      }
      
      return {
        ...bid,
        product,
      };
    }));
  }
  
  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    const messages = Array.from(this.messages.values()).filter(
      message => message.senderId === userId || message.receiverId === userId
    );
    
    return Promise.all(messages.map(async message => {
      const sender = await this.getUser(message.senderId);
      const receiver = await this.getUser(message.receiverId);
      
      if (!sender || !receiver) {
        throw new Error(`Sender or receiver not found for message: ${message.id}`);
      }
      
      let product: ProductWithDetails | undefined = undefined;
      if (message.productId) {
        product = await this.getProductById(message.productId);
      }
      
      return {
        ...message,
        sender,
        receiver,
        product,
      };
    }));
  }
  
  async getMessagesByConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    const messages = Array.from(this.messages.values()).filter(
      message => 
        (message.senderId === userId1 && message.receiverId === userId2) ||
        (message.senderId === userId2 && message.receiverId === userId1)
    );
    
    return Promise.all(messages.map(async message => {
      const sender = await this.getUser(message.senderId);
      const receiver = await this.getUser(message.receiverId);
      
      if (!sender || !receiver) {
        throw new Error(`Sender or receiver not found for message: ${message.id}`);
      }
      
      let product: ProductWithDetails | undefined = undefined;
      if (message.productId) {
        product = await this.getProductById(message.productId);
      }
      
      return {
        ...message,
        sender,
        receiver,
        product,
      };
    }));
  }
  
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentIds.messages++;
    const createdAt = new Date();
    const message: Message = { ...insertMessage, id, createdAt };
    this.messages.set(id, message);
    return message;
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
  
  // Notification methods
  async getUserNotifications(userId: number): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(
      notification => notification.userId === userId
    );
  }
  
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = this.currentIds.notifications++;
    const createdAt = new Date();
    const notification: Notification = { ...insertNotification, id, createdAt };
    this.notifications.set(id, notification);
    return notification;
  }
  
  async markNotificationAsRead(id: number): Promise<Notification> {
    const notification = this.notifications.get(id);
    if (!notification) {
      throw new Error("Notification not found");
    }
    
    const updatedNotification: Notification = { ...notification, isRead: true };
    this.notifications.set(id, updatedNotification);
    return updatedNotification;
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<void> {
    const userNotifications = Array.from(this.notifications.entries())
      .filter(([_, notification]) => notification.userId === userId);
    
    for (const [id, notification] of userNotifications) {
      this.notifications.set(id, { ...notification, isRead: true });
    }
  }
  
  // Helper methods
  private async addProductDetails(products: Product[]): Promise<ProductWithDetails[]> {
    return Promise.all(products.map(async product => {
      const category = product.categoryId ? await this.getCategoryById(product.categoryId) : undefined;
      const seller = await this.getUser(product.sellerId);
      const reviews = await this.getProductReviews(product.id);
      
      // Calculate average rating
      let averageRating: number | undefined = undefined;
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = totalRating / reviews.length;
      }
      
      return {
        ...product,
        category,
        seller,
        reviews,
        averageRating,
      };
    }));
  }
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PgSessionStore({
      pool,
      createTableIfMissing: true
    });
    this.initializeDefaultData();
  }
  
  // Bookmark methods
  async getUserBookmarks(userId: number): Promise<BookmarkWithProduct[]> {
    const result = await db.query.bookmarks.findMany({
      where: eq(bookmarks.userId, userId),
      with: {
        product: true
      }
    });
    
    // Add additional product details like seller and category
    const bookmarksWithDetails: BookmarkWithProduct[] = [];
    for (const bookmark of result) {
      const productWithDetails = await this.getProductById(bookmark.product.id);
      if (productWithDetails) {
        bookmarksWithDetails.push({
          ...bookmark,
          product: productWithDetails
        });
      }
    }
    
    return bookmarksWithDetails;
  }
  
  async getBookmarkById(id: number): Promise<Bookmark | undefined> {
    return db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, id)
    });
  }
  
  async getBookmarkByProductId(userId: number, productId: number): Promise<Bookmark | undefined> {
    return db.query.bookmarks.findFirst({
      where: and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.productId, productId)
      )
    });
  }
  
  async addBookmark(bookmark: InsertBookmark): Promise<Bookmark> {
    const [result] = await db.insert(bookmarks).values(bookmark).returning();
    return result;
  }
  
  async removeBookmark(id: number): Promise<void> {
    await db.delete(bookmarks).where(eq(bookmarks.id, id));
  }
  
  // Bid methods
  async getUserBids(userId: number, status?: string): Promise<BidWithProduct[]> {
    let query = db.query.bids.findMany({
      where: eq(bids.userId, userId),
      with: {
        product: true
      }
    });
    
    if (status) {
      query = db.query.bids.findMany({
        where: and(
          eq(bids.userId, userId),
          eq(bids.status, status)
        ),
        with: {
          product: true
        }
      });
    }
    
    const result = await query;
    
    // Add additional product details like seller and category
    const bidsWithDetails: BidWithProduct[] = [];
    for (const bid of result) {
      const productWithDetails = await this.getProductById(bid.product.id);
      if (productWithDetails) {
        bidsWithDetails.push({
          ...bid,
          product: productWithDetails
        });
      }
    }
    
    return bidsWithDetails;
  }
  
  async getBidById(id: number): Promise<Bid | undefined> {
    return db.query.bids.findFirst({
      where: eq(bids.id, id)
    });
  }
  
  async createBid(bid: InsertBid): Promise<Bid> {
    const [result] = await db.insert(bids).values({
      ...bid,
      status: bid.status || "pending", // Ensure status has a default
      createdAt: new Date()
    }).returning();
    return result;
  }
  
  async updateBidStatus(id: number, status: string): Promise<Bid> {
    const [result] = await db.update(bids)
      .set({ status })
      .where(eq(bids.id, id))
      .returning();
    return result;
  }
  
  async getProductBids(productId: number): Promise<BidWithProduct[]> {
    const product = await this.getProductById(productId);
    if (!product) return [];
    
    const result = await db.query.bids.findMany({
      where: eq(bids.productId, productId),
      with: {
        product: true
      }
    });
    
    return result.map(bid => ({
      ...bid,
      product
    }));
  }
  
  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    const result = await db.query.messages.findMany({
      where: or(
        eq(messages.senderId, userId),
        eq(messages.receiverId, userId)
      ),
      orderBy: desc(messages.createdAt)
    });
    
    const messagesWithDetails: MessageWithDetails[] = [];
    for (const message of result) {
      const sender = await this.getUser(message.senderId);
      const receiver = await this.getUser(message.receiverId);
      let product = undefined;
      
      if (message.productId) {
        product = await this.getProductById(message.productId);
      }
      
      if (sender && receiver) {
        messagesWithDetails.push({
          ...message,
          sender,
          receiver,
          product
        });
      }
    }
    
    return messagesWithDetails;
  }
  
  async getMessagesByConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    const result = await db.query.messages.findMany({
      where: or(
        and(
          eq(messages.senderId, userId1),
          eq(messages.receiverId, userId2)
        ),
        and(
          eq(messages.senderId, userId2),
          eq(messages.receiverId, userId1)
        )
      ),
      orderBy: asc(messages.createdAt)
    });
    
    const messagesWithDetails: MessageWithDetails[] = [];
    for (const message of result) {
      const sender = await this.getUser(message.senderId);
      const receiver = await this.getUser(message.receiverId);
      let product = undefined;
      
      if (message.productId) {
        product = await this.getProductById(message.productId);
      }
      
      if (sender && receiver) {
        messagesWithDetails.push({
          ...message,
          sender,
          receiver,
          product
        });
      }
    }
    
    return messagesWithDetails;
  }
  
  async createMessage(message: InsertMessage): Promise<Message> {
    const [result] = await db.insert(messages).values({
      ...message,
      isRead: false,
      createdAt: new Date()
    }).returning();
    return result;
  }
  
  async markMessageAsRead(id: number): Promise<Message> {
    const [result] = await db.update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id))
      .returning();
    return result;
  }
  
  // Notification methods
  async getUserNotifications(userId: number): Promise<Notification[]> {
    const result = await db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: desc(notifications.createdAt)
    });
    return result;
  }
  
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [result] = await db.insert(notifications).values({
      ...notification,
      isRead: false,
      createdAt: new Date()
    }).returning();
    return result;
  }
  
  async markNotificationAsRead(id: number): Promise<Notification> {
    const [result] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return result;
  }
  
  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
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
    // First delete associated cart items and reviews
    await db.delete(cartItems).where(eq(cartItems.productId, id));
    await db.delete(reviews).where(eq(reviews.productId, id));
    
    // Then delete the product
    await db.delete(products).where(eq(products.id, id));
  }

  // Cart methods
  async getCartItems(userId: number): Promise<CartItemWithProduct[]> {
    const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
    
    return Promise.all(items.map(async (item) => {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId));
      
      if (!product) {
        throw new Error(`Product not found for cart item: ${item.id}`);
      }
      
      return {
        ...item,
        product,
      };
    }));
  }

  async getCartItemById(id: number): Promise<CartItem | undefined> {
    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, id));
    return item;
  }

  async getCartItemByProductId(userId: number, productId: number): Promise<CartItem | undefined> {
    const [item] = await db.select()
      .from(cartItems)
      .where(and(
        eq(cartItems.userId, userId),
        eq(cartItems.productId, productId)
      ));
    
    return item;
  }

  async addToCart(cartItem: InsertCartItem): Promise<CartItem> {
    const [newItem] = await db.insert(cartItems).values(cartItem).returning();
    return newItem;
  }

  async updateCartItem(id: number, quantity: number): Promise<CartItem> {
    const [updatedItem] = await db
      .update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, id))
      .returning();
    
    if (!updatedItem) {
      throw new Error("Cart item not found");
    }
    
    return updatedItem;
  }

  async removeFromCart(id: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }
  
  async clearCart(userId: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
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
      
      // Calculate average rating
      let averageRating: number | undefined = undefined;
      if (reviewsResult.length > 0) {
        const totalRating = reviewsResult.reduce((sum, review) => sum + review.rating, 0);
        averageRating = totalRating / reviewsResult.length;
      }
      
      return {
        ...product,
        category,
        seller,
        reviews: reviewsResult,
        averageRating,
      };
    }));
  }
}

// Use the DatabaseStorage implementation for persistence
export const storage = new DatabaseStorage();
