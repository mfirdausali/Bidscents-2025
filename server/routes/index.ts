import { Router } from "express";
import bookmarkRoutes from "./bookmarks";
import bidRoutes from "./bids";
import messageRoutes from "./messages";
import notificationRoutes from "./notifications";

const router = Router();

router.use("/api/bookmarks", bookmarkRoutes);
router.use("/api/bids", bidRoutes);
router.use("/api/messages", messageRoutes);
router.use("/api/notifications", notificationRoutes);

export default router;