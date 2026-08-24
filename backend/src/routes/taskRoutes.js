const express = require("express");
const {
  createTask,
  getTasks,
  getMyTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskStats,
} = require("../controllers/taskController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { createTaskRules, updateTaskRules, updateTaskStatusRules } = require("../validators/taskValidators");

const router = express.Router();

router.use(protect); // every task route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", authorize("Authority", "Admin"), getTaskStats);
router.get("/me", getMyTasks);

router.route("/")
  .post(authorize("Authority", "Admin"), createTaskRules, createTask)
  .get(authorize("Authority", "Admin"), getTasks);

// Ownership (is this task assigned to me?) is checked inside the controller,
// so these two only require authentication at the route level.
router.get("/:id", getTaskById);
router.patch("/:id/status", updateTaskStatusRules, updateTaskStatus);

router.put("/:id", authorize("Authority", "Admin"), updateTaskRules, updateTask);
router.delete("/:id", authorize("Admin"), deleteTask);

module.exports = router;
