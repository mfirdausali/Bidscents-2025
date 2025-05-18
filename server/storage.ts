import { users, products, categories, reviews, orders, orderItems, productImages, messages, auctions, bids, payments } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  Review, InsertReview,
  Order, InsertOrder, OrderItem, InsertOrderItem, OrderWithItems,
  ProductImage, InsertProductImage,
  Message, InsertMessage, MessageWithDetails,
  Auction, InsertAuction, AuctionWithDetails,
  Bid, InsertBid, BidWithDetails,
  Payment, InsertPayment
} from "@shared/schema";

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
import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { eq, and, gte, lte, like, ilike, asc, desc, sql, or, isNull } from "drizzle-orm";
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
  getMessage(id: number): Promise<Message | undefined>;
  sendMessage(message: InsertMessage): Promise<Message>;
  markMessageAsRead(id: number): Promise<Message>;
  markAllMessagesAsRead(receiverId: number, senderId: number): Promise<void>;
  getUnreadMessageCount(userId: number): Promise<number>;
  updateMessage(id: number, updates: Partial<Message>): Promise<Message>;
  
  // Payment methods
  createPayment(payment: InsertPayment): Promise<Payment>;
  getPaymentById(id: number): Promise<Payment | undefined>;
  getPaymentByOrderId(orderId: string): Promise<Payment | undefined>;
  getPaymentByBillId(billId: string): Promise<Payment | undefined>;
  getUserPayments(userId: number): Promise<Payment[]>;
  updatePaymentStatus(id: number, status: string, billId?: string, paymentChannel?: string, paidAt?: Date): Promise<Payment>;
  updatePaymentProductIds(id: number, productIds: string[]): Promise<Payment>;
  
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
  private productImages: Map<number, ProductImage>;
  private messages: Map<number, Message>;
  sessionStore: any;
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

  async deleteProductImage(id: number): Promise<void> {
    this.productImages.delete(id);
  }

  // Message methods
  async getMessage(id: number): Promise<Message | undefined> {
    return this.messages.get(id);
  }

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
  
  // Update message with partial data (used for setting isClicked to true for confirmations)
  async updateMessage(id: number, updates: Partial<Message>): Promise<Message> {
    const message = this.messages.get(id);
    
    if (!message) {
      throw new Error("Message not found");
    }
    
    const updatedMessage = { ...message, ...updates };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
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
      
      return {
        ...product,
        category,
        seller,
        reviews,
        averageRating,
        images,
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

  async deleteProductImage(id: number): Promise<void> {
    await db.delete(productImages).where(eq(productImages.id, id));
  }

  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    const userMessages = await db.select()
      .from(messages)
      .where(
        or(
          eq(messages.senderId, userId),
          eq(messages.receiverId, userId)
        )
      )
      .orderBy(messages.createdAt);
    
    return this.addMessageDetails(userMessages);
  }
  
  async getConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    const conversation = await db.select()
      .from(messages)
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
    
    return this.addMessageDetails(conversation);
  }
  
  async getConversationForProduct(userId1: number, userId2: number, productId: number): Promise<MessageWithDetails[]> {
    const conversation = await db.select()
      .from(messages)
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
    
    return this.addMessageDetails(conversation);
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
  
  async getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
    const result = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .execute();
      
    return result[0];
  }
  
  async getPaymentByBillId(billId: string): Promise<Payment | undefined> {
    const result = await db
      .select()
      .from(payments)
      .where(eq(payments.billId, billId))
      .execute();
      
    return result[0];
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
  
  private async addMessageDetails(messagesList: Message[]): Promise<MessageWithDetails[]> {
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    return Promise.all(
      messagesList.map(async (message) => {
        // Get sender
        const [sender] = message.senderId ? 
          await db.select().from(users).where(eq(users.id, message.senderId)) : 
          [];
        
        // Get receiver
        const [receiver] = message.receiverId ? 
          await db.select().from(users).where(eq(users.id, message.receiverId)) : 
          [];
        
        // Get product if applicable
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
          content, // Replace with decrypted content
          sender,
          receiver,
          product
        };
      })
    );
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
      
      return {
        ...product,
        category,
        seller,
        reviews: reviewsResult,
        averageRating,
        images,
      };
    }));
  }
}

// Import the SupabaseStorage implementation
import { SupabaseStorage } from "./supabase-storage";

// Use the SupabaseStorage implementation for persistence
export const storage = new SupabaseStorage();
