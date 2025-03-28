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

const MemoryStore = createMemoryStore(session);

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
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private categories: Map<number, Category>;
  private products: Map<number, Product>;
  private cartItems: Map<number, CartItem>;
  private reviews: Map<number, Review>;
  sessionStore: session.SessionStore;
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

export const storage = new MemStorage();
