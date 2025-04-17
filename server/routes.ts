import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProductSchema, insertReviewSchema, insertProductImageSchema } from "@shared/schema";
import { productImages } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import * as objectStorage from "./object-storage"; // Import the entire module to access all properties
import path from "path"; // Added import for path
import { supabase } from "./supabase"; // Import Supabase for server-side operations
import { createClient } from '@supabase/supabase-js';
import { users } from "@shared/schema"; // Import the users schema for database updates

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Password reset endpoint - server-side fallback for when client-side methods fail
  app.post("/api/update-password", async (req, res) => {
    try {
      console.log('SERVER API: Password reset request received');
      
      // Validate the request body
      const resetSchema = z.object({
        token: z.string().min(1, "Token is required"),
        password: z.string().min(6, "Password must be at least 6 characters")
      });
      
      const { token, password } = resetSchema.parse(req.body);
      
      // Log the request for debugging (not including the password)
      console.log(`SERVER API: Token type: ${token.startsWith('ey') ? 'JWT Token' : 'Custom Token'}`);
      console.log(`SERVER API: Token length: ${token.length} characters`);
      
      // Try multiple approaches to update the password
      let approachResults = [];
      
      // APPROACH 1: Direct updateUser with token
      try {
        console.log('SERVER API: Approach 1 - Setting session with token');
        
        // First try setting the session with the token
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: ''
        });
        
        if (sessionError) {
          console.error('SERVER API: Session error:', sessionError.message);
          approachResults.push(`Approach 1 failed: ${sessionError.message}`);
        } else {
          console.log('SERVER API: Session set successfully', !!sessionData.session);
          
          // Now try to update the password
          const { error: updateError } = await supabase.auth.updateUser({
            password: password
          });
          
          if (!updateError) {
            console.log('SERVER API: Password updated successfully');
            return res.status(200).json({ message: "Password updated successfully" });
          } else {
            console.error('SERVER API: Update error after session:', updateError.message);
            approachResults.push(`Update failed after session: ${updateError.message}`);
          }
        }
      } catch (err: any) {
        console.error('SERVER API: Approach 1 exception:', err.message);
        approachResults.push(`Approach 1 exception: ${err.message}`);
      }
      
      // APPROACH 2: Attempt to decode JWT and use admin capabilities if available
      try {
        console.log('SERVER API: Approach 2 - Trying to extract user ID from token');
        
        // Basic JWT parsing - this is a simplified approach
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            const userId = payload.sub;
            
            if (userId) {
              console.log('SERVER API: Extracted user ID from token:', userId);
              approachResults.push(`Found user ID: ${userId}`);
              
              // APPROACH 2B: Use the admin API with the user ID
              try {
                console.log('SERVER API: Attempting admin update with extracted user ID');
                
                // Create a new admin client with admin key
                const adminKey = process.env.SUPABASE_KEY;
                if (adminKey && adminKey.startsWith('ey')) {
                  const adminClient = createClient(
                    process.env.SUPABASE_URL || '',
                    adminKey,
                    {
                      auth: {
                        autoRefreshToken: false,
                        persistSession: false
                      }
                    }
                  );
                  
                  // First get the user from auth to retrieve their email
                  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
                  
                  if (userError) {
                    console.error('SERVER API: Failed to get user data:', userError.message);
                    approachResults.push(`Failed to get user data: ${userError.message}`);
                  } else if (userData?.user) {
                    console.log('SERVER API: Retrieved user data for:', userData.user.email);
                    
                    // Now update the password in auth.users
                    const { error } = await adminClient.auth.admin.updateUserById(
                      userId,
                      { password: password }
                    );
                    
                    if (error) {
                      console.error('SERVER API: Admin update failed:', error.message);
                      approachResults.push(`Admin update failed: ${error.message}`);
                    } else {
                      console.log('SERVER API: Password updated successfully in auth.users');
                      return res.status(200).json({ message: "Password updated successfully" });
                    }
                  }
                } else {
                  console.log('SERVER API: No valid admin key available');
                  approachResults.push('No valid admin key available');
                }
              } catch (adminErr: any) {
                console.error('SERVER API: Admin update exception:', adminErr.message);
                approachResults.push(`Admin update exception: ${adminErr.message}`);
              }
            } else {
              approachResults.push(`No user ID in token`);
            }
          } catch (err: any) {
            console.error('SERVER API: Failed to parse token payload');
            approachResults.push(`Token payload parsing failed: ${err.message}`);
          }
        } else {
          approachResults.push(`Token does not appear to be a valid JWT format`);
        }
      } catch (err: any) {
        console.error('SERVER API: Approach 2 exception:', err.message);
        approachResults.push(`Approach 2 exception: ${err.message}`);
      }
      
      // APPROACH 3: Last resort - try the original Supabase auth flow with a fresh client
      try {
        console.log('SERVER API: Approach 3 - Last resort direct method');
        
        // Create a separate client for this attempt
        const resetClient = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_KEY || '',
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false
            }
          }
        );
        
        // First try setting a session with this new client
        const { error: sessionError } = await resetClient.auth.setSession({
          access_token: token,
          refresh_token: ''
        });
        
        if (sessionError) {
          console.error('SERVER API: Approach 3 session error:', sessionError.message);
          approachResults.push(`Approach 3 session error: ${sessionError.message}`);
        } else {
          // Try with a direct approach
          const { error } = await resetClient.auth.updateUser({ password });
          
          if (!error) {
            console.log('SERVER API: Password updated successfully with approach 3');
            return res.status(200).json({ message: "Password updated successfully" });
          } else {
            console.error('SERVER API: Update error with approach 3:', error.message);
            approachResults.push(`Approach 3 update error: ${error.message}`);
          }
        }
      } catch (err: any) {
        console.error('SERVER API: Approach 3 exception:', err.message);
        approachResults.push(`Approach 3 exception: ${err.message}`);
      }
      
      // If we got this far, all approaches failed - return detailed information
      console.error('SERVER API: All password reset approaches failed');
      return res.status(400).json({ 
        message: "Invalid or expired password reset token. Please request a new password reset link.",
        details: approachResults
      });
    } catch (error: any) {
      console.error('SERVER API: Password reset error:', error);
      
      // Handle different types of errors
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Invalid request data", 
          details: error.errors 
        });
      }
      
      return res.status(400).json({ // Changed from 500 to 400 to ensure client can handle it consistently
        message: "Failed to reset password: " + (error.message || "Unknown error") 
      });
    }
  });

  // Configure multer for file uploads
  const upload = multer({
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max file size
    },
    fileFilter: (_req, file, cb) => {
      // Accept only image files
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Serve social media preview image
  app.get('/social-preview.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/public/social-preview.jpg'));
  });

  // Categories endpoints
  app.get("/api/categories", async (_req, res, next) => {
    try {
      const categories = await storage.getAllCategories();
      res.json(categories);
    } catch (error) {
      next(error);
    }
  });

  // Products endpoints
  app.get("/api/products", async (req, res, next) => {
    try {
      const { category, brand, minPrice, maxPrice, search } = req.query;
      const products = await storage.getProducts({
        categoryId: category ? Number(category) : undefined,
        brand: brand as string | undefined,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        search: search as string | undefined,
      });
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/products/featured", async (_req, res, next) => {
    try {
      const products = await storage.getFeaturedProducts();
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/products/:id", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/products", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const validatedData = insertProductSchema.parse({
        ...req.body,
        sellerId: req.user.id,
      });

      const product = await storage.createProduct(validatedData);
      res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/products/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only edit your own products" });
      }

      const validatedData = insertProductSchema.parse({
        ...req.body,
        sellerId: req.user.id,
      });

      const updatedProduct = await storage.updateProduct(id, validatedData);
      res.json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/products/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only delete your own products" });
      }

      await storage.deleteProduct(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Product Images endpoints
  app.get("/api/products/:id/images", async (req, res, next) => {
    try {
      const productId = parseInt(req.params.id);
      const images = await storage.getProductImages(productId);
      res.json(images);
    } catch (error) {
      next(error);
    }
  });

  // Endpoint to register product images (metadata only)
  app.post("/api/product-images", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const validatedData = insertProductImageSchema.parse(req.body);

      // Check if the product exists and belongs to the seller
      const product = await storage.getProductById(validatedData.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only add images to your own products" });
      }

      const image = await storage.createProductImage(validatedData);
      res.status(201).json(image);
    } catch (error) {
      next(error);
    }
  });

  // Endpoint to upload the actual image file to object storage
  app.post("/api/product-images/:id/upload", upload.single('image'), async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const imageId = parseInt(req.params.id);

      // Verify the image exists in database
      const result = await db.select().from(productImages).where(eq(productImages.id, imageId));
      if (result.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      const image = result[0];

      // Check if the product belongs to the seller
      const product = await storage.getProductById(image.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only upload images to your own products" });
      }

      // Make sure we have a file
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Get the UUID from the image URL
      const imageUrlParts = image.imageUrl.split('-');
      const uuid = imageUrlParts[imageUrlParts.length - 1];

      // Upload to object storage
      const uploadResult = await objectStorage.uploadProductImage(
        req.file.buffer,
        uuid,
        req.file.mimetype
      );

      if (!uploadResult.success) {
        return res.status(500).json({ message: "Failed to upload image to storage" });
      }

      // Update the image URL in the database to the actual one from object storage
      await db.update(productImages)
        .set({ imageUrl: uploadResult.url })
        .where(eq(productImages.id, imageId));

      res.status(200).json({ 
        message: "Image uploaded successfully",
        url: uploadResult.url
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      next(error);
    }
  });

  app.delete("/api/product-images/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const id = parseInt(req.params.id);

      // Query the database for the specific image by ID
      const result = await db.select().from(productImages).where(eq(productImages.id, id));
      if (result.length === 0) {
        return res.status(404).json({ message: "Image not found" });
      }

      const image = result[0];

      // Check if the product belongs to the seller
      const product = await storage.getProductById(image.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only delete images from your own products" });
      }

      await storage.deleteProductImage(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Cart endpoints
  app.get("/api/cart", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const cartItems = await storage.getCartItems(req.user.id);
      res.json(cartItems);
    } catch (error) {
      next(error);
    }
  });


  // Reviews endpoints
  app.get("/api/products/:id/reviews", async (req, res, next) => {
    try {
      const productId = parseInt(req.params.id);
      const reviews = await storage.getProductReviews(productId);
      res.json(reviews);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/reviews", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = insertReviewSchema.parse({
        ...req.body,
        userId: req.user.id,
      });

      // Check if the product exists
      const product = await storage.getProductById(validatedData.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if user already reviewed this product
      const existingReview = await storage.getUserProductReview(req.user.id, validatedData.productId);
      if (existingReview) {
        return res.status(400).json({ message: "You have already reviewed this product" });
      }

      const review = await storage.createReview(validatedData);
      res.status(201).json(review);
    } catch (error) {
      next(error);
    }
  });

  // Seller-specific endpoints
  app.get("/api/seller/products", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }

      const products = await storage.getSellerProducts(req.user.id);
      res.json(products);
    } catch (error) {
      next(error);
    }
  });

  // Public seller profile endpoints
  app.get("/api/sellers/:id", async (req, res, next) => {
    try {
      const sellerId = parseInt(req.params.id);
      const seller = await storage.getUser(sellerId);

      if (!seller) {
        return res.status(404).json({ message: "Seller not found" });
      }

      if (!seller.isSeller) {
        return res.status(404).json({ message: "User is not a seller" });
      }

      // Return seller profile directly since password is no longer in the schema
      res.json(seller);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sellers/:id/products", async (req, res, next) => {
    try {
      const sellerId = parseInt(req.params.id);
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const category = req.query.category as string | undefined;
      const sort = req.query.sort as string | undefined;

      // Verify the seller exists
      const seller = await storage.getUser(sellerId);
      if (!seller || !seller.isSeller) {
        return res.status(404).json({ message: "Seller not found" });
      }

      // Get all products for this seller
      const products = await storage.getSellerProducts(sellerId);

      // Filter by category if provided
      let filteredProducts = products;
      if (category && category !== "all") {
        filteredProducts = products.filter(p => {
          return p.category?.name.toLowerCase() === category.toLowerCase();
        });
      }

      // Sort products based on sort option
      if (sort) {
        filteredProducts = [...filteredProducts].sort((a, b) => {
          if (sort === "price-low") return a.price - b.price;
          if (sort === "price-high") return b.price - a.price;
          if (sort === "rating") {
            const aRating = a.averageRating || 0;
            const bRating = b.averageRating || 0;
            return bRating - aRating;
          }
          // Default: newest first (by ID as a proxy for creation time)
          return b.id - a.id;
        });
      }

      // Calculate pagination
      const totalProducts = filteredProducts.length;
      const totalPages = Math.ceil(totalProducts / limit);
      const offset = (page - 1) * limit;
      const paginatedProducts = filteredProducts.slice(offset, offset + limit);

      res.json({
        products: paginatedProducts,
        pagination: {
          page,
          limit,
          totalProducts,
          totalPages
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Admin-specific endpoints
  app.get("/api/admin/users", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/users/:id/ban", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const id = parseInt(req.params.id);
      const { isBanned } = z.object({ isBanned: z.boolean() }).parse(req.body);

      // Prevent admins from banning themselves or other admins
      const userToBan = await storage.getUser(id);
      if (!userToBan) {
        return res.status(404).json({ message: "User not found" });
      }

      if (userToBan.isAdmin) {
        return res.status(403).json({ message: "Cannot ban administrator accounts" });
      }

      const updatedUser = await storage.banUser(id, isBanned);
      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/orders", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const orders = await storage.getAllOrders();
      res.json(orders);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/admin/orders/:id/status", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }

      const id = parseInt(req.params.id);
      const { status } = z.object({ 
        status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"])
      }).parse(req.body);

      const order = await storage.getOrderById(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);
      res.json(updatedOrder);
    } catch (error) {
      next(error);
    }
  });

  // Endpoint to serve images
  app.get('/api/images/:imageId', async (req, res, next) => {
    try {
      const { imageId } = req.params;

      // Determine content type based on file extension or default to jpeg
      let contentType = 'image/jpeg';
      if (imageId.endsWith('.png')) contentType = 'image/png';
      if (imageId.endsWith('.gif')) contentType = 'image/gif';
      if (imageId.endsWith('.webp')) contentType = 'image/webp';

      // Get the image from Replit Object Storage
      const imageBuffer = await objectStorage.getImageFromStorage(imageId);

      if (imageBuffer) {
        // If we have the image, send it back with the appropriate content type
        res.setHeader('Content-Type', contentType);
        return res.send(imageBuffer);
      }

      // If we get here, the image was not found
      res.status(404).json({ message: 'Image not found' });
    } catch (error) {
      console.error('Error serving image:', error);
      next(error);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}