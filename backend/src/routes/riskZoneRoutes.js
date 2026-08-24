const express = require("express");
const {
  createRiskZone,
  getRiskZones,
  getRiskZoneById,
  updateRiskZone,
  deleteRiskZone,
  overrideRiskZoneScore,
} = require("../controllers/riskZoneController");
const { protect } = require("../middleware/authMiddleware");
const { requireMapPermission } = require("../middleware/mapAccessMiddleware");
const { requireAiRiskPermission } = require("../middleware/aiRiskAccessMiddleware");
const { createRiskZoneRules, updateRiskZoneRules, overrideScoreRules } = require("../validators/riskZoneValidators");

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(requireMapPermission("viewRiskZones"), getRiskZones)
  .post(requireMapPermission("addRiskZone"), createRiskZoneRules, createRiskZone);

router
  .route("/:id")
  .get(requireMapPermission("viewRiskZones"), getRiskZoneById)
  .put(requireMapPermission("editRiskZone"), updateRiskZoneRules, updateRiskZone)
  .delete(requireMapPermission("removeRiskZone"), deleteRiskZone);

router.patch("/:id/override", requireAiRiskPermission("overrideAiRisk"), overrideScoreRules, overrideRiskZoneScore);

module.exports = router;
