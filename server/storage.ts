import { users, products, categories, cartItems, reviews } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  CartItem, InsertCartItem, CartItemWithProduct,
  Review, InsertReview
} from "@shared/schema";
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
  
  // Review methods
  getProductReviews(productId: number): Promise<Review[]>;
  getUserProductReview(userId: number, productId: number): Promise<Review | undefined>;
  createReview(review: InsertReview): Promise<Review>;
  
  // Session storage
  sessionStore: any;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private categories: Map<number, Category>;
  private products: Map<number, Product>;
  private cartItems: Map<number, CartItem>;
  private reviews: Map<number, Review>;
  sessionStore: any;
  currentIds: {
    users: number;
    categories: number;
    products: number;
    cartItems: number;
    reviews: number;
  };

  constructor() {
    this.users = new Map();
    this.categories = new Map();
    this.products = new Map();
    this.cartItems = new Map();
    this.reviews = new Map();
    this.currentIds = {
      users: 1,
      categories: 1,
      products: 1,
      cartItems: 1,
      reviews: 1,
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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
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
