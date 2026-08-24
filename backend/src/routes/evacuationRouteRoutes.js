const express = require("express");
const {
  createEvacuationRoute,
  getEvacuationRoutes,
  getEvacuationRouteById,
  updateEvacuationRoute,
  markAreaEvacuated,
  deleteEvacuationRoute,
} = require("../controllers/evacuationRouteController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { requireMapPermission } = require("../middleware/mapAccessMiddleware");
const { createEvacuationRouteRules, updateEvacuationRouteRules } = require("../validators/evacuationRouteValidators");

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(requireMapPermission("viewEvacuationRoutes"), getEvacuationRoutes)
  .post(requireMapPermission("createEvacuationZone"), createEvacuationRouteRules, createEvacuationRoute);

router
  .route("/:id")
  .get(requireMapPermission("viewEvacuationRoutes"), getEvacuationRouteById)
  .put(requireMapPermission("createEvacuationZone"), updateEvacuationRouteRules, updateEvacuationRoute)
  .delete(authorize("Admin"), deleteEvacuationRoute);

router.patch("/:id/mark-evacuated", requireMapPermission("markAreaEvacuated"), markAreaEvacuated);

module.exports = router;
