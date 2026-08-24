const express = require("express");
const {
  getDisasterRiskScore,
  overrideDisasterRiskScore,
  sendMapBasedAlert,
  generateRiskReport,
  getMapAnalytics,
  getMapHistory,
  getWeatherInfo,
  getAvailableLayers,
} = require("../controllers/mapController");
const { getRiskMap, getOverallRisk } = require("../controllers/aiRiskController");
const { protect } = require("../middleware/authMiddleware");
const { requireMapPermission } = require("../middleware/mapAccessMiddleware");
const { requireAiRiskPermission } = require("../middleware/aiRiskAccessMiddleware");
const { sendMapAlertRules, overrideDisasterRiskRules } = require("../validators/mapValidators");

const router = express.Router();

router.use(protect);

// "View AI risk map" / "View overall risk" now live in config/aiRiskPermissions.js -
// see routes/aiRiskRoutes.js for the canonical /api/ai-risk/map, /api/ai-risk/overall.
// Kept mounted here too under their original paths for backward compatibility.
router.get("/live", requireAiRiskPermission("viewRiskMap"), getRiskMap);
router.get("/overall-risk", requireAiRiskPermission("viewOverallRisk"), getOverallRisk);
router.get("/layers", requireMapPermission("filterMapLayers"), getAvailableLayers);
router.get("/weather", requireMapPermission("viewWeatherInfo"), getWeatherInfo);

router.get("/disasters/:id/risk-score", requireAiRiskPermission("viewRiskScore"), getDisasterRiskScore);
router.patch(
  "/disasters/:id/risk-score/override",
  requireAiRiskPermission("overrideAiRisk"),
  overrideDisasterRiskRules,
  overrideDisasterRiskScore
);

router.post("/alerts", requireMapPermission("sendMapBasedAlert"), sendMapAlertRules, sendMapBasedAlert);
router.get("/report", requireAiRiskPermission("generateAiRiskAssessment"), generateRiskReport);
router.get("/analytics", requireMapPermission("viewMapAnalytics"), getMapAnalytics);
router.get("/history", requireMapPermission("viewMapHistory"), getMapHistory);

module.exports = router;
