const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const disasterSchema = new mongoose.Schema(
  {
    disasterId: {
      type: String,
      unique: true,
    },
    type: {
      type: String,
      enum: ["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"],
      required: [true, "Disaster type is required"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    // GeoJSON mirror of `coordinates`, kept in sync automatically below. This is what
    // powers 2dsphere "nearby" queries - Mongo can't geo-index a plain {lat,lng} object.
    geo: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedByName: {
      type: String, // denormalized snapshot for quick display, in case user record changes
    },
    status: {
      type: String,
      enum: ["Pending", "Verified", "In Progress", "Resolved", "Rejected"],
      default: "Pending",
    },
    team: {
      type: String,
      default: "Unassigned",
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectionReason: { type: String, trim: true, default: "" },

    // Operational priority, distinct from citizen-reported `severity`. Only
    // Admin/Authority can set this (see incidentPermissions.changePriority).
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    priorityChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    priorityChangedAt: { type: Date, default: null },

    // --- Assignment (who is handling this incident) ---
    assignedAuthority: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // Admin-only to set
    assignedVolunteers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    assignedNgo: { type: mongoose.Schema.Types.ObjectId, ref: "NGO", default: null },

    // --- Investigation notes (Admin/Authority only) ---
    investigationNotes: [
      {
        note: { type: String, trim: true, required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        addedByRole: { type: String, trim: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // --- Escalation ---
    escalated: { type: Boolean, default: false },
    escalatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    escalatedAt: { type: Date, default: null },
    escalationReason: { type: String, trim: true, default: "" },

    // --- Resolution. Volunteer can only submit a recommendation; actually
    // resolving (flipping status to "Resolved") is Admin/Authority only. ---
    resolutionNotes: { type: String, trim: true, default: "" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolutionRecommendations: [
      {
        note: { type: String, trim: true, required: true },
        recommendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // --- Reopen requests. Volunteer can only request; Admin/Authority
    // actually reopen (flip status back from Resolved/Rejected). ---
    reopenRequests: [
      {
        reason: { type: String, trim: true, required: true },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
        status: { type: String, enum: ["Pending", "Approved", "Declined"], default: "Pending" },
      },
    ],
    reopenCount: { type: Number, default: 0 },

    images: [{ type: String }], // URLs to uploaded evidence, if any
    // AI-computed risk score (0-100), derived from severity by default.
    // Citizen sees this as "Basic" (via the map's viewAiRiskScore scope);
    // Admin can override freely, Authority's override is capped (LIMITED).
    aiRiskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    riskScoreOverride: {
      value: { type: Number, min: 0, max: 100 },
      reason: { type: String, trim: true, default: "" },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: { type: Date },
    },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like DR-1042 on creation
disasterSchema.pre("save", async function (next) {
  if (this.isNew && !this.disasterId) {
    const seq = await getNextSequence("disasterId");
    this.disasterId = `DR-${1000 + seq}`;
  }

  // Keep the GeoJSON mirror in sync whenever lat/lng change (or are cleared)
  if (
    this.coordinates &&
    typeof this.coordinates.lat === "number" &&
    typeof this.coordinates.lng === "number"
  ) {
    this.geo = { type: "Point", coordinates: [this.coordinates.lng, this.coordinates.lat] };
  } else {
    this.geo = undefined;
  }

  // Recompute the AI risk score from severity whenever severity changes and
  // no manual override is in play. This is a placeholder heuristic; swap in
  // a real model call here if/when one is available.
  if (this.isModified("severity") || this.isNew) {
    const SEVERITY_SCORE = { Low: 25, Medium: 50, High: 75, Critical: 95 };
    this.aiRiskScore = SEVERITY_SCORE[this.severity] ?? 50;
  }

  next();
});

// The score actually shown to consumers: the manual override if present,
// otherwise the AI-computed score.
disasterSchema.virtual("effectiveRiskScore").get(function () {
  return this.riskScoreOverride && typeof this.riskScoreOverride.value === "number"
    ? this.riskScoreOverride.value
    : this.aiRiskScore;
});
disasterSchema.set("toObject", { virtuals: true });
disasterSchema.set("toJSON", { virtuals: true });

disasterSchema.index({ status: 1, type: 1, severity: 1 });
disasterSchema.index({ geo: "2dsphere" });
disasterSchema.index({ assignedVolunteers: 1 });
disasterSchema.index({ assignedAuthority: 1 });

module.exports = mongoose.model("Disaster", disasterSchema);
