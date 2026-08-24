const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// Backs "Generate AI risk assessment", "Approve AI recommendations",
// "Confirm AI prediction", "AI-analyze citizen reports", "View disaster
// predictions", "View AI accuracy" and "View prediction history" from the
// AI Risk Engine permission table.
const aiPredictionSchema = new mongoose.Schema(
  {
    predictionId: {
      type: String,
      unique: true,
    },
    disasterType: {
      type: String,
      required: [true, "Disaster type is required"],
      trim: true,
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    center: {
      lat: { type: Number },
      lng: { type: Number },
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 50,
    },
    // Label derived from riskScore via AiRiskSettings.thresholds at
    // generation time - kept as a stored field (not just a virtual) so
    // history/accuracy queries don't need to re-derive it against
    // thresholds that may since have changed.
    riskLevel: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 60,
    },
    affectedAreas: {
      type: [String],
      default: [],
    },
    // Short human-readable guidance for Admin/Authority, generated from
    // riskLevel + disasterType. See utils/riskEngine.js.
    recommendedAction: {
      type: String,
      trim: true,
      default: "",
    },
    populationAtRisk: {
      type: Number,
      default: 0,
      min: 0,
    },
    shelterRecommendations: {
      type: [
        {
          shelter: { type: mongoose.Schema.Types.ObjectId, ref: "Shelter" },
          reason: { type: String, trim: true, default: "" },
        },
      ],
      default: [],
    },
    evacuationRecommendations: {
      type: [String],
      default: [],
    },
    resourcePredictions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    resourceShortages: {
      type: [
        {
          resource: { type: String, trim: true },
          shortfall: { type: Number, default: 0 },
          unit: { type: String, trim: true, default: "units" },
        },
      ],
      default: [],
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    relatedRiskZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RiskZone",
      default: null,
    },
    // "AI-analyze citizen reports" - links the citizen disaster reports this
    // prediction was generated/refined from.
    sourceReports: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Disaster" }],
      default: [],
    },
    analyzedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    analyzedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Rejected", "Approved"],
      default: "Pending",
    },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },

    // "View AI accuracy" - once the real outcome is known, Admin/Authority
    // record whether the prediction was borne out.
    outcome: {
      type: String,
      enum: ["Unknown", "Accurate", "Inaccurate"],
      default: "Unknown",
    },

    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

aiPredictionSchema.pre("save", async function (next) {
  if (this.isNew && !this.predictionId) {
    const seq = await getNextSequence("aiPredictionId");
    this.predictionId = `AIP-${900 + seq}`;
  }
  next();
});

aiPredictionSchema.index({ district: 1, createdAt: -1 });
aiPredictionSchema.index({ status: 1 });

module.exports = mongoose.model("AiPrediction", aiPredictionSchema);
