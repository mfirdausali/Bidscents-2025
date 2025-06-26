/**
 * Authorization Fix for BidScents Routes
 * 
 * This file contains the fixed implementations of vulnerable endpoints
 * that were accepting sellerId from request body/query instead of using
 * the authenticated user's ID from the JWT token.
 * 
 * Key security fixes:
 * 1. Always use req.user.id from JWT authentication
 * 2. Never trust sellerId from request body or query parameters
 * 3. Add ownership verification before allowing modifications
 * 4. Use consistent authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import { getAuthService } from './auth-service';
import { storage } from './storage';
import { insertProductSchema } from '../shared/schema';

// Extend Express Request to include authenticated user
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    username: string;
    isSeller: boolean;
    isAdmin: boolean;
    isBanned: boolean;
  };
}

/**
 * FIXED: Product Update Endpoint
 * Security: Uses authenticated user ID, verifies ownership
 */
export const updateProductFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // SECURITY: Require authentication - no bypass allowed
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required", 
        code: "AUTH_REQUIRED" 
      });
    }

    // SECURITY: Require seller account
    if (!req.user.isSeller) {
      return res.status(403).json({ 
        message: "Seller account required", 
        code: "SELLER_REQUIRED" 
      });
    }

    const productId = parseInt(req.params.id);
    const product = await storage.getProductById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // SECURITY: Verify ownership - user can only edit their own products
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only edit your own products",
        code: "OWNERSHIP_REQUIRED"
      });
    }

    // SECURITY: Force sellerId to authenticated user's ID
    const validatedData = insertProductSchema.parse({
      ...req.body,
      sellerId: req.user.id // Always use authenticated user's ID
    });

    const updatedProduct = await storage.updateProduct(productId, validatedData);
    res.json(updatedProduct);
  } catch (error) {
    next(error);
  }
};

/**
 * FIXED: Product Delete Endpoint
 * Security: Uses authenticated user ID, verifies ownership
 */
export const deleteProductFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // SECURITY: Require authentication
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required", 
        code: "AUTH_REQUIRED" 
      });
    }

    // SECURITY: Require seller account
    if (!req.user.isSeller) {
      return res.status(403).json({ 
        message: "Seller account required", 
        code: "SELLER_REQUIRED" 
      });
    }

    const productId = parseInt(req.params.id);
    const product = await storage.getProductById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // SECURITY: Verify ownership
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only delete your own products",
        code: "OWNERSHIP_REQUIRED"
      });
    }

    // Check if product has active auctions
    const activeAuctions = await storage.getActiveAuctionsByProductId(productId);
    if (activeAuctions.length > 0) {
      return res.status(400).json({ 
        message: "Cannot delete product with active auctions",
        code: "ACTIVE_AUCTIONS_EXIST"
      });
    }

    await storage.deleteProduct(productId);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * FIXED: Auction Update Endpoint
 * Security: Uses authenticated user ID, verifies ownership through product
 */
export const updateAuctionFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // SECURITY: Require authentication
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required", 
        code: "AUTH_REQUIRED" 
      });
    }

    // SECURITY: Require seller account
    if (!req.user.isSeller) {
      return res.status(403).json({ 
        message: "Seller account required", 
        code: "SELLER_REQUIRED" 
      });
    }

    const auctionId = parseInt(req.params.id);
    const auction = await storage.getAuctionById(auctionId);
    
    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }
    
    // Get the associated product to verify ownership
    const product = await storage.getProductById(auction.productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    
    // SECURITY: Verify ownership through product
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only edit your own auctions",
        code: "OWNERSHIP_REQUIRED"
      });
    }
    
    // Update product information if provided
    if (req.body.product) {
      const productData = {
        ...req.body.product,
        sellerId: req.user.id // Force correct seller ID
      };
      
      const validatedProductData = insertProductSchema.parse(productData);
      await storage.updateProduct(product.id, validatedProductData);
    }
    
    // Update auction information if provided
    if (req.body.auction) {
      const auctionData = req.body.auction;
      
      // Restrict updates if auction has bids
      if (auction.currentBid && auction.currentBid > 0) {
        // Only allow updating certain fields when bids exist
        const safeAuctionData = {
          buyNowPrice: auctionData.buyNowPrice,
          // Add other safe fields as needed
        };
        await storage.updateAuction(auctionId, safeAuctionData);
      } else {
        // No bids yet, can update all fields
        await storage.updateAuction(auctionId, auctionData);
      }
    }
    
    // Return updated data
    const updatedAuction = await storage.getAuctionById(auctionId);
    const updatedProduct = await storage.getProductById(auction.productId);
    
    res.json({
      auction: updatedAuction,
      product: updatedProduct
    });
  } catch (error) {
    next(error);
  }
};

