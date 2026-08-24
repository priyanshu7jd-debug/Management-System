const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const campaignSchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      unique: true,
    },
    title: {
      type: String,
      required: [true, "Campaign title is required"],
      trim: true,
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      required: [true, "A campaign must belong to an NGO"],
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    target: {
      type: Number,
      required: [true, "Target amount is required"],
      min: [1, "Target amount must be greater than 0"],
    },
    deadline: {
      type: Date,
    },
    bankDetails: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Active", "Completed", "Cancelled", "Suspended"],
      default: "Active",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // --- Approval workflow ("Approve fund campaign" - Admin only) ---
    // Mirrors Shelter.approvalStatus: an Admin-created campaign is
    // auto-approved; an Authority-created one starts Pending until an
    // Admin approves it. Donations only ever run against an Approved
    // campaign (see campaignController.getCampaigns / donationController).
    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },

    // --- Suspend ("Suspend campaign" - Admin only) ---
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    suspendedAt: { type: Date, default: null },
    suspendedReason: { type: String, trim: true, default: "" },

    // --- Close ("Close campaign" - Admin only: distinct from delete, moves
    // an Active campaign to a terminal Completed/Cancelled state) ---
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

campaignSchema.pre("save", async function (next) {
  if (this.isNew && !this.campaignId) {
    const seq = await getNextSequence("campaignId");
    this.campaignId = `CMP-${String(seq).padStart(3, "0")}`;
  }
  next();
});

campaignSchema.index({ status: 1 });
campaignSchema.index({ approvalStatus: 1 });
campaignSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Campaign", campaignSchema);
