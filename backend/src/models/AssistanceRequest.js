const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// Individual/household requests for direct financial assistance - "Request
// financial assistance" through "Allocate relief money" in the Fund
// role-permission table. Distinct from NGO.assistanceRequests (which is
// Authority/Admin requesting an NGO's help) - this is a citizen (or staff,
// on a citizen's behalf) asking to receive relief money.
const assistanceRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
    },
    relatedShelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
    },
    // The campaign relief money would be allocated from, if/when approved.
    relatedCampaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
    },
    category: {
      type: String,
      enum: ["Medical", "Housing", "Livelihood", "Food", "Other"],
      default: "Other",
    },
    reason: {
      type: String,
      required: [true, "Please describe why assistance is needed"],
      trim: true,
    },
    amountRequested: {
      type: Number,
      required: [true, "Requested amount is required"],
      min: [1, "Requested amount must be greater than 0"],
    },
    documents: [
      {
        url: { type: String, trim: true, required: true },
        label: { type: String, trim: true, default: "" },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ["Pending", "FieldVerified", "Verified", "Approved", "Rejected", "Allocated"],
      default: "Pending",
    },
    // Volunteer's on-the-ground check ("Verify assistance request" - FIELD scope)
    fieldVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fieldVerifiedAt: { type: Date, default: null },
    fieldVerificationNotes: { type: String, trim: true, default: "" },
    // Authority/Admin's office verification ("Verify assistance request" - FULL scope)
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    // Approve / Reject decision
    decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionAt: { type: Date, default: null },
    decisionNotes: { type: String, trim: true, default: "" },
    rejectionReason: { type: String, trim: true, default: "" },
    // Allocation ("Allocate relief money")
    allocatedAmount: { type: Number, default: 0 },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    allocatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

assistanceRequestSchema.pre("save", async function (next) {
  if (this.isNew && !this.requestId) {
    const seq = await getNextSequence("assistanceRequestId");
    this.requestId = `AR-${String(seq).padStart(3, "0")}`;
  }
  next();
});

assistanceRequestSchema.index({ status: 1 });
assistanceRequestSchema.index({ requestedBy: 1 });
assistanceRequestSchema.index({ relatedShelter: 1 });
assistanceRequestSchema.index({ relatedDisaster: 1 });

module.exports = mongoose.model("AssistanceRequest", assistanceRequestSchema);
