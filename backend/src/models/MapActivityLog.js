const mongoose = require("mongoose");

// Lightweight append-only log of map actions, written by the map controllers.
// Powers "View map analytics" (aggregated counts) and "View map history"
// (raw chronological feed) - both Admin/Authority full, Volunteer limited
// (to their own actions/team), Citizen has no access to either.
const mapActivityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      enum: ["RiskZone", "EvacuationRoute", "RoadBlock", "Disaster", "Alert", "AiPrediction", "AiRiskSettings"],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    district: {
      type: String,
      trim: true,
      default: "",
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

mapActivityLogSchema.index({ createdAt: -1 });
mapActivityLogSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model("MapActivityLog", mapActivityLogSchema);

/**
 * Fire-and-forget helper for controllers to record an entry without
 * awaiting it inline every time (kept here so callers only need one import).
 */
module.exports.record = async function record({ action, entityType, entityId, district, user, details }) {
  try {
    await module.exports.create({
      action,
      entityType,
      entityId,
      district: district || "",
      performedBy: user._id,
      performedByRole: user.role,
      details: details || {},
    });
  } catch (err) {
    // Logging failures should never break the primary request.
    // eslint-disable-next-line no-console
    console.error("MapActivityLog.record failed:", err.message);
  }
};
