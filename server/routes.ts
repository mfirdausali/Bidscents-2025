import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProductSchema, insertReviewSchema, insertProductImageSchema, insertMessageSchema } from "@shared/schema";
import { productImages } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import multer from "multer";
import * as objectStorage from "./object-storage"; // Import the entire module to access all properties
import path from "path"; // Added import for path
import { supabase } from "./supabase"; // Import Supabase for server-side operations
import { createClient } from '@supabase/supabase-js';
import { users } from "@shared/schema"; // Import the users schema for database updates
import { WebSocketServer, WebSocket } from 'ws';
import { encryptMessage, decryptMessage, isEncrypted } from './encryption';
import { generateSellerPreview } from './social-preview';

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);
  
  // Social preview routes for better WhatsApp/Facebook sharing
  app.get("/social/seller/:id", generateSellerPreview);

  // User profile update endpoint
  app.patch("/api/user/:id", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized: Please log in to update your profile" });
      }

      const id = parseInt(req.params.id);
      
      // Users can only update their own profiles
      if (req.user.id !== id && !req.user.isAdmin) {
        return res.status(403).json({ message: "Forbidden: You can only update your own profile" });
      }

      // Create a schema for profile update validation
      const updateSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        address: z.string().optional(),
        profileImage: z.string().optional(),
        shopName: z.string().optional(),
        location: z.string().optional(),
        bio: z.string().optional(),
      });
      
      // Validate and extract the update data
      const updateData = updateSchema.parse(req.body);
      
      // Update the user profile
      const updatedUser = await storage.updateUser(id, updateData);
      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  });



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
  
  // Profile image upload endpoint
  app.post("/api/user/avatar", upload.single('image'), async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized: Please log in to upload a profile image" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Validate the image
      const validationResult = await objectStorage.validateImage(
        req.file.buffer,
        800, // Max width for profile photos
        800, // Max height for profile photos
        2    // Max size in MB
      );

      if (!validationResult.valid) {
        return res.status(400).json({ message: validationResult.message });
      }

      // Upload the profile image
      const uploadResult = await objectStorage.uploadProfileImage(
        req.file.buffer,
        req.user.id,
        req.file.mimetype
      );

      if (!uploadResult.success) {
        return res.status(500).json({ message: "Failed to upload profile image" });
      }

      // Update the user record in the database with the new avatar URL
      const updatedUser = await storage.updateUser(req.user.id, {
        avatarUrl: uploadResult.url
      });

      return res.json({
        message: "Profile image uploaded successfully",
        imageUrl: objectStorage.getImagePublicUrl(uploadResult.url),
        user: updatedUser
      });
    } catch (error) {
      console.error("Error in profile image upload:", error);
      next(error);
    }
  });

  // Cover photo upload endpoint
  app.post("/api/user/cover", upload.single('image'), async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized: Please log in to upload a cover photo" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Validate the image - cover photos can be larger
      const validationResult = await objectStorage.validateImage(
        req.file.buffer,
        2048, // Max width for cover photos
        1024, // Max height for cover photos
        5     // Max size in MB
      );

      if (!validationResult.valid) {
        return res.status(400).json({ message: validationResult.message });
      }

      // Upload the cover photo
      const uploadResult = await objectStorage.uploadCoverPhoto(
        req.file.buffer,
        req.user.id,
        req.file.mimetype
      );

      if (!uploadResult.success) {
        return res.status(500).json({ message: "Failed to upload cover photo" });
      }

      // Update the user record in the database with the new cover photo URL
      const updatedUser = await storage.updateUser(req.user.id, {
        coverPhoto: uploadResult.url
      });

      return res.json({
        message: "Cover photo uploaded successfully",
        imageUrl: objectStorage.getImagePublicUrl(uploadResult.url),
        user: updatedUser
      });
    } catch (error) {
      console.error("Error in cover photo upload:", error);
      next(error);
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
      // First check if the user is authenticated via session
      if (!req.isAuthenticated()) {
        // If not, try to get current user ID from the query parameters
        if (!req.body.sellerId) {
          return res.status(403).json({ message: "Unauthorized: User not authenticated" });
        }
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(req.body.sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        
        // User is verified as a seller, proceed with the same seller ID
        const validatedData = insertProductSchema.parse(req.body);
        const product = await storage.createProduct(validatedData);
        return res.status(201).json(product);
      }
      
      // Normal path for authenticated users
      if (!req.user.isSeller) {
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
      // First check if the user is authenticated via session
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the request body
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only edit your own products" });
      }

      const validatedData = insertProductSchema.parse({
        ...req.body,
        sellerId: sellerId, // Use the determined sellerId
      });

      const updatedProduct = await storage.updateProduct(id, validatedData);
      res.json(updatedProduct);
    } catch (error) {
      next(error);
    }
  });
  
  // Auction endpoints
  app.post("/api/auctions", async (req, res, next) => {
    try {
      console.log("POST /api/auctions called with body:", req.body);
      
      // Check authentication
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          console.log("User is not a seller:", req.user);
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
        console.log("Authenticated seller ID:", sellerId);
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the body
        sellerId = parseInt(req.body.sellerId.toString());
        console.log("Using sellerId from request body:", sellerId);
        
        // Verify this user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          console.log("User not found with ID:", sellerId);
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          console.log("User is not a seller:", userCheck);
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        console.log("No authentication or sellerId provided");
        return res.status(403).json({ message: "Unauthorized: Must be a seller to create auctions" });
      }
      
      // Get the product ID from the request body
      const productId = parseInt(req.body.productId?.toString() || "0");
      console.log("Product ID for auction:", productId);
      
      if (productId <= 0) {
        console.log("Invalid product ID:", productId);
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      // Verify the product exists and belongs to this seller
      const product = await storage.getProductById(productId);
      if (!product) {
        console.log("Product not found with ID:", productId);
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        console.log(`Product seller ID (${product.sellerId}) doesn't match the authenticated seller ID (${sellerId})`);
        return res.status(403).json({ message: "Unauthorized: You can only create auctions for your own products" });
      }
      
      console.log("Validated auction data:", req.body);
      console.log("End date format:", req.body.endsAt);
      
      // Set starts_at to current date if not specified
      if (!req.body.startsAt) {
        req.body.startsAt = new Date().toISOString();
        console.log("Setting starts_at to current time:", req.body.startsAt);
      }
      
      // Parse the auction data
      try {
        // Create the auction
        console.log("Creating auction in database...");
        const auction = await storage.createAuction(req.body);
        console.log("Auction created successfully:", auction);
        return res.status(200).json(auction);
      } catch (createError) {
        console.error("Error creating auction:", createError);
        throw createError;
      }
    } catch (error) {
      console.error("Error processing auction creation:", error);
      next(error);
    }
  });
  
  // Get all auctions
  app.get("/api/auctions", async (req, res, next) => {
    try {
      console.log("Getting all auctions");
      const auctions = await storage.getAuctions();
      console.log(`Retrieved ${auctions?.length || 0} auctions`);
      res.json(auctions || []);
    } catch (error) {
      console.error("Error fetching auctions:", error);
      next(error);
    }
  });
  
  // Get auction by ID
  app.get("/api/auctions/:id", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`Getting auction with ID: ${id}`);
      
      const auction = await storage.getAuctionById(id);
      if (!auction) {
        console.log(`Auction not found with ID: ${id}`);
        return res.status(404).json({ message: "Auction not found" });
      }
      
      console.log("Retrieved auction:", auction);
      res.json(auction);
    } catch (error) {
      console.error(`Error getting auction: ${error}`);
      next(error);
    }
  });

  app.delete("/api/products/:id", async (req, res, next) => {
    try {
      // First check if the user is authenticated via session
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
      } else if (req.query.sellerId) {
        // If not via session, check if sellerId was provided in the query parameter
        sellerId = parseInt(req.query.sellerId as string);
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const id = parseInt(req.params.id);
      const product = await storage.getProductById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only delete your own products" });
      }

      // Delete all associated images first
      try {
        const productImages = await storage.getProductImages(id);
        console.log(`Deleting ${productImages.length} images for product ${id}`);
        
        for (const image of productImages) {
          // Always try to delete from object storage if we have an imageUrl
          if (image.imageUrl) {
            const deleteResult = await objectStorage.deleteProductImage(image.imageUrl);
            console.log(`Deleted image ${image.imageUrl} from storage: ${deleteResult ? 'success' : 'failed'}`);
          }
          // Also remove from database
          await storage.deleteProductImage(image.id);
        }
      } catch (err) {
        console.error("Error deleting product images:", err);
        // Continue with product deletion even if image deletion fails
      }

      await storage.deleteProduct(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Get all images for a product
  app.get("/api/products/:id/images", async (req, res, next) => {
    try {
      const productId = parseInt(req.params.id);
      const images = await storage.getProductImages(productId);
      res.json(images);
    } catch (error) {
      next(error);
    }
  });

  // Image upload endpoint - creates a product image and uploads the file
  app.post("/api/products/:id/images", upload.single('image'), async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
      } else if (req.query.sellerId) {
        // If not via session, check if sellerId was provided in query
        sellerId = parseInt(req.query.sellerId as string);
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      // Get product ID from URL
      const productId = parseInt(req.params.id);
      
      // Verify the product exists and belongs to the seller
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only add images to your own products" });
      }
      
      // Make sure we have a file
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Generate a UUID for the image
      const uuid = objectStorage.generateImageId();
      
      // Create image record in database
      const productImage = await storage.createProductImage({
        productId,
        imageUrl: uuid,
        imageOrder: req.body.imageOrder ? parseInt(req.body.imageOrder) : 0,
        imageName: req.file.originalname || 'unnamed'
      });
      
      // Upload the file to object storage
      const uploadResult = await objectStorage.uploadProductImage(
        req.file.buffer,
        uuid,
        req.file.mimetype
      );
      
      if (!uploadResult.success) {
        // Clean up if upload fails
        await storage.deleteProductImage(productImage.id);
        return res.status(500).json({ message: "Failed to upload image to storage" });
      }
      
      // Return success response
      res.status(201).json({
        ...productImage,
        url: objectStorage.getImagePublicUrl(uuid),
        message: "Image uploaded successfully"
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/products/:productId/images/:imageId", async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
      } else if (req.query.sellerId) {
        // If not via session, check if sellerId was provided in query
        sellerId = parseInt(req.query.sellerId as string);
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      const productId = parseInt(req.params.productId);
      const imageId = parseInt(req.params.imageId);
      
      // Verify the product exists and belongs to the seller
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only delete images from your own products" });
      }
      
      // Get the image record
      const images = await storage.getProductImages(productId);
      const image = images.find(img => img.id === imageId);
      
      if (!image) {
        return res.status(404).json({ message: "Image not found" });
      }
      
      // Delete the image from object storage
      if (image.imageUrl) {
        const deleteResult = await objectStorage.deleteProductImage(image.imageUrl);
        console.log(`Deleted individual image ${image.imageUrl} from storage: ${deleteResult ? 'success' : 'failed'}`);
      }
      
      // Delete from database
      await storage.deleteProductImage(imageId);
      
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
      // Check if user is authenticated via session
      if (req.isAuthenticated() && req.user.isSeller) {
        const products = await storage.getSellerProducts(req.user.id);
        return res.json(products);
      }
      
      // If not authenticated via session, check for sellerId in query parameter
      const sellerId = req.query.sellerId ? parseInt(req.query.sellerId as string) : null;
      if (!sellerId) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }
      
      // Verify user exists and is a seller
      const userCheck = await storage.getUser(sellerId);
      if (!userCheck) {
        return res.status(403).json({ message: "Unauthorized: User not found" });
      }
      
      if (!userCheck.isSeller) {
        return res.status(403).json({ message: "Unauthorized: Seller account required" });
      }
      
      // User is verified as a seller, get their products
      const products = await storage.getSellerProducts(sellerId);
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
      
      console.log(`Attempting to retrieve image with ID: ${imageId}`);

      // Determine content type based on file extension or default to jpeg
      let contentType = 'image/jpeg';
      if (imageId.endsWith('.png')) contentType = 'image/png';
      if (imageId.endsWith('.gif')) contentType = 'image/gif';
      if (imageId.endsWith('.webp')) contentType = 'image/webp';

      // Get the image from Replit Object Storage using the function from object-storage.ts
      const imageBuffer = await objectStorage.getImageFromStorage(imageId);

      if (imageBuffer) {
        console.log(`Image ${imageId} found - serving with content type ${contentType}`);
        // If we have the image, send it back with the appropriate content type
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(imageBuffer);
      }

      console.log(`Image ${imageId} not found in storage`);
      // If we get here, the image was not found
      res.status(404).json({ message: 'Image not found' });
    } catch (error) {
      console.error('Error serving image:', error);
      next(error);
    }
  });

  // Facebook OAuth callback endpoint
  app.post('/api/auth/sync-oauth-user', async (req, res) => {
    try {
      const { email, providerId, provider } = req.body;

      if (!email || !providerId || !provider) {
        return res.status(400).json({ message: 'Missing required OAuth information' });
      }

      // First, check if we already have a user with this email
      let user = await storage.getUserByEmail(email);

      if (user) {
        // User exists - log them in
        req.login(user, (err) => {
          if (err) {
            console.error('Error in OAuth login session:', err);
            return res.status(500).json({ message: 'Failed to create session' });
          }
          return res.status(200).json({ user });
        });
      } else {
        // User doesn't exist - create a new account
        // Generate a username from email
        const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        let username = baseUsername;
        let counter = 1;
        
        // Check if username is taken, if so, increment counter until we find a free one
        while (await storage.getUserByUsername(username)) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Create the user
        const newUser = await storage.createUser({
          email,
          username,
          firstName: null,
          lastName: null,
          address: null,
          profileImage: null,
          walletBalance: 0,
          isSeller: true,
          isAdmin: false,
          isBanned: false
        });

        // Log the new user in
        req.login(newUser, (err) => {
          if (err) {
            console.error('Error in OAuth registration session:', err);
            return res.status(500).json({ message: 'Failed to create session' });
          }
          return res.status(201).json({ user: newUser });
        });
      }
    } catch (error) {
      console.error('Error syncing OAuth user:', error);
      res.status(500).json({ message: 'Failed to process OAuth login' });
    }
  });

  // Handle the /api/product-images endpoint for backward compatibility
  app.post("/api/product-images", async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the request body
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      // Get product ID from request body
      const productId = req.body.productId;
      
      // Verify the product exists and belongs to the seller
      const product = await storage.getProductById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only add images to your own products" });
      }
      
      // IMPORTANT: Use the exact UUID provided in the request
      // This ensures the database and object storage use the same ID
      // Don't generate another UUID here
      
      // Create image record in database with the provided imageUrl
      const productImage = await storage.createProductImage({
        productId,
        imageUrl: req.body.imageUrl,
        imageOrder: req.body.imageOrder,
        imageName: req.body.imageName || 'unnamed'
      });
      
      // Log for debugging
      console.log(`Created new product image record:`, productImage);
      
      res.status(200).json(productImage);
    } catch (error) {
      next(error);
    }
  });

  // Handle the /api/product-images/:id/upload endpoint for backward compatibility
  app.post("/api/product-images/:id/upload", upload.single('image'), async (req, res, next) => {
    try {
      // Check authentication
      let sellerId = 0;
      if (req.isAuthenticated() && req.user) {
        if (!req.user.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
        sellerId = req.user.id;
      } else if (req.body.sellerId) {
        // If not via session, check if sellerId was provided in the form data
        sellerId = parseInt(req.body.sellerId.toString());
        
        // Verify user exists and is a seller
        const userCheck = await storage.getUser(sellerId);
        if (!userCheck) {
          return res.status(403).json({ message: "Unauthorized: User not found" });
        }
        
        if (!userCheck.isSeller) {
          return res.status(403).json({ message: "Unauthorized: Seller account required" });
        }
      } else {
        return res.status(403).json({ message: "Unauthorized: User not authenticated" });
      }

      // Get image ID from URL
      const imageId = parseInt(req.params.id);
      
      console.log(`Looking for product image with id ${imageId}`);
      
      // Since we're having issues with the database method, use a direct approach
      // Get the product images from all products
      let foundProductImage = null;
      const allProducts = await storage.getProducts();
      for (const product of allProducts) {
        if (product.images) {
          for (const image of product.images) {
            if (image.id === imageId) {
              foundProductImage = image;
              break;
            }
          }
          if (foundProductImage) break;
        }
      }
      
      console.log(`Found product image:`, foundProductImage);
      
      if (!foundProductImage) {
        return res.status(404).json({ message: "Product image record not found" });
      }
      
      // Verify the product belongs to the seller
      const product = await storage.getProductById(foundProductImage.productId);
      if (!product) {
        return res.status(404).json({ message: "Associated product not found" });
      }
      
      if (product.sellerId !== sellerId) {
        return res.status(403).json({ message: "Unauthorized: You can only upload images to your own products" });
      }
      
      // Make sure we have a file
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }
      
      // Extract the UUID from the placeholder URL
      let imageUrl = foundProductImage.imageUrl;
      
      console.log(`Attempting to upload image to object storage with ID: ${imageUrl}`);
      console.log(`Image size: ${req.file.size} bytes, type: ${req.file.mimetype}`);
      
      // Upload the file to object storage
      const uploadResult = await objectStorage.uploadProductImage(
        req.file.buffer,
        imageUrl,
        req.file.mimetype
      );
      
      console.log(`Upload result:`, uploadResult);
      
      if (!uploadResult.success) {
        return res.status(500).json({ message: "Failed to upload image to storage" });
      }
      
      // Return success response
      res.status(200).json({
        ...foundProductImage,
        url: objectStorage.getImagePublicUrl(imageUrl),
        message: "Image uploaded successfully"
      });
    } catch (error) {
      console.error("Error in upload handler:", error);
      next(error);
    }
  });
  
  // Messaging API endpoints
  // Get all messages for authenticated user
  app.get("/api/messages", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.isAuthenticated()) {
        return res.status(403).json({ message: "Unauthorized: Must be logged in to access messages" });
      }
      
      const userId = req.user.id;
      const messages = await storage.getUserMessages(userId);
      
      // Decrypt message content
      const decryptedMessages = messages.map(msg => ({
        ...msg,
        content: msg.content ? decryptMessage(msg.content) : msg.content
      }));
      
      res.json(decryptedMessages);
    } catch (error) {
      next(error);
    }
  });
  
  // Get conversation between two users
  app.get("/api/messages/conversation/:userId", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.isAuthenticated()) {
        return res.status(403).json({ message: "Unauthorized: Must be logged in to access messages" });
      }
      
      const currentUserId = req.user.id;
      const otherUserId = parseInt(req.params.userId);
      
      if (isNaN(otherUserId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }
      
      // Get productId from query params if available for product-specific conversations
      const productId = req.query.productId ? parseInt(req.query.productId as string) : undefined;
      
      let conversation;
      if (productId && !isNaN(productId)) {
        conversation = await storage.getConversationForProduct(currentUserId, otherUserId, productId);
      } else {
        conversation = await storage.getConversation(currentUserId, otherUserId);
      }
      
      // Decrypt message content
      const decryptedConversation = conversation.map(msg => ({
        ...msg,
        content: msg.content ? decryptMessage(msg.content) : msg.content
      }));
      
      res.json(decryptedConversation);
    } catch (error) {
      next(error);
    }
  });
  
  // Mark messages as read
  app.post("/api/messages/mark-read", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.isAuthenticated()) {
        return res.status(403).json({ message: "Unauthorized: Must be logged in to update messages" });
      }
      
      // Validate request body
      const schema = z.object({
        messageId: z.number().optional(),
        senderId: z.number().optional(),
      }).refine(data => data.messageId !== undefined || data.senderId !== undefined, {
        message: "Either messageId or senderId must be provided"
      });
      
      const { messageId, senderId } = schema.parse(req.body);
      const currentUserId = req.user.id;
      
      if (messageId) {
        // Mark a single message as read
        await storage.markMessageAsRead(messageId);
      } else if (senderId) {
        // Mark all messages from a sender as read
        await storage.markAllMessagesAsRead(currentUserId, senderId);
      }
      
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  
  // Create WebSocket server for real-time messaging and auction updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Map of connected users: userId -> WebSocket connection
  const connectedUsers = new Map<number, WebSocket>();
  
  // Map of auction rooms: auctionId -> Set of WebSocket connections
  const auctionRooms = new Map<number, Set<WebSocket>>();
  
  // WebSocket connection handler
  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection established');
    let userId: number | null = null;
    
    // Handle messages from clients
    ws.on('message', async (messageData: string) => {
      try {
        const data = JSON.parse(messageData.toString());
        
        // Handle authentication
        if (data.type === 'auth') {
          userId = parseInt(data.userId);
          if (isNaN(userId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid user ID' }));
            return;
          }
          
          // Store connection for this user
          connectedUsers.set(userId, ws);
          console.log(`User ${userId} authenticated on WebSocket`);
          
          // Send connection confirmation
          ws.send(JSON.stringify({ type: 'auth_success', userId }));
          return;
        }
        
        // All other message types require authentication
        if (!userId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }
        
        // Handle sending a new message
        if (data.type === 'send_message') {
          try {
            // Validate message data
            const messageSchema = z.object({
              senderId: z.number(),
              receiverId: z.number(),
              content: z.string().min(1),
              productId: z.number().optional(),
            });
            
            const messageData = messageSchema.parse({
              senderId: userId, // Use authenticated user ID as sender
              receiverId: data.receiverId,
              content: data.content,
              productId: data.productId,
            });
            
            // Encrypt the message content before saving
            const encryptedContent = encryptMessage(messageData.content);
            
            // Save the encrypted message to database
            const savedMessage = await storage.sendMessage({
              ...messageData,
              content: encryptedContent
            });
            
            // Get sender details
            const sender = await storage.getUser(userId);
            
            // Get receiver details
            const receiver = await storage.getUser(data.receiverId);
            
            // Get product details if available
            let product = null;
            if (data.productId) {
              try {
                product = await storage.getProductById(data.productId);
              } catch (err) {
                console.warn('Product not found for message:', data.productId);
              }
            }
            
            // Create a detailed message object with all necessary info
            // Decrypt the message content before sending it back to clients
            const detailedMessage = {
              ...savedMessage,
              // Replace encrypted content with original content for sending to clients
              content: messageData.content, 
              sender: sender ? {
                id: sender.id,
                username: sender.username,
                profileImage: sender.profileImage
              } : undefined,
              receiver: receiver ? {
                id: receiver.id,
                username: receiver.username,
                profileImage: receiver.profileImage
              } : undefined,
              product: product ? {
                id: product.id,
                name: product.name,
                imageUrl: product.imageUrl
              } : undefined
            };
            
            // Send confirmation to sender
            ws.send(JSON.stringify({ 
              type: 'message_sent', 
              message: detailedMessage
            }));
            
            // Send notification to receiver if they're connected
            const receiverWs = connectedUsers.get(data.receiverId);
            if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
              receiverWs.send(JSON.stringify({ 
                type: 'new_message', 
                message: detailedMessage
              }));
            }
          } catch (error: any) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to send message: ' + (error.message || 'Unknown error')
            }));
          }
          return;
        }
        
        // Handle marking messages as read
        if (data.type === 'mark_read') {
          try {
            if (data.messageId) {
              // Mark a single message as read
              await storage.markMessageAsRead(data.messageId);
            } else if (data.senderId) {
              // Mark all messages from a specific sender as read
              await storage.markAllMessagesAsRead(userId, data.senderId);
            }
            
            // Send confirmation
            ws.send(JSON.stringify({ type: 'messages_marked_read' }));
            
            // Notify the sender that their messages were read
            if (data.senderId) {
              const senderWs = connectedUsers.get(data.senderId);
              if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                senderWs.send(JSON.stringify({ 
                  type: 'messages_read_by', 
                  userId: userId 
                }));
              }
            }
          } catch (error: any) {
            console.error('Error marking messages as read:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to mark messages as read: ' + (error.message || 'Unknown error')
            }));
          }
          return;
        }
        
        // Handle joining an auction room
        if (data.type === 'joinAuction') {
          try {
            // Validate auction ID
            const auctionId = parseInt(data.auctionId);
            if (isNaN(auctionId)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid auction ID' }));
              return;
            }
            
            // Get the auction room, create if it doesn't exist
            let room = auctionRooms.get(auctionId);
            if (!room) {
              room = new Set<WebSocket>();
              auctionRooms.set(auctionId, room);
            }
            
            // Add this connection to the room
            room.add(ws);
            joinedAuctions.add(auctionId);
            
            console.log(`User ${userId} joined auction room ${auctionId}`);
            ws.send(JSON.stringify({ 
              type: 'joinedAuction', 
              auctionId, 
              message: `Joined auction room ${auctionId}` 
            }));
            
            // Notify about active viewers (optional)
            const viewerCount = room.size;
            Array.from(room).forEach(connection => {
              if (connection.readyState === WebSocket.OPEN) {
                connection.send(JSON.stringify({
                  type: 'auctionViewers',
                  auctionId,
                  count: viewerCount
                }));
              }
            });
            
            return;
          } catch (error: any) {
            console.error('Error joining auction room:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to join auction room: ' + (error.message || 'Unknown error')
            }));
            return;
          }
        }
        
        // Handle leaving an auction room
        if (data.type === 'leaveAuction') {
          try {
            const auctionId = parseInt(data.auctionId);
            if (isNaN(auctionId)) {
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid auction ID' }));
              return;
            }
            
            // Remove connection from the room
            const room = auctionRooms.get(auctionId);
            if (room) {
              room.delete(ws);
              joinedAuctions.delete(auctionId);
              
              // If room is empty, delete it
              if (room.size === 0) {
                auctionRooms.delete(auctionId);
              } else {
                // Notify remaining users about viewer count
                Array.from(room).forEach(connection => {
                  if (connection.readyState === WebSocket.OPEN) {
                    connection.send(JSON.stringify({
                      type: 'auctionViewers',
                      auctionId,
                      count: room.size
                    }));
                  }
                });
              }
              
              console.log(`User ${userId} left auction room ${auctionId}`);
              ws.send(JSON.stringify({ 
                type: 'leftAuction', 
                auctionId,
                message: `Left auction room ${auctionId}` 
              }));
            }
            
            return;
          } catch (error: any) {
            console.error('Error leaving auction room:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to leave auction room: ' + (error.message || 'Unknown error')
            }));
            return;
          }
        }
        
        // Handle placing a bid
        if (data.type === 'placeBid') {
          try {
            const { auctionId, amount } = data;
            
            // Validate auction ID and bid amount
            if (isNaN(parseInt(auctionId)) || isNaN(parseFloat(amount))) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid auction ID or bid amount' 
              }));
              return;
            }
            
            // Get the auction
            const auction = await storage.getAuctionById(parseInt(auctionId));
            if (!auction) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Auction not found' 
              }));
              return;
            }
            
            // Check if auction is active
            const now = new Date();
            const endsAt = new Date(auction.endsAt);
            if (now > endsAt) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Auction has ended' 
              }));
              return;
            }
            
            // Check if the bid is high enough
            const minBid = (auction.currentBid || auction.startingPrice) + auction.bidIncrement;
            if (parseFloat(amount) < minBid) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: `Bid must be at least ${minBid}` 
              }));
              return;
            }
            
            // Create the bid in the database
            const bid = await storage.createBid({
              auctionId: parseInt(auctionId),
              bidderId: userId,
              amount: parseFloat(amount),
              isWinning: true
            });
            
            // Get bidder information
            const bidder = await storage.getUser(userId);
            
            // Add bidder name to bid
            const bidWithDetails = {
              ...bid,
              bidder: bidder?.username || `User #${userId}`
            };
            
            // Update the auction's current bid and bidder
            // Note: In a real implementation, this should be a transaction
            // to ensure bid placement and auction update happen atomically
            
            // Notify all users in the auction room
            const room = auctionRooms.get(parseInt(auctionId));
            if (room) {
              Array.from(room).forEach(connection => {
                if (connection.readyState === WebSocket.OPEN) {
                  connection.send(JSON.stringify({
                    type: 'newBid',
                    auctionId: parseInt(auctionId),
                    bid: bidWithDetails
                  }));
                }
              });
            }
            
            console.log(`User ${userId} placed bid of ${amount} on auction ${auctionId}`);
            return;
          } catch (error: any) {
            console.error('Error placing bid:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to place bid: ' + (error.message || 'Unknown error')
            }));
            return;
          }
        }
        
        // Unknown message type
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        
      } catch (error: any) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid message format' 
        }));
      }
    });
    
    // Keep track of joined auction rooms for this connection
    const joinedAuctions = new Set<number>();
    
    // Handle disconnection
    ws.on('close', () => {
      // Clean up user connection
      if (userId) {
        console.log(`User ${userId} disconnected from WebSocket`);
        connectedUsers.delete(userId);
      }
      
      // Clean up auction room memberships
      joinedAuctions.forEach(auctionId => {
        const room = auctionRooms.get(auctionId);
        if (room) {
          room.delete(ws);
          
          // If the room is empty, delete it
          if (room.size === 0) {
            auctionRooms.delete(auctionId);
          }
        }
      });
    });
    
    // Send initial connection message
    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to BidScents messaging server' }));
  });
  
  // GET /api/auctions - Get all auctions
  app.get('/api/auctions', async (req, res) => {
    try {
      const auctions = await storage.getAuctions();
      
      // Enhance auctions with bid counts
      const enhancedAuctions = await Promise.all(auctions.map(async (auction) => {
        const bids = await storage.getBidsForAuction(auction.id);
        return {
          ...auction,
          bidCount: bids.length
        };
      }));
      
      res.json(enhancedAuctions);
    } catch (error) {
      console.error('Error getting auctions:', error);
      res.status(500).json({ message: 'Error retrieving auctions' });
    }
  });
  
  // GET /api/auctions/:id - Get auction by ID
  app.get('/api/auctions/:id', async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuctionById(auctionId);
      
      if (!auction) {
        return res.status(404).json({ message: 'Auction not found' });
      }
      
      // Get bids for this auction
      const bids = await storage.getBidsForAuction(auction.id);
      
      // Get product details
      console.log(`Looking up product ID ${auction.productId} for auction ${auctionId}`);
      let product;
      try {
        product = await storage.getProductById(auction.productId);
        
        if (!product) {
          console.log(`Product with ID ${auction.productId} not found for auction ${auctionId}`);
          // Return auction without product, with special message that client can handle
          return res.status(200).json({ 
            ...auction, 
            bidCount: bids.length,
            bids,
            message: 'Product not found'
          });
        }
        
        console.log(`Found product for auction ${auctionId}:`, product.name);
      } catch (productError) {
        console.error(`Error retrieving product ${auction.productId} for auction ${auctionId}:`, productError);
        // Return auction without product, with special message that client can handle
        return res.status(200).json({ 
          ...auction, 
          bidCount: bids.length,
          bids,
          message: 'Error retrieving product details'
        });
      }
      
      // Combine auction with bid count and product details
      const auctionWithDetails = {
        ...auction,
        bidCount: bids.length,
        bids,
        product
      };
      
      res.json(auctionWithDetails);
    } catch (error) {
      console.error('Error getting auction details:', error);
      res.status(500).json({ message: 'Error retrieving auction details' });
    }
  });
  
  // GET /api/products/:id/auctions - Get auctions for a product
  app.get('/api/products/:id/auctions', async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const auctions = await storage.getProductAuctions(productId);
      
      // Enhance auctions with bid counts
      const enhancedAuctions = await Promise.all(auctions.map(async (auction) => {
        const bids = await storage.getBidsForAuction(auction.id);
        return {
          ...auction,
          bidCount: bids.length
        };
      }));
      
      res.json(enhancedAuctions);
    } catch (error) {
      console.error('Error getting product auctions:', error);
      res.status(500).json({ message: 'Error retrieving product auctions' });
    }
  });
  
  return httpServer;
}