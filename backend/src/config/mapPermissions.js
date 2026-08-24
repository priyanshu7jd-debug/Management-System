/**
 * Central permission matrix for the Map / Risk module.
 *
 * This is a direct transcription of the product's role-permission table for
 * map-related functions. Every other file in the map module (middleware,
 * controllers, routes) reads from this table instead of hard-coding role
 * checks, so the table only has to be edited in one place.
 *
 * NOTE: The AI-risk-specific rows that used to live here (viewLiveRiskMap,
 * viewOverallRisk, viewAiRiskScore, overrideAiRisk, generateRiskReport) have
 * moved to config/aiRiskPermissions.js as part of that module owning the
 * full "AI Risk Engine" permission table end-to-end - see viewRiskMap,
 * viewOverallRisk, viewRiskScore, overrideAiRisk, and generateAiRiskAssessment
 * there. controllers/mapController.js, controllers/riskZoneController.js and
 * their routes now import from aiRiskPermissions/aiRiskAccessMiddleware for
 * those specific actions instead.
 *
 * Scope values:
 *   FULL          - unrestricted access
 *   AREA          - restricted to the user's own district/area
 *   ASSIGNED      - restricted to the user's assigned disaster/shelter/zone
 *   ASSIGNED_TEAM - restricted to the user's assigned team/NGO
 *   NEARBY        - restricted to a radius around the user
 *   BASIC         - a reduced/summarized version of the data
 *   LIMITED       - a capped or partial version of the action
 *   REPORT        - may submit a report/flag, but not directly change state
 *   NONE          - not permitted at all
 */

const SCOPE = Object.freeze({
  FULL: "full",
  AREA: "area",
  ASSIGNED: "assigned",
  ASSIGNED_TEAM: "assignedTeam",
  NEARBY: "nearby",
  BASIC: "basic",
  LIMITED: "limited",
  REPORT: "report",
  NONE: false,
});

const ROLES = Object.freeze(["Admin", "Authority", "Citizen", "Volunteer"]);

// action -> { Admin, Authority, Citizen, Volunteer }
const MAP_PERMISSIONS = Object.freeze({
  viewRiskZones: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewDisasterLocations: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewActiveIncidents: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NEARBY, Volunteer: SCOPE.ASSIGNED },
  viewShelters: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewShelterCapacity: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.ASSIGNED },
  viewNGOs: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.ASSIGNED },
  viewVolunteers: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED_TEAM },
  viewEvacuationRoutes: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewBlockedRoads: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewWeatherInfo: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.BASIC, Volunteer: SCOPE.FULL },
  viewDisasterNews: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  searchLocation: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  filterMapLayers: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.LIMITED, Volunteer: SCOPE.LIMITED },
  reportIncidentFromMap: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },

  addRiskZone: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  editRiskZone: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  removeRiskZone: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  createEvacuationZone: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  markRoadBlocked: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.REPORT, Volunteer: SCOPE.REPORT },
  markAreaEvacuated: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  sendMapBasedAlert: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewMapAnalytics: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.LIMITED },
  viewMapHistory: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.LIMITED },
});

/**
 * Returns the scope a role has for a given action, or SCOPE.NONE if the
 * action or role is unknown.
 */
function getScope(action, role) {
  const row = MAP_PERMISSIONS[action];
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

module.exports = { SCOPE, ROLES, MAP_PERMISSIONS, getScope, canAccess, hasFullAccess };
