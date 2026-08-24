/**
 * Central permission matrix for the Incident module (backed by the Disaster
 * model/collection - "incident" is the product term, "Disaster" is the
 * historical schema name; they refer to the same record).
 *
 * This is a direct transcription of the product's incident role-permission
 * table. Every other file in the incident module (middleware, controllers,
 * routes) reads from this table instead of hard-coding role checks, so the
 * table only has to be edited in one place. Mirrors the same pattern as
 * config/mapPermissions.js.
 *
 * Scope values:
 *   FULL       - unrestricted access
 *   AREA       - restricted to the user's own district/area
 *   ASSIGNED   - restricted to incidents assigned to the user (Authority's
 *                area, Volunteer's assigned incident/task)
 *   OWN        - restricted to incidents the user themselves reported
 *   OWN_BEFORE_REVIEW - like OWN, but only while the incident is still
 *                Pending (i.e. before an Authority/Admin has reviewed it)
 *   REPORTED   - restricted to incidents the Volunteer reported OR is assigned to
 *   REQUEST    - may submit a request/recommendation, but not directly
 *                change state (e.g. Volunteer requesting a reopen)
 *   RECOMMEND  - may submit a resolution recommendation, but not resolve directly
 *   ASSIGNED_TASK_ONLY - Volunteer may only update status on their own
 *                assigned task/incident, not any incident
 *   LIMITED    - a capped or partial version of the action
 *   NONE       - not permitted at all
 */

const SCOPE = Object.freeze({
  FULL: "full",
  AREA: "area",
  ASSIGNED: "assigned",
  OWN: "own",
  OWN_BEFORE_REVIEW: "ownBeforeReview",
  REPORTED: "reported",
  REQUEST: "request",
  RECOMMEND: "recommend",
  ASSIGNED_TASK_ONLY: "assignedTaskOnly",
  LIMITED: "limited",
  NONE: false,
});

const ROLES = Object.freeze(["Admin", "Authority", "Citizen", "Volunteer"]);

// action -> { Admin, Authority, Citizen, Volunteer }
const INCIDENT_PERMISSIONS = Object.freeze({
  viewIncidents: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.OWN, Volunteer: SCOPE.REPORTED },
  createIncident: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  editIncident: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.OWN_BEFORE_REVIEW, Volunteer: SCOPE.OWN_BEFORE_REVIEW },
  deleteIncident: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  verifyIncident: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  rejectIncident: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  changePriority: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  assignAuthority: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  assignVolunteer: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  assignNgo: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  updateIncidentStatus: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED_TASK_ONLY },
  addInvestigationNotes: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  uploadEvidence: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  addPhotosVideos: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  addLocation: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewIncidentMap: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.LIMITED, Volunteer: SCOPE.ASSIGNED },
  requestEmergencyResponse: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  createResponseTask: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  coordinateResponse: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED },
  escalateIncident: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.FULL },
  resolveIncident: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.RECOMMEND },
  reopenIncident: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.REQUEST },
  viewIncidentHistory: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.OWN, Volunteer: SCOPE.ASSIGNED },
  generateReports: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewAnalytics: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  receiveNotifications: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  sendEmergencyAlerts: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewAuditLogs: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.OWN, Volunteer: SCOPE.OWN },
});

/**
 * Returns the scope a role has for a given action, or SCOPE.NONE if the
 * action or role is unknown.
 */
function getScope(action, role) {
  const row = INCIDENT_PERMISSIONS[action];
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

module.exports = { SCOPE, ROLES, INCIDENT_PERMISSIONS, getScope, canAccess, hasFullAccess };
