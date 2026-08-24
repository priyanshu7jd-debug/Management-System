const asyncHandler = require("express-async-handler");
const { SCOPE, getScope, canAccess } = require("../config/fundPermissions");
const Volunteer = require("../models/Volunteer");

/**
 * Blocks the request outright if the logged-in user's role has no access
 * (SCOPE.NONE) to `action`. If they have any access, the resolved scope is
 * stashed on req.fundScope so the controller can tailor the response (e.g.
 * restrict to campaigns the Authority created, or trim a Volunteer's view).
 *
 * Must run after `protect` (needs req.user).
 */
const requireFundPermission = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;

  if (!canAccess(action, role)) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' is not authorized to ${action}`);
  }

  req.fundScope = getScope(action, role);
  next();
};

/**
 * Only lets the request through when the role's scope for `action` is
 * exactly FULL. Useful for all-or-nothing endpoints (e.g. approveCampaign,
 * closeCampaign, suspendCampaign).
 */
const requireFullFundAccess = (action) => (req, res, next) => {
  const role = req.user ? req.user.role : undefined;
  const scope = getScope(action, role);

  if (scope !== SCOPE.FULL) {
    res.status(403);
    throw new Error(`Role '${role || "unknown"}' does not have full access to ${action}`);
  }

  req.fundScope = scope;
  next();
};

/**
 * Looks up the shelter/disaster the logged-in Volunteer is assigned to.
 * Returns { assignedShelter, assignedDisaster } (each possibly null).
 * Cached on req so a single request never hits the DB for this more than
 * once.
 */
const getVolunteerAssignment = asyncHandler(async (user) => {
  if (!user || user.role !== "Volunteer") return { assignedShelter: null, assignedDisaster: null };
  const profile = await Volunteer.findOne({ user: user._id }).select("assignedShelter assignedDisaster");
  return {
    assignedShelter: profile && profile.assignedShelter ? profile.assignedShelter.toString() : null,
    assignedDisaster: profile && profile.assignedDisaster ? profile.assignedDisaster.toString() : null,
  };
});

/**
 * True if an Authority user is the creator/owner of a campaign - the
 * "ASSIGNED" scope for createCampaign-derived actions (editCampaign,
 * manageFundBalance, monitorTransactions, viewAuditLogs-limited, ...).
 * Admin never needs this check since their scope is always FULL.
 */
const isCampaignAssignedToAuthority = (campaign, user) => {
  if (!campaign || !user) return false;
  const createdBy = campaign.createdBy && campaign.createdBy._id ? campaign.createdBy._id : campaign.createdBy;
  return Boolean(createdBy) && createdBy.toString() === user._id.toString();
};

module.exports = {
  requireFundPermission,
  requireFullFundAccess,
  getVolunteerAssignment,
  isCampaignAssignedToAuthority,
};
