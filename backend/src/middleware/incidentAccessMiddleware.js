const { SCOPE, getScope, canAccess } = require("../config/incidentPermissions");

/**
 * Blocks the request outright if the logged-in user's role has no access
 * (SCOPE.NONE) to `action`. If they have any access, the resolved scope is
 * stashed on req.incidentScope so the controller can tailor the response
 * (e.g. restrict to OWN, ASSIGNED, or a REQUEST/RECOMMEND-only action).
 *
 * Must run after `protect` (needs req.user).
 */
const requireIncidentPermission = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;

  if (!canAccess(action, role)) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' is not authorized to ${action}`);
  }

  req.incidentScope = getScope(action, role);
  next();
};

/**
 * Only lets the request through when the role's scope for `action` is
 * exactly FULL. Useful for endpoints that are all-or-nothing for everyone
 * except the roles marked "full" in the table (e.g. assignAuthority).
 */
const requireFullIncidentAccess = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;
  const scope = getScope(action, role);

  if (scope !== SCOPE.FULL) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' does not have full access to ${action}`);
  }

  req.incidentScope = scope;
  next();
};

/**
 * Given a loaded Disaster (incident) document, a user, and the scope
 * resolved by requireIncidentPermission, decides whether this specific
 * record is in bounds. Returns true/false - callers respond with 403/404
 * themselves so the wording can match the action.
 */
function isIncidentInScope(incident, user, scope) {
  if (!incident || !user) return false;

  switch (scope) {
    case SCOPE.FULL:
      return true;

    case SCOPE.OWN:
      return incident.reportedBy && incident.reportedBy.toString() === user._id.toString();

    case SCOPE.OWN_BEFORE_REVIEW:
      return (
        incident.reportedBy &&
        incident.reportedBy.toString() === user._id.toString() &&
        incident.status === "Pending"
      );

    case SCOPE.REPORTED: {
      const isReporter = incident.reportedBy && incident.reportedBy.toString() === user._id.toString();
      const isAssignedVolunteer = (incident.assignedVolunteers || []).some(
        (v) => v.toString() === user._id.toString()
      );
      return isReporter || isAssignedVolunteer;
    }

    case SCOPE.ASSIGNED:
    case SCOPE.ASSIGNED_TASK_ONLY: {
      if (user.role === "Authority") {
        // Authority scope is their assigned district/area, or an incident
        // explicitly assigned to them.
        const isAssignedAuthority =
          incident.assignedAuthority && incident.assignedAuthority.toString() === user._id.toString();
        const sameDistrict = user.district && incident.location && incident.location.includes(user.district);
        return Boolean(isAssignedAuthority || sameDistrict);
      }
      if (user.role === "Volunteer") {
        return (incident.assignedVolunteers || []).some((v) => v.toString() === user._id.toString());
      }
      return false;
    }

    case SCOPE.REQUEST:
    case SCOPE.RECOMMEND:
      // These are action-level (submit-only) scopes; still require the
      // volunteer to actually be assigned to the incident they're acting on.
      return (incident.assignedVolunteers || []).some((v) => v.toString() === user._id.toString());

    case SCOPE.LIMITED:
      // "Limited" is resolved by the specific controller (e.g. Authority's
      // delete is limited to incidents in their own district).
      return true;

    default:
      return false;
  }
}

/**
 * Builds a Mongo filter fragment that restricts a list query to what the
 * scope allows. Used by getIncidents/listing endpoints.
 */
function incidentScopeFilter(user, scope) {
  if (scope === SCOPE.FULL) return {};

  if (scope === SCOPE.OWN || scope === SCOPE.OWN_BEFORE_REVIEW) {
    return { reportedBy: user._id };
  }

  if (scope === SCOPE.REPORTED) {
    return { $or: [{ reportedBy: user._id }, { assignedVolunteers: user._id }] };
  }

  if (scope === SCOPE.ASSIGNED || scope === SCOPE.ASSIGNED_TASK_ONLY) {
    if (user.role === "Volunteer") return { assignedVolunteers: user._id };
    if (user.role === "Authority") {
      const or = [{ assignedAuthority: user._id }];
      if (user.district) or.push({ location: { $regex: user.district, $options: "i" } });
      return { $or: or };
    }
  }

  return { _id: null }; // unknown/unhandled scope -> no results, not everything
}

module.exports = {
  requireIncidentPermission,
  requireFullIncidentAccess,
  isIncidentInScope,
  incidentScopeFilter,
};
