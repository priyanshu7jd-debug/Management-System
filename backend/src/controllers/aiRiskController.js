const asyncHandler = require("express-async-handler");
const Disaster = require("../models/Disaster");
const RiskZone = require("../models/RiskZone");
const Shelter = require("../models/Shelter");
const EvacuationRoute = require("../models/EvacuationRoute");
const RoadBlock = require("../models/RoadBlock");
const Resource = require("../models/Resource");
const Volunteer = require("../models/Volunteer");
const AiRiskSettings = require("../models/AiRiskSettings");
const AiPrediction = require("../models/AiPrediction");
const GroundConditionReport = require("../models/GroundConditionReport");
const MapActivityLog = require("../models/MapActivityLog");
const { SCOPE } = require("../config/aiRiskPermissions");
const { districtFilter, shelterFilter, toBasicView } = require("../middleware/aiRiskAccessMiddleware");
const { predictRisk, levelFromScore, recommendAction } = require("../utils/riskEngine");

const logAiActivity = (action, entityType, entityId, user, details, district) =>
  MapActivityLog.record({ action, entityType, entityId, district: district || "", user, details });

// Looks up the caller's assigned shelter (Volunteer only), or null.
async function getAssignedShelterId(user) {
  if (!user || user.role !== "Volunteer") return null;
  const profile = await Volunteer.findOne({ user: user._id }).select("assignedShelter district");
  return profile ? profile.assignedShelter : null;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

// @desc    Overall AI risk summary - "View overall risk"
// @route   GET /api/ai-risk/overall
// @access  Private
const getOverallRisk = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const filter = districtFilter(req.user, scope, "district");

  const zones = await RiskZone.find(filter);
  const byLevel = zones.reduce((acc, z) => {
    acc[z.riskLevel] = (acc[z.riskLevel] || 0) + 1;
    return acc;
  }, {});
  const avgScore = zones.length
    ? Math.round(zones.reduce((sum, z) => sum + (z.effectiveScore || 0), 0) / zones.length)
    : 0;

  if (scope === SCOPE.LIMITED) {
    return res.json({ success: true, scope, data: { zoneCount: zones.length, averageRiskScore: avgScore } });
  }

  res.json({ success: true, scope, data: { zoneCount: zones.length, byLevel, averageRiskScore: avgScore } });
});

// @desc    Combined live AI risk map payload - "View AI risk map"
// @route   GET /api/ai-risk/map
// @access  Private
const getRiskMap = asyncHandler(async (req, res) => {
  const [disasters, riskZones, shelters, routes, roadBlocks] = await Promise.all([
    Disaster.find({ status: { $in: ["Pending", "Verified", "In Progress"] } }),
    RiskZone.find({ status: { $ne: "Cleared" } }),
    Shelter.find({ status: { $ne: "Closed" } }),
    EvacuationRoute.find({ status: "Active" }),
    RoadBlock.find({ status: { $ne: "Cleared" } }),
  ]);

  res.json({
    success: true,
    data: { disasters, riskZones, shelters, evacuationRoutes: routes, roadBlocks },
  });
});

// @desc    AI risk score for a zone/district - "View risk score"
//          Citizen: AREA (own district). Volunteer: ASSIGNED (assigned area).
// @route   GET /api/ai-risk/risk-score?district=
// @access  Private
const getRiskScore = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const filter = districtFilter(req.user, scope, "district");
  if (req.query.district && scope === SCOPE.FULL) filter.district = req.query.district;

  const zones = await RiskZone.find(filter).select("zoneId name district riskLevel effectiveScore aiRiskScore override");
  res.json({ success: true, scope, count: zones.length, data: zones });
});

// @desc    View disaster predictions
// @route   GET /api/ai-risk/predictions?district=&status=&page=&limit=
// @access  Private
const getDisasterPredictions = asyncHandler(async (req, res) => {
  const { district, status, page = 1, limit = 20 } = req.query;
  const scope = req.aiRiskScope;

  const filter = { ...districtFilter(req.user, scope === SCOPE.LIMITED ? SCOPE.FULL : scope, "district") };
  if (district) filter.district = district;
  if (status) filter.status = status;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [predictions, total] = await Promise.all([
    AiPrediction.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AiPrediction.countDocuments(filter),
  ]);

  const data =
    scope === SCOPE.LIMITED
      ? predictions.map((p) =>
          toBasicView(p, [
            "predictionId",
            "disasterType",
            "district",
            "riskScore",
            "riskLevel",
            "affectedAreas",
            "confidence",
            "recommendedAction",
            "status",
            "createdAt",
          ])
        )
      : predictions;

  res.json({ success: true, count: predictions.length, total, page: pageNum, pages: Math.ceil(total / limitNum), data });
});

