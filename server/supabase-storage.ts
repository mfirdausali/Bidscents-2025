import { users, products, categories, reviews, orders, orderItems, productImages, messages } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  Review, InsertReview,
  Order, InsertOrder, OrderItem, InsertOrderItem, OrderWithItems,
  ProductImage, InsertProductImage,
  Message, InsertMessage, MessageWithDetails
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
import session from "express-session";
import createMemoryStore from "memorystore";

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
  sessionStore: any;

  constructor() {
    // Initialize in-memory session store instead of PostgreSQL
    const MemoryStore = createMemoryStore(session);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000 // prune expired entries every 24h
    });
    
    console.log('SupabaseStorage initialized with in-memory session store');
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
      walletBalance: data.wallet_balance,
      isSeller: data.is_seller,
      isAdmin: data.is_admin,
      isBanned: data.is_banned,
      isVerified: data.is_verified,
      shopName: data.shop_name,
      location: data.location,
      bio: data.bio
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

  async createUser(user: InsertUser): Promise<User> {
    // Convert camelCase to snake_case for DB
    const dbUser = {
      username: user.username,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      address: user.address,
      profile_image: user.profileImage,
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
    if (userData.walletBalance !== undefined) dbUserData.wallet_balance = userData.walletBalance;
    if (userData.isSeller !== undefined) dbUserData.is_seller = userData.isSeller;
    if (userData.isAdmin !== undefined) dbUserData.is_admin = userData.isAdmin;
    if (userData.isBanned !== undefined) dbUserData.is_banned = userData.isBanned;
    if (userData.isVerified !== undefined) dbUserData.is_verified = userData.isVerified;
    if (userData.shopName !== undefined) dbUserData.shop_name = userData.shopName;
    if (userData.location !== undefined) dbUserData.location = userData.location;
    if (userData.bio !== undefined) dbUserData.bio = userData.bio;
    
    const { data, error } = await supabase
      .from('users')
      .update(dbUserData)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error updating user:', error);
      throw new Error(`Failed to update user: ${error?.message}`);
    }
    
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
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.error('Error getting product:', error);
      return undefined;
    }
    
    // Convert snake_case to camelCase
    const mappedProduct = this.mapSnakeToCamelCase(data);
    
    // Add product details
    const productsWithDetails = await this.addProductDetails([mappedProduct]);
    return productsWithDetails[0];
  }

  async getFeaturedProducts(): Promise<ProductWithDetails[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_featured', true);
    
    if (error) {
      console.error('Error getting featured products:', error);
      return [];
    }
    
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
      createdAt: product.created_at,
      remainingPercentage: product.remaining_percentage,
      batchCode: product.batch_code,
      purchaseYear: product.purchase_year,
      boxCondition: product.box_condition,
      listingType: product.listing_type,
      volume: product.volume
    };
  }

  async getSellerProducts(sellerId: number): Promise<ProductWithDetails[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('seller_id', sellerId);
    
    if (error) {
      console.error('Error getting seller products:', error);
      return [];
    }
    
    // Convert snake_case to camelCase
    const mappedProducts = (data || []).map(product => this.mapSnakeToCamelCase(product));
    
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
      };
    }));
  }
  
  // Message methods
  async getUserMessages(userId: number): Promise<MessageWithDetails[]> {
    // First get all messages without trying to join users
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error getting user messages:', error);
      throw new Error('Failed to retrieve user messages');
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // Create a unique set of user IDs from sender_id and receiver_id
    const userIds = new Set<number>();
    data.forEach(msg => {
      userIds.add(msg.sender_id);
      userIds.add(msg.receiver_id);
    });
    
    // Fetch user details for all users involved in messages
    const users: Record<number, any> = {};
    
    // We'll use the getUser method to fetch each user since we know it works
    for (const uid of userIds) {
      try {
        const user = await this.getUser(uid);
        if (user) {
          users[uid] = user;
        }
      } catch (err) {
        console.warn(`Could not fetch user ${uid}:`, err);
        // Continue with other users even if one fails
      }
    }
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Map from snake_case to camelCase and decrypt message content
    const messages = data.map(msg => {
      // Decrypt the message content if it's encrypted
      let content = msg.content;
      if (isEncrypted(content)) {
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
        // Add sender and receiver details if available
        sender: users[msg.sender_id],
        receiver: users[msg.receiver_id]
      };
    });
    
    return messages as MessageWithDetails[];
  }
  
  async getConversation(userId1: number, userId2: number): Promise<MessageWithDetails[]> {
    // Get messages without trying to join users table
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error getting conversation:', error);
      throw new Error('Failed to retrieve conversation');
    }
    
    if (!data || data.length === 0) {
      return [];
    }
    
    // We only need these two users
    const user1 = await this.getUser(userId1);
    const user2 = await this.getUser(userId2);
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Map from snake_case to camelCase and decrypt message content
    const messages = data.map(msg => {
      // Decrypt the message content if it's encrypted
      let content = msg.content;
      if (isEncrypted(content)) {
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
        // Add sender and receiver details
        sender: msg.sender_id === userId1 ? user1 : user2,
        receiver: msg.receiver_id === userId1 ? user1 : user2
      };
    });
    
    return messages as MessageWithDetails[];
  }
  
  async getConversationForProduct(userId1: number, userId2: number, productId: number): Promise<MessageWithDetails[]> {
    // Get messages without trying to join users table
    const { data, error } = await supabase
      .from('messages')
      .select('*')
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
    
    // We only need these two users
    const user1 = await this.getUser(userId1);
    const user2 = await this.getUser(userId2);
    
    // Import decryption utility
    const { decryptMessage, isEncrypted } = await import('./encryption');
    
    // Map from snake_case to camelCase and decrypt message content
    const messages = data.map(msg => {
      // Decrypt the message content if it's encrypted
      let content = msg.content;
      if (isEncrypted(content)) {
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
        // Add sender and receiver details
        sender: msg.sender_id === userId1 ? user1 : user2,
        receiver: msg.receiver_id === userId1 ? user1 : user2
      };
    });
    
    return messages as MessageWithDetails[];
  }
  
  async sendMessage(message: InsertMessage): Promise<Message> {
    // Import encryption utility
    const { encryptMessage } = await import('./encryption');
    
    // Encrypt the message content before storing
    const dbMessage = {
      sender_id: message.senderId,
      receiver_id: message.receiverId,
      content: encryptMessage(message.content), // Encrypt the content
      product_id: message.productId || null,
      is_read: message.isRead || false
    };
    
    const { data, error } = await supabase
      .from('messages')
      .insert([dbMessage])
      .select()
      .single();
      
    if (error || !data) {
      console.error('Error sending message:', error);
      throw new Error('Failed to send message');
    }
    
    // Convert snake_case to camelCase
    return {
      id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      content: data.content, // This will be encrypted
      isRead: data.is_read,
      createdAt: new Date(data.created_at),
      productId: data.product_id,
    } as Message;
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
}