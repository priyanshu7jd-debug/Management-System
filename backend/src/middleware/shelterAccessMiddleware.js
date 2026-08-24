const asyncHandler = require("express-async-handler");
const { SCOPE, getScope, canAccess } = require("../config/shelterPermissions");
const Volunteer = require("../models/Volunteer");

/**
 * Blocks the request outright if the logged-in user's role has no access
 * (SCOPE.NONE) to `action`. If they have any access, the resolved scope is
 * stashed on req.shelterScope so the controller can tailor the response
 * (e.g. restrict to the Volunteer's ASSIGNED shelter, or downgrade a write
 * to a REQUEST/REPORT).
 *
 * Must run after `protect` (needs req.user).
 */
const requireShelterPermission = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;

  if (!canAccess(action, role)) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' is not authorized to ${action}`);
  }

  req.shelterScope = getScope(action, role);
  next();
};

/**
 * Only lets the request through when the role's scope for `action` is
 * exactly FULL. Useful for endpoints that are all-or-nothing for everyone
 * except the roles marked "full" in the table (e.g. approveShelter).
 */
const requireFullShelterAccess = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;
  const scope = getScope(action, role);

  if (scope !== SCOPE.FULL) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' does not have full access to ${action}`);
  }

  req.shelterScope = scope;
  next();
};

/**
 * Looks up the shelter(s) the logged-in Volunteer is assigned to (their
 * Volunteer.assignedShelter). Returns null if the user has no Volunteer
 * profile or no assigned shelter. Cached on req so a single request never
 * hits the DB for this more than once.
 */
const getAssignedShelterId = asyncHandler(async (user) => {
  if (!user || user.role !== "Volunteer") return null;
  const profile = await Volunteer.findOne({ user: user._id }).select("assignedShelter");
  return profile && profile.assignedShelter ? profile.assignedShelter.toString() : null;
});

/**
 * True if a shelter (by id) is within the ASSIGNED scope for this user -
 * i.e. it's the shelter the Volunteer is currently assigned to. Admin/
 * Authority never need this check since their scope on Volunteer-shared
 * actions is always FULL.
 */
const isShelterAssignedToVolunteer = async (shelterId, user) => {
  if (!shelterId || !user) return false;
  const assignedId = await getAssignedShelterId(user);
  return Boolean(assignedId) && assignedId === shelterId.toString();
};

/**
 * Given the scope resolved by requireShelterPermission, decides whether
 * this specific shelter is in bounds for the request. Callers respond with
 * 403 themselves so the wording can match the action.
 */
const isShelterInScope = asyncHandler(async (shelterId, user, scope) => {
  switch (scope) {
    case SCOPE.FULL:
      return true;
    case SCOPE.ASSIGNED:
      return isShelterAssignedToVolunteer(shelterId, user);
    case SCOPE.SELF:
      // Any shelter is "in scope" to look at - the actual restriction to
      // the citizen's own occupant record happens in the controller
      // (checkInCitizen/checkOutCitizen/getShelterOccupants), which is
      // where the citizenId gets pinned to req.user._id.
      return true;
    case SCOPE.REQUEST:
    case SCOPE.REPORT:
    case SCOPE.LIMITED:
      // These are action-level scopes handled by the specific controller
      // (e.g. REQUEST just changes what the write produces, LIMITED just
      // trims/filters the response) rather than gating a single record.
      return true;
    default:
      return false;
  }
});

module.exports = {
  requireShelterPermission,
  requireFullShelterAccess,
  getAssignedShelterId,
  isShelterAssignedToVolunteer,
  isShelterInScope,
};