// @desc    View the risk factors/weights the AI uses - "View risk factors"
//          Citizen/Volunteer get BASIC: factor names only, no numeric weights.
// @route   GET /api/ai-risk/factors
// @access  Private
const getRiskFactors = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  const factors = Array.from(settings.weights.keys());

  if (req.aiRiskScope === SCOPE.BASIC) {
    return res.json({ success: true, scope: req.aiRiskScope, data: { factors } });
  }

  res.json({ success: true, scope: req.aiRiskScope, data: { weights: Object.fromEntries(settings.weights) } });
});

// @desc    Affected areas across active disasters/risk zones - "View affected areas"
// @route   GET /api/ai-risk/affected-areas
// @access  Private
const getAffectedAreas = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const filter = districtFilter(req.user, scope, "district");

  const [disasters, zones] = await Promise.all([
    Disaster.find({ status: { $in: ["Pending", "Verified", "In Progress"] }, ...(filter.district ? { location: { $regex: filter.district, $options: "i" } } : {}) }).select(
      "disasterId type location severity"
    ),
    RiskZone.find({ status: { $ne: "Cleared" }, ...filter }).select("zoneId name district riskLevel"),
  ]);

  res.json({ success: true, scope, data: { disasters, riskZones: zones } });
});

// @desc    Population at risk aggregation - "View population at risk"
// @route   GET /api/ai-risk/population-at-risk
// @access  Private
const getPopulationAtRisk = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const filter = districtFilter(req.user, scope, "district");

  const zones = await RiskZone.find({ status: { $ne: "Cleared" }, ...filter }).select("district estimatedPopulation riskLevel");
  const totalPopulationAtRisk = zones.reduce((sum, z) => sum + (z.estimatedPopulation || 0), 0);
  const byDistrict = zones.reduce((acc, z) => {
    const key = z.district || "Unknown";
    acc[key] = (acc[key] || 0) + (z.estimatedPopulation || 0);
    return acc;
  }, {});

  res.json({ success: true, scope, data: { totalPopulationAtRisk, byDistrict } });
});

// @desc    AI-generated shelter recommendations - "View shelter recommendations"
// @route   GET /api/ai-risk/shelter-recommendations?district=
// @access  Private
const getShelterRecommendations = asyncHandler(async (req, res) => {
  const { district } = req.query;
  const filter = { status: { $ne: "Closed" } };
  if (district) filter.district = district;

  const shelters = await Shelter.find(filter).select("shelterId name district capacity currentOccupancy facilities");
  const recommendations = shelters
    .map((s) => ({
      shelter: s,
      availableCapacity: Math.max((s.capacity || 0) - (s.currentOccupancy || 0), 0),
    }))
    .filter((r) => r.availableCapacity > 0)
    .sort((a, b) => b.availableCapacity - a.availableCapacity);

  res.json({ success: true, count: recommendations.length, data: recommendations });
});

// @desc    AI-generated evacuation recommendations - "View evacuation recommendations"
//          Volunteer: ASSIGNED to their district.
// @route   GET /api/ai-risk/evacuation-recommendations
// @access  Private
const getEvacuationRecommendations = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const filter = { status: "Active", ...districtFilter(req.user, scope, "district") };

  const routes = await EvacuationRoute.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, scope, count: routes.length, data: routes });
});

// @desc    AI-predicted resource needs - "View resource predictions"
//          Volunteer: ASSIGNED_SHELTER only.
// @route   GET /api/ai-risk/resource-predictions
// @access  Private (Admin, Authority, Volunteer-assigned-shelter)
const getResourcePredictions = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const assignedShelterId = await getAssignedShelterId(req.user);
  const filter = shelterFilter(scope, assignedShelterId);

  const resources = await Resource.find(filter);
  // Simple predictive heuristic: project days-to-depletion using the
  // configured low-stock threshold as a stand-in burn-rate signal.
  const predictions = resources.map((r) => ({
    resource: r.name,
    category: r.category,
    currentQuantity: r.quantity,
    lowStockThreshold: r.lowStockThreshold,
    projectedStatusIn7Days: r.quantity <= r.lowStockThreshold * 2 ? "Low" : "Available",
  }));

  res.json({ success: true, scope, count: predictions.length, data: predictions });
});

