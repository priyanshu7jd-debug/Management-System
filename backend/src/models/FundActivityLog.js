const mongoose = require("mongoose");

// Lightweight append-only log of fund-module actions, written by the
// campaign/donation/assistance/fund controllers. Powers "View audit logs"
// from the Fund role-permission table (Admin: full feed. Authority:
// LIMITED to campaigns they created. Citizen/Volunteer: OWN activity
// only). Mirrors models/ShelterActivityLog.js and models/MapActivityLog.js.
const fundActivityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    relatedCampaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
    relatedDonation: { type: mongoose.Schema.Types.ObjectId, ref: "Donation", default: null },
    relatedAssistanceRequest: { type: mongoose.Schema.Types.ObjectId, ref: "AssistanceRequest", default: null },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    performedByRole: {
      type: String,
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

fundActivityLogSchema.index({ relatedCampaign: 1, createdAt: -1 });
fundActivityLogSchema.index({ performedBy: 1, createdAt: -1 });
fundActivityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("FundActivityLog", fundActivityLogSchema);

/**
 * Fire-and-forget helper for controllers to record an entry without
 * awaiting it inline every time (kept here so callers only need one import).
 */
module.exports.record = async function record({ action, user, relatedCampaign = null, relatedDonation = null, relatedAssistanceRequest = null, details }) {
  try {
    await module.exports.create({
      action,
      relatedCampaign,
      relatedDonation,
      relatedAssistanceRequest,
      performedBy: user._id,
      performedByRole: user.role,
      details: details || {},
    });
  } catch (err) {
    // Logging failures should never break the primary request.
    // eslint-disable-next-line no-console
    console.error("FundActivityLog.record failed:", err.message);
  }
};
