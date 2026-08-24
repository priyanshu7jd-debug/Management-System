/**
 * Central permission matrix for the AI Risk Engine module.
 *
 * This is a direct transcription of the product's "AI Risk Engine Function"
 * role-permission table. Every other file in the AI-risk module (middleware,
 * controllers, routes) reads from this table instead of hard-coding role
 * checks, so the table only has to be edited in one place. Mirrors the same
 * pattern as config/shelterPermissions.js, config/mapPermissions.js, and
 * config/incidentPermissions.js.
 *
 * This module now OWNS every AI-risk-related row that used to live in
 * config/mapPermissions.js. Five rows moved here verbatim (same semantics,
 * renamed to match the product table) and were deleted from
 * mapPermissions.js: viewLiveRiskMap -> viewRiskMap, viewOverallRisk,
 * viewAiRiskScore -> viewRiskScore, overrideAiRisk, generateRiskReport ->
 * generateAiRiskAssessment. See controllers/mapController.js,
 * controllers/riskZoneController.js and their routes for the call sites.
 *
 * A handful of rows in the product table are actually delivered by other,
 * already-fully-permissioned modules rather than by new AI-risk endpoints.
 * They are listed here for documentation/parity with the product table but
 * are enforced where the underlying action actually happens:
 *   - submitDisasterReport   -> incidentPermissions.createIncident
 *                               (routes/disasterRoutes.js POST /)
 *   - receiveAiAlerts        -> delivered to every authenticated user via
 *                               models/Notification.js + utils/notify.js;
 *                               there is no separate "fetch" endpoint to gate
 *   - sendEmergencyAlerts    -> routes/alertRoutes.js, authorize("Authority","Admin")
 *   - createEvacuationPlan   -> mapPermissions.createEvacuationZone
 *                               (controllers/evacuationRouteController.js)
 *   - assignEmergencyTasks   -> routes/taskRoutes.js, authorize("Authority","Admin")
 *
 * Scope values:
 *   FULL             - unrestricted access
 *   AREA             - restricted to the user's own district/area
 *   ASSIGNED         - restricted to the Volunteer's assigned district/disaster
 *   ASSIGNED_SHELTER - restricted to the Volunteer's assigned shelter
 *   NEARBY           - restricted to a radius around the user
 *   BASIC            - a reduced/summarized version of the data
 *   LIMITED          - a capped or partial version of the action
 *   NONE             - not permitted at all
 */

const SCOPE = Object.freeze({
  FULL: "full",
  AREA: "area",
  ASSIGNED: "assigned",
  ASSIGNED_SHELTER: "assignedShelter",
  NEARBY: "nearby",
  BASIC: "basic",
  LIMITED: "limited",
  NONE: false,
});

const ROLES = Object.freeze(["Admin", "Authority", "Citizen", "Volunteer"]);

// action -> { Admin, Authority, Citizen, Volunteer }
const AI_RISK_PERMISSIONS = Object.freeze({
  // --- Views (moved here from mapPermissions.js) ---
  viewOverallRisk: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.LIMITED, Volunteer: SCOPE.LIMITED },
  viewRiskMap: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewRiskScore: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.AREA, Volunteer: SCOPE.ASSIGNED },

  // --- New views ---
  viewDisasterPredictions: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.LIMITED, Volunteer: SCOPE.FULL },
  viewRiskFactors: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.BASIC, Volunteer: SCOPE.BASIC },
  viewAffectedAreas: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NEARBY, Volunteer: SCOPE.ASSIGNED },
  viewPopulationAtRisk: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.AREA, Volunteer: SCOPE.ASSIGNED },
  viewShelterRecommendations: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewEvacuationRecommendations: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.ASSIGNED },
  viewResourcePredictions: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED_SHELTER },
  viewResourceShortages: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED_SHELTER },
  viewAiAccuracy: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewPredictionHistory: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.LIMITED },
  viewAuditLogs: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },

  // --- Configuration (Admin-only) ---
  configureRiskThresholds: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  configureRiskWeights: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageDisasterTypes: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageAiSettings: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageAiDataSources: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },

  // --- AI workflow actions ---
  approveAiRecommendations: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  overrideAiRisk: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  generateAiRiskAssessment: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  aiAnalyzeCitizenReports: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  confirmAiPrediction: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.FULL },
  reportGroundConditions: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },

  // --- Documented for parity; enforced by other modules (see header comment) ---
  submitDisasterReport: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  receiveAiAlerts: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  sendEmergencyAlerts: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  createEvacuationPlan: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  assignEmergencyTasks: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
});

/**
 * Returns the scope a role has for a given action, or SCOPE.NONE if the
 * action or role is unknown.
 */
function getScope(action, role) {
  const row = AI_RISK_PERMISSIONS[action];
  if (!row) return SCOPE.NONE;
  if (!ROLES.includes(role)) return SCOPE.NONE;
  return row[role] ?? SCOPE.NONE;
}

/**
 * True if the role has any level of access (including a restricted scope)
 * to the given action.
 */
function canAccess(action, role) {
  return getScope(action, role) !== SCOPE.NONE;
}

/**
 * True only if the role has unrestricted (FULL) access to the given action.
 */
function hasFullAccess(action, role) {
  return getScope(action, role) === SCOPE.FULL;
}

module.exports = { SCOPE, ROLES, AI_RISK_PERMISSIONS, getScope, canAccess, hasFullAccess };