// @desc    Resource shortages - "View resource shortages"
//          Volunteer: ASSIGNED_SHELTER only.
// @route   GET /api/ai-risk/resource-shortages
// @access  Private (Admin, Authority, Volunteer-assigned-shelter)
const getResourceShortages = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const assignedShelterId = await getAssignedShelterId(req.user);
  const filter = { status: { $in: ["Low", "Depleted"] }, ...shelterFilter(scope, assignedShelterId) };

  const shortages = await Resource.find(filter).sort({ quantity: 1 });
  res.json({ success: true, scope, count: shortages.length, data: shortages });
});

// @desc    AI prediction accuracy stats - "View AI accuracy"
//          Authority: LIMITED to their own district.
// @route   GET /api/ai-risk/accuracy
// @access  Private (Admin, Authority-limited)
const getAiAccuracy = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const filter = scope === SCOPE.LIMITED ? { district: req.user.district || "__none__" } : {};

  const [total, accurate, inaccurate, unknown] = await Promise.all([
    AiPrediction.countDocuments(filter),
    AiPrediction.countDocuments({ ...filter, outcome: "Accurate" }),
    AiPrediction.countDocuments({ ...filter, outcome: "Inaccurate" }),
    AiPrediction.countDocuments({ ...filter, outcome: "Unknown" }),
  ]);
  const scored = accurate + inaccurate;
  const accuracyRate = scored ? Math.round((accurate / scored) * 100) : null;

  res.json({ success: true, scope, data: { total, accurate, inaccurate, unknown, accuracyRate } });
});

// @desc    Prediction history - "View prediction history"
//          Volunteer: LIMITED to the most recent 10.
// @route   GET /api/ai-risk/predictions/history
// @access  Private (Admin, Authority, Volunteer-limited)
const getPredictionHistory = asyncHandler(async (req, res) => {
  const scope = req.aiRiskScope;
  const limitNum = scope === SCOPE.LIMITED ? 10 : Math.min(parseInt(req.query.limit, 10) || 50, 200);

  const predictions = await AiPrediction.find({}).sort({ createdAt: -1 }).limit(limitNum);
  res.json({ success: true, scope, count: predictions.length, data: predictions });
});

// @desc    AI Risk Engine audit logs - "View audit logs"
//          Authority: LIMITED to their own district.
// @route   GET /api/ai-risk/audit-logs?page=&limit=
// @access  Private (Admin, Authority-limited)
const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const scope = req.aiRiskScope;

  const filter = { entityType: { $in: ["AiPrediction", "AiRiskSettings"] } };
  if (scope === SCOPE.LIMITED && req.user.district) {
    filter.district = { $regex: req.user.district, $options: "i" };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [logs, total] = await Promise.all([
    MapActivityLog.find(filter)
      .populate("performedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    MapActivityLog.countDocuments(filter),
  ]);

  res.json({ success: true, scope, count: logs.length, total, page: pageNum, data: logs });
});

// ---------------------------------------------------------------------------
// Configuration (Admin-only)
// ---------------------------------------------------------------------------

// @desc    Get/update risk score thresholds - "Configure risk thresholds"
// @route   GET/PUT /api/ai-risk/settings/thresholds
// @access  Private (Admin)
const getRiskThresholds = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  res.json({ success: true, data: settings.thresholds });
});

const updateRiskThresholds = asyncHandler(async (req, res) => {
  const { low, medium, high, critical } = req.body;
  const settings = await AiRiskSettings.getSingleton();

  if (low !== undefined) settings.thresholds.low = low;
  if (medium !== undefined) settings.thresholds.medium = medium;
  if (high !== undefined) settings.thresholds.high = high;
  if (critical !== undefined) settings.thresholds.critical = critical;
  settings.updatedBy = req.user._id;

  const updated = await settings.save();
  await logAiActivity("ai_thresholds_configured", "AiRiskSettings", updated._id, req.user, req.body);
  res.json({ success: true, data: updated.thresholds });
});