/**
 * FIXED: Create Auction Endpoint
 * Security: Uses authenticated user ID, verifies product ownership
 */
export const createAuctionFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // SECURITY: Require authentication
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required", 
        code: "AUTH_REQUIRED" 
      });
    }

    // SECURITY: Require seller account
    if (!req.user.isSeller) {
      return res.status(403).json({ 
        message: "Seller account required", 
        code: "SELLER_REQUIRED" 
      });
    }

    const { product: productData, auction: auctionData } = req.body;

    // Create product with authenticated user as seller
    const productToCreate = {
      ...productData,
      sellerId: req.user.id // Force authenticated user as seller
    };

    const validatedProduct = insertProductSchema.parse(productToCreate);
    const newProduct = await storage.createProduct(validatedProduct);

    // Create auction for the product
    const auctionToCreate = {
      ...auctionData,
      productId: newProduct.id,
      status: 'active',
      currentBid: auctionData.startingBid || 0
    };

    const newAuction = await storage.createAuction(auctionToCreate);

    res.status(201).json({
      product: newProduct,
      auction: newAuction
    });
  } catch (error) {
    next(error);
  }
};

/**
 * FIXED: Product Image Upload Endpoint
 * Security: Uses authenticated user ID, verifies product ownership
 */
export const uploadProductImageFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // SECURITY: Require authentication
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required", 
        code: "AUTH_REQUIRED" 
      });
    }

    // SECURITY: Require seller account
    if (!req.user.isSeller) {
      return res.status(403).json({ 
        message: "Seller account required", 
        code: "SELLER_REQUIRED" 
      });
    }

    const productId = parseInt(req.params.id);
    const product = await storage.getProductById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // SECURITY: Verify ownership
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only upload images to your own products",
        code: "OWNERSHIP_REQUIRED"
      });
    }

    // Process image upload (implementation depends on your storage solution)
    // ... image upload logic ...

    res.json({ message: "Image uploaded successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * FIXED: Product Image Delete Endpoint
 * Security: Uses authenticated user ID, verifies ownership
 */
export const deleteProductImageFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // SECURITY: Require authentication
    if (!req.user) {
      return res.status(401).json({ 
        message: "Authentication required", 
        code: "AUTH_REQUIRED" 
      });
    }

    // SECURITY: Require seller account
    if (!req.user.isSeller) {
      return res.status(403).json({ 
        message: "Seller account required", 
        code: "SELLER_REQUIRED" 
      });
    }

    const productId = parseInt(req.params.productId);
    const imageId = parseInt(req.params.imageId);
    
    const product = await storage.getProductById(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // SECURITY: Verify ownership
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only delete images from your own products",
        code: "OWNERSHIP_REQUIRED"
      });
    }

    // Verify image belongs to product
    const image = await storage.getProductImage(imageId);
    if (!image || image.productId !== productId) {
      return res.status(404).json({ message: "Image not found" });
    }

    await storage.deleteProductImage(imageId);
    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * FIXED: Get Seller Products Endpoint
 * Security: Uses authenticated user ID when no sellerId provided
 */
export const getSellerProductsFixed = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    let sellerId: number;

    // If sellerId is provided in query, use it (for public viewing)
    if (req.query.sellerId) {
      sellerId = parseInt(req.query.sellerId as string);
    } else if (req.user && req.user.isSeller) {
      // If no sellerId provided but user is authenticated seller, show their products
      sellerId = req.user.id;
    } else {
      return res.status(400).json({ 
        message: "Seller ID required or must be authenticated as seller",
        code: "SELLER_ID_REQUIRED"
      });
    }

    const products = await storage.getProductsBySellerId(sellerId);
    res.json(products);
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to integrate auth service middleware
 */
export function setupAuthenticatedRoutes(app: any) {
  const authService = getAuthService();
  
  // Apply auth middleware and fixed handlers
  app.put("/api/products/:id", authService.requireAuth, updateProductFixed);
  app.delete("/api/products/:id", authService.requireAuth, deleteProductFixed);
  app.put("/api/auctions/:id", authService.requireAuth, updateAuctionFixed);
  app.post("/api/auctions", authService.requireAuth, createAuctionFixed);
  app.post("/api/products/:id/images", authService.requireAuth, uploadProductImageFixed);
  app.delete("/api/products/:productId/images/:imageId", authService.requireAuth, deleteProductImageFixed);
  app.get("/api/seller/products", getSellerProductsFixed); // Can work with or without auth
}