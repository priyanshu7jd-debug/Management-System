const express = require("express");
const {
  registerVolunteer,
  getVolunteers,
  getMyVolunteerProfile,
  getVolunteerById,
  updateMyVolunteerProfile,
  updateVolunteerStatus,
  assignVolunteer,
  deleteVolunteer,
  getVolunteerStats,
} = require("../controllers/volunteerController");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  registerVolunteerRules,
  updateMyVolunteerProfileRules,
  updateVolunteerStatusRules,
  assignVolunteerRules,
} = require("../validators/volunteerValidators");

const router = express.Router();

router.use(protect); // every volunteer route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", authorize("Authority", "Admin"), getVolunteerStats);
router.route("/me").get(getMyVolunteerProfile).put(updateMyVolunteerProfileRules, updateMyVolunteerProfile);

router.route("/")
  .post(registerVolunteerRules, registerVolunteer)
  // Table: viewVolunteers - Admin/Authority full, Volunteer "assigned team"
  // (scoped in the controller), Citizen no access.
  .get(authorize("Authority", "Admin", "Volunteer"), getVolunteers);

router.get("/:id", authorize("Authority", "Admin"), getVolunteerById);
router.patch("/:id/status", authorize("Authority", "Admin"), updateVolunteerStatusRules, updateVolunteerStatus);
router.patch("/:id/assign", authorize("Authority", "Admin"), assignVolunteerRules, assignVolunteer);
router.delete("/:id", authorize("Admin"), deleteVolunteer);

module.exports = router;
