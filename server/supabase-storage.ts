import { users, products, categories, reviews, orders, orderItems, productImages } from "@shared/schema";
import type { 
  User, InsertUser, 
  Product, InsertProduct, ProductWithDetails,
  Category, InsertCategory,
  Review, InsertReview,
  Order, InsertOrder, OrderItem, InsertOrderItem, OrderWithItems,
  ProductImage, InsertProductImage
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
import connectPg from "connect-pg-simple";
import session from "express-session";
import pkg from "pg";
const { Pool } = pkg;

// Still need a PostgreSQL pool for session store
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PgSessionStore = connectPg(session);

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
    // Initialize the session store with the PostgreSQL connection
    this.sessionStore = new PgSessionStore({
      pool,
      tableName: 'session'
    });
    
    console.log('SupabaseStorage initialized');
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
    
    return data as User;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !data) {
      console.error('Error getting user by username:', error);
      return undefined;
    }
    
    return data as User;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      console.error('Error getting user by email:', error);
      return undefined;
    }
    
    return data as User;
  }

  async createUser(user: InsertUser): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert([user])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error?.message}`);
    }
    
    return data as User;
  }

  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error updating user:', error);
      throw new Error(`Failed to update user: ${error?.message}`);
    }
    
    return data as User;
  }

  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      console.error('Error getting all users:', error);
      return [];
    }
    
    return data as User[];
  }

  async banUser(id: number, isBanned: boolean): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ isBanned })
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error banning user:', error);
      throw new Error(`Failed to update user ban status: ${error?.message}`);
    }
    
    return data as User;
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
    
    return data as Category[];
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
    
    return data as Category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const { data, error } = await supabase
      .from('categories')
      .insert([category])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating category:', error);
      throw new Error(`Failed to create category: ${error?.message}`);
    }
    
    return data as Category;
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
    const { data, error } = await supabase
      .from('products')
      .insert([product])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating product:', error);
      throw new Error(`Failed to create product: ${error?.message}`);
    }
    
    return data as Product;
  }

  async updateProduct(id: number, product: InsertProduct): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update(product)
      .eq('id', id)
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error updating product:', error);
      throw new Error(`Failed to update product: ${error?.message}`);
    }
    
    return data as Product;
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
    const { data, error } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating order:', error);
      throw new Error(`Failed to create order: ${error?.message}`);
    }
    
    return data as Order;
  }
  
  async addOrderItem(orderItem: InsertOrderItem): Promise<OrderItem> {
    const { data, error } = await supabase
      .from('orderItems')
      .insert([orderItem])
      .select()
      .single();
    
    if (error || !data) {
      console.error('Error creating order item:', error);
      throw new Error(`Failed to create order item: ${error?.message}`);
    }
    
    return data as OrderItem;
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
    
    // Get order items
    const { data: orderItems, error: itemsError } = await supabase
      .from('orderItems')
      .select('*')
      .eq('orderId', id);
    
    if (itemsError) {
      console.error('Error getting order items:', itemsError);
      throw new Error(`Failed to get order items: ${itemsError.message}`);
    }
    
    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', order.userId)
      .single();
    
    if (userError || !user) {
      console.error('Error getting user for order:', userError);
      throw new Error(`User not found for order: ${id}`);
    }
    
    // Get products for each order item
    const items = await Promise.all((orderItems || []).map(async (item) => {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.productId)
        .single();
      
      if (productError || !product) {
        console.error('Error getting product for order item:', productError);
        throw new Error(`Product not found for order item: ${item.id}`);
      }
      
      return { ...item, product } as OrderItem & { product: Product };
    }));
    
    return {
      ...order,
      items,
      user,
    } as OrderWithItems;
  }
  
  async getUserOrders(userId: number): Promise<OrderWithItems[]> {
    const { data: userOrders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false });
    
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
      .order('createdAt', { ascending: false });
    
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
    
    return data as Order;
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
}