import { Router } from "express";
import { storage } from "../storage";
import { insertBookmarkSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get bookmarks for the current user
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const bookmarks = await storage.getUserBookmarks(req.user.id);
    res.json(bookmarks);
  } catch (error) {
    res.status(500).json({ error: "Failed to get bookmarks" });
  }
});

// Add a product to bookmarks
router.post("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const validationSchema = insertBookmarkSchema.extend({
      productId: z.number()
    });
    
    const bookmarkData = validationSchema.parse({
      ...req.body,
      userId: req.user.id
    });
    
    // Check if already bookmarked
    const existingBookmark = await storage.getBookmarkByProductId(req.user.id, bookmarkData.productId);
    if (existingBookmark) {
      return res.status(400).json({ error: "Product already bookmarked" });
    }
    
    // Check if the product exists
    const product = await storage.getProductById(bookmarkData.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const bookmark = await storage.addBookmark(bookmarkData);
    res.status(201).json(bookmark);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to add bookmark" });
  }
});

// Remove a bookmark
router.delete("/:id", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const bookmarkId = parseInt(req.params.id);
    if (isNaN(bookmarkId)) {
      return res.status(400).json({ error: "Invalid bookmark ID" });
    }
    
    // Check if the bookmark exists and belongs to the user
    const bookmark = await storage.getBookmarkById(bookmarkId);
    if (!bookmark) {
      return res.status(404).json({ error: "Bookmark not found" });
    }
    
    if (bookmark.userId !== req.user.id) {
      return res.status(403).json({ error: "You can only remove your own bookmarks" });
    }
    
    await storage.removeBookmark(bookmarkId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to remove bookmark" });
  }
});

export default router;