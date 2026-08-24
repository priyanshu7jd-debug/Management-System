const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// Backs "Report ground conditions" - a lightweight, low-friction field
// update distinct from a full "Submit disaster report" (models/Disaster.js).
// Anyone authenticated can file one; Admin/Authority use them as raw input
// when generating or refining an AiPrediction (see AiPrediction.sourceReports
// equivalent via relatedPrediction below).
const groundConditionReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      unique: true,
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
    disasterType: {
      type: String,
      trim: true,
      default: "",
    },
    condition: {
      type: String,
      required: [true, "Please describe the ground condition"],
      trim: true,
    },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    images: {
      type: [String],
      default: [],
    },
    relatedPrediction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AiPrediction",
      default: null,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedByRole: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

groundConditionReportSchema.pre("save", async function (next) {
  if (this.isNew && !this.reportId) {
    const seq = await getNextSequence("groundConditionReportId");
    this.reportId = `GC-${500 + seq}`;
  }
  next();
});

groundConditionReportSchema.index({ district: 1, createdAt: -1 });

module.exports = mongoose.model("GroundConditionReport", groundConditionReportSchema);
