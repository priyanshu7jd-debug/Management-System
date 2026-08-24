const express = require("express");
const {
  getFundBalance,
  adjustFundBalance,
  trackFundUtilization,
  monitorTransactions,
  generateFundReports,
  exportFundReports,
  sendFundNotifications,
  reportMisuse,
  getMisuseReports,
  updateMisuseReport,
  getFundAuditLogs,
} = require("../controllers/fundController");
const { protect } = require("../middleware/authMiddleware");
const { requireFundPermission, requireFullFundAccess } = require("../middleware/fundAccessMiddleware");
const {
  adjustBalanceRules,
  sendNotificationRules,
  reportMisuseRules,
  updateMisuseReportRules,
} = require("../validators/fundValidators");

const router = express.Router();

router.use(protect); // every fund-module route requires login

// --- Manage fund balance ------------------------------------------------
router.get("/campaigns/:id/balance", requireFundPermission("manageFundBalance"), getFundBalance);
router.post("/campaigns/:id/adjust", requireFundPermission("manageFundBalance"), adjustBalanceRules, adjustFundBalance);

// --- Track fund utilization ----------------------------------------------
router.get("/campaigns/:id/utilization", requireFundPermission("trackFundUtilization"), trackFundUtilization);

// --- Monitor transactions -------------------------------------------------
router.get("/transactions", requireFundPermission("monitorTransactions"), monitorTransactions);

// --- Generate / export fund reports ---------------------------------------
router.get("/reports", requireFullFundAccess("generateFundReports"), generateFundReports);
router.get("/reports/export", requireFullFundAccess("exportReports"), exportFundReports);

// --- Send fund notifications -----------------------------------------------
router.post("/campaigns/:id/notify", requireFundPermission("sendFundNotifications"), sendNotificationRules, sendFundNotifications);

// --- Report misuse -----------------------------------------------------------
router
  .route("/misuse-reports")
  .post(requireFundPermission("reportMisuse"), reportMisuseRules, reportMisuse)
  .get(getMisuseReports);
router.patch(
  "/misuse-reports/:id",
  (req, res, next) => {
    if (!req.user || !["Authority", "Admin"].includes(req.user.role)) {
      res.status(403);
      throw new Error("Only Authority or Admin may triage a misuse report");
    }
    next();
  },
  updateMisuseReportRules,
  updateMisuseReport
);

// --- View audit logs -----------------------------------------------------------
router.get("/audit", requireFundPermission("viewAuditLogs"), getFundAuditLogs);

module.exports = router;
