import { users, products, categories, reviews, orders, orderItems, productImages, messages, auctions, bids, payments, transactions, boostPackages } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  BoostPackage, InsertBoostPackage,
  Review, InsertReview,
  Order, InsertOrder, OrderItem, InsertOrderItem, OrderWithItems,
  ProductImage, InsertProductImage,
  Message, InsertMessage, MessageWithDetails,
  Auction, InsertAuction,
  Bid, InsertBid,
  Payment, InsertPayment,
  Transaction, InsertTransaction, TransactionWithDetails
} from "@shared/schema";

// Define cart types since they're removed from schema but still in interface
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
import { IStorage } from "./storage";
import { supabase } from "./supabase";
// Removed session dependency - using Supabase as sole IdP
// Removed all session dependencies - using Supabase as sole IdP

type ProductFilter = {
  categoryId?: number;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
};

/**
 * Implements the IStorage interface using Supabase for database operations
 * while keeping Replit Object Storage for file storage
 */
export class SupabaseStorage implements IStorage {
  // Removed session store - using Supabase authentication

  constructor() {
    // Using Supabase as sole authentication provider
    console.log('SupabaseStorage initialized with Supabase authentication');
  }
  
  // Helper method to map DB user to our User type without password
  private mapUserFromDb(data: any): User {
    return {
      id: data.id,
      username: data.username,
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      address: data.address,
      profileImage: data.profile_image,
      avatarUrl: data.avatar_url,
      coverPhoto: data.cover_photo,
      walletBalance: data.wallet_balance,
      isSeller: data.is_seller,
      isAdmin: data.is_admin,
      isBanned: data.is_banned,
      isVerified: data.is_verified,
      shopName: data.shop_name,
      location: data.location,
      bio: data.bio,
      providerId: data.provider_id,
      provider: data.provider
    } as User;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.error('Error getting user:', error);
      return undefined;
    }
    
