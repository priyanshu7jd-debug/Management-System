// Frontend mirror of backend/src/config/shelterPermissions.js.
//
// This is UI-gating only (show/hide buttons and panels) - the backend
// enforces the real rule on every request regardless of what the UI does.
// Keep this file's shape in sync with the backend table if it changes.
//
// Note: "manageUsers" and "manageRolesPermissions" are Admin-only,
// account-wide actions (not shelter-specific) already handled by the
// existing user-management screens/routes - they're listed here only for
// parity with the product's Shelter table.

export const SCOPE = Object.freeze({
  FULL: "full",
  ASSIGNED: "assigned",
  REQUEST: "request",
  REPORT: "report",
  LIMITED: "limited",
  SELF: "self",
  NONE: false,
});

export const SHELTER_PERMISSIONS = Object.freeze({
  viewShelters: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  addShelter: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  editShelter: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  deleteShelter: { Admin: SCOPE.FULL, Authority: SCOPE.REQUEST, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  approveShelter: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageCapacity: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED },
  viewOccupancy: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  citizenCheckInOut: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.SELF, Volunteer: SCOPE.ASSIGNED },
  assignShelter: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED },
  transferCitizen: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageFoodWater: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED },
  manageMedicines: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED },
  manageFacilities: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.REPORT },
  assignVolunteers: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  createVolunteerTasks: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  reportShelterProblem: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  resolveShelterProblems: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  sendShelterAlerts: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewReportsStatistics: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.LIMITED },
  manageUsers: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageRolesPermissions: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewAuditHistory: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
});

/** Returns the scope a role has for `action` (SCOPE.NONE if unknown). */
export function getShelterScope(action, role) {
  const row = SHELTER_PERMISSIONS[action];
  if (!row) return SCOPE.NONE;
  return row[role] ?? SCOPE.NONE;
}

/** True if the role has any access at all (including a restricted scope). */
export function canAccessShelter(action, role) {
  return getShelterScope(action, role) !== SCOPE.NONE;
}

/** True only if the role's access is unrestricted (FULL). */
export function hasFullShelterAccess(action, role) {
  return getShelterScope(action, role) === SCOPE.FULL;
}

/**
 * React hook-free helper: pass the current user's role and get back an
 * object of { actionName: boolean } for a list of actions, handy for
 * gating a group of buttons at once, e.g.:
 *
 *   const can = shelterPermissionsFor(user.role, ["editShelter", "approveShelter"]);
 *   {can.approveShelter && <button>Approve</button>}
 */
export function shelterPermissionsFor(role, actions) {
  return actions.reduce((acc, action) => {
    acc[action] = canAccessShelter(action, role);
    return acc;
  }, {});
}
