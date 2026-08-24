const express = require("express");
const { getDashboardSummary, getDashboardTrends } = require("../controllers/dashboardController");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Every dashboard route requires an authenticated Authority/Admin user
router.use(protect, authorize("Authority", "Admin"));

router.get("/summary", getDashboardSummary);
router.get("/trends", getDashboardTrends);

module.exports = router;
