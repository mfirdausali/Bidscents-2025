import { Router } from "express";
import { storage } from "../storage";
import { insertMessageSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get all messages for the current user
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const messages = await storage.getUserMessages(req.user.id);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// Get conversation with a specific user
router.get("/conversation/:userId", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const otherUserId = parseInt(req.params.userId);
    if (isNaN(otherUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }
    
    // Check if the other user exists
    const otherUser = await storage.getUser(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const messages = await storage.getMessagesByConversation(req.user.id, otherUserId);
    
    // Mark all messages from the other user as read
    for (const message of messages) {
      if (message.senderId === otherUserId && !message.isRead) {
        await storage.markMessageAsRead(message.id);
      }
    }
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Failed to get conversation" });
  }
});

// Send a message to another user
router.post("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const validationSchema = insertMessageSchema.extend({
      receiverId: z.number(),
      content: z.string().min(1).max(500),
      productId: z.number().optional().nullable()
    });
    
    const messageData = validationSchema.parse({
      ...req.body,
      senderId: req.user.id
    });
    
    // Check if receiver exists
    const receiver = await storage.getUser(messageData.receiverId);
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    }
    
    // Create the message
    const message = await storage.createMessage(messageData);
    
    // Create a notification for the receiver
    await storage.createNotification({
      userId: messageData.receiverId,
      type: "message",
      content: `New message from ${req.user.username}`,
      relatedId: message.id
    });
    
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Mark a message as read
router.patch("/:id/read", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const messageId = parseInt(req.params.id);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }
    
    // Get all user's messages
    const userMessages = await storage.getUserMessages(req.user.id);
    const message = userMessages.find(m => m.id === messageId);
    
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }
    
    // Only the receiver can mark a message as read
    if (message.receiverId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    
    const updatedMessage = await storage.markMessageAsRead(messageId);
    res.json(updatedMessage);
  } catch (error) {
    res.status(500).json({ error: "Failed to mark message as read" });
  }
});

export default router;