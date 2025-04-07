import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProductSchema, insertCartItemSchema, insertReviewSchema, insertProductImageSchema } from "@shared/schema";
import { productImages } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import * as objectStorage from "./object-storage"; // Import the entire module to access all properties

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);
  
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
      const imageUrlParts = image.image_url.split('-');
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
        .set({ image_url: uploadResult.url })
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

  app.post("/api/cart", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = insertCartItemSchema.parse({
        ...req.body,
        userId: req.user.id,
      });
      
      // Check if the product exists
      const product = await storage.getProductById(validatedData.productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Check if the item is already in the cart
      const existingItem = await storage.getCartItemByProductId(req.user.id, validatedData.productId);
      
      if (existingItem) {
        // Update quantity if the item already exists
        const updatedItem = await storage.updateCartItem(
          existingItem.id, 
          existingItem.quantity + (validatedData.quantity || 1)
        );
        return res.json(updatedItem);
      }
      
      // Create new cart item
      const cartItem = await storage.addToCart(validatedData);
      res.status(201).json(cartItem);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/cart/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const id = parseInt(req.params.id);
      const quantity = z.number().min(1).parse(req.body.quantity);
      
      const cartItem = await storage.getCartItemById(id);
      
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      if (cartItem.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only update your own cart" });
      }
      
      const updatedItem = await storage.updateCartItem(id, quantity);
      res.json(updatedItem);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/cart/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const id = parseInt(req.params.id);
      const cartItem = await storage.getCartItemById(id);
      
      if (!cartItem) {
        return res.status(404).json({ message: "Cart item not found" });
      }
      
      if (cartItem.userId !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized: You can only remove items from your own cart" });
      }
      
      await storage.removeFromCart(id);
      res.status(204).send();
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
