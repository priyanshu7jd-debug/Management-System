// Frontend mirror of backend/src/config/fundPermissions.js.
//
// This is UI-gating only (show/hide buttons and panels) - the backend
// enforces the real rule on every request regardless of what the UI does.
// Keep this file's shape in sync with the backend table if it changes.

export const SCOPE = Object.freeze({
  FULL: "full",
  ASSIGNED: "assigned",
  OWN: "own",
  FIELD: "field",
  LIMITED: "limited",
  NONE: false,
});

export const FUND_PERMISSIONS = Object.freeze({
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

/** Returns the scope a role has for `action` (SCOPE.NONE if unknown). */
export function getFundScope(action, role) {
  const row = FUND_PERMISSIONS[action];
  if (!row) return SCOPE.NONE;
  return row[role] ?? SCOPE.NONE;
}

/** True if the role has any access at all (including a restricted scope). */
export function canAccessFund(action, role) {
  return getFundScope(action, role) !== SCOPE.NONE;
}

/** True only if the role's access is unrestricted (FULL). */
export function hasFullFundAccess(action, role) {
  return getFundScope(action, role) === SCOPE.FULL;
}
