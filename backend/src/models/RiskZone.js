const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const riskZoneSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Zone name is required"],
      trim: true,
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    radiusMeters: {
      type: Number,
      default: 2000,
      min: [0, "Radius cannot be negative"],
    },
    geo: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    riskLevel: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    // Computed/placeholder AI score, 0-100. In production this would come from
    // a model service; here it defaults from riskLevel and can be recomputed.
    aiRiskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    // An Admin (full) or Authority (limited, capped delta) can override the
    // AI-computed score with a manual value + justification.
    override: {
      value: { type: Number, min: 0, max: 100 },
      reason: { type: String, trim: true, default: "" },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: { type: Date },
    },
    // Best-effort population estimate inside this zone, used by the AI Risk
    // Engine's "View population at risk" aggregation.
    estimatedPopulation: {
      type: Number,
      default: 0,
      min: [0, "Population estimate cannot be negative"],
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    // For Authority's "assigned" edit scope - which authority user(s) this
    // zone is assigned to. Admin can edit/remove regardless.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["Active", "Monitoring", "Cleared"],
      default: "Active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

riskZoneSchema.pre("save", async function (next) {
  if (this.isNew && !this.zoneId) {
    const seq = await getNextSequence("riskZoneId");
    this.zoneId = `RZ-${100 + seq}`;
  }

  if (this.center && typeof this.center.lat === "number" && typeof this.center.lng === "number") {
    this.geo = { type: "Point", coordinates: [this.center.lng, this.center.lat] };
  } else {
    this.geo = undefined;
  }

  next();
});

// The score actually shown to consumers: the manual override if present,
// otherwise the AI-computed score.
riskZoneSchema.virtual("effectiveScore").get(function () {
  return this.override && typeof this.override.value === "number" ? this.override.value : this.aiRiskScore;
});
riskZoneSchema.set("toObject", { virtuals: true });
riskZoneSchema.set("toJSON", { virtuals: true });

riskZoneSchema.index({ district: 1, riskLevel: 1 });
riskZoneSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("RiskZone", riskZoneSchema);
