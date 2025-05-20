import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProductSchema, insertReviewSchema, insertProductImageSchema, insertMessageSchema, insertPaymentSchema } from "@shared/schema";
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
import * as billplz from './billplz';
import crypto from 'crypto';

/**
 * Helper function to determine if we're in a sandbox environment
 * This is used throughout the payment processing system
 */
function isBillplzSandbox(): boolean {
  return process.env.BILLPLZ_BASE_URL?.includes('sandbox') ?? true;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);
  
  // Raw query middleware specifically for Billplz redirect
  // This captures the original query string before Express parses it
  app.use('/api/payments/process-redirect', (req: Request & { rawQuery?: string }, res: Response, next: NextFunction) => {
    // Extract the raw query string from the original URL
    req.rawQuery = req.originalUrl.split('?')[1] || '';
    console.log('🔍 RAW QUERY CAPTURED:', req.rawQuery);
    
    // Debug info about the request
    console.log('🔍 REDIRECT REQUEST DETAILS:');
    console.log('> Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    console.log('> Host:', req.get('host'));
    console.log('> Original URL:', req.originalUrl);
    console.log('> Path:', req.path);
    console.log('> Headers:', JSON.stringify(req.headers, null, 2));
    
    next();
  });
  
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

  // Configure multer for image uploads
  const imageUpload = multer({
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
  
  // Configure multer for message file uploads (images, pdfs, etc.)
  const messageFileUpload = multer({
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
    fileFilter: (_req, file, cb) => {
      // Accept image files, PDFs, and other common document types
      const allowedMimeTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only images, PDFs, and common document types are allowed'));
      }
    }
  });

  // Serve social media preview image
  app.get('/social-preview.jpg', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/public/social-preview.jpg'));
  });
  
  // Profile image upload endpoint
  app.post("/api/user/avatar", imageUpload.single('image'), async (req, res, next) => {
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
  app.post("/api/user/cover", imageUpload.single('image'), async (req, res, next) => {
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
  
  // Get all products (for admin dashboard)
  app.get("/api/products/all", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }
      
      // Get all products with seller information
      const products = await storage.getAllProductsWithDetails();
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
  
  // Basic auction details (deprecated, use the complete route below instead)
  // This route is kept for backward compatibility
  app.get("/api/auctions/:id/basic", async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`Getting basic auction with ID: ${id}`);
      
      const auction = await storage.getAuctionById(id);
      if (!auction) {
        console.log(`Auction not found with ID: ${id}`);
        return res.status(404).json({ message: "Auction not found" });
      }
      
      console.log("Retrieved basic auction:", auction);
      res.json(auction);
    } catch (error) {
      console.error(`Error getting basic auction: ${error}`);
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
  app.post("/api/products/:id/images", imageUpload.single('image'), async (req, res, next) => {
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
      
      // Filter by status if provided (active, pending, sold, etc.)
      const status = req.query.status as string | undefined;
      
      // Filter by category and status if provided
      let filteredProducts = products;
      
      if (status) {
        filteredProducts = filteredProducts.filter(p => {
          return p.status?.toLowerCase() === status.toLowerCase();
        });
      }
      
      if (category && category !== "all") {
        filteredProducts = filteredProducts.filter(p => {
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
  
  // Admin route to remove a product listing and notify the seller
  app.post("/api/admin/products/:id/remove", async (req, res, next) => {
    try {
      if (!req.isAuthenticated() || !req.user.isAdmin) {
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }
      
      const id = parseInt(req.params.id);
      const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body);
      
      // Fetch the product to get seller information
      const product = await storage.getProductById(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      // Get seller information
      const seller = await storage.getUser(product.sellerId);
      if (!seller) {
        return res.status(404).json({ message: "Seller not found" });
      }
      
      // Send notification to seller before deleting the product
      const messageContent = `Your listing "${product.name}" has been removed by an administrator for the following reason: ${reason}. If you believe this was done in error, please contact support.`;
      
      const ADMIN_USER_ID = 32; // The ID of the admin account used for system messages
      
      await storage.sendMessage({
        senderId: ADMIN_USER_ID,
        receiverId: seller.id,
        content: messageContent,
        productId: product.id,
        isRead: false
      });
      
      // Check if product has an associated auction and delete it
      try {
        const auctions = await storage.getProductAuctions(id);
        if (auctions && auctions.length > 0) {
          console.log(`Admin deleting ${auctions.length} auctions for product #${id}`);
          for (const auction of auctions) {
            await storage.deleteAuction(auction.id);
          }
        }
      } catch (err) {
        console.error(`Error deleting associated auctions for product #${id}:`, err);
        // Continue with product deletion even if auction deletion fails
      }
      
      // Now delete product images from object storage and database
      try {
        const productImages = await storage.getProductImages(id);
        console.log(`Admin deleting ${productImages.length} images for product #${id}`);
        
        for (const image of productImages) {
          // Delete from object storage
          if (image.imageUrl) {
            const deleteResult = await objectStorage.deleteProductImage(image.imageUrl);
            console.log(`Deleted image ${image.imageUrl} from storage: ${deleteResult ? 'success' : 'failed'}`);
          }
          // Delete from database
          await storage.deleteProductImage(image.id);
        }
      } catch (err) {
        console.error(`Error deleting product images for product #${id}:`, err);
        // Continue with product deletion even if image deletion fails
      }
      
      // Finally, delete the product itself
      await storage.deleteProduct(id);
      
      console.log(`Admin completely deleted product #${id}, message sent to seller #${seller.id}`);
      
      res.json({ 
        message: "Product listing completely removed and seller notified",
        productId: id
      });
    } catch (error) {
      next(error);
    }
  });

  // Message file upload endpoint
  app.post("/api/messages/upload-file", messageFileUpload.single('file'), async (req, res, next) => {
    try {
      console.log("File upload request received");
      
      if (!req.isAuthenticated()) {
        console.log("Authentication check failed");
        return res.status(401).json({ message: "Unauthorized: Please log in to upload files" });
      }

      if (!req.file) {
        console.log("No file found in request");
        return res.status(400).json({ message: "No file provided" });
      }
      console.log(`File received: ${req.file.originalname}, size: ${req.file.size}, type: ${req.file.mimetype}`);
      
      if (!req.body.receiverId) {
        console.log("No receiver ID found in request");
        return res.status(400).json({ message: "Receiver ID is required" });
      }
      console.log(`Receiver ID: ${req.body.receiverId}`);
      
      if (req.body.productId) {
        console.log(`Product ID: ${req.body.productId}`);
      }
      
      // Set proper content type header for JSON response
      res.setHeader('Content-Type', 'application/json');
      
      // Upload the file to the message files bucket
      console.log("Uploading file to object storage...");
      const uploadResult = await objectStorage.uploadMessageFile(
        req.file.buffer,
        req.file.mimetype
      );
      
      if (!uploadResult.success) {
        console.log("File upload to object storage failed:", uploadResult);
        return res.status(500).json({ message: "Failed to upload file" });
      }
      console.log(`File uploaded successfully with ID: ${uploadResult.url}`);
      
      // Create a new message with type FILE
      console.log("Creating message record in database...");
      
      // Check table columns before inserting
      console.log("Checking messages table columns...");
      const { data: tableInfo, error: tableError } = await supabase
        .from('messages')
        .select('*')
        .limit(1);
        
      console.log("Table columns:", tableInfo ? Object.keys(tableInfo[0]) : "No records found");
      if (tableError) {
        console.error("Error checking table structure:", tableError);
      }
      
      // Prepare message data
      const messagePayload = {
        sender_id: req.user.id,
        receiver_id: parseInt(req.body.receiverId),
        content: null, // Content is null for FILE type messages
        product_id: req.body.productId ? parseInt(req.body.productId) : null,
        message_type: 'FILE', // Set message type to FILE
        file_url: uploadResult.url
      };
      
      console.log("Inserting message with payload:", messagePayload);
      
      // Using Supabase direct insert for messages
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .insert(messagePayload)
        .select()
        .single();
      
      if (messageError) {
        console.error("Database error while creating message:", messageError);
        return res.status(500).json({ 
          message: "Error saving message to database",
          error: messageError.message
        });
      }
      
      if (!messageData) {
        console.log("No data returned from message insert");
        return res.status(500).json({ message: "No data returned from database" });
      }

      console.log("Message created successfully:", messageData);
      
      // Return the created message with the file URL
      // Log the actual message data returned from the database
      console.log("Raw message data from database:", messageData);
      
      const responseData = {
        id: messageData.id,
        senderId: messageData.sender_id,
        receiverId: messageData.receiver_id,
        productId: messageData.product_id,
        messageType: messageData.message_type,
        fileUrl: objectStorage.getMessageFilePublicUrl(uploadResult.url),
        createdAt: messageData.created_at
      };
      
      console.log("Formatted response data:", responseData);
      
      // Send a simple, clean JSON response 
      return res.status(200).json(responseData);
    } catch (error) {
      console.error("Error in message file upload handler:", error);
      // Ensure consistent JSON response even for errors
      return res.status(500).json({ 
        success: false,
        message: typeof error === 'object' && error !== null && 'message' in error 
          ? (error as Error).message 
          : "An unexpected error occurred" 
      });
    }
  });
  
  // Endpoint to serve message files
  app.get('/api/message-files/:fileId', async (req, res, next) => {
    try {
      const { fileId } = req.params;
      
      // Check if we should serve the file for preview
      const isPreview = req.query.preview === 'true';
      
      console.log(`Attempting to retrieve message file with ID: ${fileId}, preview mode: ${isPreview}`);

      // Get the file from Replit Object Storage
      const fileBuffer = await objectStorage.getMessageFileFromStorage(fileId);

      if (fileBuffer) {
        // Get content type from metadata if available, or try to detect from file signature
        let contentType = 'application/octet-stream';
        
        // Check file signatures to determine content type
        if (fileBuffer.length > 8) {
          const signature = fileBuffer.slice(0, 8).toString('hex');
          
          // Check file signatures for common types
          if (signature.startsWith('89504e47')) {
            contentType = 'image/png';
          } else if (signature.startsWith('ffd8ff')) {
            contentType = 'image/jpeg';
          } else if (signature.startsWith('47494638')) {
            contentType = 'image/gif';
          } else if (signature.startsWith('25504446')) {
            contentType = 'application/pdf';
          } else if (signature.startsWith('504b0304')) {
            // Could be DOCX, XLSX, PPTX (all Office Open XML formats)
            if (fileId.endsWith('.docx')) {
              contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            } else {
              contentType = 'application/zip';
            }
          }
        }
        
        // Add disposition header based on whether we're previewing or downloading
        if (isPreview) {
          res.setHeader('Content-Disposition', 'inline');
        } else {
          // For download, suggest a filename
          const filename = fileId.includes('_') ? fileId.split('_').pop() : fileId;
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }
        
        console.log(`Message file ${fileId} found - serving with content type ${contentType}`);
        
        // Send the file with the appropriate content type
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        return res.send(fileBuffer);
      }

      console.log(`Message file ${fileId} not found in storage`);
      // If we get here, the file was not found
      res.status(404).json({ message: 'File not found' });
    } catch (error) {
      console.error('Error serving message file:', error);
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
  app.post("/api/product-images/:id/upload", imageUpload.single('image'), async (req, res, next) => {
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
      
      // Decrypt message content and prepare file URLs
      const decryptedMessages = messages.map(msg => ({
        ...msg,
        content: msg.content ? decryptMessage(msg.content) : msg.content,
        fileUrl: msg.fileUrl // Make sure we're consistent with fileUrl property
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
        // Get conversation messages with all fields including action type and is_clicked
        conversation = await storage.getConversation(currentUserId, otherUserId);
        
        // Add logging for debugging transaction messages
        conversation.forEach(msg => {
          if (msg.messageType === 'ACTION') {
            console.log(`Found action message ID ${msg.id}, is_clicked=${msg.isClicked}, action_type=${msg.actionType}`);
          }
        });
      }
      
      // Enhance messages with file URLs and product images
      // First, collect all product IDs from ACTION messages
      const productIdsToFetch = conversation
        .filter(msg => msg.messageType === 'ACTION' && msg.productId)
        .map(msg => msg.productId);
      
      // Fetch product images for all relevant products at once
      const productImagesMap = new Map();
      if (productIdsToFetch.length > 0) {
        try {
          // Fetch product images for all products in one batch
          for (const productId of productIdsToFetch) {
            if (productId) {
              const productImages = await storage.getProductImages(productId);
              if (productImages && productImages.length > 0) {
                // Find the main image (order 0)
                const mainImage = productImages.find((img: any) => img.imageOrder === 0);
                if (mainImage && mainImage.imageUrl) {
                  productImagesMap.set(productId, objectStorage.getImagePublicUrl(mainImage.imageUrl));
                }
              }
            }
          }
        } catch (error) {
          console.error('Error fetching product images for transaction messages:', error);
        }
      }
      
      // First, pre-fetch all missing product data for action messages
      const missingProductIds: number[] = [];
      for (const msg of conversation) {
        if (msg.messageType === 'ACTION' && msg.productId && !msg.product) {
          missingProductIds.push(msg.productId);
        }
      }
      
      // Create a product data lookup map
      const productDataMap = new Map<number, any>();
      if (missingProductIds.length > 0) {
        try {
          // Fetch each product data individually
          for (const productId of missingProductIds) {
            const productData = await storage.getProductById(productId);
            if (productData) {
              // Create a simple object with just the fields we need
              const simplifiedProduct = {
                id: productData.id,
                name: productData.name,
                price: productData.price || 0,
                imageUrl: productData.imageUrl || null
              };
              productDataMap.set(productId, simplifiedProduct);
            }
          }
        } catch (error) {
          console.error('Error fetching missing product data:', error);
        }
      }
      
      // Process each message
      const decryptedConversation = conversation.map(msg => {
        // Check if this is a file message (has fileUrl and/or message_type is FILE)
        const isFileMessage = msg.messageType === 'FILE' || msg.fileUrl;
        
        // For file messages, we need to generate a public URL
        let fileUrl = null;
        if (isFileMessage && msg.fileUrl) {
          fileUrl = objectStorage.getMessageFilePublicUrl(msg.fileUrl);
        }
        
        // For action messages with products, add or enhance the product data
        let productWithImage = msg.product;
        if (msg.messageType === 'ACTION' && msg.productId) {
          // If we don't have product data, get it from our pre-fetched map
          if (!productWithImage && productDataMap.has(msg.productId)) {
            productWithImage = productDataMap.get(msg.productId);
          }
          
          // Add the image URL if we have it from our batch fetch
          if (productImagesMap.has(msg.productId)) {
            const imageUrl = productImagesMap.get(msg.productId);
            if (productWithImage && imageUrl) {
              // Add image URL to existing product data
              productWithImage = {
                ...productWithImage,
                imageUrl: imageUrl
              };
            } else if (imageUrl) {
              // Create a minimal product object with image
              productWithImage = {
                id: msg.productId,
                name: "Product " + msg.productId,
                price: 0, // Default price
                brand: "", // Empty brand
                description: null,
                imageUrl: imageUrl,
                stockQuantity: 0,
                categoryId: null,
                sellerId: msg.senderId,
                isNew: null,
                isFeatured: false,
                featuredAt: null,
                featuredUntil: null,
                createdAt: new Date(),
                remainingPercentage: null,
                status: "available",
                concentrationType: null,
                volume: null
              };
            }
          }
        }
        
        // Create a properly mapped message
        const mappedMsg = {
          ...msg,
          // Decrypt content if it exists and is encrypted
          content: msg.content ? decryptMessage(msg.content) : msg.content,
          // Set fileUrl to the properly generated URL if it exists
          fileUrl: fileUrl
        };
        
        // Only add the product property if we have product info
        if (productWithImage) {
          mappedMsg.product = productWithImage;
        }
        
        return mappedMsg;
      });
      
      res.json(decryptedConversation);
    } catch (error) {
      next(error);
    }
  });
  
  // Confirm transaction action
  app.post("/api/messages/action/confirm", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.isAuthenticated()) {
        return res.status(403).json({ message: "Unauthorized: Must be logged in to confirm transactions" });
      }
      
      // Validate request body
      const schema = z.object({
        messageId: z.number()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validationResult.error.errors 
        });
      }
      
      const { messageId } = validationResult.data;
      const userId = req.user.id;
      
      // Fetch the message to verify it's a transaction for this user
      const message = await storage.getMessageById(messageId);
      
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      // Verify this user is the recipient of the message
      if (message.receiverId !== userId) {
        return res.status(403).json({ message: "Unauthorized: You cannot confirm this transaction" });
      }
      
      // Verify it's an action message
      if (message.messageType !== 'ACTION') {
        return res.status(400).json({ message: "Not an action message" });
      }
      
      // Update the message to mark it as clicked
      const updatedMessage = await storage.updateActionMessageStatus(messageId, true);
      
      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to update message status" });
      }
      console.log("action type: ", message.actionType);
      
      // Handle different action types differently
      if (message.actionType === 'CONFIRM_PAYMENT') {
        // This is a seller confirming payment received
        if (message.productId) {
          try {
            // Find the transaction for this product between these users
            const { data: transactions, error } = await supabase
              .from('transactions')
              .select('*')
              .eq('product_id', message.productId)
              .eq('seller_id', userId) // Current user (seller) is confirming payment
              .eq('buyer_id', message.senderId) // The sender of this message is the buyer
              .eq('status', 'WAITING_PAYMENT')
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (error) {
              console.error('Error fetching transaction:', error);
              return res.status(500).json({ message: "Error processing payment confirmation" });
            }
            
            if (transactions && transactions.length > 0) {
              const transaction = transactions[0];
              
              // Update the transaction status to WAITING_DELIVERY (not COMPLETED yet)
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'WAITING_DELIVERY',
                  updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);
              
              if (updateError) {
                console.error('Error updating transaction status:', updateError);
                return res.status(500).json({ message: "Failed to update transaction status" });
              }
              
              console.log(`Updated transaction ${transaction.id} to WAITING_DELIVERY status`);
              
              // Update the product status to 'pending' from 'active'
              const { error: productUpdateError } = await supabase
                .from('products')
                .update({
                  status: 'pending'
                })
                .eq('id', message.productId);

              if (productUpdateError) {
                console.error('Error updating product status to pending:', productUpdateError);
                // Don't return an error response here, as the main transaction was successful
                // Just log the error and continue
                } else {
                  console.log(`Updated product ${message.productId} status to pending`);
                }
            } else {
              console.warn(`No WAITING_PAYMENT transaction found for product ${message.productId} between seller ${userId} and buyer ${message.senderId}`);
            }
            
            // Log payment confirmation success
            console.log(`Payment confirmation successful for message ${messageId}, product ${message.productId}, seller ${userId}`);
          } catch (transError) {
            console.error('Error during payment confirmation:', transError);
            return res.status(500).json({ message: "Error processing payment confirmation" });
          }
        }
      } else if (message.actionType === 'CONFIRM_DELIVERY') {
        // This is a buyer confirming delivery received
        if (message.productId) {
          try {
            // Find the transaction for this product between these users
            const { data: transactions, error } = await supabase
              .from('transactions')
              .select('*')
              .eq('product_id', message.productId)
              .eq('buyer_id', userId) // Current user (buyer) is confirming delivery
              .eq('status', 'WAITING_DELIVERY')
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (error) {
              console.error('Error fetching transaction:', error);
              return res.status(500).json({ message: "Error processing delivery confirmation" });
            }
            
            if (transactions && transactions.length > 0) {
              const transaction = transactions[0];
              
              // Update the transaction status to WAITING_REVIEW
              const { error: updateError } = await supabase
                .from('transactions')
                .update({
                  status: 'WAITING_REVIEW',
                  updated_at: new Date().toISOString()
                })
                .eq('id', transaction.id);
              
              if (updateError) {
                console.error('Error updating transaction status:', updateError);
                return res.status(500).json({ message: "Failed to update transaction status" });
              }
              
              console.log(`Updated transaction ${transaction.id} to WAITING_REVIEW status`);
              
              // Update the product status to 'sold' from 'pending'
              const { error: productUpdateError } = await supabase
                .from('products')
                .update({
                  status: 'sold'
                })
                .eq('id', message.productId);

              if (productUpdateError) {
                console.error('Error updating product status to sold:', productUpdateError);
                // Don't return an error response here, as the main transaction was successful
                // Just log the error and continue
              } else {
                console.log(`Updated product ${message.productId} status to sold`);
              }
            } else {
              console.warn(`No WAITING_DELIVERY transaction found for product ${message.productId} for buyer ${userId}`);
            }
            
            // Log delivery confirmation success
            console.log(`Delivery confirmation successful for message ${messageId}, product ${message.productId}, buyer ${userId}`);
          } catch (transError) {
            console.error('Error during delivery confirmation:', transError);
            return res.status(500).json({ message: "Error processing delivery confirmation" });
          }
        }
      } else {
        // Default action type (INITIATE) - Buyer confirming purchase
        // Get product details to include in the confirmation message and create transaction
        let productName = "this item";
        let productPrice = 1; // Default amount for the transaction if price can't be determined
        if (message.productId) {
          try {
            const product = await storage.getProductById(message.productId);
            if (product) {
              productName = product.name;
              productPrice = product.price;
              
              // Create a transaction record with WAITING_PAYMENT status
              try {
                await supabase
                  .from('transactions')
                  .insert({
                    product_id: message.productId,
                    seller_id: message.senderId,
                    buyer_id: userId,
                    amount: productPrice,
                    status: 'WAITING_PAYMENT',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  });
                
                console.log(`Created transaction record for product ${message.productId}, seller ${message.senderId}, buyer ${userId}`);
              } catch (transError) {
                console.error('Error creating transaction record:', transError);
                // Continue execution even if transaction creation fails
                // We don't want to prevent the confirmation message from being sent
              }
            }
          } catch (err) {
            console.error('Error fetching product details for confirmation message:', err);
          }
        }
        
        // Log transaction creation success
        console.log(`Purchase confirmation successful for message ${messageId}, product ${message.productId}, buyer ${userId}`);
      }
      
      // Return success response
      res.json({ success: true, message: "Action confirmed successfully" });
    } catch (error) {
      console.error("Error confirming transaction action:", error);
      next(error);
    }
  });
  
  // Submit a review for a completed transaction
  app.post("/api/messages/submit-review/:messageId", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.isAuthenticated()) {
        return res.status(403).json({ message: "Unauthorized: Must be logged in to submit reviews" });
      }
      
      // Validate request parameters and body
      const messageId = parseInt(req.params.messageId, 10);
      if (isNaN(messageId)) {
        return res.status(400).json({ message: "Invalid message ID" });
      }
      
      const schema = z.object({
        rating: z.number().min(0).max(5),
        comment: z.string().optional(),
        productId: z.number()
      });
      
      const validationResult = schema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: validationResult.error.errors 
        });
      }
      
      const { rating, comment, productId } = validationResult.data;
      const userId = req.user.id;
      
      // Fetch the message to verify it's a review action message for this user
      const message = await storage.getMessageById(messageId);
      
      if (!message) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      // Verify this user is the sender of the message (only buyer can submit review)
      if (message.senderId !== userId) {
        return res.status(403).json({ message: "Unauthorized: Only the buyer can submit a review" });
      }
      
      // Verify it's a review action message
      if (message.messageType !== 'ACTION' || message.actionType !== 'REVIEW') {
        return res.status(400).json({ message: "Not a review message" });
      }
      
      // Update the message to mark it as clicked (review submitted)
      const updatedMessage = await storage.updateActionMessageStatus(messageId, true);
      
      if (!updatedMessage) {
        return res.status(500).json({ message: "Failed to update message status" });
      }
      
      // Find the transaction for this product between these users
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('product_id', productId)
        .eq('buyer_id', userId) // Current user (buyer) is submitting review
        .eq('status', 'WAITING_REVIEW')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        console.error('Error fetching transaction:', error);
        return res.status(500).json({ message: "Error processing review submission" });
      }
      
      if (!transactions || transactions.length === 0) {
        return res.status(404).json({ message: "No transaction found for this review" });
      }
      
      const transaction = transactions[0];
      
      // 1. Add the review to the reviews table
      const { error: reviewError } = await supabase
        .from('reviews')
        .insert({
          user_id: userId, // Reviewer (buyer)
          product_id: productId,
          rating: rating,
          comment: comment || null,
          created_at: new Date()
        });
      
      if (reviewError) {
        console.error('Error adding review:', reviewError);
        return res.status(500).json({ message: "Failed to create review" });
      }
      
      // 2. Update the transaction status to COMPLETED
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          updated_at: new Date()
        })
        .eq('id', transaction.id);
      
      if (updateError) {
        console.error('Error updating transaction:', updateError);
        return res.status(500).json({ message: "Failed to update transaction status" });
      }
      
      // Return success
      res.status(200).json({ 
        message: "Review submitted successfully",
        transactionStatus: 'COMPLETED'
      });
      
      // Notify other user through WebSocket
      const otherUserId = message.receiverId;
      const socketMessage = {
        type: 'REVIEW_SUBMITTED',
        messageId: messageId,
        productId: productId,
        userId: userId,
        rating: rating
      };
      
      notifyUser(otherUserId, socketMessage);
      
    } catch (error) {
      console.error('Error in submit-review endpoint:', error);
      res.status(500).json({ message: "Internal server error" });
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
  
  // Endpoint to get unread message count
  app.get("/api/messages/unread-count", async (req, res, next) => {
    try {
      // Check authentication
      if (!req.isAuthenticated()) {
        return res.status(403).json({ message: "Unauthorized: Must be logged in to get unread messages" });
      }
      
      const currentUserId = req.user.id;
      
      // Get unread message count
      const count = await storage.getUnreadMessageCount(currentUserId);
      
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });

  const httpServer = createServer(app);
  
  // Function to check for expired auctions and handle them
  async function checkAndProcessExpiredAuctions() {
    const timestamp = new Date().toISOString();
    // console.log(`[${timestamp}] Checking for expired auctions...`);
    try {
      // Get only active auctions - more efficient
      const auctions = await storage.getActiveAuctions();
      // Get current time and add 1 hour to match BST timezone used by the database
      const now = new Date();
      now.setHours(now.getHours() + 1); // Add 1 hour to match BST
      
      // console.log(`Current server time: ${new Date().toISOString()}`);
      // console.log(`Adjusted time for BST: ${now.toISOString()}`);
      
      // Filter for active auctions that have passed their end time
      const expiredAuctions = auctions.filter(auction => {
        const auctionEndDate = new Date(auction.endsAt);
        // Compare the dates directly using the BST-adjusted current time
        const isExpired = auctionEndDate.getTime() < now.getTime();
        
        console.log(`Auction #${auction.id}: endsAt=${auctionEndDate.toISOString()}, BST-adjusted current=${now.toISOString()}, expired=${isExpired}`);
        
        return isExpired;
      });
      
      // console.log(`[${timestamp}] Found ${expiredAuctions.length} expired auctions to process`);
      
      // We already logged the auction details in the filter above, no need to do it again
      
      // Admin user ID for system messages
      const ADMIN_USER_ID = 32;
      
      // Process each expired auction
      for (const auction of expiredAuctions) {
        // console.log(`Processing expired auction #${auction.id}`);
        
        try {
          // Check for reserve price
          const hasReservePrice = auction.reservePrice !== null && auction.reservePrice > 0;
          const reserveNotMet = hasReservePrice && 
            (auction.currentBid === null || auction.currentBid < auction.reservePrice);
            
          if (reserveNotMet) {
            // Reserve price wasn't met, update status to 'reserve_not_met'
            await storage.updateAuction(auction.id, { status: 'reserve_not_met' });
            console.log(`Updated auction #${auction.id} status to 'reserve_not_met'. Reserve price: ${auction.reservePrice}, Current bid: ${auction.currentBid || 'none'}`);
            
            // Update the corresponding product status to pending
            const { error: productUpdateError } = await supabase
              .from('products')
              .update({
                status: 'pending'
              })
              .eq('id', auction.productId);
              
            if (productUpdateError) {
              console.error(`Error updating product #${auction.productId} status to pending:`, productUpdateError);
            } else {
              console.log(`Updated product #${auction.productId} status to 'pending' for expired auction with reserve not met`);
            }
            
            // Get the product and seller details
            const product = await storage.getProductById(auction.productId);
            if (!product) {
              console.log(`Could not find product #${auction.productId} for auction #${auction.id}`);
              continue;
            }
            
            // Get seller information
            const seller = await storage.getUser(product.sellerId);
            if (!seller) {
              console.log(`Missing seller information for auction #${auction.id}`);
              continue;
            }
            
            // Send message from admin to seller that reserve wasn't met
            const messageContent = `The auction for "${product.name}" has ended, but the reserve price of ${auction.reservePrice} was not met. The highest bid was ${auction.currentBid || 'none'}. You can relist the item.`;
            
            await storage.sendMessage({
              senderId: ADMIN_USER_ID,
              receiverId: seller.id,
              content: messageContent,
              productId: product.id,
              isRead: false
            });
            
            console.log(`Sent reserve_not_met message from admin #${ADMIN_USER_ID} to seller #${seller.id}`);
            
            // Notify auction room if there are any connected clients
            notifyAuctionRoom(auction.id, product.id, 'reserveNotMet', auction.currentBid, auction.currentBidderId);
            
          } else {
            // Regular auction completion flow
            await storage.updateAuction(auction.id, { status: 'pending' });
            console.log(`Updated auction #${auction.id} status to 'pending'`);
            
            // Also update the corresponding product status to pending
            const { error: productUpdateError } = await supabase
              .from('products')
              .update({
                status: 'pending'
              })
              .eq('id', auction.productId);
              
            if (productUpdateError) {
              console.error(`Error updating product #${auction.productId} status to pending:`, productUpdateError);
            } else {
              console.log(`Updated product #${auction.productId} status to 'pending' for expired auction with winning bid`);
            }
            
            // If no bids were placed, just end the auction
            if (!auction.currentBidderId) {
              console.log(`Auction #${auction.id} has no winning bidder, skipping messaging`);
              continue;
            }
            
            const product = await storage.getProductById(auction.productId);
            if (!product) {
              console.log(`Could not find product #${auction.productId} for auction #${auction.id}`);
              continue;
            }
            
            // Get information about the seller and winning bidder
            const seller = await storage.getUser(product.sellerId);
            const highestBidder = await storage.getUser(auction.currentBidderId);
            
            if (!seller || !highestBidder) {
              console.log(`Missing seller or bidder information for auction #${auction.id}`);
              continue;
            }
            
            // Send automated message from seller to highest bidder
            const messageContent = `Congratulations! You've won the auction for "${product.name}" with a winning bid of ${auction.currentBid}. Please proceed with payment to complete the purchase. Thank you for participating!`;
            
            await storage.sendMessage({
              senderId: seller.id,
              receiverId: highestBidder.id,
              content: messageContent,
              productId: product.id,
              isRead: false
            });
            
            console.log(`Sent automated message from seller #${seller.id} to winning bidder #${highestBidder.id}`);
            
            // Notify auction room
            notifyAuctionRoom(auction.id, product.id, 'auctionEnded', auction.currentBid, auction.currentBidderId);
          }
        } catch (error) {
          console.error(`Error processing expired auction #${auction.id}:`, error);
        }
      }
      
      // Helper function to notify auction room via WebSocket
      function notifyAuctionRoom(auctionId: number, productId: number, eventType: string, currentBid: number | null, bidderId: number | null) {
        const auctionRoom = auctionRooms.get(auctionId);
        if (auctionRoom && auctionRoom.size > 0) {
          const notificationPayload = {
            type: eventType,
            auctionId,
            productId,
            winningBid: currentBid,
            winningBidderId: bidderId
          };
          
          // Convert Set to Array before iteration to avoid TypeScript error
          Array.from(auctionRoom).forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(notificationPayload));
            }
          });
          
          console.log(`Notified ${auctionRoom.size} clients that auction #${auctionId} has ${eventType}`);
        }
      }
    } catch (error) {
      console.error('Error checking for expired auctions:', error);
    }
    
    // We'll use setInterval outside this function instead of setTimeout here
    // This ensures the next check runs even if there was an error in this execution
  }
  
  // Create WebSocket server for real-time messaging and auction updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Map of connected users: userId -> WebSocket connection
  const connectedUsers = new Map<number, WebSocket>();
  
  // Helper function to send notification to a specific user
  function notifyUser(userId: number, data: any) {
    const userSocket = connectedUsers.get(userId);
    if (userSocket && userSocket.readyState === WebSocket.OPEN) {
      try {
        userSocket.send(JSON.stringify(data));
        console.log(`Notification sent to user ${userId}:`, data.type);
        return true;
      } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error);
      }
    } else {
      console.log(`User ${userId} is not connected or socket not ready`);
    }
    return false;
  }
  
  // Map of auction rooms: auctionId -> Set of WebSocket connections
  const auctionRooms = new Map<number, Set<WebSocket>>();
  
  // Start the auction expiry check process - initial call
  // Commented out to reduce log noise
  // checkAndProcessExpiredAuctions();
  
  // Set up a proper interval to check expired auctions every minute
  // This ensures the check runs even if there are errors in previous executions
  console.log('Setting up recurring auction expiry check (every 60 seconds)');
  // Commented out to reduce log noise
  setInterval(checkAndProcessExpiredAuctions, 60000);
  
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
        
        // Most message types require authentication, except for auction viewing
        if (!userId && data.type !== 'joinAuction' && data.type !== 'leaveAuction') {
          ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
          return;
        }
        
        // For auction room messages, use guest mode if no user ID
        if (data.type === 'joinAuction' || data.type === 'leaveAuction') {
          // Allow guest access, but don't reset userId if it's already set
          if (!userId && data.userId && data.userId === 'guest') {
            console.log('Guest user joining auction room');
            // We're not setting a numeric userId so the user stays in guest mode
          }
        }
        
        // Handle sending an action message (for transactions)
        if (data.type === 'send_action_message') {
          try {
            // Validate action message data
            const actionMessageSchema = z.object({
              senderId: z.number(),
              receiverId: z.number(),
              productId: z.number(),
              actionType: z.enum(['INITIATE', 'CONFIRM_PAYMENT', 'CONFIRM_DELIVERY', 'REVIEW']),
            });
            
            // Ensure userId is not null before using it
            if (userId === null) {
              throw new Error('User ID is required to send an action message');
            }
            
            const actionMessageData = actionMessageSchema.parse({
              senderId: userId, // Use authenticated user ID as sender
              receiverId: data.receiverId,
              productId: data.productId,
              actionType: data.actionType,
            });
            
            // Get product info with detailed images
            const product = await storage.getProductById(actionMessageData.productId);
            if (!product) {
              throw new Error('Product not found');
            }
            
            // Get product images for this product
            let productImageUrl = product.imageUrl;
            try {
              // Get the first image as the main product image
              const productImages = await storage.getProductImages(actionMessageData.productId);
              if (productImages && productImages.length > 0) {
                // Find the first image (usually with imageOrder = 0)
                const primaryImage = productImages.find(img => img.imageOrder === 0) || productImages[0];
                if (primaryImage) {
                  // Update the product image URL
                  productImageUrl = primaryImage.imageUrl;
                  console.log(`Found primary image for product ${actionMessageData.productId}:`, primaryImage.imageUrl);
                }
              }
            } catch (err) {
              console.warn(`Failed to get product images for product ${actionMessageData.productId}:`, err);
            }
            
            // Create message record
            const newMessage = {
              senderId: actionMessageData.senderId,
              receiverId: actionMessageData.receiverId,
              content: null, // Action messages have null content
              productId: actionMessageData.productId,
              isRead: false,
              messageType: 'ACTION',
              actionType: actionMessageData.actionType,
              isClicked: false,
            };
            
            // Insert the message using direct Supabase call
            const { data: message, error: messageError } = await supabase
              .from('messages')
              .insert({
                sender_id: actionMessageData.senderId,
                receiver_id: actionMessageData.receiverId,
                content: null, // Action messages have null content
                product_id: actionMessageData.productId,
                is_read: false,
                message_type: 'ACTION',
                action_type: actionMessageData.actionType,
                is_clicked: false,
              })
              .select()
              .single();
              
            if (messageError) {
              throw new Error(`Failed to create action message: ${messageError.message}`);
            }
            
            if (!message) {
              throw new Error('No message data returned from database');
            }
            
            // Get sender and receiver details for the response
            const sender = await storage.getUser(actionMessageData.senderId);
            const receiver = await storage.getUser(actionMessageData.receiverId);
            
            // Create a detailed message object for the response
            const detailedMessage = {
              id: message.id,
              senderId: message.sender_id,
              receiverId: message.receiver_id,
              content: message.content,
              productId: message.product_id,
              isRead: message.is_read,
              createdAt: message.created_at,
              messageType: message.message_type,
              actionType: message.action_type,
              isClicked: message.is_clicked,
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
                price: product.price,
                imageUrl: productImageUrl || product.imageUrl
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
            console.error('Error processing action message:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to send action message: ' + (error.message || 'Unknown error')
            }));
          }
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
            
            // Ensure userId is not null before using it
            if (userId === null) {
              throw new Error('User ID is required to send a message');
            }
            
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
              // Ensure userId is not null before using it
              if (userId === null) {
                throw new Error('User ID is required to mark messages as read');
              }
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
            
            console.log(`User ${userId || 'guest'} joined auction room ${auctionId}`);
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
              
              console.log(`User ${userId || 'guest'} left auction room ${auctionId}`);
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
            // For placing bids, we need to verify the user is actually logged in
            // First check if the WebSocket has been authenticated
            if (!userId) {
              console.log('Bid attempt rejected: WebSocket not authenticated');
              
              // Try to get the user ID from the message data
              if (data.userId) {
                // Check if this user exists in our database
                try {
                  console.log(`Verifying user ${data.userId} for bid...`);
                  const user = await storage.getUser(data.userId);
                  
                  if (user) {
                    console.log(`User ${data.userId} verified for bid through lookup`);
                    // Use the verified user ID
                    userId = data.userId;
                  } else {
                    console.log(`User ${data.userId} not found in database`);
                    ws.send(JSON.stringify({ 
                      type: 'error', 
                      message: 'You must be logged in to place a bid' 
                    }));
                    return;
                  }
                } catch (err) {
                  console.error(`Error verifying user ${data.userId}:`, err);
                  ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'Authentication error. Please try logging in again.' 
                  }));
                  return;
                }
              } else {
                console.log('Bid attempt rejected: No user ID provided');
                ws.send(JSON.stringify({ 
                  type: 'error', 
                  message: 'You must be logged in to place a bid' 
                }));
                return;
              }
            }
            
            console.log(`Processing bid from user ${userId}...`);
            const { auctionId, amount } = data;
            
            // Validate auction ID and bid amount
            if (isNaN(parseInt(auctionId)) || isNaN(parseFloat(amount))) {
              console.log(`Bid validation failed: Invalid auction ID ${auctionId} or amount ${amount}`);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid auction ID or bid amount' 
              }));
              return;
            }
            
            console.log(`Fetching auction ${auctionId} for bid validation...`);
            // Get the auction
            const auction = await storage.getAuctionById(parseInt(auctionId));
            if (!auction) {
              console.log(`Bid rejected: Auction ${auctionId} not found`);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Auction not found' 
              }));
              return;
            }
            console.log(`Found auction ${auctionId} for product ${auction.productId}`);
            
            // Check if auction is active
            const now = new Date();
            const endsAt = new Date(auction.endsAt);
            if (now > endsAt) {
              console.log(`Bid rejected: Auction ${auctionId} has ended at ${endsAt}, current time is ${now}`);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Auction has ended' 
              }));
              return;
            }
            
            // Check if the bid is high enough
            const minBid = (auction.currentBid || auction.startingPrice) + auction.bidIncrement;
            if (parseFloat(amount) < minBid) {
              console.log(`Bid rejected: Amount ${amount} is less than minimum bid ${minBid}`);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: `Bid must be at least ${minBid}` 
              }));
              return;
            }
            
            console.log(`Bid validation successful. Processing bid of ${amount} on auction ${auctionId} by user ${userId}...`);
            
            // Step 2: Set any previous winning bids to not winning
            try {
              console.log(`Resetting previous winning bids for auction ${auctionId}...`);
              // This needs to be a direct database call since our storage interface doesn't have this method
              const { error: updateError } = await supabase
                .from('bids')
                .update({ is_winning: false })
                .eq('auction_id', auctionId)
                .eq('is_winning', true);
                
              if (updateError) {
                console.error('Error updating previous bids:', updateError);
                // Continue with new bid placement anyway
              } else {
                console.log(`Successfully reset previous winning bids for auction ${auctionId}`);
              }
            } catch (err) {
              console.error('Exception updating previous bids:', err);
              // Continue with new bid placement anyway
            }
            
            // Step 3: Create the bid in the database
            console.log(`Creating new bid record for auction ${auctionId} by user ${userId} with amount ${amount}...`);
            
            try {
              // Step 3: Create the new bid
              // At this point, userId should be a valid number from our earlier checks
              if (userId === null) {
                throw new Error('User ID is missing but should have been validated earlier');
              }
              
              const bid = await storage.createBid({
                auctionId: parseInt(auctionId),
                bidderId: userId,
                amount: parseFloat(amount),
                isWinning: true // This new bid becomes the winning bid
              });
              console.log(`Successfully created bid with ID ${bid.id}`);
              
              // Step 4: Update the auction's current bid and bidder
              console.log(`Updating auction ${auctionId} with new current bid ${amount} and bidder ${userId}...`);
              await storage.updateAuction(parseInt(auctionId), {
                currentBid: parseFloat(amount),
                currentBidderId: userId
              });
              console.log(`Successfully updated auction ${auctionId}`);
              
              // Get bidder information
              // We've already verified userId is not null above
              if (userId === null) {
                throw new Error('User ID is null when it should not be');
              }
              
              console.log(`Fetching bidder details for user ${userId}...`);
              const bidder = await storage.getUser(userId);
              console.log(`Bidder details: ${bidder ? 'Found' : 'Not found'}`);
              
              // Add bidder name to bid
              const bidWithDetails = {
                ...bid,
                bidder: bidder?.username || `User #${userId}`
              };
              console.log(`Enhanced bid with bidder name: ${bidWithDetails.bidder}`);
              
              // Step 5: Notify all users in the auction room
              console.log(`Preparing to notify all users in auction room ${auctionId} about the new bid...`);
              const room = auctionRooms.get(parseInt(auctionId));
              
              if (room) {
                // Get updated auction data to include in the notification
                console.log(`Fetching updated auction data for notification...`);
                const updatedAuction = await storage.getAuctionById(parseInt(auctionId));
                
                if (!updatedAuction) {
                  console.error(`Could not fetch updated auction data for ID ${auctionId}`);
                  // Continue with notification using just the bid information
                } else {
                  console.log(`Updated auction data retrieved. Current bid: ${updatedAuction.currentBid}, current bidder: ${updatedAuction.currentBidderId}`);
                }
                
                console.log(`Broadcasting bid update to ${room.size} connected clients in room...`);
                let notifiedCount = 0;
                
                Array.from(room).forEach(connection => {
                  if (connection.readyState === WebSocket.OPEN) {
                    // Create the message payload
                    const payload: any = {
                      type: 'newBid',
                      auctionId: parseInt(auctionId),
                      bid: bidWithDetails
                    };
                    
                    // Only include auction data if we successfully retrieved it
                    if (updatedAuction) {
                      payload.auction = updatedAuction;
                    }
                    
                    connection.send(JSON.stringify(payload));
                    notifiedCount++;
                  }
                });
                
                console.log(`Successfully notified ${notifiedCount} clients about the new bid`);
              } else {
                console.log(`No auction room found for auctionId ${auctionId}, skipping notification`);
              }
              
              // Send success response to the bidder
              console.log(`Sending bid acceptance confirmation to bidder...`);
              ws.send(JSON.stringify({
                type: 'bidAccepted',
                bid: bidWithDetails,
                message: `Your bid of $${parseFloat(amount).toFixed(2)} was accepted`
              }));
              
              console.log(`✅ Successfully completed bid process: User ${userId} placed bid of ${amount} on auction ${auctionId}`);
            } catch (err) {
              console.error(`Error in bid creation process:`, err);
              throw err;
            }
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
      
      // Enhance bids with bidder usernames
      const enhancedBids = await Promise.all(bids.map(async (bid) => {
        try {
          const bidder = await storage.getUser(bid.bidderId);
          return {
            ...bid,
            bidder: bidder?.username || `User #${bid.bidderId}`
          };
        } catch (err) {
          console.warn(`Could not fetch username for bidder ${bid.bidderId}:`, err);
          return {
            ...bid,
            bidder: `User #${bid.bidderId}`
          };
        }
      }));
      
      // Get product details
      console.log(`Looking up product ID ${auction.productId} for auction ${auctionId}`);
      let product;
      try {
        // Try standard product lookup first
        product = await storage.getProductById(auction.productId);
        
        // If that fails, try direct database lookup
        if (!product) {
          console.log(`Standard product lookup failed for ID ${auction.productId}, trying direct database lookup`);
          
          // Make a direct database query to get the product
          const { data: productData, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', auction.productId)
            .single();
          
          if (productError || !productData) {
            console.error(`Direct product lookup failed for ID ${auction.productId}:`, productError);
            // Return auction without product, with special message that client can handle
            return res.status(200).json({ 
              ...auction, 
              bidCount: bids.length,
              bids: enhancedBids,
              message: 'Product not found'
            });
          }
          
          // Map the product from snake_case to camelCase
          product = {
            id: productData.id,
            name: productData.name,
            brand: productData.brand,
            description: productData.description,
            price: productData.price,
            imageUrl: productData.image_url,
            stockQuantity: productData.stock_quantity,
            categoryId: productData.category_id,
            sellerId: productData.seller_id,
            isNew: productData.is_new,
            isFeatured: productData.is_featured,
            createdAt: productData.created_at,
            // Include default values for product details that might be missing
            remainingPercentage: productData.remaining_percentage || 100,
            batchCode: productData.batch_code || 'Unknown',
            purchaseYear: productData.purchase_year || new Date().getFullYear(),
            boxCondition: productData.box_condition || 'Good',
            listingType: productData.listing_type || 'auction',
            volume: productData.volume || 100,
            // Add seller information
            seller: {
              id: productData.seller_id,
              username: 'Seller',
              isSeller: true,
              isVerified: true
            },
            // Add category information
            category: {
              id: productData.category_id || 1,
              name: 'Fragrance'
            },
            images: [],
            reviews: [],
            averageRating: undefined
          };
          
          console.log(`Found product through direct lookup for auction ${auctionId}:`, product.name);
        } else {
          console.log(`Found product through standard lookup for auction ${auctionId}:`, product.name);
        }
      } catch (productError) {
        console.error(`Error retrieving product ${auction.productId} for auction ${auctionId}:`, productError);
        // Return auction without product, with special message that client can handle
        return res.status(200).json({ 
          ...auction, 
          bidCount: bids.length,
          bids: enhancedBids,
          message: 'Error retrieving product details'
        });
      }
      
      // Combine auction with bid count and product details
      const auctionWithDetails = {
        ...auction,
        bidCount: bids.length,
        bids: enhancedBids,  // Use enhanced bids with usernames
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
  
  // No imports needed here - moved to the top of the file
  
  // POST /api/payments/create-boost - Create a boost payment for one or more products
  app.post('/api/payments/create-boost', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized: Please log in to make payments' });
      }
      
      // Validate request body - now supporting multiple product IDs
      const paymentSchema = z.object({
        productIds: z.array(z.string()).min(1),
        returnUrl: z.string().url()
      });
      
      const { productIds, returnUrl } = paymentSchema.parse(req.body);
      
      // Check if all products exist and belong to the user
      const productValidations = await Promise.all(
        productIds.map(async (pid) => {
          const productId = parseInt(pid);
          const product = await storage.getProductById(productId);
          return { 
            productId,
            product,
            valid: product && product.sellerId === req.user.id 
          };
        })
      );
      
      // Filter out invalid products
      const invalidProducts = productValidations.filter(p => !p.valid);
      if (invalidProducts.length > 0) {
        return res.status(403).json({ 
          message: 'Some products are invalid or do not belong to you',
          invalidProductIds: invalidProducts.map(p => p.productId)
        });
      }
      
      // Get valid products
      const validProducts = productValidations
        .filter(p => p.valid)
        .map(p => p.product);
      
      // Fixed boost amount per product in sen (RM10 = 1000 sen)
      const boostAmountPerProduct = 1000;
      const totalAmount = boostAmountPerProduct * validProducts.length;
      
      // Generate a proper UUID for order ID
      const orderId = crypto.randomUUID();
      
      // Prepare the metadata with product IDs in multiple formats for redundancy
      const paymentMetadata = {
        paymentType: 'boost',
        productCount: validProducts.length,
        productIds: productIds, // Array of product IDs
        product_ids: productIds.join(','), // As CSV string
        productId: productIds.length === 1 ? productIds[0] : null, // Single ID if only one product
        productDetails: validProducts.map(p => ({ id: p.id, name: p.name }))
      };
      
      console.log('📦 Creating payment with enhanced product ID storage:', {
        productIds: productIds,
        productCount: validProducts.length,
        orderId: orderId
      });
      
      // Create a new payment record
      const payment = await storage.createPayment({
        userId: req.user.id,
        orderId,
        amount: totalAmount / 100, // Convert sen to RM for storage
        status: 'due',
        billId: null,
        paymentType: 'boost',
        featureDuration: 7, // 7 days boost
        productIds: productIds,
        metadata: paymentMetadata
      });
      
      // Create product names list for description
      const productNames = validProducts.map(p => p.name).join(', ');
      const description = validProducts.length === 1
        ? `Product Boost for ${productNames}`
        : `Product Boost for ${validProducts.length} products`;
      
      // Get base URL for callbacks - use development URL for testing
      // In development, use the Replit domain; in production, use APP_URL
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const baseUrl = isDevelopment
        ? `https://${req.get('host')}`  // Use Replit domain
        : (process.env.APP_URL || `https://${req.get('host')}`);
      
      console.log(`🌍 Using base URL for payments: ${baseUrl} (${isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode)`);
      
      // Create a Billplz bill
      const bill = await billplz.createBill({
        name: req.user.username || 'User',
        email: req.user.email,
        amount: totalAmount, // Amount in sen
        description,
        reference_1: orderId,
        reference_2: productIds.join(','),
        callback_url: `${baseUrl}/api/payments/webhook`,
        redirect_url: `${baseUrl}/api/payments/process-redirect` // Use our payment processor instead of direct return
      });
      
      if (!bill || !bill.id) {
        // If bill creation failed
        await storage.updatePaymentStatus(
          payment.id, 
          'failed',
          undefined, // No bill ID
          undefined, // No payment channel
          undefined  // No paid date
        );
        return res.status(500).json({ message: 'Failed to create payment bill' });
      }
      
      // Update payment with bill ID
      await storage.updatePaymentStatus(
        payment.id, 
        'due',   // Keep status as 'due' until paid
        bill.id, // Set the bill ID
        undefined, // No payment channel yet
        undefined  // No paid date yet
      );
      
      // Return bill information with payment popup message
      res.json({
        billId: bill.id,
        billUrl: billplz.getBillURL(bill.id),
        orderId,
        status: 'due',
        message: 'You will be redirected to Billplz to complete your payment...',
        productCount: validProducts.length,
        totalAmount: totalAmount / 100 // Convert sen to RM for display
      });
      
    } catch (error) {
      console.error('Error creating boost payment:', error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      }
      res.status(500).json({ message: 'Error creating payment' });
    }
  });
  
  // Shared function to process payment updates from both webhook and redirect
  async function processPaymentUpdate(paymentData: {
    id?: string; // billId
    paid?: string | boolean;
    paid_at?: string;
    reference_1?: string; // orderId
    reference_2?: string; // productId(s) - can be single ID or comma-separated list
    payment_channel?: string;
    reference_3?: string; // additional reference if needed
    transaction_id?: string;
    transaction_status?: string;
  }, isWebhook = false) {
    try {
      console.log(`Processing payment update from ${isWebhook ? 'webhook' : 'redirect'}:`, JSON.stringify(paymentData, null, 2));
      
      // Extract data from payment payload
      const {
        id: billId,
        paid,
        paid_at,
        reference_1: orderId,
        reference_2: productId,
        payment_channel,
        transaction_id,
        transaction_status
      } = paymentData;
      
      // Log the status flags for debugging
      console.log('Payment status flags:', {
        billId, 
        paid: paid,
        paidType: typeof paid,
        isPaidTrue: paid === 'true',
        isPaidTrueBoolean: paid === true,
        orderId,
        productId,
        productIdType: typeof productId
      });
      
      // Find the associated payment with fallback mechanism
      let payment;
      
      // First try by orderId if available
      if (orderId) {
        console.log(`Attempting to find payment by orderId (reference_1): ${orderId}`);
        payment = await storage.getPaymentByOrderId(orderId);
      }
      
      // If not found by orderId or if orderId was missing, try finding by bill_id
      if (!payment && billId) {
        console.log(`Payment not found by orderId or orderId missing. Attempting to find by bill_id: ${billId}`);
        payment = await storage.getPaymentByBillId(billId);
      }
      
      if (!payment) {
        console.error(`🔴 Payment not found for ${orderId ? 'orderId: ' + orderId : ''} ${billId ? 'or bill_id: ' + billId : ''}`);
        return { success: false, message: 'Payment record not found in our system.' };
      }
      
      console.log('Found payment record:', {
        id: payment.id,
        orderId: payment.orderId,
        currentStatus: payment.status,
        amount: payment.amount,
        productIds: payment.productIds
      });
      
      // Check if payment already processed to prevent duplicate processing
      if (payment.status === 'paid') {
        console.log(`Payment ${payment.id} already marked as paid, skipping status update`);
        
        // DIAGNOSTIC: Check if we need to process product boosts even for already-paid payments
        console.log(`🔍 DIAGNOSTIC: Checking if already-paid payment needs product boost processing`);
        console.log(`Payment product_id:`, payment.product_id);
        console.log(`Payment productIds:`, payment.productIds);
        
        // DIAGNOSTIC: Check database for existing product-specific payment records
        console.log(`🔍 DIAGNOSTIC: Checking for existing product-specific payment records with bill_id: ${billId}`);
        
        try {
          const { data: existingPayments, error } = await supabase
            .from('payments')
            .select('id, product_id, order_id, user_id')
            .eq('bill_id', billId);
            
          if (error) {
            console.error(`❌ Error checking for existing payments:`, error);
          } else {
            console.log(`Found ${existingPayments ? existingPayments.length : 0} payment records with bill_id ${billId}:`);
            if (existingPayments && existingPayments.length > 0) {
              existingPayments.forEach(p => {
                console.log(`- Payment #${p.id}: product_id=${p.product_id}, order_id=${p.order_id}, user_id=${p.user_id}`);
              });
            } else {
              console.log(`❗ No product-specific payment records found for bill_id ${billId}`);
              
              // CRITICAL: We should still process product boosts if no product-specific records exist!
              // This indicates that we never processed the individual product records during initial payment.
              if ((payment.productIds && payment.productIds.length > 0) || payment.product_id) {
                console.log(`🔄 CRITICAL: Need to process product boost records even though payment is already paid`);
                // Continue to product boost processing below rather than returning early
                // We'll set this flag and check it later in the code
                payment._forceProductBoostProcessing = true;
              }
            }
          }
        } catch (err) {
          console.error(`❌ Error during diagnostic check:`, err);
        }
        
        // Even if already paid, we'll update the bill_id if it wasn't set before
        if (!payment.billId && billId) {
          await storage.updatePaymentStatus(
            payment.id, 
            'paid',
            billId,
            payment_channel,
            undefined // No need to update paid date since it's already marked as paid
          );
          console.log(`Updated bill_id for payment ${payment.id} to ${billId}`);
        }
        
        // Only exit early if we don't need to force product boost processing
        if (!payment._forceProductBoostProcessing) {
          return { success: true, message: 'Payment already processed', payment };
        } else {
          console.log(`🔄 Continuing to product boost processing despite payment being already paid`);
        }
      }
      
      // Determine payment status - handle both string and boolean values from Billplz
      const isPaid = paid === 'true' || paid === true;
      const status = isPaid ? 'paid' : 'failed';
      const paidDate = paid_at ? new Date(paid_at) : isPaid ? new Date() : undefined;
      
      console.log(`Updating payment ${payment.id} status to '${status}'${paidDate ? ' with paid date ' + paidDate : ''}`);
      
      // Update payment with complete data
      const updatedPayment = await storage.updatePaymentStatus(
        payment.id,
        status,
        billId,                    // Bill ID from Billplz
        payment_channel || null,   // Payment method
        paidDate                  // Payment date
      );
      
      console.log(`Payment status updated to ${status}`);
      
      // Helper function to update product feature status
      async function updateProductFeatureStatus(productId: number | string, payment: any) {
        try {
          // Default feature duration is 7 days if not specified
          const featureDuration = payment?.metadata?.featureDuration || 7;
          
          // Create feature expiry date
          const featuredUntil = new Date();
          featuredUntil.setDate(featuredUntil.getDate() + Number(featureDuration));
          
          // Update the product status in the database
          const { data: updatedProduct, error: productError } = await supabase
            .from('products')
            .update({
              is_featured: true,
              featured_at: new Date(),
              featured_until: featuredUntil
            })
            .eq('id', Number(productId))
            .select()
            .single();
          
          if (productError) {
            console.error(`❌ Error updating product ${productId} featured status:`, productError);
            return false;
          } else {
            console.log(`✅ Updated product #${productId} to featured status until ${featuredUntil.toISOString()}`);
            return true;
          }
        } catch (productErr) {
          console.error(`❌ Error while updating product featured status: ${productErr}`);
          return false;
        }
      }
      
      // DIAGNOSTIC: Add marker for payment processing entry point
      console.log(`🔍 [DIAGNOSTIC] PAYMENT BOOST PROCESSING - STATUS CHECK: Payment ID ${payment.id}, Status ${status}, Force=${payment._forceProductBoostProcessing ? 'true' : 'false'}`);
            
      // CRITICAL: If payment is successful, process boost for all products
      // Also runs if payment._forceProductBoostProcessing was set earlier during diagnostic
      if (status === 'paid' || payment._forceProductBoostProcessing) {
        console.log(`🔍 [DIAGNOSTIC] PAYMENT BOOST PROCESSING - ENTERED MAIN BLOCK`);
        try {
          // Extract product IDs from payment metadata or from reference_2
          let productIds: string[] = [];
          
          // DIAGNOSTIC: Log all potential sources of product IDs
          console.log(`🔎 [PRODUCT ID SOURCES] Examining payment record for product IDs:`);
          console.log(`- payment.id: ${payment.id}`);
          console.log(`- productIds property: ${payment.productIds ? JSON.stringify(payment.productIds) : 'Missing'}`);
          console.log(`- product_id property: ${payment.product_id || 'Missing'}`);
          console.log(`- reference_2: ${payment.reference_2 || 'Missing'}`);
          console.log(`- reference_1: ${payment.reference_1 || 'Missing'}`);
          console.log(`- webhook_payload: ${payment.webhook_payload ? (typeof payment.webhook_payload === 'string' ? 'Present (string)' : 'Present (object)') : 'Missing'}`);
          
          // First check the payment record for productIds
          if (payment.productIds && payment.productIds.length > 0) {
            productIds = payment.productIds;
            console.log(`✅ Using productIds from payment record: ${productIds.join(', ')}`);
          }
          // Check if there's a single product_id stored directly in the payment record
          else if (payment.product_id) {
            productIds = [String(payment.product_id)];
            console.log(`✅ Using single product_id from payment record: ${payment.product_id}`);
          }
          // Then check if reference_2 contains comma-separated product IDs
          else if (productId && typeof productId === 'string' && productId.includes(',')) {
            productIds = productId.split(',');
            console.log(`Using productIds from reference_2: ${productIds.join(', ')}`);
            
            // Update the payment record with these product IDs if they weren't stored before
            if (!payment.productIds || payment.productIds.length === 0) {
              try {
                await storage.updatePaymentProductIds(payment.id, productIds);
                console.log(`✅ Updated payment ${payment.id} with product IDs from reference_2`);
              } catch (err) {
                console.error(`❌ Error updating payment with product IDs:`, err);
              }
            }
          }
          // Finally, check if reference_2 is a single product ID
          else if (productId) {
            productIds = [productId];
            console.log(`Using single productId from reference_2: ${productId}`);
            
            // Update the payment record with this product ID if it wasn't stored before
            if (!payment.productIds || payment.productIds.length === 0) {
              try {
                await storage.updatePaymentProductIds(payment.id, productIds);
                console.log(`✅ Updated payment ${payment.id} with single product ID from reference_2`);
              } catch (err) {
                console.error(`❌ Error updating payment with product ID:`, err);
              }
            }
          }
          
          // If we still don't have product IDs, try to find some from related payments
          if (productIds.length === 0 && billId) {
            console.log(`🔍 Attempting to find product IDs from related payments with billId: ${billId}`);
            try {
              const { data: relatedPayments } = await supabase
                .from('payments')
                .select('product_id')
                .eq('bill_id', billId)
                .not('product_id', 'is', null);
                
              if (relatedPayments && relatedPayments.length > 0) {
                productIds = relatedPayments.map(p => String(p.product_id));
                console.log(`✅ Found ${productIds.length} product IDs from related payments:`, productIds);
              }
            } catch (err) {
              console.error(`❌ Error finding related payments:`, err);
            }
          }
          
          // Special handling for direct database check
        if (productIds.length === 0) {
            console.log('🔍 No product IDs found in payment metadata, checking webhook_payload directly');
            try {
              // Try to extract product IDs from webhook_payload JSON
              const { data } = await supabase
                .from('payments')
                .select('webhook_payload')
                .eq('id', payment.id)
                .single();
                
              if (data && data.webhook_payload) {
                let webhookData;
                if (typeof data.webhook_payload === 'string') {
                  try {
                    webhookData = JSON.parse(data.webhook_payload);
                  } catch (e) {
                    console.error('Failed to parse webhook_payload string', e);
                  }
                } else {
                  webhookData = data.webhook_payload;
                }
                
                if (webhookData) {
                  console.log('📦 Extracted webhook data:', webhookData);
                  
                  // Look for product IDs in various formats
                  if (webhookData.productIds && webhookData.productIds.length > 0) {
                    productIds = webhookData.productIds.map(id => String(id));
                    console.log(`✅ Found product IDs in webhook_payload.productIds: ${productIds.join(', ')}`);
                  } else if (webhookData.product_ids && webhookData.product_ids.length > 0) {
                    productIds = webhookData.product_ids.map(id => String(id));
                    console.log(`✅ Found product IDs in webhook_payload.product_ids: ${productIds.join(', ')}`);
                  } else if (webhookData.productId) {
                    productIds = [String(webhookData.productId)];
                    console.log(`✅ Found single product ID in webhook_payload.productId: ${productIds[0]}`);
                  }
                }
              }
            } catch (err) {
              console.error('Error extracting product IDs from webhook_payload:', err);
            }
        }
        
        if (productIds.length === 0) {
            console.warn('No product IDs found in payment for boosting after all attempts');
            return { success: true, message: 'Payment processed but no products to boost', payment: updatedPayment };
          }

          // CORRECT IMPLEMENTATION: Create MULTIPLE payment records (one per product)
          // Based on the actual database schema (single product_id per record)
          console.log(`🔍 BOOST PAYMENT DEBUG: Creating ${productIds.length} payment records (one per product)`);
          console.log(`🔍 BOOST PAYMENT DEBUG: Product IDs to process:`, productIds);
          
          // First, update the original payment record to include product IDs for better tracking
          try {
            const enhancedMetadata = {
              productIds: productIds,
              product_ids: productIds.join(','),
              productCount: productIds.length,
              productId: productIds.length === 1 ? productIds[0] : null,
              processedAt: new Date().toISOString(),
              type: 'boost_payment'
            };
            
            // Update the original payment record with this enhanced metadata
            const { error: updateError } = await supabase
              .from('payments')
              .update({
                webhook_payload: JSON.stringify(enhancedMetadata),
                product_id: productIds.length === 1 ? Number(productIds[0]) : null
              })
              .eq('id', payment.id);
              
            if (updateError) {
              console.error(`❌ Error updating original payment with enhanced metadata:`, updateError);
            } else {
              console.log(`✅ Updated original payment #${payment.id} with enhanced product IDs metadata`);
            }
          } catch (enhanceErr) {
            console.error(`❌ Error during payment metadata enhancement:`, enhanceErr);
            // Continue processing even if this update fails
          }
          
          // Verify bill_id is present
          let effectiveBillId = billId;
          if (!effectiveBillId) {
            console.error(`❌ WARNING: billId is missing, using placeholder`);
            effectiveBillId = 'missing-' + new Date().getTime();
          }
          
          try {
            // Update the original payment record with paid status and enhanced metadata
            const enhancedMetadata = {
              productIds: productIds,
              product_ids: productIds.join(','),
              productCount: productIds.length,
              processedAt: new Date().toISOString(),
              type: 'boost_payment'
            };
            
            // First, make sure the original payment has the complete metadata
            const { data: updatedPayment, error: updateError } = await supabase
              .from('payments')
              .update({
                status: 'paid',
                bill_id: effectiveBillId,
                paid_at: paidDate || new Date(),
                webhook_payload: JSON.stringify(enhancedMetadata)
              })
              .eq('id', payment.id)
              .select()
              .single();
              
            if (updateError) {
              console.error(`❌ Error updating original payment:`, updateError);
            }
            
            console.log(`✅ Updated original payment record #${payment.id} to 'paid' status`);
            
            // Get the original payment user_id using a direct query
            let paymentUserId = "0";
            try {
              const { data: paymentData } = await supabase
                .from('payments')
                .select('user_id')
                .eq('id', payment.id)
                .single();
                
              if (paymentData && paymentData.user_id) {
                paymentUserId = String(paymentData.user_id);
                console.log(`✅ Retrieved user_id ${paymentUserId} from original payment record`);
              }
            } catch (userIdError) {
              console.error(`❌ Error retrieving user_id from payment:`, userIdError);
            }
            
            // Process each product individually - create separate payment records with forced execution
            const createdPayments = [];
            
            console.log(`🔬 DIAGNOSTIC: Beginning product loop with ${productIds.length} products`);
            console.log(`🔬 DIAGNOSTIC: Raw productIds array:`, JSON.stringify(productIds));
            console.log(`🔬 DIAGNOSTIC: Types of elements:`, productIds.map(id => typeof id));
            
            for (let i = 0; i < productIds.length; i++) {
              const pid = productIds[i];
              console.log(`🔬 DIAGNOSTIC: Processing product #${i+1} with ID '${pid}' (type: ${typeof pid})`);
              
              // Ensure robust parsing of product ID
              let productId;
              try {
                productId = Number(pid);
                console.log(`🔬 DIAGNOSTIC: Parsed productId = ${productId}, isNaN = ${isNaN(productId)}`);
              } catch (parseErr) {
                console.error(`❌ Error parsing product ID '${pid}':`, parseErr);
                productId = NaN;
              }
              
              if (isNaN(productId)) {
                console.error(`❌ Invalid product ID '${pid}' - skipping`);
                continue;
              }
              
              console.log(`🔄 Processing product #${productId} (${i+1} of ${productIds.length})`);
              
              try {
                // Generate a proper UUID for this specific product's payment record
                // Each payment record must have a unique order_id in UUID format
                // Generate a proper UUID that satisfies PostgreSQL's uuid type requirements
                let uniqueOrderId = '';
                try {
                    uniqueOrderId = crypto.randomUUID(); 
                    console.log(`🔑 Generated UUID for product #${productId}: ${uniqueOrderId}`);
                } catch (uuidErr) {
                    console.error(`❌ Error generating UUID:`, uuidErr);
                    // Skip this product if we can't generate a valid UUID
                    continue;
                }
                
                // Query the database to confirm product exists
                const product = await storage.getProductById(productId);
                
                if (!product) {
                  console.error(`❌ Product #${productId} does not exist - skipping`);
                  continue;
                }
                
                console.log(`📦 Found product: "${product.name}" (ID: ${productId})`);
                
                // DETAILED DEBUGGING: Log all values before creating payment record
                // Determine best user ID for payment record
                console.log(`🔍 BOOST PAYMENT DETAIL [Product #${productId}]:`, {
                  uniqueOrderId,
                  billId: effectiveBillId,
                  productId: productId,
                  productIdType: typeof productId,
                  amount: Math.floor(payment.amount / productIds.length),
                  originalUserId: payment.userId,
                  userIdType: typeof payment.userId,
                  paidAt: paidDate || new Date()
                });
                
                // ----- USER ID DETERMINATION LOGIC -----
                // Try multiple strategies to get a valid user ID for the payment
                let paymentUserId = "0"; // Default fallback
                
                // Strategy 1: Use payment.userId if valid
                if (payment.userId && payment.userId !== 0) {
                  paymentUserId = String(payment.userId);
                  console.log(`Using payment.userId (${paymentUserId}) for user_id`);
                }
                // Strategy 2: Use product's sellerId if available
                else if (product && product.sellerId) {
                  paymentUserId = String(product.sellerId);
                  console.log(`Using product.sellerId (${paymentUserId}) for user_id`);
                }
                // Strategy 3: Try to use webhook data if available
                else {
                  // We'll skip the webhook parsing for now as it's causing errors
                  console.log(`No user ID from primary sources - using default`);
                }
                
                if (paymentUserId === "0") {
                  console.error(`❌ CRITICAL: Could not determine user_id for payment!`);
                  console.log(`Using "0" as a last resort to prevent database errors`);
                }
                
                // Convert user ID to a number if it's not already
                let userId = paymentUserId;
                // Try to parse the user ID as a number if it's a string
                if (typeof paymentUserId === 'string') {
                  try {
                    const numericUserId = parseInt(paymentUserId, 10);
                    if (!isNaN(numericUserId)) {
                      userId = numericUserId;
                      console.log(`🔄 Converted user ID from string "${paymentUserId}" to number ${userId}`);
                    }
                  } catch (parseErr) {
                    console.error(`❌ Error parsing user ID:`, parseErr);
                  }
                }
                
                // First, get the collection_id from the original payment
                let collectionId = '';
                
                // Try to get collection_id from the original payment
                if (payment.collection_id) {
                  collectionId = payment.collection_id;
                  console.log(`Using collection_id ${collectionId} from original payment`);
                } else {
                  // Try to get it from directly querying the database
                  try {
                    const { data: paymentData } = await supabase
                      .from('payments')
                      .select('collection_id')
                      .eq('id', payment.id)
                      .single();
                      
                    if (paymentData && paymentData.collection_id) {
                      collectionId = paymentData.collection_id;
                      console.log(`Retrieved collection_id ${collectionId} from database query`);
                    }
                  } catch (collectionErr) {
                    console.error(`❌ Error getting collection_id:`, collectionErr);
                  }
                }
                
                // As a fallback, use the environment variable
                if (!collectionId) {
                  collectionId = process.env.BILLPLZ_COLLECTION_ID || '';
                  console.log(`Using collection_id '${collectionId}' from environment variable`);
                }
                
                // If still empty, use a hardcoded default (last resort)
                if (!collectionId) {
                  collectionId = '5dkdgtmo'; // Default collection ID for sandbox
                  console.log(`Using hardcoded default collection_id '${collectionId}'`);
                }
                
                // Critical: Extra verification to ensure collection_id is properly set
                console.log(`🔍 FINAL collection_id: '${collectionId}', type: ${typeof collectionId}, length: ${collectionId.length}, isEmpty: ${collectionId === ''}`);
                
                // One more safety check - if somehow it's still empty, force the default value
                if (!collectionId || collectionId.trim() === '') {
                  collectionId = '5dkdgtmo'; // Guaranteed fallback
                  console.log(`⚠️ FORCING default collection_id: '${collectionId}'`);
                }
                
                // Now create the record with ALL required fields explicitly set
                const insertData = {
                  order_id: uniqueOrderId,  // Now using proper UUID format
                  bill_id: effectiveBillId,
                  collection_id: collectionId, // CRITICAL: This was missing before
                  product_id: Number(productId),  // Explicit conversion to number
                  amount: Math.floor(payment.amount / productIds.length), 
                  user_id: userId,  // Using potentially converted user ID
                  status: 'paid',
                  paid_at: paidDate || new Date(),
                  created_at: new Date(),
                  // Add a webhook_payload with product details for better tracking
                  webhook_payload: JSON.stringify({
                    productId: productId,
                    productIds: [productId],
                    type: 'product_boost',
                    processedAt: new Date().toISOString(),
                    originalPaymentId: payment.id,
                    billId: effectiveBillId
                  })
                };
                
                // Log the exact object being inserted
                console.log(`📝 INSERT DATA:`, JSON.stringify(insertData, null, 2));
                console.log(`🔬 DIAGNOSTIC: product_id type = ${typeof insertData.product_id}, value = ${insertData.product_id}`);
                
                try {
                  // Attempt to extract the column types from the database
                  const { data: columnInfo, error: schemaError } = await supabase.rpc('get_column_types', {
                    table_name: 'payments'
                  }).maybeSingle();
                  
                  if (!schemaError && columnInfo) {
                    console.log(`🔬 DIAGNOSTIC: 'payments' table column types:`, columnInfo);
                  }
                } catch (schemaErr) {
                  console.log(`🔬 DIAGNOSTIC: Unable to get column types (this is expected if the RPC doesn't exist)`);
                }
                
                // Try direct SQL command with explicit typing as fallback
                try {
                  const { data: directResult, error: directError } = await supabase.rpc('insert_payment_record', {
                    p_order_id: insertData.order_id,
                    p_bill_id: insertData.bill_id,
                    p_product_id: insertData.product_id,
                    p_user_id: insertData.user_id,
                    p_amount: insertData.amount,
                    p_status: insertData.status
                  });
                  
                  if (directError) {
                    console.log(`🔬 DIAGNOSTIC: Direct insert failed (this is expected if the RPC doesn't exist):`, directError);
                  } else {
                    console.log(`🔬 DIAGNOSTIC: Direct insert succeeded:`, directResult);
                  }
                } catch (directErr) {
                  console.log(`🔬 DIAGNOSTIC: Direct insert error (this is expected if the RPC doesn't exist)`);
                }
                
                // Enhanced logging for debugging
                console.log(`FULL INSERT DATA FOR PRODUCT #${productId}:`, JSON.stringify(insertData, null, 2));
                
                // Directly create a strongly typed object with all required fields explicitly set
                // This ensures no null values are passed to the database
                const finalInsertData = {
                  order_id: uniqueOrderId,
                  bill_id: effectiveBillId,
                  collection_id: '5dkdgtmo',  // CRITICAL: Hardcoded to guarantee a value
                  product_id: Number(productId),
                  amount: Math.floor(payment.amount / productIds.length),
                  user_id: typeof userId === 'string' ? parseInt(userId, 10) : userId,
                  status: 'paid',
                  paid_at: new Date().toISOString(),
                  webhook_payload: JSON.stringify({
                    productId: productId,
                    type: 'product_boost',
                    originalPaymentId: payment.id
                  })
                };
                
                // Most direct and reliable approach - use a simplified insert with essential fields
                console.log(`🚨 [CRITICAL] CREATING PRODUCT RECORD - PRODUCT #${productId}: Starting individual payment record creation`);
                
                // Use a minimal set of required data that's guaranteed to work
                const essentialData = {
                  order_id: uniqueOrderId,
                  bill_id: effectiveBillId,
                  collection_id: '5dkdgtmo', // Hardcoded since we know this works
                  product_id: Number(productId),
                  amount: Math.floor(payment.amount / productIds.length),
                  user_id: typeof userId === 'string' ? parseInt(userId, 10) : userId,
                  status: 'paid',
                  paid_at: new Date().toISOString()
                };
                
                console.log(`🚨 [CRITICAL DATA] Product Payment Record: ${JSON.stringify({
                  product_id: Number(productId),
                  product_id_type: typeof Number(productId), 
                  order_id: uniqueOrderId,
                  bill_id: effectiveBillId,
                  collection_id: '5dkdgtmo',
                  user_id: essentialData.user_id,
                  user_id_type: typeof essentialData.user_id
                }, null, 2)}`);
                
                console.log(`🔬 USING SIMPLIFIED DATA:`, essentialData);
                
                // Try the most straightforward approach possible
                console.log(`⭐ [EXECUTION] Inserting product payment record for product #${productId} into database NOW`);
                
                // Before we try to insert, let's double-check what's already in the database
                const { data: existingRecords } = await supabase
                  .from('payments')
                  .select('id, product_id, bill_id')
                  .eq('bill_id', essentialData.bill_id)
                  .eq('product_id', essentialData.product_id);
                  
                console.log(`⭐ [DB CHECK] Found ${existingRecords?.length || 0} existing records for product #${productId} with bill_id ${essentialData.bill_id}`);
                
                // CRITICAL FIX: Ensure product_id is properly set and correctly typed
                console.log(`🔧 [FIX] Creating payment record for product #${productId} with explicit type handling`);
                
                // Explicitly cast the product ID to a number to match database column type
                const productIdNumber = Number(productId);
                if (isNaN(productIdNumber)) {
                  console.error(`❌ [TYPE ERROR] Product ID "${productId}" could not be converted to a number!`);
                  continue; // Skip this product
                }
                
                // Log the exact data being used to create the payment record
                console.log(`📋 [DATA] Payment record data:`, {
                  ...essentialData,
                  product_id: productIdNumber,
                  product_id_type: typeof productIdNumber
                });
                
                // CRITICAL FIX: Force-set product_id as a number to match database schema
                // Create a clean record with ONLY the properties we need
                const finalData = {
                  order_id: essentialData.order_id,
                  bill_id: essentialData.bill_id,
                  collection_id: '5dkdgtmo',
                  product_id: productIdNumber, // Clean, number-type product ID
                  amount: essentialData.amount,
                  user_id: essentialData.user_id,
                  status: 'paid',
                  paid_at: essentialData.paid_at
                };
                
                // Use a direct database insertion with focused error handling
                const { data: newPayment, error } = await supabase
                  .from('payments')
                  .insert(finalData)
                  .select()
                  .single();
                
                if (error) {
                  console.error(`❌ [CRITICAL ERROR] Failed to create payment record for product #${productId}:`, error);
                  console.error(`Error details:`, error.details || 'No details');
                  console.error(`Error hint:`, error.hint || 'No hint');
                  // Don't throw - just log and continue with other products
                  console.error(`Skipping product #${productId} due to database error`);
                  continue;
                }
                
                // Success! Log the created payment record
                console.log(`✅ [SUCCESS] Created payment record for product #${productId}:`, {
                  payment_id: newPayment.id,
                  product_id: newPayment.product_id,
                  product_id_type: typeof newPayment.product_id,
                  bill_id: newPayment.bill_id,
                  collection_id: newPayment.collection_id
                });
                
                console.log(`🔬 DIAGNOSTIC: Insert successful! New payment:`, {
                  id: newPayment.id,
                  product_id: newPayment.product_id,
                  product_id_type: typeof newPayment.product_id,
                  order_id: newPayment.order_id
                });
                
                console.log(`✅ Created payment record for product #${productId}:`, {
                  paymentId: newPayment.id,
                  orderId: newPayment.order_id,
                  billId: newPayment.bill_id,
                  productId: newPayment.product_id
                });
                
                createdPayments.push(newPayment);
                
                // Now update the product to mark it as featured directly in database
                const featureDuration = 7; // Default to 7 days
                const featureUntil = new Date();
                featureUntil.setDate(featureUntil.getDate() + featureDuration);
                
                // Update product status using exact column names from database
                const { error: productUpdateError } = await supabase
                  .from('products')
                  .update({
                    is_featured: true,
                    featured_at: new Date(),
                    featured_until: featureUntil,
                    status: 'featured'
                  })
                  .eq('id', productId);
                  
                if (productUpdateError) {
                  console.error(`❌ Error updating product featured status:`, productUpdateError);
                }
                
                console.log(`✅ Updated product #${productId} to featured status until ${featureUntil}`);
              } catch (err) {
                console.error(`❌ Error processing product #${productId}:`, err);
                console.error(`Stack trace:`, err.stack);
              }
            }
            
            // Enhanced diagnostic summary with detailed results
            console.log(`📊 [FINAL SUMMARY] Payment processing completed: 
               - Total products: ${productIds.length}
               - Created payment records: ${createdPayments.length}
               - Failed products: ${productIds.length - createdPayments.length}`);
            
            // Verify the product_id values in the created payment records
            if (createdPayments.length > 0) {
              console.log(`✅ [VERIFICATION] Product payment records created:`);
              createdPayments.forEach((p, i) => {
                console.log(`   ${i+1}. Payment ID: ${p.id}, Product ID: ${p.product_id || 'NULL'}, Bill ID: ${p.bill_id}`);
              });
            } else {
              console.log(`❌ [VERIFICATION FAILED] No product payment records were created!`);
            }
            
            // After processing, verify what's in the database
            try {
              const { data: finalCheck } = await supabase
                .from('payments')
                .select('id, product_id, bill_id')
                .eq('bill_id', effectiveBillId);
                
              console.log(`🔍 [DB FINAL CHECK] Found ${finalCheck?.length || 0} total payment records with bill_id ${effectiveBillId}:`);
              if (finalCheck && finalCheck.length > 0) {
                finalCheck.forEach((p, i) => {
                  console.log(`   ${i+1}. Payment ID: ${p.id}, Product ID: ${p.product_id || 'NULL'}`);
                });
              }
            } catch (verifyErr) {
              console.error(`❌ Error during final verification:`, verifyErr);
            }
            
            return { 
              success: true, 
              message: `Payment processed and ${createdPayments.length} product payments created`, 
              payment: updatedPayment,
              productPayments: createdPayments.map(p => ({
                id: p.id,
                productId: p.product_id,
                billId: p.bill_id
              }))
            };
          } catch (err) {
            console.error(`❌ ERROR in main payment processing:`, err);
            console.error(`Stack trace:`, err.stack);
            
            return { 
              success: false, 
              message: 'Error processing payment',
              error: err.message || 'Unknown error'
            };
          }

          // The product status update happens automatically after we create the payment records
          // This is handled by updateProductFeaturedStatusForPayment in SupabaseStorage
          
          console.log(`🚀 Payment has been marked as paid, products will be featured automatically`);
          return { 
            success: true, 
            message: `Payment processed and products will be featured`, 
            payment: updatedPayment 
          };
        } catch (productError) {
          console.error('Error updating product featured status:', productError);
          // We still return success as the payment was processed correctly
          return { 
            success: true, 
            message: 'Payment processed but error boosting products', 
            payment: updatedPayment,
            error: productError
          };
        }
      }
      
      return { success: true, message: 'Payment processed', status, payment: updatedPayment };
    } catch (error) {
      console.error('Error processing payment update:', error);
      return { success: false, message: 'Error processing payment', error };
    }
  }

  // POST /api/payments/webhook - Billplz webhook callback
  app.post('/api/payments/webhook', async (req, res) => {
    try {
      console.log('💰 PAYMENT WEBHOOK RECEIVED 💰');
      console.log('---------------------------------------');
      console.log('Headers:', req.headers);
      console.log('Received payment webhook payload:', req.body);
      console.log('Content-Type:', req.headers['content-type']);
      
      // DEBUG: Log all potential signature sources
      console.log('🔍 DEBUG: Checking all possible signature sources:');
      console.log('- x-signature header:', req.headers['x-signature']);
      console.log('- X-Signature header:', req.headers['X-Signature']);
      console.log('- x_signature in body:', req.body?.x_signature);
      console.log('- x_signature type:', typeof req.body?.x_signature);
     
      // Get the X-Signature from header OR body (Billplz might send it in either place)
      let xSignature = req.headers['x-signature'] as string || 
                       req.headers['X-Signature'] as string;
      
      // If not in headers, try to get from body
      if (!xSignature && req.body && req.body.x_signature) {
        xSignature = req.body.x_signature;
        console.log('✅ Found signature in request body');
      }
      
      // For sandbox environment, make signature optional
      const isSandbox = isBillplzSandbox();
      
      if (!xSignature && !isSandbox) {
        console.error('❌ ERROR: Missing X-Signature (checked headers and body)');
        return res.status(400).json({ message: 'Missing X-Signature header' });
      } else if (!xSignature) {
        console.warn('⚠️ SANDBOX MODE: Missing signature but continuing for testing purposes');
        // In sandbox, we'll continue without a signature for easier testing
      }
      
      console.log('🔑 X-Signature found:', xSignature);
      
      // Try signature verification
      let isValid = false;
      try {
        isValid = billplz.verifyWebhookSignature(req.body, xSignature);
        console.log('🔐 Signature verification result:', isValid ? 'VALID ✅' : 'INVALID ❌');
      } catch (sigError) {
        console.error('⚠️ Error during webhook signature verification:', sigError);
      }
      
      // Only do signature verification if we have a signature
      if (xSignature) {
        // For PRODUCTION environment, strictly enforce signature verification
        // For SANDBOX, already defined above
        if (!isValid && !isSandbox) {
          console.error('❌ ERROR: Invalid X-Signature in PRODUCTION environment');
          return res.status(401).json({ message: 'Invalid signature' });
        } else if (!isValid) {
          console.warn('⚠️ SANDBOX MODE: Invalid signature but continuing for testing');
        }
      }
      
      // Process the payment using the shared function
      console.log('⚙️ Processing payment from webhook...');
      const result = await processPaymentUpdate(req.body, true);
      console.log('⚙️ Payment processing result:', result);
      
      // Respond to the webhook
      console.log('✅ Webhook response:', { success: result.success, message: result.message });
      res.json({ success: result.success, message: result.message });
      
    } catch (error) {
      console.error('❌ ERROR: Exception in payment webhook handler:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      res.status(500).json({ message: 'Error processing payment' });
    }
  });
  
  // Billplz redirect route is registered above with middleware to capture raw query

  // GET /api/payments/process-redirect - Handle redirect from Billplz payment
  app.get('/api/payments/process-redirect', async (req, res) => {
    try {
      console.log('🔄 PAYMENT REDIRECT RECEIVED 🔄');
      console.log('---------------------------------------');
      
      // Print all available request information for debugging
      console.log('📝 Original URL:', req.originalUrl);
      console.log('📝 URL:', req.url);
      console.log('📝 Raw query string:', req.rawQuery);
      console.log('📝 Query object:', JSON.stringify(req.query, null, 2));
      console.log('📝 Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
      
      // Environment checks - only for production
      if (!process.env.BILLPLZ_XSIGN_KEY && !isBillplzSandbox()) {
        console.error('❌ ERROR: Missing BILLPLZ_XSIGN_KEY environment variable');
        return res.status(500).json({
          message: 'Server configuration error',
          details: 'Missing required environment variable for payment verification.'
        });
      }
      
      // Get sandbox status
      const isSandbox = isBillplzSandbox();
      console.log(`🌍 Running in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode`);
      
      // DEBUG: Log all available parameter formats for troubleshooting
      console.log('🔍 DEBUG: Query parameter format investigation:');
      console.log('> req.query has billplz property?', 'billplz' in req.query);
      console.log('> req.query.billplz type:', req.query.billplz ? typeof req.query.billplz : 'undefined');
      console.log('> Direct access to billplz[id]:', req.query["billplz[id]"]);
      
      // Safely access nested property
      const billplzObj = req.query.billplz as any;
      console.log('> Access via nested object:', billplzObj?.id);
      
      // Fix: Access nested billplz object (Express transforms billplz[param] to req.query.billplz.param)
      let directBillId = '';
      let directPaid = '';
      let directPaidAt = '';
      let directRef1 = '';
      let directRef2 = '';
      let directTransId = '';
      let directTransStatus = '';
      let directSignature = '';
      
      // Handle both formats: nested object and flat parameters
      if (req.query.billplz && typeof req.query.billplz === 'object') {
        // Express 4.18+ with nested objects
        const billplz = req.query.billplz as any;
        directBillId = billplz.id || '';
        directPaid = billplz.paid || '';
        directPaidAt = billplz.paid_at || '';
        directRef1 = billplz.reference_1 || '';
        directRef2 = billplz.reference_2 || '';
        directTransId = billplz.transaction_id || '';
        directTransStatus = billplz.transaction_status || '';
        directSignature = billplz.x_signature || '';
        
        console.log('✅ Using nested billplz object format');
      } else {
        // Flat key format
        directBillId = req.query["billplz[id]"] as string || "";
        directPaid = req.query["billplz[paid]"] as string || "";
        directPaidAt = req.query["billplz[paid_at]"] as string || "";
        directRef1 = req.query["billplz[reference_1]"] as string || "";
        directRef2 = req.query["billplz[reference_2]"] as string || "";
        directTransId = req.query["billplz[transaction_id]"] as string || "";
        directTransStatus = req.query["billplz[transaction_status]"] as string || "";
        directSignature = req.query["billplz[x_signature]"] as string || "";
        
        console.log('✅ Using flat billplz parameter format');
      }
      
      console.log('🧩 Direct parameter access:');
      console.log('- Bill ID:', directBillId);
      console.log('- Paid status:', directPaid);
      console.log('- Paid at:', directPaidAt);
      console.log('- Order ID (reference_1):', directRef1);
      console.log('- Product ID (reference_2):', directRef2);
      console.log('- Transaction ID:', directTransId);
      console.log('- Transaction status:', directTransStatus);
      console.log('- X-Signature:', directSignature);
      
      // Only require billId (make signature optional in sandbox)
      if (!directBillId) {
        console.error('❌ ERROR: Missing critical redirect parameter: billId');
        return res.status(400).json({
          message: 'Invalid payment redirect: missing bill ID',
          details: 'Required parameter billplz[id] not found.'
        });
      }
      
      // Make signature optional in sandbox environment
      if (!directSignature && !isBillplzSandbox()) {
        console.error('❌ ERROR: Missing signature in production environment');
        return res.status(400).json({
          message: 'Invalid payment redirect: missing signature',
          details: 'Required parameter billplz[x_signature] not found.'
        });
      } else if (!directSignature) {
        console.warn('⚠️ SANDBOX MODE: Missing signature but continuing for testing purposes');
      }
      
      // Build the paymentData object 
      const paymentData = {
        id: directBillId,
        paid: directPaid,
        paid_at: directPaidAt,
        reference_1: directRef1,
        reference_2: directRef2,
        transaction_id: directTransId,
        transaction_status: directTransStatus
      };
      
      console.log('📦 Payment data for processing:', paymentData);
      
      // Attempt to validate the signature
      let signatureValid = false;
      
      // First, try signature verification if we have a raw query string
      if (req.rawQuery) {
        try {
          signatureValid = billplz.verifyRedirectSignature(req.rawQuery, directSignature);
          console.log('🔐 Signature verification result:', signatureValid ? 'VALID ✅' : 'INVALID ❌');
        } catch (sigError) {
          console.error('⚠️ Error during signature verification:', sigError);
          // Continue processing even if signature verification fails temporarily
        }
      } else {
        console.warn('⚠️ No raw query string available for signature verification');
      }
      
      // For PRODUCTION environment, strictly enforce signature verification
      // For SANDBOX, allow bypass for testing
      
      if (!signatureValid && !isSandbox) {
        console.error('❌ ERROR: Signature verification failed in PRODUCTION environment');
        return res.status(401).json({
          message: 'Invalid payment redirect: signature verification failed',
          details: 'The payment signature could not be verified in production environment.'
        });
      }
      
      // Process the payment - this updates the database
      console.log('⚙️ Processing payment from redirect...');
      const result = await processPaymentUpdate(paymentData, false);
      console.log('⚙️ Payment processing result:', result);
      
      // Determine UI state based on the payment status
      const isPaid = directPaid === 'true';
      const uiState = result.success && isPaid ? 'success' : 
                      isPaid === false ? 'failed' : 'pending';
      
      // Build a redirect URL with appropriate status
      const message = encodeURIComponent(
        uiState === 'success' ? 'Payment completed successfully! Your products will be boosted now.' :
        uiState === 'failed' ? 'Payment was not successful. Please try again.' : 
        'Payment is being processed. Please wait a moment.'
      );
      
      const redirectUrl = `/seller/dashboard?payment=${uiState}&message=${message}&id=${encodeURIComponent(directBillId || '')}`;
      
      console.log(`🔄 Redirecting user to: ${redirectUrl}`);
      
      // Use 303 status code (See Other) to follow the spec for redirects after actions
      return res.redirect(303, redirectUrl);
      
    } catch (error) {
      console.error('❌ ERROR: Exception in payment redirect handler:', error);
      // Log the detailed error
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
      }
      
      // Provide a user-friendly error redirect
      return res.redirect('/seller/dashboard?payment=error&message=Error+processing+payment&details=An+unexpected+error+occurred');
    }
  });
  
  // GET /api/payments/user - Get user's payments
  app.get('/api/payments/user', async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Unauthorized: Please log in to view payments' });
      }
      
      const payments = await storage.getUserPayments(req.user.id);
      res.json(payments);
      
    } catch (error) {
      console.error('Error retrieving user payments:', error);
      res.status(500).json({ message: 'Error retrieving payments' });
    }
  });
  
  return httpServer;
}