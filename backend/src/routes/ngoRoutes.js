const express = require("express");
const {
  registerNgo,
  getNgos,
  getNgoById,
  updateNgo,
  updateNgoStatus,
  deleteNgo,
  deactivateNgo,
  suspendNgo,
  unsuspendNgo,
  verifyNgoDocuments,
  verifyNgoIdentity,
  assignNgo,
  manageNgoServices,
  getNgoResources,
  getNgoVolunteers,
  createNgoTask,
  requestNgoAssistance,
  respondNgoAssistance,
  reportNgoActivity,
  rateNgo,
  getNgoPerformance,
  sendNgoNotification,
  getNgoAudit,
  generateNgoReport,
  getNgoStats,
} = require("../controllers/ngoController");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  registerNgoRules,
  updateNgoRules,
  updateNgoStatusRules,
  deactivateNgoRules,
  suspendNgoRules,
  verifyRules,
  assignNgoRules,
  manageServicesRules,
  createNgoTaskRules,
  requestAssistanceRules,
  respondAssistanceRules,
  reportActivityRules,
  rateNgoRules,
  sendNotificationRules,
} = require("../validators/ngoValidators");

const router = express.Router();

router.use(protect); // every NGO route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", authorize("Authority", "Admin"), getNgoStats);

router.route("/")
  .get(getNgos) // View / Search / Filter NGOs - all roles (public sees Approved only)
  .post(authorize("Authority", "Admin"), registerNgoRules, registerNgo); // Register / submit request

router.get("/:id", getNgoById); // View NGOs
router
  .route("/:id")
  .put(authorize("Authority", "Admin"), updateNgoRules, updateNgo) // Edit NGO details (Authority: assigned only, checked in controller)
  .delete(authorize("Admin"), deleteNgo); // Delete NGO

router.patch("/:id/status", authorize("Admin"), updateNgoStatusRules, updateNgoStatus); // Approve / Reject
router.patch("/:id/deactivate", authorize("Admin"), deactivateNgoRules, deactivateNgo); // Delete/deactivate
router.patch("/:id/suspend", authorize("Admin"), suspendNgoRules, suspendNgo); // Suspend NGO
router.patch("/:id/unsuspend", authorize("Admin"), unsuspendNgo); // Lift suspension

router.patch("/:id/verify-documents", authorize("Admin"), verifyRules, verifyNgoDocuments); // Verify NGO documents
router.patch("/:id/verify-identity", authorize("Admin"), verifyRules, verifyNgoIdentity); // Verify NGO identity

router.patch("/:id/assign", authorize("Authority", "Admin"), assignNgoRules, assignNgo); // Assign to disaster/area/shelter
router.put("/:id/services", authorize("Authority", "Admin"), manageServicesRules, manageNgoServices); // Manage NGO services (Authority: assigned only)

router.get("/:id/resources", getNgoResources); // View NGO resources - all roles (limited for Citizen/Volunteer, checked in controller)
router.get("/:id/volunteers", authorize("Authority", "Admin"), getNgoVolunteers); // View NGO volunteers (Authority: assigned only)

router.post("/:id/tasks", authorize("Authority", "Admin"), createNgoTaskRules, createNgoTask); // Create NGO tasks (Authority: assigned only)

router.post("/:id/assistance", authorize("Authority", "Admin"), requestAssistanceRules, requestNgoAssistance); // Request NGO assistance
router.patch("/:id/assistance/:requestId", authorize("Authority", "Admin"), respondAssistanceRules, respondNgoAssistance); // Accept/decline

router.post("/:id/activity-reports", authorize("Authority", "Admin", "Volunteer"), reportActivityRules, reportNgoActivity); // Report NGO activity

router.get("/:id/performance", getNgoPerformance); // View NGO performance - Volunteer limited, Citizen blocked in controller

router.post("/:id/ratings", rateNgoRules, rateNgo); // Rate/review NGO - all roles

router.post("/:id/notify", authorize("Authority", "Admin"), sendNotificationRules, sendNgoNotification); // Send NGO notifications

router.get("/:id/audit", getNgoAudit); // View NGO history/audit - Admin full, Authority limited, checked in controller

router.get("/:id/report", authorize("Authority", "Admin"), generateNgoReport); // Generate NGO reports

module.exports = router;
