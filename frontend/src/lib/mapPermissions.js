// Frontend mirror of backend/src/config/mapPermissions.js.
//
// This is UI-gating only (show/hide buttons and panels) - the backend
// enforces the real rule on every request regardless of what the UI does.
// Keep this file's shape in sync with the backend table if it changes.

export const SCOPE = Object.freeze({
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

export const MAP_PERMISSIONS = Object.freeze({
  viewLiveRiskMap: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  viewOverallRisk: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.AREA, Volunteer: SCOPE.ASSIGNED },
  viewAiRiskScore: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.BASIC, Volunteer: SCOPE.ASSIGNED },
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
  overrideAiRisk: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  createEvacuationZone: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  markRoadBlocked: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.REPORT, Volunteer: SCOPE.REPORT },
  markAreaEvacuated: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  sendMapBasedAlert: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  generateRiskReport: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewMapAnalytics: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.LIMITED },
  viewMapHistory: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.LIMITED },
});

/** Returns the scope a role has for `action` (SCOPE.NONE if unknown). */
export function getMapScope(action, role) {
  const row = MAP_PERMISSIONS[action];
  if (!row) return SCOPE.NONE;
  return row[role] ?? SCOPE.NONE;
}

/** True if the role has any access at all (including a restricted scope). */
export function canAccessMap(action, role) {
  return getMapScope(action, role) !== SCOPE.NONE;
}

/** True only if the role's access is unrestricted (FULL). */
export function hasFullMapAccess(action, role) {
  return getMapScope(action, role) === SCOPE.FULL;
}

/**
 * React hook-free helper: pass the current user's role and get back an
 * object of { actionName: boolean } for a list of actions, handy for
 * gating a group of buttons at once, e.g.:
 *
 *   const can = mapPermissionsFor(user.role, ["addRiskZone", "removeRiskZone"]);
 *   {can.addRiskZone && <button>Add zone</button>}
 */
export function mapPermissionsFor(role, actions) {
  return actions.reduce((acc, action) => {
    acc[action] = canAccessMap(action, role);
    return acc;
  }, {});
}
