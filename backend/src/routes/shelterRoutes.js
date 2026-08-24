const express = require("express");
const {
  createShelter,
  getShelters,
  getNearbyShelters,
  getShelterById,
  updateShelter,
  updateOccupancy,
  approveShelter,
  requestShelterDeletion,
  deleteShelter,
  getShelterStats,
  uploadShelterImages,
  deleteShelterImage,
  assignCitizenToShelter,
  checkInCitizen,
  checkOutCitizen,
  getMyShelterStatus,
  getShelterOccupants,
  transferCitizen,
  getShelterResources,
  addShelterResource,
  updateShelterResource,
  updateShelterFacilities,
  assignVolunteerToShelter,
  getShelterVolunteers,
  createShelterVolunteerTask,
  getShelterTasks,
  reportShelterProblem,
  getShelterProblems,
  resolveShelterProblem,
  sendShelterAlert,
  getShelterAuditHistory,
} = require("../controllers/shelterController");
const { protect, attachUserIfPresent } = require("../middleware/authMiddleware");
const { requireShelterPermission, requireFullShelterAccess } = require("../middleware/shelterAccessMiddleware");
const { shelterImageUpload } = require("../middleware/uploadMiddleware");
const {
  createShelterRules,
  updateShelterRules,
  updateOccupancyRules,
  nearbyQueryRules,
  approveShelterRules,
  requestDeletionRules,
  assignShelterRules,
  citizenIdRules,
  transferCitizenRules,
  addShelterResourceRules,
  updateShelterResourceRules,
  updateFacilitiesRules,
  assignVolunteerRules,
  createShelterTaskRules,
  reportShelterProblemRules,
  resolveShelterProblemRules,
  sendShelterAlertRules,
} = require("../validators/shelterValidators");

const router = express.Router();

// --- View shelters -----------------------------------------------------------
// "View shelters" is FULL for every defined role (Admin/Authority/Citizen/
// Volunteer), and - like the original implementation - these three stay
// genuinely public so an unauthenticated visitor can still see shelter
// availability during a disaster. `attachUserIfPresent` still lets a logged
// -in Authority/Admin see Pending shelters via the approvalStatus filter
// (handled in the controller), without forcing a login for everyone else.
// Fixed-path routes must come before the "/:id" param route below.
router.get("/nearby", attachUserIfPresent, nearbyQueryRules, getNearbyShelters);
router.get("/", attachUserIfPresent, getShelters);
router.get("/:id", attachUserIfPresent, getShelterById);

// Everything else needs a real, authenticated user; each route then layers
// on the specific permission from config/shelterPermissions.js via
// requireShelterPermission(action).
router.use(protect);

router.get("/stats/summary", requireShelterPermission("viewReportsStatistics"), getShelterStats);
// Fixed path, must stay above "/:id/..." param routes - any logged-in user
// can check their own shelter status regardless of role/scope.
router.get("/me/status", getMyShelterStatus);

// --- Add / Edit / Delete / Approve ------------------------------------------
router.post("/", requireShelterPermission("addShelter"), createShelterRules, createShelter);
router.put("/:id", requireShelterPermission("editShelter"), updateShelterRules, updateShelter);
router.patch("/:id/occupancy", requireShelterPermission("manageCapacity"), updateOccupancyRules, updateOccupancy);
router.patch("/:id/approve", requireFullShelterAccess("approveShelter"), approveShelterRules, approveShelter);
router.post(
  "/:id/request-delete",
  requireShelterPermission("deleteShelter"),
  requestDeletionRules,
  requestShelterDeletion
);
router.delete("/:id", requireFullShelterAccess("deleteShelter"), deleteShelter);

// --- Images ------------------------------------------------------------------
router
  .route("/:id/images")
  .post(requireShelterPermission("editShelter"), shelterImageUpload.array("images", 5), uploadShelterImages)
  .delete(requireShelterPermission("editShelter"), deleteShelterImage);

// --- Occupants: assign / check-in / check-out / transfer --------------------
router.get("/:id/occupants", requireShelterPermission("citizenCheckInOut"), getShelterOccupants);
router.post("/:id/assign", requireShelterPermission("assignShelter"), assignShelterRules, assignCitizenToShelter);
router.post("/:id/checkin", requireShelterPermission("citizenCheckInOut"), citizenIdRules, checkInCitizen);
router.post("/:id/checkout", requireShelterPermission("citizenCheckInOut"), citizenIdRules, checkOutCitizen);
router.post("/:id/transfer", requireFullShelterAccess("transferCitizen"), transferCitizenRules, transferCitizen);

// --- Supplies: food/water/medicines ------------------------------------------
router
  .route("/:id/resources")
  .get(requireShelterPermission("manageFoodWater"), getShelterResources)
  .post(requireShelterPermission("manageFoodWater"), addShelterResourceRules, addShelterResource);
router.patch(
  "/:id/resources/:resourceId",
  requireShelterPermission("manageFoodWater"),
  updateShelterResourceRules,
  updateShelterResource
);

// --- Facilities ---------------------------------------------------------------
router.patch(
  "/:id/facilities",
  requireFullShelterAccess("manageFacilities"),
  updateFacilitiesRules,
  updateShelterFacilities
);

// --- Volunteers: assign + tasks ------------------------------------------------
router.patch(
  "/:id/volunteers/:volunteerId/assign",
  requireFullShelterAccess("assignVolunteers"),
  assignVolunteerRules,
  assignVolunteerToShelter
);
router.get("/:id/volunteers", requireFullShelterAccess("assignVolunteers"), getShelterVolunteers);
// Listing every task at a shelter is part of the same "Create volunteer
// tasks" capability (Admin/Authority only) - a Volunteer sees their own
// shelter tasks via the existing GET /api/tasks/me instead.
router
  .route("/:id/tasks")
  .get(requireFullShelterAccess("createVolunteerTasks"), getShelterTasks)
  .post(requireFullShelterAccess("createVolunteerTasks"), createShelterTaskRules, createShelterVolunteerTask);

// --- Problems: report (everyone) / resolve (Admin, Authority) -----------------
router
  .route("/:id/problems")
  .get(requireShelterPermission("reportShelterProblem"), getShelterProblems)
  .post(requireShelterPermission("reportShelterProblem"), reportShelterProblemRules, reportShelterProblem);
router.patch(
  "/:id/problems/:problemId/resolve",
  requireFullShelterAccess("resolveShelterProblems"),
  resolveShelterProblemRules,
  resolveShelterProblem
);

// --- Alerts ---------------------------------------------------------------------
router.post("/:id/alerts", requireFullShelterAccess("sendShelterAlerts"), sendShelterAlertRules, sendShelterAlert);

// --- Audit / history --------------------------------------------------------------
router.get("/:id/audit", requireShelterPermission("viewAuditHistory"), getShelterAuditHistory);

module.exports = router;