// @desc    Get/update risk factor weights - "Configure risk weights"
// @route   GET/PUT /api/ai-risk/settings/weights
// @access  Private (Admin)
const getRiskWeights = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  res.json({ success: true, data: Object.fromEntries(settings.weights) });
});

const updateRiskWeights = asyncHandler(async (req, res) => {
  const weights = req.body;
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
    res.status(400);
    throw new Error("Please provide a { factor: weight } object");
  }

  const settings = await AiRiskSettings.getSingleton();
  Object.entries(weights).forEach(([factor, weight]) => settings.weights.set(factor, Number(weight)));
  settings.updatedBy = req.user._id;

  const updated = await settings.save();
  await logAiActivity("ai_weights_configured", "AiRiskSettings", updated._id, req.user, weights);
  res.json({ success: true, data: Object.fromEntries(updated.weights) });
});

// @desc    List / add / update / remove disaster types - "Add/manage disaster types"
// @route   GET/POST /api/ai-risk/settings/disaster-types, PUT/DELETE /:name
// @access  Private (Admin)
const getDisasterTypes = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  res.json({ success: true, data: settings.disasterTypes });
});

const addDisasterType = asyncHandler(async (req, res) => {
  const { name, category } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Please provide a disaster type name");
  }

  const settings = await AiRiskSettings.getSingleton();
  if (settings.disasterTypes.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    res.status(400);
    throw new Error("That disaster type already exists");
  }

  settings.disasterTypes.push({ name, category: category || "", active: true });
  settings.updatedBy = req.user._id;
  const updated = await settings.save();

  await logAiActivity("ai_disaster_type_added", "AiRiskSettings", updated._id, req.user, { name, category });
  res.status(201).json({ success: true, data: updated.disasterTypes });
});

const updateDisasterType = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { category, active, newName } = req.body;

  const settings = await AiRiskSettings.getSingleton();
  const type = settings.disasterTypes.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!type) {
    res.status(404);
    throw new Error("Disaster type not found");
  }

  if (newName !== undefined) type.name = newName;
  if (category !== undefined) type.category = category;
  if (active !== undefined) type.active = active;
  settings.updatedBy = req.user._id;

  const updated = await settings.save();
  await logAiActivity("ai_disaster_type_updated", "AiRiskSettings", updated._id, req.user, req.body);
  res.json({ success: true, data: updated.disasterTypes });
});

const removeDisasterType = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const settings = await AiRiskSettings.getSingleton();
  const before = settings.disasterTypes.length;
  settings.disasterTypes = settings.disasterTypes.filter((t) => t.name.toLowerCase() !== name.toLowerCase());

  if (settings.disasterTypes.length === before) {
    res.status(404);
    throw new Error("Disaster type not found");
  }

  settings.updatedBy = req.user._id;
  const updated = await settings.save();
  await logAiActivity("ai_disaster_type_removed", "AiRiskSettings", updated._id, req.user, { name });
  res.json({ success: true, data: updated.disasterTypes });
});

// @desc    Get/update general AI settings - "Manage AI settings"
// @route   GET/PUT /api/ai-risk/settings/general
// @access  Private (Admin)
const getAiSettings = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  res.json({ success: true, data: settings.general });
});

const updateAiSettings = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  settings.general = { ...settings.general, ...req.body };
  settings.updatedBy = req.user._id;

  const updated = await settings.save();
  await logAiActivity("ai_settings_updated", "AiRiskSettings", updated._id, req.user, req.body);
  res.json({ success: true, data: updated.general });
});

// @desc    List / add / update / remove AI data sources - "Manage AI data sources"
// @route   GET/POST /api/ai-risk/settings/data-sources, PUT/DELETE /:id
// @access  Private (Admin)
const getDataSources = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  res.json({ success: true, data: settings.dataSources });
});

const addDataSource = asyncHandler(async (req, res) => {
  const { name, type, endpoint, enabled } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Please provide a data source name");
  }

  const settings = await AiRiskSettings.getSingleton();
  settings.dataSources.push({ name, type: type || "", endpoint: endpoint || "", enabled: enabled !== false });
  settings.updatedBy = req.user._id;

  const updated = await settings.save();
  await logAiActivity("ai_data_source_added", "AiRiskSettings", updated._id, req.user, req.body);
  res.status(201).json({ success: true, data: updated.dataSources });
});

