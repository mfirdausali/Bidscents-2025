import { Router } from "express";
import { storage } from "../storage";
import { insertBidSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get bids for the current user
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    // Optional status filter
    const status = req.query.status as string | undefined;
    const bids = await storage.getUserBids(req.user.id, status);
    res.json(bids);
  } catch (error) {
    res.status(500).json({ error: "Failed to get bids" });
  }
});

// Get bids for a specific product
router.get("/product/:productId", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    
    // Check if the product exists
    const product = await storage.getProductById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const bids = await storage.getProductBids(productId);
    res.json(bids);
  } catch (error) {
    res.status(500).json({ error: "Failed to get bids for product" });
  }
});

// Get highest bid for a specific product
router.get("/product/:productId/highest", async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (isNaN(productId)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }
    
    // Check if the product exists
    const product = await storage.getProductById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const bids = await storage.getProductBids(productId);
    
    // Find the highest accepted bid, or the highest pending bid
    const acceptedBids = bids.filter(b => b.status === "accepted");
    if (acceptedBids.length > 0) {
      const highestAccepted = acceptedBids.sort((a, b) => b.amount - a.amount)[0];
      return res.json(highestAccepted);
    }
    
    const pendingBids = bids.filter(b => b.status === "pending");
    if (pendingBids.length > 0) {
      const highestPending = pendingBids.sort((a, b) => b.amount - a.amount)[0];
      return res.json(highestPending);
    }
    
    res.json(null);
  } catch (error) {
    res.status(500).json({ error: "Failed to get highest bid" });
  }
});

// Create a new bid
router.post("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const validationSchema = insertBidSchema.extend({
      productId: z.number(),
      amount: z.number().positive()
    });
    
    const bidData = validationSchema.parse({
      ...req.body,
      userId: req.user.id,
      status: "pending"
    });
    
    // Check if the product exists
    const product = await storage.getProductById(bidData.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // For now, all products accept bids
    // In the future, we could add an allowOffers property to the product model
    
    // Check if the user is not bidding on their own product
    if (product.sellerId === req.user.id) {
      return res.status(400).json({ error: "You cannot bid on your own product" });
    }
    
    const bid = await storage.createBid(bidData);
    
    // Create a notification for the seller
    await storage.createNotification({
      userId: product.sellerId,
      type: "bid",
      content: `New bid of $${bid.amount.toFixed(2)} on "${product.name}"`,
      relatedId: bid.id
    });
    
    res.status(201).json(bid);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to create bid" });
  }
});

// Update a bid status (accept/reject)
router.patch("/:id/status", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const bidId = parseInt(req.params.id);
    if (isNaN(bidId)) {
      return res.status(400).json({ error: "Invalid bid ID" });
    }
    
    const { status } = z.object({ 
      status: z.enum(["pending", "accepted", "rejected"]) 
    }).parse(req.body);
    
    // Check if the bid exists
    const bid = await storage.getBidById(bidId);
    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }
    
    // Check if the product exists
    const product = await storage.getProductById(bid.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Only the seller of the product can update the bid status
    if (product.sellerId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized: Only the seller can update bid status" });
    }
    
    const updatedBid = await storage.updateBidStatus(bidId, status);
    
    // Create a notification for the bidder
    const statusText = status === "accepted" ? "accepted" : "rejected";
    await storage.createNotification({
      userId: bid.userId,
      type: "bid_update",
      content: `Your bid of $${bid.amount.toFixed(2)} on "${product.name}" was ${statusText}`,
      relatedId: bid.id
    });
    
    res.json(updatedBid);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to update bid status" });
  }
});

export default router;