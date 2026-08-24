const express = require("express");
const {
  getOverallRisk,
  getRiskMap,
  getRiskScore,
  getDisasterPredictions,
  getRiskFactors,
  getAffectedAreas,
  getPopulationAtRisk,
  getShelterRecommendations,
  getEvacuationRecommendations,
  getResourcePredictions,
  getResourceShortages,
  getAiAccuracy,
  getPredictionHistory,
  getAuditLogs,
  getRiskThresholds,
  updateRiskThresholds,
  getRiskWeights,
  updateRiskWeights,
  getDisasterTypes,
  addDisasterType,
  updateDisasterType,
  removeDisasterType,
  getAiSettings,
  updateAiSettings,
  getDataSources,
  addDataSource,
  updateDataSource,
  removeDataSource,
  generateAiRiskAssessment,
  approveAiRecommendation,
  confirmAiPrediction,
  aiAnalyzeCitizenReports,
  recordPredictionOutcome,
  reportGroundCondition,
  getGroundConditionReports,
} = require("../controllers/aiRiskController");
const { protect } = require("../middleware/authMiddleware");
const { requireAiRiskPermission } = require("../middleware/aiRiskAccessMiddleware");

const router = express.Router();

router.use(protect); // every AI Risk Engine route requires login

// --- Views ---
router.get("/overall", requireAiRiskPermission("viewOverallRisk"), getOverallRisk);
router.get("/map", requireAiRiskPermission("viewRiskMap"), getRiskMap);
router.get("/risk-score", requireAiRiskPermission("viewRiskScore"), getRiskScore);
router.get("/factors", requireAiRiskPermission("viewRiskFactors"), getRiskFactors);
router.get("/affected-areas", requireAiRiskPermission("viewAffectedAreas"), getAffectedAreas);
router.get("/population-at-risk", requireAiRiskPermission("viewPopulationAtRisk"), getPopulationAtRisk);
router.get("/shelter-recommendations", requireAiRiskPermission("viewShelterRecommendations"), getShelterRecommendations);
router.get(
  "/evacuation-recommendations",
  requireAiRiskPermission("viewEvacuationRecommendations"),
  getEvacuationRecommendations
);
router.get("/resource-predictions", requireAiRiskPermission("viewResourcePredictions"), getResourcePredictions);
router.get("/resource-shortages", requireAiRiskPermission("viewResourceShortages"), getResourceShortages);
router.get("/accuracy", requireAiRiskPermission("viewAiAccuracy"), getAiAccuracy);
router.get("/audit-logs", requireAiRiskPermission("viewAuditLogs"), getAuditLogs);

// --- Predictions ---
router.get("/predictions/history", requireAiRiskPermission("viewPredictionHistory"), getPredictionHistory);
router
  .route("/predictions")
  .get(requireAiRiskPermission("viewDisasterPredictions"), getDisasterPredictions)
  .post(requireAiRiskPermission("generateAiRiskAssessment"), generateAiRiskAssessment);
router.patch("/predictions/:id/approve", requireAiRiskPermission("approveAiRecommendations"), approveAiRecommendation);
router.patch("/predictions/:id/confirm", requireAiRiskPermission("confirmAiPrediction"), confirmAiPrediction);
router.post(
  "/predictions/:id/analyze-reports",
  requireAiRiskPermission("aiAnalyzeCitizenReports"),
  aiAnalyzeCitizenReports
);
// Outcome tracking feeds "View AI accuracy" - same roles as approving recommendations.
router.patch("/predictions/:id/outcome", requireAiRiskPermission("approveAiRecommendations"), recordPredictionOutcome);

// --- Ground conditions ---
// Everyone who can file a ground-condition report can also browse the feed;
// the controller narrows non-staff callers to their own submissions.
router
  .route("/ground-conditions")
  .get(requireAiRiskPermission("reportGroundConditions"), getGroundConditionReports)
  .post(requireAiRiskPermission("reportGroundConditions"), reportGroundCondition);

// --- Configuration (Admin-only) ---
router
  .route("/settings/thresholds")
  .get(requireAiRiskPermission("configureRiskThresholds"), getRiskThresholds)
  .put(requireAiRiskPermission("configureRiskThresholds"), updateRiskThresholds);

router
  .route("/settings/weights")
  .get(requireAiRiskPermission("configureRiskWeights"), getRiskWeights)
  .put(requireAiRiskPermission("configureRiskWeights"), updateRiskWeights);

router
  .route("/settings/disaster-types")
  .get(requireAiRiskPermission("manageDisasterTypes"), getDisasterTypes)
  .post(requireAiRiskPermission("manageDisasterTypes"), addDisasterType);
router
  .route("/settings/disaster-types/:name")
  .put(requireAiRiskPermission("manageDisasterTypes"), updateDisasterType)
  .delete(requireAiRiskPermission("manageDisasterTypes"), removeDisasterType);

router
  .route("/settings/general")
  .get(requireAiRiskPermission("manageAiSettings"), getAiSettings)
  .put(requireAiRiskPermission("manageAiSettings"), updateAiSettings);

router
  .route("/settings/data-sources")
  .get(requireAiRiskPermission("manageAiDataSources"), getDataSources)
  .post(requireAiRiskPermission("manageAiDataSources"), addDataSource);
router
  .route("/settings/data-sources/:id")
  .put(requireAiRiskPermission("manageAiDataSources"), updateDataSource)
  .delete(requireAiRiskPermission("manageAiDataSources"), removeDataSource);

module.exports = router;