const updateDataSource = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  const source = settings.dataSources.id(req.params.id);
  if (!source) {
    res.status(404);
    throw new Error("Data source not found");
  }

  ["name", "type", "endpoint", "enabled"].forEach((field) => {
    if (req.body[field] !== undefined) source[field] = req.body[field];
  });
  settings.updatedBy = req.user._id;

  const updated = await settings.save();
  await logAiActivity("ai_data_source_updated", "AiRiskSettings", updated._id, req.user, req.body);
  res.json({ success: true, data: updated.dataSources });
});

const removeDataSource = asyncHandler(async (req, res) => {
  const settings = await AiRiskSettings.getSingleton();
  const source = settings.dataSources.id(req.params.id);
  if (!source) {
    res.status(404);
    throw new Error("Data source not found");
  }

  source.deleteOne();
  settings.updatedBy = req.user._id;
  const updated = await settings.save();
  await logAiActivity("ai_data_source_removed", "AiRiskSettings", updated._id, req.user, { id: req.params.id });
  res.json({ success: true, data: updated.dataSources });
});

// ---------------------------------------------------------------------------
// AI workflow actions
// ---------------------------------------------------------------------------

// @desc    Generate a new AI risk assessment/prediction - "Generate AI risk assessment"
//          Runs the AI Risk Engine and returns: risk score, risk level,
//          predicted disaster, affected area(s), confidence, and a
//          recommended action - see utils/riskEngine.js.
// @route   POST /api/ai-risk/predictions
// @access  Private (Admin, Authority)
const generateAiRiskAssessment = asyncHandler(async (req, res) => {
  const {
    disasterType,
    district,
    center,
    affectedAreas,
    populationAtRisk,
    relatedDisaster,
    relatedRiskZone,
    factors, // optional { rainfall, riverLevel, populationDensity, infrastructureVulnerability, historicalIncidents, soilSaturation }
    sourceReportCount,
  } = req.body;

  if (!disasterType) {
    res.status(400);
    throw new Error("Please provide a disasterType");
  }

  const settings = await AiRiskSettings.getSingleton();
  const relatedZone = relatedRiskZone ? await RiskZone.findById(relatedRiskZone) : null;

  const result = predictRisk(
    {
      disasterType,
      district,
      factors,
      relatedZoneScore: relatedZone ? relatedZone.effectiveScore : undefined,
      affectedAreas: affectedAreas || [],
      sourceReportCount: sourceReportCount || 0,
    },
    settings
  );

  const prediction = await AiPrediction.create({
    disasterType: result.disasterType,
    district: result.district,
    center,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    confidence: result.confidence,
    affectedAreas: result.affectedAreas,
    recommendedAction: result.recommendedAction,
    populationAtRisk: populationAtRisk || 0,
    relatedDisaster: relatedDisaster || null,
    relatedRiskZone: relatedRiskZone || null,
    generatedBy: req.user._id,
  });

  await logAiActivity(
    "ai_assessment_generated",
    "AiPrediction",
    prediction._id,
    req.user,
    { disasterType, riskScore: result.riskScore, riskLevel: result.riskLevel },
    district
  );
  res.status(201).json({ success: true, data: prediction });
});

// @desc    Approve an AI recommendation - "Approve AI recommendations"
// @route   PATCH /api/ai-risk/predictions/:id/approve
// @access  Private (Admin, Authority)
const approveAiRecommendation = asyncHandler(async (req, res) => {
  const prediction = await AiPrediction.findById(req.params.id);
  if (!prediction) {
    res.status(404);
    throw new Error("Prediction not found");
  }

  prediction.status = "Approved";
  prediction.approvedBy = req.user._id;
  prediction.approvedAt = new Date();
  const updated = await prediction.save();

  await logAiActivity("ai_recommendation_approved", "AiPrediction", updated._id, req.user, {}, updated.district);
  res.json({ success: true, data: updated });
});

// @desc    Confirm or reject an AI prediction - "Confirm AI prediction"
// @route   PATCH /api/ai-risk/predictions/:id/confirm
// @access  Private (Admin, Authority, Volunteer)
const confirmAiPrediction = asyncHandler(async (req, res) => {
  const { confirmed = true, reason = "" } = req.body;
  const prediction = await AiPrediction.findById(req.params.id);
  if (!prediction) {
    res.status(404);
    throw new Error("Prediction not found");
  }

  prediction.status = confirmed ? "Confirmed" : "Rejected";
  prediction.confirmedBy = req.user._id;
  prediction.confirmedAt = new Date();
  const updated = await prediction.save();

  await logAiActivity(
    "ai_prediction_confirmed",
    "AiPrediction",
    updated._id,
    req.user,
    { confirmed, reason },
    updated.district
  );
  res.json({ success: true, data: updated });
});

