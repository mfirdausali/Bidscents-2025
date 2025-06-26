/**
 * Ownership Verification Middleware
 * 
 * This module provides middleware functions to verify ownership of resources
 * before allowing access to protected operations. It includes admin bypass
 * functionality and proper error handling.
 */

import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { getUserFromToken } from '../app-auth';
import { 
  Product, 
  Auction, 
  Order, 
  Message, 
  Review, 
  ProductImage,
  User 
} from '../../shared/schema';

// Extend Express Request to include authenticated user and loaded resources
declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: User;
      loadedResource?: {
        product?: Product;
        auction?: Auction;
        order?: Order;
        message?: Message;
        review?: Review;
        productImage?: ProductImage;
      };
    }
  }
}

/**
 * Generic ownership verification configuration
 */
interface OwnershipConfig<T> {
  resourceName: string;
  loadResource: (id: number | string) => Promise<T | null>;
  getOwnerId: (resource: T) => number;
  attachToRequest?: (req: Request, resource: T) => void;
}

/**
 * Creates a generic ownership verification middleware
 */
function createOwnershipMiddleware<T>(config: OwnershipConfig<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get authenticated user
      const tokenUser = getUserFromToken(req);
      if (!tokenUser) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Authentication required' 
        });
      }

      // Get full user details
      const user = await storage.getUser(tokenUser.id);
      if (!user) {
        return res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'User not found' 
        });
      }

      // Attach authenticated user to request
      req.authenticatedUser = user;

      // Admin bypass - admins can access any resource
      if (user.isAdmin) {
        return next();
      }

      // Get resource ID from params
      const resourceId = req.params.id || req.params.productId || req.params.auctionId || 
                        req.params.orderId || req.params.messageId || req.params.reviewId || 
                        req.params.imageId;

      if (!resourceId) {
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Resource ID not provided' 
        });
      }

      // Load the resource
      const resource = await config.loadResource(resourceId);
      if (!resource) {
        return res.status(404).json({ 
          error: 'Not Found', 
          message: `${config.resourceName} not found` 
        });
      }

      // Verify ownership
      const ownerId = config.getOwnerId(resource);
      if (ownerId !== user.id) {
        return res.status(403).json({ 
          error: 'Forbidden', 
          message: `You do not have permission to access this ${config.resourceName.toLowerCase()}` 
        });
      }

      // Attach resource to request for reuse
      if (config.attachToRequest) {
        config.attachToRequest(req, resource);
      }

      next();
    } catch (error) {
      console.error(`Ownership verification error for ${config.resourceName}:`, error);
      return res.status(500).json({ 
        error: 'Internal Server Error', 
        message: 'Failed to verify ownership' 
      });
    }
  };
}

/**
 * Verify product ownership middleware
 * Checks if the authenticated user is the seller of the product
 */
export const verifyProductOwnership = createOwnershipMiddleware<Product>({
  resourceName: 'Product',
  loadResource: async (id) => {
    const productId = parseInt(id as string);
    if (isNaN(productId)) return null;
    return await storage.getProduct(productId);
  },
  getOwnerId: (product) => product.sellerId,
  attachToRequest: (req, product) => {
    if (!req.loadedResource) req.loadedResource = {};
    req.loadedResource.product = product;
  }
});

/**
 * Verify auction ownership middleware
 * Checks if the authenticated user owns the product associated with the auction
 */
export const verifyAuctionOwnership = createOwnershipMiddleware<Auction & { product?: Product }>({
  resourceName: 'Auction',
  loadResource: async (id) => {
    const auctionId = parseInt(id as string);
    if (isNaN(auctionId)) return null;
    
    const auction = await storage.getAuction(auctionId);
    if (!auction) return null;
    
    // Load associated product to check ownership
    const product = await storage.getProduct(auction.productId);
    return product ? { ...auction, product } : null;
  },
  getOwnerId: (auction) => auction.product?.sellerId || 0,
  attachToRequest: (req, auction) => {
    if (!req.loadedResource) req.loadedResource = {};
    req.loadedResource.auction = auction;
    if (auction.product) {
      req.loadedResource.product = auction.product;
    }
  }
});

/**
 * Verify order ownership middleware
 * Checks if the authenticated user is the buyer of the order
 */
export const verifyOrderOwnership = createOwnershipMiddleware<Order>({
  resourceName: 'Order',
  loadResource: async (id) => {
    const orderId = parseInt(id as string);
    if (isNaN(orderId)) return null;
    return await storage.getOrder(orderId);
  },
  getOwnerId: (order) => order.userId,
  attachToRequest: (req, order) => {
    if (!req.loadedResource) req.loadedResource = {};
    req.loadedResource.order = order;
  }
});

/**
 * Verify message access middleware
 * Checks if the authenticated user is either the sender or receiver of the message
 */
