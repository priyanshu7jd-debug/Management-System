const asyncHandler = require("express-async-handler");
const Disaster = require("../models/Disaster");
const RiskZone = require("../models/RiskZone");
const Shelter = require("../models/Shelter");
const EvacuationRoute = require("../models/EvacuationRoute");
const RoadBlock = require("../models/RoadBlock");
const Alert = require("../models/Alert");
const MapActivityLog = require("../models/MapActivityLog");
const { notify } = require("../utils/notify");
const { SCOPE } = require("../config/mapPermissions");
const { SCOPE: AI_SCOPE } = require("../config/aiRiskPermissions");
const { districtFilter } = require("../middleware/mapAccessMiddleware");

// NOTE: "View live risk map" and "View overall risk" moved to
// controllers/aiRiskController.js (getRiskMap / getOverallRisk) as part of
// config/aiRiskPermissions.js owning the AI Risk Engine table end-to-end.
// See routes/aiRiskRoutes.js (GET /api/ai-risk/map, /api/ai-risk/overall).

// @desc    AI risk score for a specific disaster - "View risk score"
//          Citizen gets BASIC (score + level only, no override audit trail).
// @route   GET /api/map/disasters/:id/risk-score
// @access  Private
const getDisasterRiskScore = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster not found");
  }

  const scope = req.aiRiskScope;
  if (scope === AI_SCOPE.AREA || scope === AI_SCOPE.ASSIGNED) {
    return res.json({
      success: true,
      scope,
      data: {
        disasterId: disaster.disasterId,
        type: disaster.type,
        severity: disaster.severity,
        riskScore: disaster.effectiveRiskScore,
      },
    });
  }

  res.json({
    success: true,
    scope,
    data: {
      disasterId: disaster.disasterId,
      type: disaster.type,
      severity: disaster.severity,
      aiRiskScore: disaster.aiRiskScore,
      override: disaster.riskScoreOverride,
      riskScore: disaster.effectiveRiskScore,
    },
  });
});

// @desc    Override a disaster's AI risk score - "Override AI risk"
//          Admin: any value. Authority (LIMITED): capped to +/-15 points.
// @route   PATCH /api/map/disasters/:id/risk-score/override
// @access  Private (Admin, Authority-limited)
const overrideDisasterRiskScore = asyncHandler(async (req, res) => {
  const { value, reason } = req.body;
  if (value === undefined || value < 0 || value > 100) {
    res.status(400);
    throw new Error("Please provide an override value between 0 and 100");
  }

  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster not found");
  }

  if (req.aiRiskScope === AI_SCOPE.LIMITED) {
    const delta = Math.abs(value - disaster.aiRiskScore);
    if (delta > 15) {
      res.status(403);
      throw new Error("Authority override is limited to +/-15 points from the AI-computed score");
    }
  }

  disaster.riskScoreOverride = { value, reason: reason || "", by: req.user._id, at: new Date() };
  const updated = await disaster.save();

  await MapActivityLog.record({
    action: "risk_score_overridden",
    entityType: "Disaster",
    entityId: disaster._id,
    user: req.user,
    details: { value, reason },
  });

  res.json({ success: true, data: updated });
});

// @desc    Send a map-based alert - "Send map-based alert" (Admin, Authority only)
// @route   POST /api/map/alerts
// @access  Private (Admin, Authority)
const sendMapBasedAlert = asyncHandler(async (req, res) => {
  const { title, type, location, priority, description, relatedDisaster, relatedRiskZone } = req.body;

  if (!title || !type || !location) {
    res.status(400);
    throw new Error("Please provide title, type and location");
  }

  const alert = await Alert.create({
    title,
    type,
    location,
    priority,
    description,
    relatedDisaster,
    relatedRiskZone,
    mapBased: true,
    issuedBy: req.user._id,
  });

  notify({
    recipient: null,
    type: "Alert",
    title: `${alert.priority} priority (map): ${alert.title}`,
    message: `${alert.type} alert issued for ${alert.location}.${alert.description ? " " + alert.description : ""}`,
    createdBy: req.user._id,
    related: { relatedAlert: alert._id },
  });

  await MapActivityLog.record({
    action: "map_alert_sent",
    entityType: "Alert",
    entityId: alert._id,
    user: req.user,
  });

  res.status(201).json({ success: true, data: alert });
});