// @desc    AI-analyze a batch of citizen disaster reports - "AI-analyze citizen reports"
// @route   POST /api/ai-risk/predictions/:id/analyze-reports
// @access  Private (Admin, Authority)
const aiAnalyzeCitizenReports = asyncHandler(async (req, res) => {
  const { reportIds = [] } = req.body;
  const prediction = await AiPrediction.findById(req.params.id);
  if (!prediction) {
    res.status(404);
    throw new Error("Prediction not found");
  }

  const reports = await Disaster.find({ _id: { $in: reportIds } });
  prediction.sourceReports = reports.map((r) => r._id);
  // Corroborating citizen reports raise both the score and how much we
  // trust it, with more weight for High/Critical-severity reports.
  const severityBoost = reports.filter((r) => ["High", "Critical"].includes(r.severity)).length * 5;
  prediction.riskScore = Math.min(100, prediction.riskScore + severityBoost);

  const settings = await AiRiskSettings.getSingleton();
  prediction.riskLevel = levelFromScore(prediction.riskScore, settings.thresholds);
  prediction.recommendedAction = recommendAction(prediction.riskLevel, prediction.disasterType);
  prediction.confidence = Math.min(99, prediction.confidence + Math.min(reports.length, 5) * 2);

  prediction.analyzedBy = req.user._id;
  prediction.analyzedAt = new Date();

  const updated = await prediction.save();
  await logAiActivity(
    "ai_citizen_reports_analyzed",
    "AiPrediction",
    updated._id,
    req.user,
    { reportCount: reports.length },
    updated.district
  );
  res.json({ success: true, data: updated });
});

// @desc    Record whether a resolved prediction turned out accurate - feeds "View AI accuracy"
// @route   PATCH /api/ai-risk/predictions/:id/outcome
// @access  Private (Admin, Authority)
const recordPredictionOutcome = asyncHandler(async (req, res) => {
  const { outcome } = req.body;
  if (!["Accurate", "Inaccurate"].includes(outcome)) {
    res.status(400);
    throw new Error("outcome must be 'Accurate' or 'Inaccurate'");
  }

  const prediction = await AiPrediction.findById(req.params.id);
  if (!prediction) {
    res.status(404);
    throw new Error("Prediction not found");
  }

  prediction.outcome = outcome;
  const updated = await prediction.save();
  await logAiActivity("ai_prediction_outcome_recorded", "AiPrediction", updated._id, req.user, { outcome }, updated.district);
  res.json({ success: true, data: updated });
});

// @desc    File a ground-condition report - "Report ground conditions"
// @route   POST /api/ai-risk/ground-conditions
// @access  Private (any authenticated user)
const reportGroundCondition = asyncHandler(async (req, res) => {
  const { district, location, disasterType, condition, severity, images, relatedPrediction } = req.body;

  if (!condition) {
    res.status(400);
    throw new Error("Please describe the ground condition");
  }

  const report = await GroundConditionReport.create({
    district,
    location,
    disasterType,
    condition,
    severity,
    images,
    relatedPrediction: relatedPrediction || null,
    reportedBy: req.user._id,
    reportedByRole: req.user.role,
  });

  await logAiActivity("ground_condition_reported", "AiPrediction", report.relatedPrediction, req.user, { reportId: report.reportId }, district);
  res.status(201).json({ success: true, data: report });
});

// @desc    List ground-condition reports
// @route   GET /api/ai-risk/ground-conditions?district=
// @access  Private
const getGroundConditionReports = asyncHandler(async (req, res) => {
  const { district, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (district) filter.district = district;
  // Citizens/Volunteers can file reports but only browse their own; full
  // feed visibility is an Admin/Authority capability.
  if (!["Admin", "Authority"].includes(req.user.role)) filter.reportedBy = req.user._id;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [reports, total] = await Promise.all([
    GroundConditionReport.find(filter)
      .populate("reportedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    GroundConditionReport.countDocuments(filter),
  ]);

  res.json({ success: true, count: reports.length, total, page: pageNum, data: reports });
});

module.exports = {
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
};
