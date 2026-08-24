const express = require("express");
const {
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getUserStats,
} = require("../controllers/userController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { updateUserRoleRules, updateUserStatusRules } = require("../validators/userValidators");

const router = express.Router();

// Every user-management route requires an authenticated Admin
router.use(protect, authorize("Admin"));

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", getUserStats);

router.get("/", getUsers);
router.get("/:id", getUserById);
router.patch("/:id/role", updateUserRoleRules, updateUserRole);
router.patch("/:id/status", updateUserStatusRules, updateUserStatus);
router.delete("/:id", deleteUser);

module.exports = router;
