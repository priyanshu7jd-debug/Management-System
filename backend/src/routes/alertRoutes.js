const express = require("express");
const {
  createAlert,
  getAlerts,
  getAlertById,
  updateAlert,
  deactivateAlert,
  deleteAlert,
  getAlertStats,
} = require("../controllers/alertController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { createAlertRules, updateAlertRules } = require("../validators/alertValidators");

const router = express.Router();

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", protect, authorize("Authority", "Admin"), getAlertStats);

// Public: anyone can view active emergency alerts, no login required
router.get("/", getAlerts);
router.get("/:id", getAlertById);

// Everything below requires an authenticated Authority/Admin user
router.post("/", protect, authorize("Authority", "Admin"), createAlertRules, createAlert);
router.put("/:id", protect, authorize("Authority", "Admin"), updateAlertRules, updateAlert);
router.patch("/:id/deactivate", protect, authorize("Authority", "Admin"), deactivateAlert);
router.delete("/:id", protect, authorize("Admin"), deleteAlert);

module.exports = router;
