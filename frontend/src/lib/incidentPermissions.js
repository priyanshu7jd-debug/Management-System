// Frontend mirror of backend/src/config/incidentPermissions.js.
//
// This is UI-gating only (show/hide buttons and panels) - the backend
// enforces the real rule on every request regardless of what the UI does.
// Keep this file's shape in sync with the backend table if it changes.

export const SCOPE = Object.freeze({
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

export const INCIDENT_PERMISSIONS = Object.freeze({
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

/** Returns the scope a role has for `action` (SCOPE.NONE if unknown). */
export function getIncidentScope(action, role) {
  const row = INCIDENT_PERMISSIONS[action];
  if (!row) return SCOPE.NONE;
  return row[role] ?? SCOPE.NONE;
}

/** True if the role has any access at all (including a restricted scope). */
export function canAccessIncident(action, role) {
  return getIncidentScope(action, role) !== SCOPE.NONE;
}

/** True only if the role's access is unrestricted (FULL). */
export function hasFullIncidentAccess(action, role) {
  return getIncidentScope(action, role) === SCOPE.FULL;
}

/**
 * React hook-free helper: pass the current user's role and get back an
 * object of { actionName: boolean } for a list of actions, handy for
 * gating a group of buttons at once, e.g.:
 *
 *   const can = incidentPermissionsFor(user.role, ["verifyIncident", "escalateIncident"]);
 *   {can.verifyIncident && <button>Verify</button>}
 */
export function incidentPermissionsFor(role, actions) {
  return actions.reduce((acc, action) => {
    acc[action] = canAccessIncident(action, role);
    return acc;
  }, {});
}
