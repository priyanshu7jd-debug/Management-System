const { SCOPE, getScope, canAccess } = require("../config/mapPermissions");

/**
 * Blocks the request outright if the logged-in user's role has no access
 * (SCOPE.NONE) to `action`. If they have any access, the resolved scope is
 * stashed on req.mapScope so the controller can tailor the response
 * (e.g. trim fields for BASIC, filter by district for AREA).
 *
 * Must run after `protect` (needs req.user).
 */
const requireMapPermission = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;

  if (!canAccess(action, role)) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' is not authorized to ${action}`);
  }

  req.mapScope = getScope(action, role);
  next();
};

/**
 * Only lets the request through when the role's scope for `action` is
 * exactly FULL. Useful for endpoints where a restricted scope (LIMITED,
 * REPORT, etc.) isn't meaningful and the action is all-or-nothing for
 * everyone except the roles marked "full" in the table.
 */
const requireFullMapAccess = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;
  const scope = getScope(action, role);

  if (scope !== SCOPE.FULL) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' does not have full access to ${action}`);
  }

  req.mapScope = scope;
  next();
};

/**
 * Given a user and a scope, returns a Mongo filter fragment that restricts
 * a query to that user's area. Assumes the target collection stores a
 * plain-text `district` (or `location`) field to match against - callers
 * pass which field name to use.
 *
 * - FULL: no restriction ({})
 * - AREA: restrict to the citizen's home district
 * - ASSIGNED: restrict to the volunteer's assigned district/disaster
 * - NEARBY: caller should use a $geoNear/$near query instead; this just
 *   signals that a coordinate-based radius filter is expected
 */
function districtFilter(user, scope, field = "district") {
  if (scope === SCOPE.FULL) return {};

  if (scope === SCOPE.AREA || scope === SCOPE.ASSIGNED) {
    const district = user && (user.district || (user.volunteerProfile && user.volunteerProfile.district));
    if (!district) return { _id: null }; // no known area -> no results, rather than leaking everything
    return { [field]: district };
  }

  return {};
}

/**
 * Strips a document down to a "basic" public-safe view. Used for
 * BASIC-scope responses (e.g. Citizen viewing AI risk score or weather).
 * `fields` is the allow-list of keys to keep.
 */
function toBasicView(doc, fields) {
  if (!doc) return doc;
  const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const trimmed = {};
  fields.forEach((f) => {
    if (plain[f] !== undefined) trimmed[f] = plain[f];
  });
  return trimmed;
}

module.exports = {
  requireMapPermission,
  requireFullMapAccess,
  districtFilter,
  toBasicView,
};
