const express = require("express");
const {
  createTeam,
  getTeams,
  getMyTeams,
  getTeamById,
  updateTeam,
  addMembers,
  removeMember,
  deleteTeam,
  notifyTeam,
} = require("../controllers/teamController");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
  createTeamRules,
  updateTeamRules,
  addMembersRules,
  notifyTeamRules,
} = require("../validators/teamValidators");

const router = express.Router();

router.use(protect); // every team route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/me", authorize("Volunteer"), getMyTeams);

router.route("/")
  // Admin/Authority see all teams, Volunteer scoped to their own team (controller). Citizen: no access.
  .get(authorize("Authority", "Admin", "Volunteer"), getTeams)
  .post(authorize("Admin"), createTeamRules, createTeam);

router.route("/:id")
  .get(authorize("Authority", "Admin", "Volunteer"), getTeamById)
  .put(authorize("Admin"), updateTeamRules, updateTeam)
  .delete(authorize("Admin"), deleteTeam);

router.post("/:id/members", authorize("Admin"), addMembersRules, addMembers);
router.delete("/:id/members/:volunteerId", authorize("Admin"), removeMember);
router.post("/:id/notify", authorize("Admin"), notifyTeamRules, notifyTeam);

module.exports = router;
