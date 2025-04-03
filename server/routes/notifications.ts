import { Router } from "express";
import { storage } from "../storage";

const router = Router();

// Get all notifications for the current user
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const notifications = await storage.getUserNotifications(req.user.id);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

// Mark a notification as read
router.patch("/:id/read", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    const notificationId = parseInt(req.params.id);
    if (isNaN(notificationId)) {
      return res.status(400).json({ error: "Invalid notification ID" });
    }
    
    // Get the notification to check if it belongs to the user
    const notifications = await storage.getUserNotifications(req.user.id);
    const notification = notifications.find(n => n.id === notificationId);
    
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    
    const updatedNotification = await storage.markNotificationAsRead(notificationId);
    res.json(updatedNotification);
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// Mark all notifications as read
router.post("/read-all", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    await storage.markAllNotificationsAsRead(req.user.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

export default router;