    // Use helper method to map user without password
    return this.mapUserFromDb(data);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !data) {
      if (!error?.message.includes('No rows found')) {
        console.error('Error getting user by username:', error);
      }
      return undefined;
    }
    
    // Use helper method to map user without password
    return this.mapUserFromDb(data);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      if (!error?.message.includes('No rows found')) {
        console.error('Error getting user by email:', error);
      }
      return undefined;
    }
    
    // Use helper method to map user without password
    return this.mapUserFromDb(data);
  }

  async getUserByProviderId(providerId: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('provider_id', providerId)
      .single();
    
    if (error || !data) {
      if (!error?.message.includes('No rows found')) {
        console.error('Error getting user by provider ID:', error);
      }
      return undefined;
    }
    
    return this.mapUserFromDb(data);
  }

  async updateUserProviderId(userId: number, providerId: string, provider: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        provider_id: providerId,
        provider: provider
      })
      .eq('id', userId)
      .select('*')
      .single();
    
    if (error || !data) {
      console.error('Error updating user provider ID:', error);
      throw new Error('Failed to update user provider ID');
    }
    
    return this.mapUserFromDb(data);
  }

  async createUser(user: InsertUser): Promise<User> {
    // Convert camelCase to snake_case for DB
    const dbUser = {
      username: user.username,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      address: user.address,
      profile_image: user.profileImage,
      avatar_url: user.avatarUrl,
      cover_photo: user.coverPhoto,
      // Always provide a default value for wallet_balance if not specified
      wallet_balance: user.walletBalance !== undefined ? user.walletBalance : 0,
      is_seller: user.isSeller !== undefined ? user.isSeller : true,
      is_admin: user.isAdmin !== undefined ? user.isAdmin : false,
      is_banned: user.isBanned !== undefined ? user.isBanned : false,
      is_verified: user.isVerified !== undefined ? user.isVerified : false,
      shop_name: user.shopName,
      location: user.location,
      bio: user.bio
    };
    
    // Create a new user
    const { data, error } = await supabase
      .from('users')
      .insert([dbUser])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error?.message}`);
    }
    
    // Use helper method to map user without password
    return this.mapUserFromDb(data);
  }

  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    // Convert camelCase to snake_case for DB
    const dbUserData: any = {};
    
    if (userData.username !== undefined) dbUserData.username = userData.username;
    // Remove password field - passwords are now managed by Supabase Auth
    if (userData.email !== undefined) dbUserData.email = userData.email;
    if (userData.firstName !== undefined) dbUserData.first_name = userData.firstName;
    if (userData.lastName !== undefined) dbUserData.last_name = userData.lastName;
    if (userData.address !== undefined) dbUserData.address = userData.address;
    if (userData.profileImage !== undefined) dbUserData.profile_image = userData.profileImage;
    if (userData.avatarUrl !== undefined) dbUserData.avatar_url = userData.avatarUrl;
    if (userData.coverPhoto !== undefined) dbUserData.cover_photo = userData.coverPhoto;
    if (userData.walletBalance !== undefined) dbUserData.wallet_balance = userData.walletBalance;
    if (userData.isSeller !== undefined) dbUserData.is_seller = userData.isSeller;
    if (userData.isAdmin !== undefined) dbUserData.is_admin = userData.isAdmin;
    if (userData.isBanned !== undefined) dbUserData.is_banned = userData.isBanned;
    if (userData.isVerified !== undefined) dbUserData.is_verified = userData.isVerified;
    if (userData.shopName !== undefined) dbUserData.shop_name = userData.shopName;
    if (userData.location !== undefined) dbUserData.location = userData.location;
    if (userData.bio !== undefined) dbUserData.bio = userData.bio;
    
    // Add missing fields that auth.ts is trying to update
    if (userData.providerId !== undefined) dbUserData.provider_id = userData.providerId;
    if (userData.provider !== undefined) dbUserData.provider = userData.provider;
    if (userData.lastLoginAt !== undefined) dbUserData.last_login_at = userData.lastLoginAt;
    if (userData.lastLoginIp !== undefined) dbUserData.last_login_ip = userData.lastLoginIp;
    if (userData.failedLoginAttempts !== undefined) dbUserData.failed_login_attempts = userData.failedLoginAttempts;
    
    console.log(`🔧 Updating user ${id} with fields:`, Object.keys(dbUserData));
    
    // Skip empty updates
    if (Object.keys(dbUserData).length === 0) {
      console.log(`✅ No fields to update for user ${id}`);
      // Return the existing user
      return await this.getUser(id);
    }
    
    const { data, error } = await supabase
      .from('users')
      .update(dbUserData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      // Check if it's a "no rows" error
      if (error.code === 'PGRST116') {
        console.error(`❌ User ID ${id} not found in database`);
        throw new Error(`User with ID ${id} not found`);
      }
      console.error('❌ Error updating user:', error);
      console.error(`❌ Attempted to update user ID ${id} with:`, dbUserData);
      throw new Error(`Failed to update user: ${error?.message}`);
    }
    
    if (!data) {
      console.error(`❌ No data returned after updating user ${id}`);
      throw new Error('Failed to update user: No data returned');
    }
    
    console.log(`✅ Successfully updated user ${id}`);
    
    // Use helper method to map user without password
    return this.mapUserFromDb(data);
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      console.error('Error getting all users:', error);
      return [];
    }
    
    // Use helper method to map each user without password
    const mappedUsers = (data || []).map(user => this.mapUserFromDb(user));
    
    return mappedUsers as User[];
  }

  async banUser(id: number, isBanned: boolean): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ is_banned: isBanned })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error banning/unbanning user:', error);
      throw new Error(`Failed to update user ban status: ${error?.message}`);
    }
    
    // Use helper method to map user without password
    return this.mapUserFromDb(data);
  }

  // Category methods
  async getAllCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from('categories')
      .select('*');
    
    if (error) {
      console.error('Error getting all categories:', error);
      return [];
    }
    
    // Map snake_case to camelCase
    const mappedCategories = (data || []).map(category => ({
      id: category.id,
      name: category.name,
      description: category.description
    }));
    
    return mappedCategories as Category[];
  }

  async getCategoryById(id: number): Promise<Category | undefined> {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.error('Error getting category:', error);
      return undefined;
    }
    
    // Map snake_case to camelCase
    const mappedCategory = {
      id: data.id,
      name: data.name,
      description: data.description
    };
    
    return mappedCategory as Category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    // Convert to snake_case for DB if needed
    const dbCategory = {
      name: category.name,
      description: category.description
    };
    
    const { data, error } = await supabase
      .from('categories')
      .insert([dbCategory])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating category:', error);
      throw new Error(`Failed to create category: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const mappedCategory = {
      id: data.id,
      name: data.name,
      description: data.description
    };
    
    return mappedCategory as Category;
  }

  // Product methods
  async getProducts(filters?: ProductFilter): Promise<ProductWithDetails[]> {
    // Start with a base query
    let query = supabase.from('products').select('*');
    
    // Filter for active, featured, and pending products (pending needed for auctions)
    query = query.or('status.eq.active,status.eq.featured,status.eq.pending');
    
    // Apply filters if provided
    if (filters) {
      if (filters.categoryId) {
        query = query.eq('category_id', filters.categoryId);
      }
      
      if (filters.brand) {
        query = query.eq('brand', filters.brand);
      }
      
      if (filters.minPrice !== undefined) {
        query = query.gte('price', filters.minPrice);
      }
      
      if (filters.maxPrice !== undefined) {
        query = query.lte('price', filters.maxPrice);
      }
      
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%, description.ilike.%${filters.search}%, brand.ilike.%${filters.search}%`);
      }
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error getting products:', error);
      return [];
    }
    
    // Convert snake_case to camelCase
    const mappedProducts = (data || []).map(product => this.mapSnakeToCamelCase(product));
    
    // Add product details (category, seller, reviews, etc.)
    return this.addProductDetails(mappedProducts as Product[]);
  }

  async getProductById(id: number): Promise<ProductWithDetails | undefined> {
    console.log(`Looking up product with ID: ${id}`);
    
    // Debug - directly query database to see if product exists
    try {
      const { count, error: countError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('id', id);
        
      console.log(`Product ID ${id} existence check: ${count} products found`);
      
      if (countError) {
        console.error(`Error checking if product ${id} exists:`, countError);
      }
    } catch (err) {
      console.error(`Error in count query for product ${id}:`, err);
    }
    
    // Main product query
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error(`Error getting product ${id}:`, error);
      
      // Special handling for "No rows found" error - this is common
      if (error.message.includes('No rows found')) {
        console.log(`Product ${id} not found in database`);
      }
      
      return undefined;
    }
    
    if (!data) {
      console.error(`No data returned for product ${id} but no error was thrown`);
      return undefined;
    }
    
    console.log(`Found product ${id}: ${data.name}`);
    
    // Convert snake_case to camelCase
    const mappedProduct = this.mapSnakeToCamelCase(data);
    
    // Add product details
    const productsWithDetails = await this.addProductDetails([mappedProduct]);
    return productsWithDetails[0];
  }

  async getFeaturedProducts(): Promise<ProductWithDetails[]> {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_featured', true)
      .or(`featured_until.is.null,featured_until.gt.${now}`) // Include products with NULL featured_until OR not yet expired
      .order('featured_at', { ascending: false });
    
    if (error) {
      console.error('Error getting featured products:', error);
      return [];
    }
    
    console.log(`📋 getFeaturedProducts: Found ${data?.length || 0} active featured products`);
    
    // Map from snake_case to camelCase for our application logic
    const mappedProducts = (data || []).map(product => this.mapSnakeToCamelCase(product));
    
    return this.addProductDetails(mappedProducts as Product[]);
  }
  
  // Helper method to convert snake_case to camelCase for product objects
  private mapSnakeToCamelCase(product: any): Product {
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      description: product.description,
      price: product.price,
      imageUrl: product.image_url,
      stockQuantity: product.stock_quantity,
      categoryId: product.category_id,
      sellerId: product.seller_id,
      isNew: product.is_new,
      isFeatured: product.is_featured,
      featuredUntil: product.featured_until,
      createdAt: product.created_at,
      remainingPercentage: product.remaining_percentage,
      batchCode: product.batch_code,
      purchaseYear: product.purchase_year,
      boxCondition: product.box_condition,
      listingType: product.listing_type,
      volume: product.volume,
      status: product.status // Add the status field
    };
  }

  async getSellerProducts(sellerId: number): Promise<ProductWithDetails[]> {
    console.log(`Fetching products for seller ID: ${sellerId}`);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('seller_id', sellerId);
    
    if (error) {
      console.error('Error getting seller products:', error);
      return [];
    }
    
    console.log(`Fetched ${data?.length || 0} products for seller, with statuses:`, 
      data?.map(p => p.status).filter((v, i, a) => a.indexOf(v) === i));
    
    // Convert snake_case to camelCase
    const mappedProducts = (data || []).map(product => this.mapSnakeToCamelCase(product));
    
    return this.addProductDetails(mappedProducts as Product[]);
  }
  
  async getAllProductsWithDetails(): Promise<ProductWithDetails[]> {
    // Get all products from the database with no filters
    const { data, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      console.error('Error getting all products for admin:', error);
      return [];
    }
    
    // Map from snake_case to camelCase for our application logic
    const mappedProducts = (data || []).map(product => this.mapSnakeToCamelCase(product));
    
    // Add seller, category, and other details to each product
    return this.addProductDetails(mappedProducts as Product[]);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    // Convert camelCase to snake_case for DB
    const dbProduct = {
      name: product.name,
      brand: product.brand,
      description: product.description,
      price: product.price,
      image_url: product.imageUrl,
      stock_quantity: product.stockQuantity,
      category_id: product.categoryId,
      seller_id: product.sellerId,
      is_new: product.isNew,
      is_featured: product.isFeatured,
      featured_until: product.featuredUntil,
      remaining_percentage: product.remainingPercentage,
      batch_code: product.batchCode,
      purchase_year: product.purchaseYear,
      box_condition: product.boxCondition,
      listing_type: product.listingType,
      volume: product.volume
    };
    
    const { data, error } = await supabase
      .from('products')
      .insert([dbProduct])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating product:', error);
      throw new Error(`Failed to create product: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const mappedProduct = this.mapSnakeToCamelCase(data);
    
    return mappedProduct as Product;
  }

  async updateProduct(id: number, product: InsertProduct): Promise<Product> {
    // Convert camelCase to snake_case for DB
    const dbProduct: any = {};
    
    if (product.name !== undefined) dbProduct.name = product.name;
    if (product.brand !== undefined) dbProduct.brand = product.brand;
    if (product.description !== undefined) dbProduct.description = product.description;
    if (product.price !== undefined) dbProduct.price = product.price;
    if (product.imageUrl !== undefined) dbProduct.image_url = product.imageUrl;
    if (product.stockQuantity !== undefined) dbProduct.stock_quantity = product.stockQuantity;
    if (product.categoryId !== undefined) dbProduct.category_id = product.categoryId;
    if (product.sellerId !== undefined) dbProduct.seller_id = product.sellerId;
    if (product.isNew !== undefined) dbProduct.is_new = product.isNew;
    if (product.isFeatured !== undefined) dbProduct.is_featured = product.isFeatured;
    if (product.featuredUntil !== undefined) dbProduct.featured_until = product.featuredUntil;
    if (product.remainingPercentage !== undefined) dbProduct.remaining_percentage = product.remainingPercentage;
    if (product.batchCode !== undefined) dbProduct.batch_code = product.batchCode;
    if (product.purchaseYear !== undefined) dbProduct.purchase_year = product.purchaseYear;
    if (product.boxCondition !== undefined) dbProduct.box_condition = product.boxCondition;
    if (product.listingType !== undefined) dbProduct.listing_type = product.listingType;
    if (product.volume !== undefined) dbProduct.volume = product.volume;
    
    const { data, error } = await supabase
      .from('products')
      .update(dbProduct)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error updating product:', error);
      throw new Error(`Failed to update product: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const mappedProduct = this.mapSnakeToCamelCase(data);
    
    return mappedProduct as Product;
  }

  async deleteProduct(id: number): Promise<void> {
    try {
      // First delete related product images
      const productImages = await this.getProductImages(id);
      for (const image of productImages) {
        await this.deleteProductImage(image.id);
      }
      
      // Then delete the product
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      
      if (error) {
        throw new Error(`Failed to delete product: ${error.message}`);
      }
      
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
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error getting product reviews:', error);
      return [];
    }
    
    // Map snake_case to camelCase
    const reviews = (data || []).map(review => ({
      id: review.id,
      userId: review.user_id,
      productId: review.product_id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.created_at
    }));
    
    return reviews as Review[];
  }

  async getUserProductReview(userId: number, productId: number): Promise<Review | undefined> {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .single();
    
    if (error || !data) {
      // Not found is expected in many cases
      if (!error?.message.includes('No rows found')) {
        console.error('Error getting user product review:', error);
      }
      return undefined;
    }
    
    // Map snake_case to camelCase
    const review = {
      id: data.id,
      userId: data.user_id,
      productId: data.product_id,
      rating: data.rating,
      comment: data.comment,
      createdAt: data.created_at
    };
    
    return review as Review;
  }

  async createReview(review: InsertReview): Promise<Review> {
    // Convert to snake_case for DB
    const dbReview = {
      user_id: review.userId,
      product_id: review.productId,
      rating: review.rating,
      comment: review.comment
    };
    
    const { data, error } = await supabase
      .from('reviews')
      .insert([dbReview])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating review:', error);
      throw new Error(`Failed to create review: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const newReview = {
      id: data.id,
      userId: data.user_id,
      productId: data.product_id,
      rating: data.rating,
      comment: data.comment,
      createdAt: data.created_at
    };
    
    return newReview as Review;
  }
  
  // Order methods
  async createOrder(order: InsertOrder): Promise<Order> {
    // Convert to snake_case for DB
    const dbOrder = {
      user_id: order.userId,
      total: order.total,
      status: order.status
    };
    
    const { data, error } = await supabase
      .from('orders')
      .insert([dbOrder])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating order:', error);
      throw new Error(`Failed to create order: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const newOrder = {
      id: data.id,
      userId: data.user_id,
      total: data.total,
      status: data.status,
      createdAt: data.created_at
    };
    
    return newOrder as Order;
  }
  
  async addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    // Convert to snake_case for DB
    const dbOrderItem = {
      order_id: orderItem.orderId,
      product_id: orderItem.productId,
      quantity: orderItem.quantity,
      price: orderItem.price
    };
    
    const { data, error } = await supabase
      .from('order_items')
      .insert([dbOrderItem])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating order item:', error);
      throw new Error(`Failed to create order item: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const newOrderItem = {
      id: data.id,
      orderId: data.order_id,
      productId: data.product_id,
      quantity: data.quantity,
      price: data.price
    };
    
    return newOrderItem as OrderItem;
  }
  
  async getOrderById(id: number): Promise<OrderWithItems | undefined> {
    // Get the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();
    
    if (orderError || !order) {
      console.error('Error getting order:', orderError);
      return undefined;
    }
    
    // Convert order from snake_case to camelCase
    const mappedOrder = {
      id: order.id,
      userId: order.user_id,
      total: order.total,
      status: order.status,
      createdAt: order.created_at
    };
    
    // Get order items
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id);
    
    if (itemsError) {
      console.error('Error getting order items:', itemsError);
      throw new Error(`Failed to get order items: ${itemsError.message}`);
    }
    
    // Convert order items from snake_case to camelCase
    const mappedOrderItems = (orderItems || []).map(item => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      quantity: item.quantity,
      price: item.price
    }));
    
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', order.user_id)
      .single();
    
    if (userError || !user) {
      console.error('Error getting user for order:', userError);
      throw new Error(`User not found for order: ${id}`);
    }
    
    // Use helper method to map user without password
    const mappedUser = this.mapUserFromDb(user);
    
    // Get products for each order item
    const items = await Promise.all(mappedOrderItems.map(async (item) => {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.productId)
        .single();
      
      if (productError || !product) {
        console.error('Error getting product for order item:', productError);
        throw new Error(`Product not found for order item: ${item.id}`);
      }
      
      // Map product from snake_case to camelCase
      const mappedProduct = this.mapSnakeToCamelCase(product);
      
      return { ...item, product: mappedProduct } as OrderItem & { product: Product };
    }));
    
    return {
      ...mappedOrder,
      items,
      user: mappedUser as User,
    } as OrderWithItems;
  }
  
  async getUserOrders(userId: number): Promise<OrderWithItems[]> {
    const { data: userOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error getting user orders:', error);
      return [];
    }
    
    return Promise.all(
      (userOrders || []).map(order => this.getOrderById(order.id))
    ) as Promise<OrderWithItems[]>;
  }
  
  async getAllOrders(): Promise<OrderWithItems[]> {
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error getting all orders:', error);
      return [];
    }
    
    return Promise.all(
      (allOrders || []).map(order => this.getOrderById(order.id))
    ) as Promise<OrderWithItems[]>;
  }
  
  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error updating order status:', error);
      throw new Error(`Failed to update order status: ${error?.message}`);
    }
    
    // Map from snake_case to camelCase
    const order = {
      id: data.id,
      userId: data.user_id,
      total: data.total,
      status: data.status,
      createdAt: data.created_at
    };
    
    return order as Order;
  }

  // Product Image methods
  async getProductImages(productId: number): Promise<ProductImage[]> {
    const { data, error } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', productId)
      .order('image_order', { ascending: true });
    
    if (error) {
      console.error('Error getting product images:', error);
      return [];
    }
    
    // Map snake_case to camelCase
    const images = (data || []).map(img => ({
      id: img.id,
      productId: img.product_id,
      imageUrl: img.image_url,
      imageOrder: img.image_order,
      imageName: img.image_name,
      createdAt: img.created_at
    }));
    
    return images as ProductImage[];
  }

  async createProductImage(productImage: InsertProductImage): Promise<ProductImage> {
    // Convert to snake_case for DB
    const dbProductImage = {
      product_id: productImage.productId,
      image_url: productImage.imageUrl,
      image_order: productImage.imageOrder,
      image_name: productImage.imageName
    };
    
    const { data, error } = await supabase
      .from('product_images')
      .insert([dbProductImage])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating product image:', error);
      throw new Error(`Failed to create product image: ${error?.message}`);
    }
    
    // Convert back to camelCase
    return {
      id: data.id,
      productId: data.product_id,
      imageUrl: data.image_url,
      imageOrder: data.image_order,
      imageName: data.image_name,
      createdAt: data.created_at
    } as ProductImage;
  }

  async updateProductImage(id: number, productImage: Partial<InsertProductImage>): Promise<ProductImage> {
    const updateData: any = {};
    
    // Map camelCase to snake_case for database
    if (productImage.productId !== undefined) updateData.product_id = productImage.productId;
    if (productImage.imageUrl !== undefined) updateData.image_url = productImage.imageUrl;
    if (productImage.displayOrder !== undefined) updateData.display_order = productImage.displayOrder;
    
    const { data, error } = await supabase
      .from('product_images')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating product image:', error);
      throw new Error(`Failed to update product image: ${error.message}`);
    }
    
    return {
      id: data.id,
      productId: data.product_id,
      imageUrl: data.image_url,
      displayOrder: data.display_order
    };
  }

  async deleteProductImage(id: number): Promise<void> {
    const { error } = await supabase
      .from('product_images')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting product image:', error);
      throw new Error(`Failed to delete product image: ${error.message}`);
    }
  }

  // Helper methods
  private async addProductDetails(products: Product[]): Promise<ProductWithDetails[]> {
    return Promise.all(products.map(async (product) => {
      // Get category
      let category: Category | undefined = undefined;
      if (product.categoryId) {
        const { data: categoryResult, error: categoryError } = await supabase
          .from('categories')
          .select('*')
          .eq('id', product.categoryId)
          .single();
        
        if (!categoryError && categoryResult) {
          category = categoryResult as Category;
        }
      }
      
      // Get seller
      const { data: seller, error: sellerError } = await supabase
        .from('users')
        .select('*')
        .eq('id', product.sellerId)
        .single();
      
      // Get reviews
      const { data: reviewsResult, error: reviewsError } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', product.id);
      
      // Get product images
      const images = await this.getProductImages(product.id);
      
      // Get auction data if the product is an auction
      let auction = undefined;
      if (product.listingType === 'auction') {
        // First get the auction details
        const { data: auctionData, error: auctionError } = await supabase
          .from('auctions')
          .select('*')
          .eq('product_id', product.id)
          .single();
          
        if (!auctionError && auctionData) {
          // Convert snake_case to camelCase
          const mappedAuction = {
            id: auctionData.id,
            productId: auctionData.product_id,
            startingPrice: auctionData.starting_price,
            reservePrice: auctionData.reserve_price,
            buyNowPrice: auctionData.buy_now_price,
            currentBid: auctionData.current_bid,
            currentBidderId: auctionData.current_bidder_id,
            bidIncrement: auctionData.bid_increment,
            startsAt: auctionData.starts_at,
            endsAt: auctionData.ends_at,
            status: auctionData.status,
            createdAt: auctionData.created_at,
            updatedAt: auctionData.updated_at
          };
          
          // Then get the bid count
          const { count: bidCount, error: bidCountError } = await supabase
            .from('bids')
            .select('*', { count: 'exact', head: true })
            .eq('auction_id', mappedAuction.id);
            
          // Add the bid count to the auction object
          auction = {
            ...mappedAuction,
            bidCount: bidCount || 0
          };
        }
      }
      
      // Calculate average rating
      let averageRating: number | undefined = undefined;
      const reviews = reviewsResult || [];
      if (reviews.length > 0) {
        const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = totalRating / reviews.length;
      }
      
      return {
        ...product,
        category,
        seller: seller as User | undefined,
        reviews: reviews as Review[],
        averageRating,
        images,
        auction,
      };
    }));
  }
  
  // =========== AUCTION METHODS ===========

  async getAuctions(): Promise<Auction[]> {
    console.log('Getting all auctions from Supabase');
    const { data, error } = await supabase
      .from('auctions')
      .select('*');
    
    if (error) {
      console.error('Error getting auctions:', error);
      return [];
    }
    
    // Map snake_case to camelCase
    const mappedAuctions = (data || []).map(auction => ({
      id: auction.id,
      productId: auction.product_id,
      startingPrice: auction.starting_price,
      reservePrice: auction.reserve_price,
      buyNowPrice: auction.buy_now_price,
      currentBid: auction.current_bid,
      currentBidderId: auction.current_bidder_id,
      bidIncrement: auction.bid_increment,
      startsAt: auction.starts_at,
      endsAt: auction.ends_at,
      status: auction.status,
      createdAt: auction.created_at,
      updatedAt: auction.updated_at,
    }));
    
    console.log(`Retrieved ${mappedAuctions.length} auctions`);
    return mappedAuctions as Auction[];
  }
  
  async getActiveAuctions(): Promise<Auction[]> {
    console.log('[AUCTION-DB] Getting active auctions from Supabase');
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('status', 'active');
    
    if (error) {
      console.error('Error getting active auctions:', error);
      return [];
    }
    
    console.log(`[AUCTION-DB] Found ${data?.length || 0} active auctions`);
    if (data && data.length > 0) {
      console.log('[AUCTION-DB] Sample auction data:', {
        id: data[0].id,
        ends_at_raw: data[0].ends_at,
        ends_at_parsed: new Date(data[0].ends_at).toISOString(),
        ends_at_local: new Date(data[0].ends_at).toString()
      });
    }
    
    // Map snake_case to camelCase
    const mappedAuctions = (data || []).map(auction => ({
      id: auction.id,
      productId: auction.product_id,
      startingPrice: auction.starting_price,
      reservePrice: auction.reserve_price,
      buyNowPrice: auction.buy_now_price,
      currentBid: auction.current_bid,
      currentBidderId: auction.current_bidder_id,
      bidIncrement: auction.bid_increment,
      startsAt: auction.starts_at,
      endsAt: auction.ends_at,
      status: auction.status,
      createdAt: auction.created_at,
      updatedAt: auction.updated_at,
    }));
    
    console.log(`Retrieved ${mappedAuctions.length} active auctions`);
    return mappedAuctions as Auction[];
  }

  async getAuctionById(id: number): Promise<Auction | undefined> {
    console.log(`Getting auction with ID: ${id}`);
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.error('Error getting auction:', error);
      return undefined;
    }
    
    // Map snake_case to camelCase
    const mappedAuction = {
      id: data.id,
      productId: data.product_id,
      startingPrice: data.starting_price,
      reservePrice: data.reserve_price,
      buyNowPrice: data.buy_now_price,
      currentBid: data.current_bid,
      currentBidderId: data.current_bidder_id,
      bidIncrement: data.bid_increment,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    console.log(`Retrieved auction: ${JSON.stringify(mappedAuction)}`);
    return mappedAuction as Auction;
  }

  async getProductAuctions(productId: number): Promise<Auction[]> {
    console.log(`Getting auctions for product ID: ${productId}`);
    const { data, error } = await supabase
      .from('auctions')
      .select('*')
      .eq('product_id', productId);
    
    if (error) {
      console.error('Error getting product auctions:', error);
      return [];
    }
    
    // Map snake_case to camelCase
    const mappedAuctions = (data || []).map(auction => ({
      id: auction.id,
      productId: auction.product_id,
      startingPrice: auction.starting_price,
      reservePrice: auction.reserve_price,
      buyNowPrice: auction.buy_now_price,
      currentBid: auction.current_bid,
      currentBidderId: auction.current_bidder_id,
      bidIncrement: auction.bid_increment,
      startsAt: auction.starts_at,
      endsAt: auction.ends_at,
      status: auction.status,
      createdAt: auction.created_at,
      updatedAt: auction.updated_at,
    }));
    
    console.log(`Retrieved ${mappedAuctions.length} auctions for product ${productId}`);
    return mappedAuctions as Auction[];
  }

  async createAuction(auction: InsertAuction): Promise<Auction> {
    console.log(`[AUCTION-DB] ===== Creating Auction in Database =====`);
    console.log(`[AUCTION-DB] Input data: ${JSON.stringify(auction)}`);
    
    // Analyze the end time
    const endDate = new Date(auction.endsAt);
    const now = new Date();
    const msUntilEnd = endDate.getTime() - now.getTime();
    const hoursUntilEnd = msUntilEnd / (1000 * 60 * 60);
    
    console.log(`[AUCTION-DB] End time analysis:`);
    console.log(`  - endsAt received: ${auction.endsAt}`);
    console.log(`  - endsAt parsed (UTC): ${endDate.toISOString()}`);
    console.log(`  - endsAt parsed (local): ${endDate.toString()}`);
    console.log(`  - current time (UTC): ${now.toISOString()}`);
    console.log(`  - hours until end: ${hoursUntilEnd.toFixed(2)}`);
    
    // CRITICAL FIX: Normalize timestamps to UTC before storing
    const startsAtNormalized = auction.startsAt 
      ? new Date(auction.startsAt).toISOString()
      : new Date().toISOString();
    
    const endsAtNormalized = new Date(auction.endsAt).toISOString();
    
    console.log(`[AUCTION-DB] Timestamp normalization:`);
    console.log(`  - Original endsAt: ${auction.endsAt}`);
    console.log(`  - Normalized endsAt: ${endsAtNormalized}`);
    console.log(`  - Original startsAt: ${auction.startsAt}`);
    console.log(`  - Normalized startsAt: ${startsAtNormalized}`);
    
    // Convert camelCase to snake_case for DB
    const dbAuction = {
      product_id: auction.productId,
      starting_price: auction.startingPrice,
      reserve_price: auction.reservePrice,
      buy_now_price: auction.buyNowPrice,
      current_bid: auction.currentBid,
      current_bidder_id: auction.currentBidderId,
      bid_increment: auction.bidIncrement,
      // Store normalized UTC timestamps
      starts_at: startsAtNormalized,
      ends_at: endsAtNormalized,
      status: auction.status || 'active',
    };
    
    console.log(`[AUCTION-DB] Data being sent to Supabase: ${JSON.stringify(dbAuction)}`);
    const { data, error } = await supabase
      .from('auctions')
      .insert([dbAuction])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating auction:', error);
      throw new Error(`Failed to create auction: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const mappedAuction = {
      id: data.id,
      productId: data.product_id,
      startingPrice: data.starting_price,
      reservePrice: data.reserve_price,
      buyNowPrice: data.buy_now_price,
      currentBid: data.current_bid,
      currentBidderId: data.current_bidder_id,
      bidIncrement: data.bid_increment,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    console.log(`[AUCTION-DB] Raw data from Supabase after insert:`, data);
    console.log(`[AUCTION-DB] Stored ends_at:`, data.ends_at);
    console.log(`[AUCTION-DB] Successfully created auction: ${JSON.stringify(mappedAuction)}`);
    return mappedAuction as Auction;
  }

  async updateAuction(id: number, auctionData: Partial<InsertAuction>): Promise<Auction> {
    console.log(`Updating auction ${id} with data: ${JSON.stringify(auctionData)}`);
    
    // Convert camelCase to snake_case for DB
    const dbAuctionData: any = {};
    
    if (auctionData.productId !== undefined) dbAuctionData.product_id = auctionData.productId;
    if (auctionData.startingPrice !== undefined) dbAuctionData.starting_price = auctionData.startingPrice;
    if (auctionData.reservePrice !== undefined) dbAuctionData.reserve_price = auctionData.reservePrice;
    if (auctionData.buyNowPrice !== undefined) dbAuctionData.buy_now_price = auctionData.buyNowPrice;
    if (auctionData.currentBid !== undefined) dbAuctionData.current_bid = auctionData.currentBid;
    if (auctionData.currentBidderId !== undefined) dbAuctionData.current_bidder_id = auctionData.currentBidderId;
    if (auctionData.bidIncrement !== undefined) dbAuctionData.bid_increment = auctionData.bidIncrement;
    if (auctionData.startsAt !== undefined) dbAuctionData.starts_at = auctionData.startsAt;
    if (auctionData.endsAt !== undefined) dbAuctionData.ends_at = auctionData.endsAt;
    if (auctionData.status !== undefined) dbAuctionData.status = auctionData.status;
    
    // Always update the updated_at timestamp
    dbAuctionData.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('auctions')
      .update(dbAuctionData)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error updating auction:', error);
      throw new Error(`Failed to update auction: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const mappedAuction = {
      id: data.id,
      productId: data.product_id,
      startingPrice: data.starting_price,
      reservePrice: data.reserve_price,
      buyNowPrice: data.buy_now_price,
      currentBid: data.current_bid,
      currentBidderId: data.current_bidder_id,
      bidIncrement: data.bid_increment,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    console.log(`Successfully updated auction: ${JSON.stringify(mappedAuction)}`);
    return mappedAuction as Auction;
  }

  async deleteAuction(id: number): Promise<void> {
    console.log(`Deleting auction with ID: ${id}`);
    
    // First delete all bids for this auction
    try {
      const { error: bidsError } = await supabase
        .from('bids')
        .delete()
        .eq('auction_id', id);
      
      if (bidsError) {
        console.error('Error deleting auction bids:', bidsError);
        // Continue with auction deletion anyway
      }
    } catch (err) {
      console.error('Exception deleting auction bids:', err);
      // Continue with auction deletion anyway
    }
    
    // Then delete the auction
    const { error } = await supabase
      .from('auctions')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting auction:', error);
      throw new Error(`Failed to delete auction: ${error.message}`);
    }
    
    console.log(`Successfully deleted auction ${id}`);
  }

  // =========== BID METHODS ===========

  async getBidsForAuction(auctionId: number): Promise<Bid[]> {
    console.log(`Getting bids for auction ID: ${auctionId}`);
    
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .eq('auction_id', auctionId)
      .order('placed_at', { ascending: false });
    
    if (error) {
      console.error('Error getting auction bids:', error);
      return [];
    }
    
    // Map snake_case to camelCase
    const mappedBids = (data || []).map(bid => ({
      id: bid.id,
      auctionId: bid.auction_id,
      bidderId: bid.bidder_id,
      amount: bid.amount,
      placedAt: bid.placed_at,
      isWinning: bid.is_winning,
    }));
    
    console.log(`Retrieved ${mappedBids.length} bids for auction ${auctionId}`);
    return mappedBids as Bid[];
  }

  async createBid(bid: InsertBid): Promise<Bid> {
    console.log(`Creating bid with data: ${JSON.stringify(bid)}`);
    
    // Convert camelCase to snake_case for DB
    const dbBid = {
      auction_id: bid.auctionId,
      bidder_id: bid.bidderId,
      amount: bid.amount,
      is_winning: bid.isWinning === undefined ? true : bid.isWinning,
    };
    
    const { data, error } = await supabase
      .from('bids')
      .insert([dbBid])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating bid:', error);
      throw new Error(`Failed to create bid: ${error?.message}`);
    }
    
    // Map snake_case to camelCase
    const mappedBid = {
      id: data.id,
      auctionId: data.auction_id,
      bidderId: data.bidder_id,
      amount: data.amount,
      placedAt: data.placed_at,
      isWinning: data.is_winning,
    };
    
    console.log(`Successfully created bid: ${JSON.stringify(mappedBid)}`);
    return mappedBid as Bid;
  }

  async updatePreviousBids(auctionId: number, newBidderId: number): Promise<void> {
    console.log(`Updating previous bids for auction ${auctionId}, new bidder: ${newBidderId}`);
    
    // Mark all previous bids as not winning
    const { error } = await supabase
      .from('bids')
      .update({ is_winning: false })
      .eq('auction_id', auctionId)
      .neq('bidder_id', newBidderId);
    
    if (error) {
      console.error('Error updating previous bids:', error);
      throw new Error(`Failed to update previous bids: ${error.message}`);
    }
    
    console.log(`Successfully updated previous bids for auction ${auctionId}`);
  }
  
  async createBidAuditEntry(entry: {
    auctionId: number;
    userId: number;
    attemptedAmount: number;
    status: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('bid_audit_trail')
      .insert({
        auction_id: entry.auctionId,
        user_id: entry.userId,
        attempted_amount: entry.attemptedAmount,
        status: entry.status,
        reason: entry.reason,
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent
      });
    
    if (error) {
      console.error('Error creating bid audit entry:', error);
      // Don't throw - audit logging should not break the bid flow
    }
  }
  
  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    // Get only the latest message per conversation to minimize data transfer
    // Use a window function to get the most recent message for each unique conversation pair
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(id, username, first_name, last_name, profile_image),
        receiver:users!messages_receiver_id_fkey(id, username, first_name, last_name, profile_image),
        product:products(id, name, brand, price, image_url, seller_id)
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error getting user messages:', error);
      throw new Error('Failed to retrieve user messages');
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Group by conversation and keep only the latest message per conversation
    const conversationMap = new Map<string, any>();
    
    data.forEach(msg => {
      // Create conversation key by sorting user IDs to ensure consistency
      const conversationKey = [msg.sender_id, msg.receiver_id].sort().join('-') + 
                             (msg.product_id ? `-${msg.product_id}` : '');
      
      // Keep only the latest message (first one due to order by created_at desc)
      if (!conversationMap.has(conversationKey)) {
        conversationMap.set(conversationKey, msg);
      }
    });
    
    // Process the latest messages with optimized data mapping
    return await this.processJoinedMessages(Array.from(conversationMap.values()));
  }

  private async processJoinedMessages(data: any[]): Promise<MessageWithDetails[]> {
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    return data.map(msg => {
      // Decrypt the message content if it's encrypted and not null
      let content = msg.content;
      if (content && isEncrypted(content)) {
        content = decryptMessage(content);
      }
      
      return {
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        content: content, // Decrypted content
        isRead: msg.is_read,
        createdAt: new Date(msg.created_at),
        productId: msg.product_id,
        // Add the new fields for file messages
        messageType: msg.message_type || 'TEXT',
        fileUrl: msg.file_url || null,
        // Add action message fields
        actionType: msg.action_type || null,
        isClicked: msg.is_clicked || false,
        // Map joined user and product data directly from the JOIN results
        sender: msg.sender ? {
          id: msg.sender.id,
          username: msg.sender.username,
          firstName: msg.sender.first_name,
          lastName: msg.sender.last_name,
          profileImage: msg.sender.profile_image
        } : undefined,
        receiver: msg.receiver ? {
          id: msg.receiver.id,
          username: msg.receiver.username,
          firstName: msg.receiver.first_name,
          lastName: msg.receiver.last_name,
          profileImage: msg.receiver.profile_image
        } : undefined,
        product: msg.product ? {
          id: msg.product.id,
          name: msg.product.name,
          brand: msg.product.brand,
          price: msg.product.price,
          imageUrl: msg.product.image_url,
          sellerId: msg.product.seller_id
        } : undefined
      };
    }) as MessageWithDetails[];
  }

  private async processMessagesWithOptimizedUserFetch(data: any[]): Promise<MessageWithDetails[]> {
    // Collect all unique user IDs and product IDs in batch
    const userIds = new Set<number>();
    const productIds = new Set<number>();
    
    data.forEach(msg => {
      userIds.add(msg.sender_id);
      userIds.add(msg.receiver_id);
      if (msg.product_id) productIds.add(msg.product_id);
    });
    
    // Fetch all users in one query using IN clause
    const usersMap = new Map<number, any>();
    if (userIds.size > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .in('id', Array.from(userIds));
        
      if (!usersError && usersData) {
        usersData.forEach(user => {
          usersMap.set(user.id, this.mapUserFromDb(user));
        });
      }
    }
    
    // Fetch all products in one query (basic info only for performance)
    const productsMap = new Map<number, any>();
    if (productIds.size > 0) {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, brand, price, image_url, seller_id')
        .in('id', Array.from(productIds));
        
      if (!productsError && productsData) {
        productsData.forEach(product => {
          productsMap.set(product.id, this.mapSnakeToCamelCase(product));
        });
      }
    }
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Map messages with their details
    const messages = data.map(msg => {
      let content = msg.content;
      if (content && isEncrypted(content)) {
        content = decryptMessage(content);
      }
      
      return {
        id: msg.id,
        senderId: msg.sender_id,
        receiverId: msg.receiver_id,
        content: content,
        isRead: msg.is_read,
        createdAt: new Date(msg.created_at),
        productId: msg.product_id,
        messageType: msg.message_type || 'TEXT',
        fileUrl: msg.file_url || null,
        actionType: msg.action_type || null,
        isClicked: msg.is_clicked || false,
        sender: usersMap.get(msg.sender_id),
        receiver: usersMap.get(msg.receiver_id),
        product: msg.product_id ? productsMap.get(msg.product_id) : undefined
      };
    });
    
    return messages as MessageWithDetails[];
  }
  
  async getConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    console.log(`Fetching conversation between users ${userId1} and ${userId2}`);
    
    // Use JOIN queries to fetch all data in a single request - eliminates N+1 queries
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(id, username, first_name, last_name, profile_image),
        receiver:users!messages_receiver_id_fkey(id, username, first_name, last_name, profile_image),
        product:products(id, name, brand, price, image_url, seller_id)
      `)
      .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error getting conversation:', error);
      throw new Error('Failed to retrieve conversation');
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Process joined data without additional queries
    return this.processJoinedMessages(data);
  }
  
  async getConversationForProduct(userId1: number, userId2: number, productId: number): Promise<MessageWithDetails[]> {
    // Use JOIN queries to fetch all related data in a single optimized request - eliminates N+1 queries
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey(id, username, first_name, last_name, profile_image),
        receiver:users!messages_receiver_id_fkey(id, username, first_name, last_name, profile_image),
        product:products(id, name, brand, price, image_url, seller_id)
      `)
      .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
      .eq('product_id', productId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error getting conversation for product:', error);
      throw new Error('Failed to retrieve product conversation');
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Process joined data without additional queries - all data fetched in single request
    return this.processJoinedMessages(data);
  }
  
  async sendMessage(message: InsertMessage): Promise<Message> {
    // Import encryption utility
    const { encryptMessage } = await import('./encryption');
    
    // Prepare content - only encrypt text messages, not action messages
    let contentToStore: string | null = null;
    if (message.messageType === 'ACTION') {
      // Action messages don't have text content to encrypt
      contentToStore = null;
    } else if (message.content) {
      // Regular text messages need encryption
      contentToStore = encryptMessage(message.content);
    }
    
    // Prepare database message object
    const dbMessage: any = {
      sender_id: message.senderId,
      receiver_id: message.receiverId,
      content: contentToStore,
      product_id: message.productId || null,
      is_read: message.isRead || false
    };
    
    // Add action message specific fields if this is an action message
    if (message.messageType === 'ACTION') {
      dbMessage.message_type = 'ACTION';
      dbMessage.action_type = message.actionType;
      dbMessage.is_clicked = message.isClicked || false;
    }
    
    const { data, error } = await supabase
      .from('messages')
      .insert([dbMessage])
      .select()
      .single();
      
    if (error || !data) {
      console.error('Error sending message:', error);
      throw new Error('Failed to send message');
    }
    
    // Convert snake_case to camelCase and include action message fields
    const result: any = {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      content: data.content, // Will be null for action messages, encrypted for text messages
      isRead: data.is_read,
      createdAt: new Date(data.created_at),
      productId: data.product_id,
    };
    
    // Add action message specific fields if they exist
    if (data.message_type) {
      result.messageType = data.message_type;
    }
    if (data.action_type) {
      result.actionType = data.action_type;
    }
    if (data.is_clicked !== undefined) {
      result.isClicked = data.is_clicked;
    }
    
    return result as Message;
  }
  
  async markMessageAsRead(id: number): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();
      
    if (error || !data) {
      console.error('Error marking message as read:', error);
      throw new Error('Failed to mark message as read');
    }
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Decrypt message content if it's encrypted
    let content = data.content;
    if (isEncrypted(content)) {
      content = decryptMessage(content);
    }
    
    // Convert snake_case to camelCase
    return {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      content: content, // Use decrypted content
      isRead: data.is_read,
      createdAt: new Date(data.created_at),
      productId: data.product_id,
    } as Message;
  }
  
  async markAllMessagesAsRead(receiverId: number, senderId: number): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', receiverId)
      .eq('sender_id', senderId);
      
    if (error) {
      console.error('Error marking all messages as read:', error);
      throw new Error('Failed to mark all messages as read');
    }
  }
  
  /**
   * Get a specific message by ID
   */
  async getMessageById(messageId: number): Promise<MessageWithDetails | null> {
    console.log(`Getting message with ID ${messageId} from Supabase`);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();
      
    if (error) {
      console.error('Error getting message by ID:', error);
      return null;
    }
    
    if (!data) {
      return null;
    }
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Decrypt the message content if needed
    let content = data.content;
    if (content && isEncrypted(content)) {
      content = decryptMessage(content);
    }
    
    // Map from snake_case to camelCase
    const message: MessageWithDetails = {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      content: content,
      isRead: data.is_read,
      createdAt: new Date(data.created_at),
      messageType: data.message_type || 'TEXT',
      fileUrl: data.file_url || null,
      actionType: data.action_type || null,
      isClicked: data.is_clicked || false,
      productId: data.product_id || null
    };
    
    // If it's an ACTION message with a product, get the product details
    if (message.messageType === 'ACTION' && message.productId) {
      try {
        // Just fetch the product directly instead of using a helper method
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', message.productId)
          .single();
          
        if (!error && data) {
          const product = {
            id: data.id,
            name: data.name,
            brand: data.brand,
            description: data.description,
            price: data.price,
            imageUrl: data.image_url,
            // Add other properties as needed
          };
          message.product = product;
        }
      } catch (error) {
        console.error(`Error fetching product ${message.productId} for action message:`, error);
      }
    }
    
    return message;
  }
  
  /**
   * Add a new message (alternative method name for compatibility)
   */
  async addMessage(message: InsertMessage): Promise<Message> {
    return this.sendMessage(message);
  }

  /**
   * Update transaction status
   */
  async updateTransactionStatus(transactionId: number, status: string): Promise<void> {
    console.log(`Updating transaction ${transactionId} status to: ${status}`);
    
    const { error } = await supabase
      .from('transactions')
      .update({ status: status })
      .eq('id', transactionId);
      
    if (error) {
      console.error('Error updating transaction status:', error);
      throw new Error(`Failed to update transaction status: ${error.message}`);
    }
  }

  /**
   * Update an action message status to mark it as clicked/confirmed
   */
  async updateActionMessageStatus(messageId: number, isClicked: boolean): Promise<MessageWithDetails | null> {
    console.log(`Updating action message ${messageId} status, setting isClicked=${isClicked}`);
    
    // First, ensure the message exists and is an ACTION type
    const existingMessage = await this.getMessageById(messageId);
    
    if (!existingMessage || existingMessage.messageType !== 'ACTION') {
      console.error('Message not found or not an ACTION type:', messageId);
      return null;
    }
    
    // Update the is_clicked field in the database
    const { data, error } = await supabase
      .from('messages')
      .update({ is_clicked: isClicked })
      .eq('id', messageId)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating action message status:', error);
      return null;
    }
    
    if (!data) {
      return null;
    }
    
    // Get the updated message with all details
    // We need to make sure we return the message with updated information
    const updatedMessage = await this.getMessageById(messageId);
    return updatedMessage;
  }
  
  async getUnreadMessageCount(userId: number): Promise<number> {
    const { data, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .eq('is_read', false);
      
    if (error) {
      console.error('Error getting unread message count:', error);
      throw new Error('Failed to get unread message count');
    }
    
    return count || 0;
  }
  
  // Payment methods
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    console.log('Creating payment with full data:', JSON.stringify({
      orderId: insertPayment.orderId,
      productIds: insertPayment.productIds || [],
      amount: insertPayment.amount,
      status: insertPayment.status || 'due',
      metadata: insertPayment.metadata || {}
    }, null, 2));
    
    // Map the payment data to match the actual database schema
    const paymentData: any = {
      order_id: insertPayment.orderId,
      bill_id: insertPayment.billId,
      collection_id: process.env.BILLPLZ_COLLECTION_ID || '',
      amount: insertPayment.amount * 100, // Convert to sen (RM to sen)
      status: insertPayment.status || 'due',
      paid_at: insertPayment.paidAt || null,
      webhook_payload: insertPayment.metadata ? JSON.stringify(insertPayment.metadata) : null
      // created_at is added automatically by the database
    };
    
    // Add the product_id field if only one product
    if (insertPayment.productIds && insertPayment.productIds.length === 1) {
      const productId = Number(insertPayment.productIds[0]);
      if (!isNaN(productId)) {
        console.log(`Setting product_id field directly to ${productId} for single product boost`);
        paymentData.product_id = productId;
      }
    }
    
    // Add user_id field
    if (insertPayment.userId) {
      paymentData.user_id = insertPayment.userId;
      console.log(`Setting user_id field to ${insertPayment.userId}`);
    }
    
    console.log('Final payment data being inserted:', JSON.stringify(paymentData, null, 2));
    
    const { data, error } = await supabase
      .from('payments')
      .insert(paymentData)
      .select()
      .single();
      
    if (error) {
      console.error('Error creating payment:', error);
      console.error('Error details:', error.details || 'No details available');
      throw error;
    }
    
    // Check if product_id was stored correctly
    console.log(`Payment created with ID ${data.id}`, {
      product_id: data.product_id,
      has_product_id: data.product_id !== null && data.product_id !== undefined
    });
    
    return this.mapPaymentFromDb(data);
  }
  
  async getPaymentByOrderId(orderId: string): Promise<Payment | undefined> {
    const { data, error } = await supabase
      .from('payments')
      .select()
      .eq('order_id', orderId)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return undefined;
      }
      console.error('Error getting payment by order ID:', error);
      throw error;
    }
    
    return this.mapPaymentFromDb(data);
  }
  
  async getPaymentByBillId(billId: string): Promise<Payment | undefined> {
    const { data, error } = await supabase
      .from('payments')
      .select()
      .eq('bill_id', billId)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return undefined;
      }
      console.error('Error getting payment by bill ID:', error);
      throw error;
    }
    
    return this.mapPaymentFromDb(data);
  }
  
  // Since our payments table doesn't have user_id, we'll need to join with orders or use metadata
  // For now, we'll retrieve all payments and filter client-side if needed
  async getUserPayments(userId: number): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select()
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error getting user payments:', error);
      throw error;
    }
    
    // We can add filtering logic here once we establish the relationship between payments and users
    return data.map(this.mapPaymentFromDb);
  }
  
  async updatePaymentStatus(id: number, status: string, billId?: string, paymentChannel?: string, paidAt?: Date): Promise<Payment> {
    console.log(`Updating payment ${id} to status '${status}'${paidAt ? ' with paid date ' + paidAt : ''}`);
    
    // Only include fields that exist in the actual database schema
    const updateData: any = { 
      status
    };
    
    // Add bill_id if provided
    if (billId) {
      updateData.bill_id = billId;
    }
    
    // Add payment_channel if provided
    if (paymentChannel) {
      updateData.payment_channel = paymentChannel;
    }
    
    // Add paid_at if provided
    if (paidAt) {
      updateData.paid_at = paidAt;
    }
    
    // Directly log what's being sent to the database
    console.log('Sending update to database:', { 
      table: 'payments',
      id,
      updateData
    });
    
    try {
      const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) {
        console.error(`Error updating payment ${id}:`, error);
        throw error;
      }
      
      console.log(`✅ Successfully updated payment ${id} to status '${status}'`);
      
      // If status is 'paid', update the product's featured status
      if (status === 'paid') {
        await this.updateProductFeaturedStatusForPayment(data.id);
      }
      
      return this.mapPaymentFromDb(data);
    } catch (err) {
      console.error(`❌ Failed to update payment ${id}:`, err);
      throw err;
    }
  }
  
  /**
   * Updates product featured status when a payment is completed
   * This links payments to products by making them featured when payment is successful
   */
  private async updateProductFeaturedStatusForPayment(paymentId: number): Promise<void> {
    try {
      // Get the payment to extract product IDs
      const payment = await this.getPaymentById(paymentId);
      if (!payment) {
        console.error(`Cannot update product featured status: Payment ${paymentId} not found`);
        return;
      }
      
      console.log('🔍 DEBUGGING: Looking for product IDs in payment record:', {
        paymentId,
        hasProductId: payment.hasOwnProperty('product_id') && payment.product_id !== null,
        productId: payment.product_id,
        hasProductIds: payment.hasOwnProperty('productIds') && payment.productIds !== null,
        productIds: payment.productIds,
        hasMetadata: payment.hasOwnProperty('metadata') && payment.metadata !== null
      });
      
      // Extract product IDs from the payment
      let productIds: number[] = [];
      
      // First check the product_id column (singular)
      if (payment.product_id !== null && payment.product_id !== undefined) {
        console.log('✅ Found product_id in direct column:', payment.product_id);
        productIds = [Number(payment.product_id)];
      } 
      // Then check productIds array
      else if (payment.productIds) {
        console.log('✅ Found product IDs in productIds array:', payment.productIds);
        productIds = Array.isArray(payment.productIds)
          ? payment.productIds.map(id => Number(id))
          : [Number(payment.productIds)];
      }
      // Then check metadata
      else if (payment.metadata && payment.metadata.productIds) {
        // If product IDs are stored in the metadata directly
        console.log('✅ Found product IDs in metadata.productIds:', payment.metadata.productIds);
        productIds = Array.isArray(payment.metadata.productIds) 
          ? payment.metadata.productIds.map(id => Number(id)) 
          : [Number(payment.metadata.productIds)];
      } else if (payment.metadata && payment.metadata.product_id) {
        // Alternative: product_id in metadata
        console.log('✅ Found product_id in metadata.product_id:', payment.metadata.product_id);
        productIds = [Number(payment.metadata.product_id)];
      } else if (payment.metadata && payment.metadata.product_ids) {
        // Alternative: product_ids as string in metadata
        console.log('✅ Found product_ids in metadata.product_ids:', payment.metadata.product_ids);
        const ids = typeof payment.metadata.product_ids === 'string'
          ? payment.metadata.product_ids.split(',')
          : payment.metadata.product_ids;
        productIds = ids.map(id => Number(id));
      }
      
      if (productIds.length === 0) {
        console.warn(`Payment ${paymentId} has no associated product IDs, cannot update featured status`);
        return;
      }
      
      console.log(`Updating featured status for ${productIds.length} products from payment ${paymentId}`);
      
      // Get duration from boost package metadata (in hours)
      let durationHours = 24; // Default fallback in hours
      
      if (payment.metadata) {
        // Check for boost package duration first (preferred)
        if (payment.metadata.durationHours) {
          durationHours = Number(payment.metadata.durationHours);
          console.log(`Using boost package duration: ${durationHours} hours`);
        }
        // Legacy fallback for old featureDuration in days
        else if (payment.metadata.featureDuration) {
          durationHours = Number(payment.metadata.featureDuration) * 24;
          console.log(`Using legacy featureDuration: ${payment.metadata.featureDuration} days = ${durationHours} hours`);
        }
      }
      
      // Calculate the featured until date using hours instead of days
      const now = new Date();
      const featuredUntil = new Date(now);
      featuredUntil.setHours(featuredUntil.getHours() + durationHours);
      
      console.log(`Setting featured duration: ${durationHours} hours, until ${featuredUntil.toISOString()}`);
      
      // Update each product
      for (const productId of productIds) {
        console.log(`Setting product ${productId} as featured until ${featuredUntil.toISOString()}`);
        
        // Update the product
        const { error } = await supabase
          .from('products')
          .update({
            is_featured: true,
            featured_at: now.toISOString(),
            featured_until: featuredUntil.toISOString(),
            status: 'featured'
          })
          .eq('id', productId);
          
        if (error) {
          console.error(`Failed to update featured status for product ${productId}:`, error);
        } else {
          console.log(`✅ Successfully featured product ${productId}`);
        }
      }
    } catch (err) {
      console.error('Error in updateProductFeaturedStatusForPayment:', err);
    }
  }
  
  /**
   * Get a payment by ID
   */
  async getPaymentById(id: number): Promise<Payment | undefined> {
    const { data, error } = await supabase
      .from('payments')
      .select()
      .eq('id', id)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') { // No rows returned
        return undefined;
      }
      console.error('Error getting payment by ID:', error);
      throw error;
    }
    
    return this.mapPaymentFromDb(data);
  }
  
  /**
   * Update payment with product IDs
   * This ensures product IDs are stored in the payment record
   * even if they were only sent via the Billplz reference fields
   */
  async updatePaymentProductIds(id: number, productIds: string[]): Promise<Payment> {
    console.log(`Updating payment ${id} with product IDs: ${productIds.join(', ')}`);
    
    // DEBUGGING: Check database schema first
    console.log('🔍 DEBUGGING: Checking database schema for payments table');
    const { data: tableInfo, error: tableError } = await supabase
      .from('payments')
      .select('*')
      .limit(1);
      
    if (tableError) {
      console.error('Error getting table schema:', tableError);
    } else {
      console.log('Available columns in payments table:', Object.keys(tableInfo[0] || {}));
    }
    
    // DEBUGGING: Get the first product ID if available
    const firstProductId = productIds.length > 0 ? productIds[0] : null;
    
    // Convert product IDs to JSON string for webhook_payload storage
    // Store both as array in metadata and as string in webhook_payload for backward compatibility
    const productDetails = productIds.map(pid => ({ id: pid }));
    const metadata = {
      productIds,
      productDetails,
      updatedAt: new Date().toISOString()
    };
    
    // Store in multiple places to see which one works
    const updateData: any = {
      webhook_payload: JSON.stringify(metadata),
      product_ids: productIds,              // Try as array
      product_id: firstProductId,           // Try as single value
      metadata: metadata                    // Also store in metadata column
    };
    
    console.log('🔍 DEBUGGING: Sending product ID update to database:', {
      table: 'payments',
      id,
      productCount: productIds.length,
      updateFields: Object.keys(updateData),
      productIds,
      firstProductId,
      productIdType: typeof firstProductId
    });
    
    try {
      // Get the current payment first to ensure we have access to all fields
      const { data: existingPayment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('id', id)
        .single();
        
      if (fetchError) {
        console.error('Error fetching existing payment:', fetchError);
        throw fetchError;
      }
      
      if (!existingPayment) {
        throw new Error(`Payment with ID ${id} not found`);
      }
      
      console.log('🔍 DEBUGGING: Existing payment:', {
        id: existingPayment.id,
        availableFields: Object.keys(existingPayment),
        currentProductId: existingPayment.product_id || 'none',
        currentProductIds: existingPayment.product_ids || 'none'
      });
      
      // Try different methods to see what works
      // 1. First try with basic update
      console.log('🔍 DEBUGGING: Attempting update method #1 (basic update)');
      const { data, error } = await supabase
        .from('payments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
        
      if (error) {
        console.error('Error updating payment status:', error);
        // Log the fields we tried to update
        console.error('Fields attempted to update:', Object.keys(updateData).join(', '));
        console.error('Error details:', error.details, error.message, error.hint);
        
        // Let's try a different method - just update the product_id field
        console.log('🔍 DEBUGGING: Attempting update method #2 (individual field update)');
        const simpleUpdateData = { product_id: firstProductId };
        
        const { data: data2, error: error2 } = await supabase
          .from('payments')
          .update(simpleUpdateData)
          .eq('id', id)
          .select()
          .single();
          
        if (error2) {
          console.error('Second update attempt also failed:', error2);
          throw error; // Throw the original error
        }
        
        console.log('🎉 Second update attempt succeeded!', {
          id: data2.id,
          product_id: data2.product_id,
          updated_at: data2.updated_at
        });
        
        return this.mapPaymentFromDb(data2);
      }
      
      console.log('🎉 Payment updated successfully:', {
        id: data.id,
        product_id: data.product_id,
        product_ids: data.product_ids,
        updated_at: data.updated_at
      });
      
      return this.mapPaymentFromDb(data);
    } catch (err) {
      console.error('Database error updating payment:', err);
      
      // Try to get the payment to check if it exists
      const { data } = await supabase
        .from('payments')
        .select()
        .eq('id', id)
        .single();
        
      if (!data) {
        console.error(`Payment with ID ${id} not found`);
      } else {
        console.log('Payment exists but could not be updated:', {
          availableFields: Object.keys(data).join(', '),
          product_ids_field_exists: Object.keys(data).includes('product_ids')
        });
      }
      
      throw err;
    }
  }
  
  /**
   * Update a payment record to associate it with a single product
   * Used for creating individual payment records per product
   */
  async updateSingleProductPayment(paymentId: number, productId: number): Promise<void> {
    console.log(`Updating payment ${paymentId} with single product ID ${productId}`);
    
    try {
      const { error } = await supabase
        .from('payments')
        .update({ product_id: productId })
        .eq('id', paymentId);
        
      if (error) {
        console.error(`Error updating payment ${paymentId} with product ID:`, error);
        throw error;
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
    orderId: string; // Required parameter for unique constraint
    amount: number;
    status: string;
    paidAt?: Date;
    paymentType: string;
    featureDuration?: number;
  }): Promise<any> {
    console.log(`📝 Creating new payment record for product ID ${params.productId}:`);
    console.log(`  - Bill ID: ${params.billId}`);
    console.log(`  - Order ID: ${params.orderId}`);
    console.log(`  - User ID: ${params.userId}`);
    
    try {
      // Convert productId to ensure it's a valid integer
      const productId = parseInt(String(params.productId));
      
      if (isNaN(productId)) {
        throw new Error(`Invalid product ID: ${params.productId}`);
      }
      
      // First check if product exists
      const { data: productCheck } = await supabase
        .from('products')
        .select('id, name')
        .eq('id', productId)
        .single();
        
      if (!productCheck) {
        throw new Error(`Product ID ${productId} does not exist`);
      }
      
      console.log(`✅ Verified product ${productId} exists: ${productCheck.name}`);

      // CRITICAL: Dump table schema to verify column names
      console.log(`🔍 DEBUG: Verifying payments table schema`);
      const { data: tableInfo, error: tableError } = await supabase
        .from('payments')
        .select('*')
        .limit(1);
        
      if (tableError) {
        console.error(`Error fetching table schema:`, tableError);
      } else if (tableInfo && tableInfo.length > 0) {
        console.log(`Available columns in payments table:`, Object.keys(tableInfo[0] || {}));
      }
      
      // Create the payment record with all required fields
      // The critical fields are order_id (must be unique) and product_ids (array)
      const insertData = {
        user_id: params.userId,
        order_id: params.orderId, // REQUIRED and must be unique
        bill_id: params.billId,
        amount: params.amount,
        status: params.status || 'paid',
        paid_at: params.paidAt || new Date(),
        payment_type: params.paymentType || 'boost',
        feature_duration: params.featureDuration || 7,
        product_ids: [String(productId)], // CORRECT FORMAT: Array of strings
        created_at: new Date(),
        updated_at: new Date()
      };
      
      console.log(`🔍 DEBUG: Insert data with correct types:`, {
        order_id: insertData.order_id + ' (type: ' + typeof insertData.order_id + ')',
        product_ids: JSON.stringify(insertData.product_ids) + ' (type: ' + typeof insertData.product_ids + ')',
        user_id: insertData.user_id + ' (type: ' + typeof insertData.user_id + ')',
        amount: insertData.amount + ' (type: ' + typeof insertData.amount + ')'
      });
      
      // Insert the record
      const { data, error } = await supabase
        .from('payments')
        .insert(insertData)
        .select()
        .single();
        
      if (error) {
        console.error(`❌ ERROR creating payment record:`, error);
        console.error(`Error details:`, error.details || 'No details');
        console.error(`Error hint:`, error.hint || 'No hint');
        
        // Try an alternative approach with RPC if insert fails
        console.log(`🔄 Trying alternative approach via plain SQL...`);
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_payment_record', {
          p_user_id: params.userId,
          p_order_id: params.orderId,
          p_bill_id: params.billId,
          p_amount: params.amount,
          p_status: params.status || 'paid',
          p_product_ids: [String(productId)],
          p_payment_type: params.paymentType || 'boost',
          p_feature_duration: params.featureDuration || 7
        });
        
        if (rpcError) {
          console.error(`❌ RPC method also failed:`, rpcError);
          throw error; // Throw the original error
        }
        
        console.log(`✅ Created payment record via RPC:`, rpcData);
        return rpcData;
      }
      
      console.log(`✅ Successfully created payment record for product ${productId}:`, {
        paymentId: data.id,
        orderId: data.order_id,
        billId: data.bill_id,
        productIds: data.product_ids
      });
      
      // Now update the existing product record to mark it as featured
      try {
        // Use hours instead of days for more precise control
        const durationHours = params.featureDuration ? params.featureDuration * 24 : 24; // Convert days to hours, default 24 hours
        const featureUntil = new Date();
        featureUntil.setHours(featureUntil.getHours() + durationHours);
        
        console.log(`Setting product featured for ${durationHours} hours until ${featureUntil.toISOString()}`);
        
        const { error: updateError } = await supabase
          .from('products')
          .update({
            is_featured: true,
            featured_at: new Date(),
            featured_until: featureUntil,
            status: 'featured'
          })
          .eq('id', productId);
        
        if (updateError) {
          console.error(`Error updating product featured status:`, updateError);
        } else {
          console.log(`✅ Updated product ${productId} to featured status until ${featureUntil}`);
        }
      } catch (updateErr) {
        console.error(`Error in product feature update:`, updateErr);
        // Don't throw here - we want to return the payment record even if this fails
      }
      
      return data;
    } catch (err) {
      console.error(`❌ CRITICAL ERROR: Failed to create payment record for product ${params.productId}:`, err);
      console.error(`Full error stack:`, err.stack);
      throw err;
    }
  }
  
  // Helper method to map DB payment to our Payment type
  private mapPaymentFromDb(data: any): Payment {
    // Log the actual data structure from the database for debugging
    console.log('Mapping payment data from DB:', {
      availableFields: Object.keys(data),
      dataTypes: Object.entries(data).reduce((acc, [key, val]) => {
        acc[key] = typeof val;
        return acc;
      }, {})
    });
    
    // Parse webhook payload if it exists
    let webhookPayload = null;
    if (data.webhook_payload) {
      try {
        webhookPayload = typeof data.webhook_payload === 'string' 
          ? JSON.parse(data.webhook_payload)
          : data.webhook_payload;
      } catch (e) {
        console.warn('Failed to parse webhook payload:', e);
      }
    }
    
    // Check for product_id and add it to product_ids if needed
    let productIds = data.product_ids || null;
    
    // If we have a product_id but no product_ids, use that
    if (!productIds && data.product_id) {
      console.log('Found product_id in database record, converting to productIds array:', data.product_id);
      productIds = [data.product_id];
    }
    
    // Use optional chaining to safely handle missing fields
    // Use default values for required fields in our schema
    const payment: Payment = {
      id: data.id,
      userId: data.user_id || 0, // Default to 0 if missing
      orderId: data.order_id || '',
      billId: data.bill_id || null,
      amount: data.amount || 0,
      status: data.status || 'unknown',
      paymentType: data.payment_type || 'unknown',
      featureDuration: data.feature_duration || null,
      productIds: productIds,
      product_id: data.product_id || null, // Add this field even though it's not in the schema
      paymentChannel: data.payment_channel || null,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      createdAt: data.created_at ? new Date(data.created_at) : null,
      updatedAt: data.updated_at ? new Date(data.updated_at) : null,
      metadata: data.metadata || null
    };
    
    console.log('Mapped payment:', {
      id: payment.id,
      status: payment.status,
      productIds: payment.productIds,
      product_id: payment.product_id
    });
    return payment;
  }

  async activateBoostForProducts(productIds: number[], durationHours: number): Promise<void> {
    console.log(`🚀 [SupabaseStorage] Activating boost for products ${productIds.join(', ')} for ${durationHours} hours`);

    if (productIds.length === 0) {
      console.warn('No product IDs provided for boost activation');
      return;
    }

    const currentTime = new Date();
    const expirationTime = new Date(currentTime.getTime() + (durationHours * 60 * 60 * 1000));

    console.log(`Featured period: ${currentTime.toISOString()} to ${expirationTime.toISOString()}`);

    try {
      // Use Supabase transaction for consistency
      const { error } = await supabase.rpc('activate_boost_for_products', {
        p_product_ids: productIds,
        p_duration_hours: durationHours,
        p_current_time: currentTime.toISOString(),
        p_expiration_time: expirationTime.toISOString()
      });

      if (error) {
        console.error('❌ Error calling Supabase RPC for boost activation:', error);
        
        // Fallback to individual updates if RPC fails
        console.log('🔄 Falling back to individual product updates');
        
        for (const productId of productIds) {
          const { error: updateError } = await supabase
            .from('products')
            .update({
              is_featured: true,
              featured_at: currentTime.toISOString(),
              featured_until: expirationTime.toISOString(),
              featured_duration_hours: durationHours,
              status: 'featured',
              updated_at: currentTime.toISOString()
            })
            .eq('id', productId);

          if (updateError) {
            console.error(`❌ Error updating product ${productId}:`, updateError);
            throw new Error(`Failed to update product ${productId}: ${updateError.message}`);
          }

          console.log(`✅ Product ${productId} successfully boosted until ${expirationTime.toISOString()}`);
        }
      } else {
        console.log('✅ RPC call successful for boost activation');
      }

      console.log(`🎉 Successfully activated boost for ${productIds.length} products`);
    } catch (error) {
      console.error('❌ Error activating boost for products:', error);
      throw new Error(`Failed to activate boost for products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateBoostOrder(userId: number, boostPackageId: number, productIds: number[]): Promise<void> {
    console.log(`🔍 [SupabaseStorage] Validating boost order for user ${userId}, package ${boostPackageId}, products: ${productIds.join(', ')}`);
    
    try {
      // Check if package exists and is active
      const { data: boostPackage, error: packageError } = await supabase
        .from('boost_packages')
        .select('*')
        .eq('id', boostPackageId)
        .eq('is_active', true)
        .single();

      if (packageError || !boostPackage) {
        throw new Error('Boost package not found or inactive');
      }

      console.log(`✅ Boost package found: ${boostPackage.name} (${boostPackage.item_count} items, ${boostPackage.duration_hours}h)`);

      // Validate product count matches package limits
      if (productIds.length !== boostPackage.item_count) {
        throw new Error(`Expected ${boostPackage.item_count} products, but received ${productIds.length}`);
      }

      // Verify user owns all selected products
      const { data: userProducts, error: productsError } = await supabase
        .from('products')
        .select('id, seller_id, is_featured, featured_until')
        .in('id', productIds)
        .eq('seller_id', userId);

      if (productsError) {
        console.error('❌ Error checking product ownership:', productsError);
        throw new Error('Failed to validate product ownership');
      }

      if (!userProducts || userProducts.length !== productIds.length) {
        const ownedProductIds = userProducts?.map(p => p.id) || [];
        const notOwnedIds = productIds.filter(id => !ownedProductIds.includes(id));
        throw new Error(`You don't own these products: ${notOwnedIds.join(', ')}`);
      }

      // Check if any products are already featured
      const currentTime = new Date();
      const featuredProducts = userProducts.filter(p => 
        p.is_featured && 
        p.featured_until && 
        new Date(p.featured_until) > currentTime
      );

      if (featuredProducts.length > 0) {
        const featuredIds = featuredProducts.map(p => p.id);
        throw new Error(`Products with IDs ${featuredIds.join(', ')} are already featured`);
      }

      console.log('✅ Boost order validation passed');
    } catch (error) {
      console.error('❌ Error validating boost order:', error);
      throw error;
    }
  }

  async getBoostPackageById(id: number): Promise<BoostPackage | null> {
    console.log(`🔍 [SupabaseStorage] Fetching boost package ID: ${id}`);
    
    try {
      const { data: boostPackage, error } = await supabase
        .from('boost_packages')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('❌ Error fetching boost package:', error);
        return null;
      }

      console.log(`✅ Boost package found: ${boostPackage?.name}`);
      return boostPackage;
    } catch (error) {
      console.error('❌ Error getting boost package:', error);
      return null;
    }
  }
}