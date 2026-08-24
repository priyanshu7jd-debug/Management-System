const express = require("express");
const {
  createResource,
  getResources,
  getResourceById,
  updateResource,
  adjustResourceQuantity,
  deleteResource,
  getResourceStats,
} = require("../controllers/resourceController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { createResourceRules, updateResourceRules, adjustQuantityRules } = require("../validators/resourceValidators");

const router = express.Router();

router.use(protect); // every resource route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", authorize("Authority", "Admin"), getResourceStats);

router.route("/")
  .post(authorize("Authority", "Admin"), createResourceRules, createResource)
  .get(getResources);

router.route("/:id")
  .get(getResourceById)
  .put(authorize("Authority", "Admin"), updateResourceRules, updateResource)
  .delete(authorize("Admin"), deleteResource);

router.patch("/:id/quantity", authorize("Authority", "Admin"), adjustQuantityRules, adjustResourceQuantity);

module.exports = router;
