const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// Powers "Report shelter problem" (every role) and "Resolve shelter
// problems" (Admin/Authority only) from the Shelter role-permission table.
// Also doubles as the landing spot for Volunteer's REPORT-scoped facility
// flags (see manageFacilities in config/shelterPermissions.js) - those are
// created here with category "Facility" instead of directly editing the
// shelter.
const shelterProblemSchema = new mongoose.Schema(
  {
    problemId: {
      type: String,
      unique: true,
    },
    shelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      required: true,
    },
    category: {
      type: String,
      enum: ["Facility", "Food", "Water", "Medical", "Safety", "Overcrowding", "Other"],
      default: "Other",
    },
    description: {
      type: String,
      required: [true, "Please describe the problem"],
      trim: true,
    },
    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["Open", "In Progress", "Resolved"],
      default: "Open",
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNotes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

shelterProblemSchema.pre("save", async function (next) {
  if (this.isNew && !this.problemId) {
    const seq = await getNextSequence("shelterProblemId");
    this.problemId = `SP-${seq}`;
  }

  if (this.isModified("status")) {
    if (this.status === "Resolved") {
      this.resolvedAt = this.resolvedAt || new Date();
    } else {
      this.resolvedAt = null;
      this.resolvedBy = this.status === "Open" ? null : this.resolvedBy;
    }
  }

  next();
});

shelterProblemSchema.index({ shelter: 1, status: 1 });
shelterProblemSchema.index({ reportedBy: 1 });

module.exports = mongoose.model("ShelterProblem", shelterProblemSchema);
