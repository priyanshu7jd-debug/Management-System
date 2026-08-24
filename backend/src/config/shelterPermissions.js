/**
 * Central permission matrix for the Shelter module.
 *
 * This is a direct transcription of the product's Shelter role-permission
 * table. Every other file in the shelter module (middleware, controllers,
 * routes) reads from this table instead of hard-coding role checks, so the
 * table only has to be edited in one place. Mirrors the same pattern as
 * config/incidentPermissions.js and config/mapPermissions.js.
 *
 * Two rows in the product table - "Manage users" and "Manage roles/
 * permissions" - are Admin-only, account-wide capabilities that are not
 * shelter-specific. They are already fully enforced by
 * routes/userRoutes.js + middleware/authMiddleware.js's `authorize("Admin")`
 * (see getUsers/updateUserRole/updateUserStatus/deleteUser in
 * controllers/userController.js), so they are listed here for
 * documentation/parity with the product table but are not wired to any new
 * shelter-module middleware or endpoints.
 *
 * Scope values:
 *   FULL       - unrestricted access
 *   ASSIGNED   - restricted to the shelter(s) the Volunteer is assigned to
 *                (Volunteer.assignedShelter)
 *   REQUEST    - may submit a request/recommendation, but not directly
 *                change state (e.g. Authority requesting a shelter be
 *                deleted/deactivated - only Admin can actually delete)
 *   REPORT     - may submit a report/flag, but not directly change state
 *                (e.g. Volunteer flagging a facilities problem instead of
 *                editing facilities directly)
 *   LIMITED    - a capped or partial version of the action (e.g. Authority's
 *                view of audit history, Volunteer's view of reports)
 *   SELF       - may act, but only on their own record (e.g. a Citizen
 *                checking themself in/out of the shelter they're assigned
 *                to - never someone else's occupant record)
 *   NONE       - not permitted at all
 */

const SCOPE = Object.freeze({
  FULL: "full",
  ASSIGNED: "assigned",
  REQUEST: "request",
  REPORT: "report",
  LIMITED: "limited",
  SELF: "self",
  NONE: false,
});

const ROLES = Object.freeze(["Admin", "Authority", "Citizen", "Volunteer"]);

// action -> { Admin, Authority, Citizen, Volunteer }
const SHELTER_PERMISSIONS = Object.freeze({
  viewShelters: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  addShelter: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  editShelter: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  deleteShelter: { Admin: SCOPE.FULL, Authority: SCOPE.REQUEST, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  approveShelter: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  // Volunteer: ASSIGNED - a Volunteer may update the headcount ("Update
  // occupancy") at their assigned shelter, but not the total capacity
  // (that's still Admin/Authority via editShelter) - enforced in the
  // controller, not just this table.
  manageCapacity: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.ASSIGNED },
  viewOccupancy: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  // Citizen: SELF - a citizen can check themself in/out (only their own
  // occupant record), never anyone else's. Matches the product table's
  // "Citizen check-in ❌/Self, check-out Self".
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

/**
 * Returns the scope a role has for a given action, or SCOPE.NONE if the
 * action or role is unknown.
 */
function getScope(action, role) {
  const row = SHELTER_PERMISSIONS[action];
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

module.exports = { SCOPE, ROLES, SHELTER_PERMISSIONS, getScope, canAccess, hasFullAccess };
