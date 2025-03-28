import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertProductSchema, insertCartItemSchema, insertReviewSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

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

  // Cart endpoints
  app.get("/api/cart", async (req, res, next) => {
    try {
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Cart access denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId) {
          console.log("Using session backup authentication for cart");
          const user = await storage.getUser(req.session.userId);
          if (user) {
            console.log("Session user found:", user.username);
            req.user = user;
          } else {
            return res.status(401).json({ message: "Unauthorized" });
          }
        } else {
          return res.status(401).json({ message: "Unauthorized" });
        }
      }
      
      console.log("Cart access granted for user:", req.user.username);
      const cartItems = await storage.getCartItems(req.user.id);
      res.json(cartItems);
    } catch (error) {
      console.error("Error accessing cart:", error);
      next(error);
    }
  });

  app.post("/api/cart", async (req, res, next) => {
    try {
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Cart add denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId) {
          console.log("Using session backup authentication for cart add");
          const user = await storage.getUser(req.session.userId);
          if (user) {
            console.log("Session user found:", user.username);
            req.user = user;
          } else {
            return res.status(401).json({ message: "Unauthorized" });
          }
        } else {
          return res.status(401).json({ message: "Unauthorized" });
        }
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
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Cart update denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId) {
          console.log("Using session backup authentication for cart update");
          const user = await storage.getUser(req.session.userId);
          if (user) {
            console.log("Session user found:", user.username);
            req.user = user;
          } else {
            return res.status(401).json({ message: "Unauthorized" });
          }
        } else {
          return res.status(401).json({ message: "Unauthorized" });
        }
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
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Cart delete denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId) {
          console.log("Using session backup authentication for cart delete");
          const user = await storage.getUser(req.session.userId);
          if (user) {
            console.log("Session user found:", user.username);
            req.user = user;
          } else {
            return res.status(401).json({ message: "Unauthorized" });
          }
        } else {
          return res.status(401).json({ message: "Unauthorized" });
        }
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
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Review creation denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId) {
          console.log("Using session backup authentication for review creation");
          const user = await storage.getUser(req.session.userId);
          if (user) {
            console.log("Session user found:", user.username);
            req.user = user;
          } else {
            return res.status(401).json({ message: "Unauthorized" });
          }
        } else {
          return res.status(401).json({ message: "Unauthorized" });
        }
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
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Seller products access denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId) {
          console.log("Using session backup authentication for seller products");
          const user = await storage.getUser(req.session.userId);
          if (user) {
            console.log("Session user found:", user.username);
            req.user = user;
          } else {
            return res.status(401).json({ message: "Unauthorized" });
          }
        } else {
          return res.status(401).json({ message: "Unauthorized" });
        }
      }
      
      // Verify seller status
      if (!req.user.isSeller) {
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
      console.log("=== ADMIN AUTH DEBUGGING ===");
      console.log("Admin users API called - Auth status:", req.isAuthenticated());
      console.log("Session ID:", req.sessionID);
      console.log("Session data:", req.session);
      console.log("User data:", req.user);
      
      // First check if Passport.js authentication is working
      if (!req.isAuthenticated()) {
        console.log("Passport authentication failed - Checking session backup");
        
        // Fallback to session-stored authentication
        if (req.session.userId && req.session.isAdmin === true) {
          console.log("Session backup authentication succeeded");
          
          // If session has valid admin credentials but passport auth failed,
          // manually fetch the user and continue
          if (req.session.userId) {
            const user = await storage.getUser(req.session.userId);
            if (user && user.isAdmin) {
              console.log("Manually fetched user:", user.username);
              req.user = user;
            }
          } else {
            console.log("Session user ID invalid or not admin");
            return res.status(403).json({ message: "Unauthorized: Not authenticated" });
          }
        } else {
          console.log("No valid authentication in session either");
          return res.status(403).json({ message: "Unauthorized: Not authenticated" });
        }
      }
      
      // Now check admin status
      if (!req.user || !req.user.isAdmin) {
        console.log("Admin access denied - isAdmin:", req.user?.isAdmin);
        return res.status(403).json({ message: "Unauthorized: Admin account required" });
      }
      
      console.log("Authentication successful - Admin access granted");
      const users = await storage.getAllUsers();
      console.log("Retrieved users from DB:", users.length);
      res.json(users);
    } catch (error) {
      console.error("Error in admin/users endpoint:", error);
      next(error);
    }
  });

  app.patch("/api/admin/users/:id/ban", async (req, res, next) => {
    try {
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Admin ban user denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId && req.session.isAdmin) {
          console.log("Using session backup authentication for admin ban user");
          const user = await storage.getUser(req.session.userId);
          if (user && user.isAdmin) {
            console.log("Session admin found:", user.username);
            req.user = user;
          } else {
            return res.status(403).json({ message: "Unauthorized: Admin account required" });
          }
        } else {
          return res.status(403).json({ message: "Unauthorized: Admin account required" });
        }
      }
      
      // Double-check admin status
      if (!req.user.isAdmin) {
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
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Admin orders access denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId && req.session.isAdmin) {
          console.log("Using session backup authentication for admin orders");
          const user = await storage.getUser(req.session.userId);
          if (user && user.isAdmin) {
            console.log("Session admin found:", user.username);
            req.user = user;
          } else {
            return res.status(403).json({ message: "Unauthorized: Admin account required" });
          }
        } else {
          return res.status(403).json({ message: "Unauthorized: Admin account required" });
        }
      }
      
      // Double-check admin status
      if (!req.user.isAdmin) {
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
      // More robust authentication check
      if (!req.isAuthenticated() || !req.user) {
        console.log("Admin order update denied - not authenticated");
        // Check if we have session-based auth as backup
        if (req.session && req.session.userId && req.session.isAdmin) {
          console.log("Using session backup authentication for admin order update");
          const user = await storage.getUser(req.session.userId);
          if (user && user.isAdmin) {
            console.log("Session admin found:", user.username);
            req.user = user;
          } else {
            return res.status(403).json({ message: "Unauthorized: Admin account required" });
          }
        } else {
          return res.status(403).json({ message: "Unauthorized: Admin account required" });
        }
      }
      
      // Double-check admin status
      if (!req.user.isAdmin) {
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

  const httpServer = createServer(app);
  return httpServer;
}
