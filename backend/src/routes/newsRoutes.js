const express = require("express");
const {
  createNews,
  getNews,
  getNewsById,
  updateNews,
  deleteNews,
  assignNews,
  submitForApproval,
  approveNews,
  rejectNews,
  publishNews,
  verifyNews,
  addDisasterUpdate,
  reviewDisasterUpdate,
  uploadNewsMedia,
  deleteNewsMedia,
  addSource,
  removeSource,
  reportNews,
  reviewReport,
  sendEmergencyNews,
  schedulePublication,
  getNewsStats,
  getAuditHistory,
} = require("../controllers/newsController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { newsMediaUpload } = require("../middleware/uploadMiddleware");
const {
  createNewsRules,
  updateNewsRules,
  assignNewsRules,
  rejectNewsRules,
  disasterUpdateRules,
  reviewUpdateRules,
  sourceRules,
  reportRules,
  reviewReportRules,
  scheduleRules,
} = require("../validators/newsValidators");

const router = express.Router();

router.use(protect); // every News route requires login - all four roles are logged-in users

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", authorize("Authority", "Admin"), getNewsStats);

router
  .route("/")
  .get(getNews) // View/search/filter news - all roles
  .post(authorize("Authority", "Admin"), createNewsRules, createNews); // Create news

router
  .route("/:id")
  .get(getNewsById)
  .put(authorize("Authority", "Admin"), updateNewsRules, updateNews) // Edit news (Admin any | Authority if assigned)
  .delete(authorize("Admin"), deleteNews); // Delete news

router.patch("/:id/assign", authorize("Admin"), assignNewsRules, assignNews);
router.patch("/:id/submit", authorize("Authority", "Admin"), submitForApproval);
router.patch("/:id/approve", authorize("Admin"), approveNews); // Approve news
router.patch("/:id/reject", authorize("Admin"), rejectNewsRules, rejectNews); // Reject news
router.patch("/:id/publish", authorize("Authority", "Admin"), publishNews); // Publish news (Admin any | Authority if assigned)
router.patch("/:id/verify", authorize("Authority", "Admin"), verifyNews); // Mark as verified

router
  .route("/:id/updates")
  .post(authorize("Authority", "Admin", "Volunteer"), disasterUpdateRules, addDisasterUpdate); // Add disaster updates (Volunteer = report only)
router.patch("/:id/updates/:updateId", authorize("Authority", "Admin"), reviewUpdateRules, reviewDisasterUpdate);

router
  .route("/:id/media")
  .post(authorize("Authority", "Admin", "Volunteer"), newsMediaUpload.array("files", 5), uploadNewsMedia) // Upload images/documents
  .delete(authorize("Authority", "Admin", "Volunteer"), deleteNewsMedia);

router
  .route("/:id/sources")
  .post(authorize("Authority", "Admin"), sourceRules, addSource); // Add official source
router.delete("/:id/sources/:sourceId", authorize("Authority", "Admin"), removeSource);

router.post("/:id/report", reportRules, reportNews); // Report news/problem - all roles
router.patch("/:id/reports/:reportId", authorize("Authority", "Admin"), reviewReportRules, reviewReport);

router.patch("/:id/emergency", authorize("Authority", "Admin"), sendEmergencyNews); // Send emergency news
router.patch("/:id/schedule", authorize("Authority", "Admin"), scheduleRules, schedulePublication); // Schedule publication (Admin any | Authority limited)

router.get("/:id/audit", authorize("Authority", "Admin"), getAuditHistory); // View audit history (Admin full | Authority limited)

module.exports = router;
