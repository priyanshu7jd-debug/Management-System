const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// "Report misuse" - full access for every role in the Fund table. Anyone
// can flag a campaign, donation or assistance request they believe is
// fraudulent or being misused; Admin/Authority triage from there.
const misuseReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      unique: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: {
      type: String,
      required: [true, "Please describe the concern"],
      trim: true,
    },
    relatedCampaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
    relatedDonation: { type: mongoose.Schema.Types.ObjectId, ref: "Donation", default: null },
    relatedAssistanceRequest: { type: mongoose.Schema.Types.ObjectId, ref: "AssistanceRequest", default: null },
    status: {
      type: String,
      enum: ["Open", "Reviewing", "Resolved", "Dismissed"],
      default: "Open",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    resolutionNotes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

misuseReportSchema.pre("save", async function (next) {
  if (this.isNew && !this.reportId) {
    const seq = await getNextSequence("misuseReportId");
    this.reportId = `MR-${String(seq).padStart(3, "0")}`;
  }
  next();
});

misuseReportSchema.index({ status: 1 });
misuseReportSchema.index({ reportedBy: 1 });

module.exports = mongoose.model("MisuseReport", misuseReportSchema);
