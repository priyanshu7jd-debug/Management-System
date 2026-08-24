const express = require("express");
const {
  createDisaster,
  getDisasters,
  getNearbyDisasters,
  getDisasterById,
  updateDisasterStatus,
  updateDisaster,
  deleteDisaster,
  getDisasterStats,
  uploadDisasterImages,
  deleteDisasterImage,
  verifyIncident,
  rejectIncident,
  changePriority,
  assignAuthority,
  assignVolunteer,
  assignNgo,
  addInvestigationNote,
  requestEmergencyResponse,
  createResponseTask,
  coordinateResponse,
  escalateIncident,
  resolveIncident,
  reopenIncident,
  getIncidentHistory,
  getIncidentAuditLogs,
} = require("../controllers/disasterController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { requireIncidentPermission, requireFullIncidentAccess } = require("../middleware/incidentAccessMiddleware");
const { disasterImageUpload } = require("../middleware/uploadMiddleware");
const {
  createDisasterRules,
  updateDisasterRules,
  updateDisasterStatusRules,
  nearbyQueryRules,
  rejectIncidentRules,
  changePriorityRules,
  assignAuthorityRules,
  assignVolunteerRules,
  assignNgoRules,
  addNoteRules,
  escalateRules,
  resolveRules,
  reopenRules,
} = require("../validators/disasterValidators");

const router = express.Router();

router.use(protect); // every incident route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", authorize("Authority", "Admin"), getDisasterStats); // generateReports / viewAnalytics
router.get("/audit-logs", requireIncidentPermission("viewAuditLogs"), getIncidentAuditLogs);
router.get("/nearby", nearbyQueryRules, getNearbyDisasters);

router
  .route("/")
  .post(requireIncidentPermission("createIncident"), createDisasterRules, createDisaster)
  .get(requireIncidentPermission("viewIncidents"), getDisasters);

router
  .route("/:id")
  .get(requireIncidentPermission("viewIncidents"), getDisasterById)
  .put(requireIncidentPermission("editIncident"), updateDisasterRules, updateDisaster)
  .delete(requireIncidentPermission("deleteIncident"), deleteDisaster);

router.patch(
  "/:id/status",
  requireIncidentPermission("updateIncidentStatus"),
  updateDisasterStatusRules,
  updateDisasterStatus
);

router.patch("/:id/verify", requireFullIncidentAccess("verifyIncident"), verifyIncident);
router.patch("/:id/reject", requireFullIncidentAccess("rejectIncident"), rejectIncidentRules, rejectIncident);
router.patch("/:id/priority", requireFullIncidentAccess("changePriority"), changePriorityRules, changePriority);

router.patch("/:id/assign-authority", requireFullIncidentAccess("assignAuthority"), assignAuthorityRules, assignAuthority);
router.patch("/:id/assign-volunteer", requireFullIncidentAccess("assignVolunteer"), assignVolunteerRules, assignVolunteer);
router.patch("/:id/assign-ngo", requireFullIncidentAccess("assignNgo"), assignNgoRules, assignNgo);

router.post("/:id/notes", requireFullIncidentAccess("addInvestigationNotes"), addNoteRules, addInvestigationNote);

router.post("/:id/request-response", requireIncidentPermission("requestEmergencyResponse"), requestEmergencyResponse);
router.post("/:id/response-task", requireFullIncidentAccess("createResponseTask"), createResponseTask);
router.patch("/:id/coordinate", requireIncidentPermission("coordinateResponse"), coordinateResponse);

router.patch("/:id/escalate", requireIncidentPermission("escalateIncident"), escalateRules, escalateIncident);
router.patch("/:id/resolve", requireIncidentPermission("resolveIncident"), resolveRules, resolveIncident);
router.patch("/:id/reopen", requireIncidentPermission("reopenIncident"), reopenRules, reopenIncident);

router.get("/:id/history", requireIncidentPermission("viewIncidentHistory"), getIncidentHistory);

router
  .route("/:id/images")
  .post(
    requireIncidentPermission("uploadEvidence"),
    disasterImageUpload.array("images", 5),
    uploadDisasterImages
  )
  .delete(requireIncidentPermission("uploadEvidence"), deleteDisasterImage);

module.exports = router;
