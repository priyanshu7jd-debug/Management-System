const asyncHandler = require("express-async-handler");
const Notification = require("../models/Notification");

// @desc    Get the logged-in user's notification feed (direct + broadcast)
// @route   GET /api/notifications?type=&unread=&page=&limit=
// @access  Private
const getMyNotifications = asyncHandler(async (req, res) => {
  const { type, unread, page = 1, limit = 20 } = req.query;

  const filter = {
    $or: [{ recipient: req.user._id }, { recipient: null }],
  };
  if (type) filter.type = type;
  if (unread === "true") filter.readBy = { $ne: req.user._id };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Notification.countDocuments(filter),
  ]);

  // Shape each doc with a per-user "read" boolean instead of leaking the full readBy list
  const data = notifications.map((n) => {
    const obj = n.toObject();
    obj.read = n.readBy.some((id) => id.toString() === req.user._id.toString());
    delete obj.readBy;
    return obj;
  });

  res.json({
    success: true,
    count: data.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data,
  });
});

// @desc    Get count of unread notifications for the logged-in user
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    $or: [{ recipient: req.user._id }, { recipient: null }],
    readBy: { $ne: req.user._id },
  });

  res.json({ success: true, data: { unread: count } });
});

// @desc    Mark a single notification as read for the logged-in user
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  const isMine = notification.recipient === null || notification.recipient.toString() === req.user._id.toString();
  if (!isMine) {
    res.status(403);
    throw new Error("Not authorized to modify this notification");
  }

  const alreadyRead = notification.readBy.some((id) => id.toString() === req.user._id.toString());
  if (!alreadyRead) {
    notification.readBy.push(req.user._id);
    await notification.save();
  }

  res.json({ success: true, message: "Notification marked as read" });
});

// @desc    Mark every notification in the logged-in user's feed as read
// @route   PATCH /api/notifications/read-all
// @access  Private
const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    {
      $or: [{ recipient: req.user._id }, { recipient: null }],
      readBy: { $ne: req.user._id },
    },
    { $push: { readBy: req.user._id } }
  );

  res.json({ success: true, message: "All notifications marked as read" });
});

// @desc    Delete a notification (cleanup)
// @route   DELETE /api/notifications/:id
// @access  Private (Authority, Admin)
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) {
    res.status(404);
    throw new Error("Notification not found");
  }

  await notification.deleteOne();
  res.json({ success: true, message: "Notification deleted" });
});

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
