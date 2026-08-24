const express = require("express");
const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notificationController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect); // every notification route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);

router.get("/", getMyNotifications);
router.patch("/:id/read", markAsRead);
router.delete("/:id", authorize("Authority", "Admin"), deleteNotification);

module.exports = router;
