/**
 * Central permission matrix for the Fund/Donation module (relief funds,
 * campaigns, donations, financial assistance requests, and the money
 * trail behind them).
 *
 * Same pattern as config/shelterPermissions.js, config/mapPermissions.js
 * and config/incidentPermissions.js: every fund-module controller/route
 * reads from this table instead of hard-coding role checks.
 *
 * Scope values:
 *   FULL       - unrestricted access
 *   ASSIGNED   - restricted to campaigns/records the Authority created (or
 *                is otherwise assigned to), or - for a Volunteer - to their
 *                assigned shelter/disaster
 *   OWN        - restricted to records the user themself is the subject of
 *                (donations they made, requests they filed, their own
 *                activity in the audit log)
 *   FIELD      - may perform an on-the-ground/field verification step, but
 *                not the final office verification (Volunteer's field
 *                verification of an assistance request vs. Authority/Admin's
 *                full verification of it)
 *   LIMITED    - a capped or partial version of the action (e.g. Volunteer's
 *                view of donations, Citizen's view of fund utilization)
 *   NONE       - not permitted at all
 */

const SCOPE = Object.freeze({
  FULL: "full",
  ASSIGNED: "assigned",
  OWN: "own",
  FIELD: "field",
  LIMITED: "limited",
  NONE: false,
});

const ROLES = Object.freeze(["Admin", "Authority", "Citizen", "Volunteer"]);

// action -> { Admin, Authority, Citizen, Volunteer }
const FUND_PERMISSIONS = Object.freeze({
  viewReliefFunds: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.LIMITED },
  createCampaign: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  editCampaign: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  closeCampaign: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  approveCampaign: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  suspendCampaign: { Admin: SCOPE.FULL, Authority: SCOPE.NONE, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewDonations: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.OWN, Volunteer: SCOPE.LIMITED },
  makeDonation: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  anonymousDonation: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.NONE },
  viewDonationHistory: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.OWN, Volunteer: SCOPE.ASSIGNED },
  verifyDonation: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  manageFundBalance: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  requestFinancialAssistance: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.NONE },
  verifyAssistanceRequest: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.FIELD },
  approveAssistance: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  rejectAssistance: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  allocateReliefMoney: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  trackFundUtilization: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.LIMITED, Volunteer: SCOPE.ASSIGNED },
  uploadProofDocuments: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  reportMisuse: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.FULL, Volunteer: SCOPE.FULL },
  monitorTransactions: { Admin: SCOPE.FULL, Authority: SCOPE.ASSIGNED, Citizen: SCOPE.OWN, Volunteer: SCOPE.NONE },
  generateFundReports: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  exportReports: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  sendFundNotifications: { Admin: SCOPE.FULL, Authority: SCOPE.FULL, Citizen: SCOPE.NONE, Volunteer: SCOPE.NONE },
  viewAuditLogs: { Admin: SCOPE.FULL, Authority: SCOPE.LIMITED, Citizen: SCOPE.OWN, Volunteer: SCOPE.OWN },
});

/**
 * Returns the scope a role has for a given action, or SCOPE.NONE if the
 * action or role is unknown.
 */
function getScope(action, role) {
  const row = FUND_PERMISSIONS[action];
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

module.exports = { SCOPE, ROLES, FUND_PERMISSIONS, getScope, canAccess, hasFullAccess };
