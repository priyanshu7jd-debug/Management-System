const mongoose = require("mongoose");

// Lightweight append-only log of shelter actions, written by the shelter
// controllers. Powers "View audit/history" from the Shelter role-permission
// table (Admin: full feed. Authority: limited to shelters they manage.
// Citizen/Volunteer: no access). Mirrors models/MapActivityLog.js.
const shelterActivityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    shelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      required: true,
    },
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

shelterActivityLogSchema.index({ shelter: 1, createdAt: -1 });
shelterActivityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("ShelterActivityLog", shelterActivityLogSchema);

/**
 * Fire-and-forget helper for controllers to record an entry without
 * awaiting it inline every time (kept here so callers only need one import).
 */
module.exports.record = async function record({ action, shelter, user, details }) {
  try {
    await module.exports.create({
      action,
      shelter,
      performedBy: user._id,
      performedByRole: user.role,
      details: details || {},
    });
  } catch (err) {
    // Logging failures should never break the primary request.
    // eslint-disable-next-line no-console
    console.error("ShelterActivityLog.record failed:", err.message);
  }
};