export const verifyMessageAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get authenticated user
    const tokenUser = getUserFromToken(req);
    if (!tokenUser) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    // Get full user details
    const user = await storage.getUser(tokenUser.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    // Attach authenticated user to request
    req.authenticatedUser = user;

    // Admin bypass
    if (user.isAdmin) {
      return next();
    }

    // Get message ID
    const messageId = req.params.messageId || req.params.id;
    if (!messageId) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Message ID not provided' 
      });
    }

    // Load the message
    const message = await storage.getMessage(parseInt(messageId));
    if (!message) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Message not found' 
      });
    }

    // Verify user is either sender or receiver
    if (message.senderId !== user.id && message.receiverId !== user.id) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'You do not have permission to access this message' 
      });
    }

    // Attach message to request for reuse
    if (!req.loadedResource) req.loadedResource = {};
    req.loadedResource.message = message;

    next();
  } catch (error) {
    console.error('Message access verification error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to verify message access' 
    });
  }
};

/**
 * Verify review ownership middleware
 * Checks if the authenticated user is the author of the review
 */
export const verifyReviewOwnership = createOwnershipMiddleware<Review>({
  resourceName: 'Review',
  loadResource: async (id) => {
    const reviewId = parseInt(id as string);
    if (isNaN(reviewId)) return null;
    return await storage.getReview(reviewId);
  },
  getOwnerId: (review) => review.userId,
  attachToRequest: (req, review) => {
    if (!req.loadedResource) req.loadedResource = {};
    req.loadedResource.review = review;
  }
});

/**
 * Verify image ownership middleware
 * Checks if the authenticated user owns the product associated with the image
 */
export const verifyImageOwnership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get authenticated user
    const tokenUser = getUserFromToken(req);
    if (!tokenUser) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    // Get full user details
    const user = await storage.getUser(tokenUser.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    // Attach authenticated user to request
    req.authenticatedUser = user;

    // Admin bypass
    if (user.isAdmin) {
      return next();
    }

    // Get image and product IDs
    const imageId = req.params.imageId;
    const productId = req.params.productId;

    if (!imageId || !productId) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Image ID and Product ID are required' 
      });
    }

    // Load the product
    const product = await storage.getProduct(parseInt(productId));
    if (!product) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Product not found' 
      });
    }

    // Verify product ownership
    if (product.sellerId !== user.id) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'You do not have permission to manage images for this product' 
      });
    }

    // Load the product image to verify it belongs to the product
    const productImage = await storage.getProductImage(parseInt(imageId));
    if (!productImage || productImage.productId !== product.id) {
      return res.status(404).json({ 
        error: 'Not Found', 
        message: 'Image not found or does not belong to this product' 
      });
    }

    // Attach resources to request for reuse
    if (!req.loadedResource) req.loadedResource = {};
    req.loadedResource.product = product;
    req.loadedResource.productImage = productImage;

    next();
  } catch (error) {
    console.error('Image ownership verification error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to verify image ownership' 
    });
  }
};

/**
 * Verify seller access middleware
 * Ensures the user is a seller before allowing access
 */
export const verifySellerAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get authenticated user
    const tokenUser = getUserFromToken(req);
    if (!tokenUser) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    // Get full user details
    const user = await storage.getUser(tokenUser.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    // Attach authenticated user to request
    req.authenticatedUser = user;

    // Check if user is a seller
    if (!user.isSeller && !user.isAdmin) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Seller account required' 
      });
    }

    next();
  } catch (error) {
    console.error('Seller access verification error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to verify seller access' 
    });
  }
};

/**
 * Verify admin access middleware
 * Ensures the user is an admin before allowing access
 */
export const verifyAdminAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get authenticated user
    const tokenUser = getUserFromToken(req);
    if (!tokenUser) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    // Get full user details
    const user = await storage.getUser(tokenUser.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    // Attach authenticated user to request
    req.authenticatedUser = user;

    // Check if user is an admin
    if (!user.isAdmin) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Admin access required' 
      });
    }

    next();
  } catch (error) {
    console.error('Admin access verification error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to verify admin access' 
    });
  }
};

/**
 * Verify user profile access middleware
 * Checks if the authenticated user is accessing their own profile
 */
export const verifyProfileAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get authenticated user
    const tokenUser = getUserFromToken(req);
    if (!tokenUser) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    // Get full user details
    const user = await storage.getUser(tokenUser.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    // Attach authenticated user to request
    req.authenticatedUser = user;

    // Admin bypass
    if (user.isAdmin) {
      return next();
    }

    // Get target user ID
    const targetUserId = parseInt(req.params.id || req.params.userId);
    if (isNaN(targetUserId)) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'Invalid user ID' 
      });
    }

    // Verify user is accessing their own profile
    if (targetUserId !== user.id) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'You can only access your own profile' 
      });
    }

    next();
  } catch (error) {
    console.error('Profile access verification error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Failed to verify profile access' 
    });
  }
};

/**
 * Helper function to get loaded resource from request
 * This can be used in route handlers to avoid reloading resources
 */
export function getLoadedResource<T extends keyof NonNullable<Request['loadedResource']>>(
  req: Request, 
  resourceType: T
): NonNullable<Request['loadedResource']>[T] | undefined {
  return req.loadedResource?.[resourceType];
}

/**
 * Helper function to get authenticated user from request
 * This can be used after ownership middleware has run
 */
export function getAuthenticatedUserFromRequest(req: Request): User | undefined {
  return req.authenticatedUser;
}