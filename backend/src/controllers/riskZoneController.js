const asyncHandler = require("express-async-handler");
const RiskZone = require("../models/RiskZone");
const MapActivityLog = require("../models/MapActivityLog");
const { SCOPE } = require("../config/mapPermissions");
const { SCOPE: AI_SCOPE } = require("../config/aiRiskPermissions");

// @desc    Create a risk zone
// @route   POST /api/map/risk-zones
// @access  Private (Admin, Authority) - "Add risk zone"
const createRiskZone = asyncHandler(async (req, res) => {
  const { name, district, center, radiusMeters, riskLevel, relatedDisaster, assignedTo } = req.body;

  if (!name || !center || center.lat === undefined || center.lng === undefined) {
    res.status(400);
    throw new Error("Please provide a name and center coordinates");
  }

  const zone = await RiskZone.create({
    name,
    district,
    center,
    radiusMeters,
    riskLevel,
    relatedDisaster,
    assignedTo: assignedTo || (req.user.role === "Authority" ? req.user._id : null),
    createdBy: req.user._id,
  });

  await MapActivityLog.record({
    action: "risk_zone_created",
    entityType: "RiskZone",
    entityId: zone._id,
    district: zone.district,
    user: req.user,
    details: { name: zone.name, riskLevel: zone.riskLevel },
  });

  res.status(201).json({ success: true, data: zone });
});

// @desc    List risk zones - "View risk zones" (full access for every role)
// @route   GET /api/map/risk-zones?district=&riskLevel=&page=&limit=
// @access  Private
const getRiskZones = asyncHandler(async (req, res) => {
  const { district, riskLevel, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (district) filter.district = district;
  if (riskLevel) filter.riskLevel = riskLevel;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 50, 200);

  const [zones, total] = await Promise.all([
    RiskZone.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    RiskZone.countDocuments(filter),
  ]);

  // "View risk score" (config/aiRiskPermissions.js) restricts Citizen/
  // Volunteer to AREA/ASSIGNED zones: strip the override/audit trail and
  // only surface the effective score + level. Set by a separate
  // requireAiRiskPermission("viewRiskScore") on this route if desired.
  const scope = req.aiRiskScope;
  const data =
    scope === AI_SCOPE.AREA || scope === AI_SCOPE.ASSIGNED
      ? zones.map((z) => ({
          zoneId: z.zoneId,
          name: z.name,
          district: z.district,
          center: z.center,
          radiusMeters: z.radiusMeters,
          riskLevel: z.riskLevel,
          effectiveScore: z.effectiveScore,
        }))
      : zones;

  res.json({ success: true, count: zones.length, total, page: pageNum, pages: Math.ceil(total / limitNum), data });
});

// @desc    Get a single risk zone
// @route   GET /api/map/risk-zones/:id
// @access  Private
const getRiskZoneById = asyncHandler(async (req, res) => {
  const zone = await RiskZone.findById(req.params.id);
  if (!zone) {
    res.status(404);
    throw new Error("Risk zone not found");
  }
  res.json({ success: true, data: zone });
});

// @desc    Update a risk zone - "Edit risk zone" (Admin full, Authority assigned-only)
// @route   PUT /api/map/risk-zones/:id
// @access  Private (Admin, Authority)
const updateRiskZone = asyncHandler(async (req, res) => {
  const zone = await RiskZone.findById(req.params.id);
  if (!zone) {
    res.status(404);
    throw new Error("Risk zone not found");
  }

  if (req.mapScope === SCOPE.ASSIGNED) {
    const isAssigned = zone.assignedTo && zone.assignedTo.toString() === req.user._id.toString();
    if (!isAssigned) {
      res.status(403);
      throw new Error("You can only edit risk zones assigned to you");
    }
  }

  const fields = ["name", "district", "center", "radiusMeters", "riskLevel", "status", "relatedDisaster", "assignedTo"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) zone[field] = req.body[field];
  });

  const updated = await zone.save();

  await MapActivityLog.record({
    action: "risk_zone_updated",
    entityType: "RiskZone",
    entityId: zone._id,
    district: zone.district,
    user: req.user,
  });

  res.json({ success: true, data: updated });
});

// @desc    Delete a risk zone - "Remove risk zone" (Admin only)
// @route   DELETE /api/map/risk-zones/:id
// @access  Private (Admin)
const deleteRiskZone = asyncHandler(async (req, res) => {
  const zone = await RiskZone.findById(req.params.id);
  if (!zone) {
    res.status(404);
    throw new Error("Risk zone not found");
  }

  await zone.deleteOne();

  await MapActivityLog.record({
    action: "risk_zone_removed",
    entityType: "RiskZone",
    entityId: zone._id,
    district: zone.district,
    user: req.user,
  });

  res.json({ success: true, message: "Risk zone removed" });
});

// @desc    Override the AI risk score - "Override AI risk"
//          (Admin: any value; Authority: LIMITED to a +/-15 nudge on zones
//          assigned to them; Citizen/Volunteer: no access, blocked upstream)
// @route   PATCH /api/map/risk-zones/:id/override
// @access  Private (Admin, Authority-limited)
const overrideRiskZoneScore = asyncHandler(async (req, res) => {
  const { value, reason } = req.body;

  if (value === undefined || value < 0 || value > 100) {
    res.status(400);
    throw new Error("Please provide an override value between 0 and 100");
  }

  const zone = await RiskZone.findById(req.params.id);
  if (!zone) {
    res.status(404);
    throw new Error("Risk zone not found");
  }

  if (req.aiRiskScope === AI_SCOPE.LIMITED) {
    const isAssigned = zone.assignedTo && zone.assignedTo.toString() === req.user._id.toString();
    if (!isAssigned) {
      res.status(403);
      throw new Error("You can only override the risk score on zones assigned to you");
    }
    const delta = Math.abs(value - zone.aiRiskScore);
    if (delta > 15) {
      res.status(403);
      throw new Error("Authority override is limited to +/-15 points from the AI-computed score");
    }
  }

  zone.override = { value, reason: reason || "", by: req.user._id, at: new Date() };
  const updated = await zone.save();

  await MapActivityLog.record({
    action: "risk_score_overridden",
    entityType: "RiskZone",
    entityId: zone._id,
    district: zone.district,
    user: req.user,
    details: { value, reason },
  });

  res.json({ success: true, data: updated });
});

module.exports = {
  createRiskZone,
  getRiskZones,
  getRiskZoneById,
  updateRiskZone,
  deleteRiskZone,
  overrideRiskZoneScore,
};