// @desc    Generate a risk report (aggregated snapshot) - "Generate risk report"
// @route   GET /api/map/report
// @access  Private (Admin, Authority)
const generateRiskReport = asyncHandler(async (req, res) => {
  const [disasterCounts, zoneCounts, shelterTotals, activeRoadBlocks, activeAlerts] = await Promise.all([
    Disaster.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]),
    RiskZone.aggregate([{ $group: { _id: "$riskLevel", count: { $sum: 1 } } }]),
    Shelter.aggregate([
      { $group: { _id: null, totalCapacity: { $sum: "$capacity" }, totalOccupancy: { $sum: "$currentOccupancy" } } },
    ]),
    RoadBlock.countDocuments({ status: { $in: ["Reported", "Confirmed"] } }),
    Alert.countDocuments({ active: true }),
  ]);

  const report = {
    generatedAt: new Date(),
    generatedBy: { id: req.user._id, name: req.user.name, role: req.user.role },
    disastersBySeverity: disasterCounts,
    riskZonesByLevel: zoneCounts,
    shelterCapacity: shelterTotals[0] || { totalCapacity: 0, totalOccupancy: 0 },
    activeRoadBlocks,
    activeAlerts,
  };

  await MapActivityLog.record({
    action: "risk_report_generated",
    entityType: "Disaster",
    user: req.user,
  });

  res.json({ success: true, data: report });
});

// @desc    Map analytics - "View map analytics" (Admin/Authority full, Volunteer limited to own activity)
// @route   GET /api/map/analytics
// @access  Private (Admin, Authority, Volunteer-limited)
const getMapAnalytics = asyncHandler(async (req, res) => {
  const scope = req.mapScope;
  const match = scope === SCOPE.LIMITED ? { performedBy: req.user._id } : {};

  const byAction = await MapActivityLog.aggregate([
    { $match: match },
    { $group: { _id: "$action", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const total = await MapActivityLog.countDocuments(match);

  res.json({ success: true, scope, data: { total, byAction } });
});

// @desc    Map history feed - "View map history" (Admin/Authority full, Volunteer limited to own activity)
// @route   GET /api/map/history?page=&limit=
// @access  Private (Admin, Authority, Volunteer-limited)
const getMapHistory = asyncHandler(async (req, res) => {
  const scope = req.mapScope;
  const { page = 1, limit = 50 } = req.query;

  const match = scope === SCOPE.LIMITED ? { performedBy: req.user._id } : {};
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 50, 200);

  const [entries, total] = await Promise.all([
    MapActivityLog.find(match)
      .populate("performedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    MapActivityLog.countDocuments(match),
  ]);

  res.json({
    success: true,
    scope,
    count: entries.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: entries,
  });
});

// @desc    Weather info - "View weather information" (Citizen gets BASIC)
// @route   GET /api/map/weather?lat=&lng=&location=
// @access  Private
const getWeatherInfo = asyncHandler(async (req, res) => {
  // No external weather provider is configured in this project (no API key
  // in .env). This returns a clearly-labeled placeholder so the role-gated
  // BASIC vs FULL response shape can be wired up end-to-end; swap the body
  // of this function for a real provider call (e.g. OpenWeather) later.
  const full = {
    location: req.query.location || "Unknown",
    condition: "Unavailable",
    temperatureC: null,
    humidityPercent: null,
    windKph: null,
    forecast: [],
    source: "placeholder - no weather provider configured",
  };

  const scope = req.mapScope;
  const data = scope === SCOPE.BASIC ? { location: full.location, condition: full.condition, source: full.source } : full;

  res.json({ success: true, scope, data });
});

// @desc    Which map layers a role may toggle - "Filter map layers"
//          (Admin/Authority: every layer. Citizen/Volunteer: LIMITED subset)
// @route   GET /api/map/layers
// @access  Private
const getAvailableLayers = asyncHandler(async (req, res) => {
  const ALL_LAYERS = [
    "disasters",
    "riskZones",
    "shelters",
    "ngos",
    "volunteers",
    "evacuationRoutes",
    "roadBlocks",
    "weather",
    "news",
    "mapAnalytics",
  ];
  const LIMITED_LAYERS = ["disasters", "riskZones", "shelters", "ngos", "evacuationRoutes", "roadBlocks", "weather", "news"];

  const scope = req.mapScope;
  const layers = scope === SCOPE.LIMITED ? LIMITED_LAYERS : ALL_LAYERS;

  res.json({ success: true, scope, data: layers });
});

module.exports = {
  getDisasterRiskScore,
  overrideDisasterRiskScore,
  sendMapBasedAlert,
  generateRiskReport,
  getMapAnalytics,
  getMapHistory,
  getWeatherInfo,
  getAvailableLayers,
};
