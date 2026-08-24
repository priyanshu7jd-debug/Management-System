const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// Append-only ledger of every movement of relief money - the source of
// truth behind "Manage fund balance", "Track fund utilization" and
// "Monitor transactions" in the Fund role-permission table. A campaign's
// balance is always the sum of its credits minus its debits here, rather
// than a separately-stored (and easily stale) counter.
const fundTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
    },
    type: {
      type: String,
      enum: ["DonationReceived", "Allocation", "Utilization", "Adjustment"],
      required: true,
    },
    // "credit" adds to the campaign's balance (a verified cash donation),
    // "debit" removes from it (relief money allocated/spent).
    direction: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    amount: {
      type: Number,
      required: [true, "Transaction amount is required"],
      min: [0.01, "Transaction amount must be greater than 0"],
    },
    relatedCampaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
    },
    relatedDonation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Donation",
      default: null,
    },
    relatedAssistanceRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AssistanceRequest",
      default: null,
    },
    // Running balance for relatedCampaign immediately after this transaction,
    // captured at write time so history can be displayed without re-summing.
    balanceAfter: {
      type: Number,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

fundTransactionSchema.pre("save", async function (next) {
  if (this.isNew && !this.transactionId) {
    const seq = await getNextSequence("fundTransactionId");
    this.transactionId = `FT-${String(seq).padStart(4, "0")}`;
  }
  next();
});

fundTransactionSchema.index({ relatedCampaign: 1, createdAt: -1 });
fundTransactionSchema.index({ performedBy: 1 });
fundTransactionSchema.index({ type: 1 });

/**
 * Current balance of a campaign: sum of credits minus sum of debits across
 * every transaction recorded against it.
 */
fundTransactionSchema.statics.getCampaignBalance = async function (campaignId) {
  const [result] = await this.aggregate([
    { $match: { relatedCampaign: new mongoose.Types.ObjectId(campaignId) } },
    {
      $group: {
        _id: null,
        credits: { $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amount", 0] } },
        debits: { $sum: { $cond: [{ $eq: ["$direction", "debit"] }, "$amount", 0] } },
      },
    },
  ]);
  const credits = result ? result.credits : 0;
  const debits = result ? result.debits : 0;
  return { balance: credits - debits, credits, debits };
};

/**
 * Records a transaction and returns it with balanceAfter populated.
 * Fire-and-forget is NOT appropriate here (unlike notify()) since the
 * ledger is the source of truth for money - callers should await this.
 */
fundTransactionSchema.statics.record = async function ({
  type,
  direction,
  amount,
  relatedCampaign = null,
  relatedDisaster = null,
  relatedDonation = null,
  relatedAssistanceRequest = null,
  performedBy,
  notes = "",
}) {
  const txn = new this({
    type,
    direction,
    amount,
    relatedCampaign,
    relatedDisaster,
    relatedDonation,
    relatedAssistanceRequest,
    performedBy,
    notes,
  });

  if (relatedCampaign) {
    const { balance } = await this.getCampaignBalance(relatedCampaign);
    txn.balanceAfter = direction === "credit" ? balance + amount : balance - amount;
  }

  await txn.save();
  return txn;
};

module.exports = mongoose.model("FundTransaction", fundTransactionSchema);
