const asyncHandler = require("express-async-handler");
const Alert = require("../models/Alert");
const { notify } = require("../utils/notify");

// @desc    Issue a new alert
// @route   POST /api/alerts
// @access  Private (Authority, Admin)
const createAlert = asyncHandler(async (req, res) => {
  const { title, type, location, priority, description, relatedDisaster } = req.body;

  if (!title || !type || !location) {
    res.status(400);
    throw new Error("Please provide title, type and location");
  }

  const alert = await Alert.create({
    title,
    type,
    location,
    priority,
    description,
    relatedDisaster,
    issuedBy: req.user._id,
  });

  // Broadcast to every user - alerts are a public-safety concern, not just for staff
  notify({
    recipient: null,
    type: "Alert",
    title: `${alert.priority} priority: ${alert.title}`,
    message: `${alert.type} alert issued for ${alert.location}.${alert.description ? " " + alert.description : ""}`,
    createdBy: req.user._id,
    related: { relatedAlert: alert._id },
  });

  res.status(201).json({ success: true, data: alert });
});

// @desc    Get all alerts (defaults to active only)
// @route   GET /api/alerts?active=&type=&priority=&page=&limit=
// @access  Public
const getAlerts = asyncHandler(async (req, res) => {
  const { active = "true", type, priority, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (active !== "all") filter.active = active === "true";
  if (type) filter.type = type;
  if (priority) filter.priority = priority;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [alerts, total] = await Promise.all([
    Alert.find(filter)
      .populate("issuedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Alert.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: alerts.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: alerts,
  });
});

// @desc    Get single alert by ID
// @route   GET /api/alerts/:id
// @access  Public
const getAlertById = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id).populate("issuedBy", "name role");

  if (!alert) {
    res.status(404);
    throw new Error("Alert not found");
  }

  res.json({ success: true, data: alert });
});

// @desc    Update an alert
// @route   PUT /api/alerts/:id
// @access  Private (Authority, Admin)
const updateAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  if (!alert) {
    res.status(404);
    throw new Error("Alert not found");
  }

  const fields = ["title", "type", "location", "priority", "description", "active", "relatedDisaster"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) alert[field] = req.body[field];
  });

  const updated = await alert.save();
  res.json({ success: true, data: updated });
});

// @desc    Deactivate (soft-close) an alert
// @route   PATCH /api/alerts/:id/deactivate
// @access  Private (Authority, Admin)
const deactivateAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  if (!alert) {
    res.status(404);
    throw new Error("Alert not found");
  }

  alert.active = false;
  const updated = await alert.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete an alert
// @route   DELETE /api/alerts/:id
// @access  Private (Admin)
const deleteAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);
  if (!alert) {
    res.status(404);
    throw new Error("Alert not found");
  }

  await alert.deleteOne();
  res.json({ success: true, message: "Alert deleted" });
});

// @desc    Dashboard stats - counts by type, priority, active vs inactive
// @route   GET /api/alerts/stats/summary
// @access  Private (Authority, Admin)
const getAlertStats = asyncHandler(async (req, res) => {
  const [byType, byPriority, activeCount, total] = await Promise.all([
    Alert.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
    Alert.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
    Alert.countDocuments({ active: true }),
    Alert.countDocuments(),
  ]);

  res.json({
    success: true,
    data: {
      total,
      active: activeCount,
      inactive: total - activeCount,
      byType,
      byPriority,
    },
  });
});

module.exports = {
  createAlert,
  getAlerts,
  getAlertById,
  updateAlert,
  deactivateAlert,
  deleteAlert,
  getAlertStats,
};
