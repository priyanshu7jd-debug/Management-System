const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const donationSchema = new mongoose.Schema(
  {
    donationId: {
      type: String,
      unique: true,
    },
    donorName: {
      type: String,
      required: [true, "Donor name is required"],
      trim: true,
    },
    donorEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    donorPhone: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["Cash", "Kind"],
      required: [true, "Donation type is required"],
    },
    // Cash donations
    amount: {
      type: Number,
      min: [0, "Amount cannot be negative"],
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["UPI", "Bank Transfer", "Card", "Cash", "Other"],
    },
    transactionId: {
      type: String,
      trim: true,
      default: "",
    },
    // In-kind donations
    itemName: {
      type: String,
      trim: true,
      default: "",
    },
    quantity: {
      type: Number,
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    unit: {
      type: String,
      trim: true,
      default: "",
    },
    // Linking
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
    },
    relatedShelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
    },
    relatedCampaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
    },
    status: {
      type: String,
      enum: ["Pending", "Received", "Utilized", "Cancelled"],
      default: "Pending",
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Who logged the donation (may be the donor themself, an Authority, or Admin)
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // --- Anonymous donation ("Anonymous donation" - not available to
    // Volunteer per the Fund permission table). Donor identity is hidden
    // from anyone except Admin/Authority/the person who recorded it once
    // this is set - see donationController's maskIfAnonymous(). ---
    isAnonymous: {
      type: Boolean,
      default: false,
    },

    // --- Verify donation ("Verify donation" - Admin/Authority only).
    // Separate from `status` (Pending/Received/Utilized/Cancelled): a
    // donation can be Received but not yet formally verified for the
    // fund ledger. Verifying a Cash donation is what posts it as a
    // credit to FundTransaction / the campaign's balance. ---
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like DN-2001 on creation
donationSchema.pre("save", async function (next) {
  if (this.isNew && !this.donationId) {
    const seq = await getNextSequence("donationId");
    this.donationId = `DN-${2000 + seq}`;
  }

  // Basic cross-field sanity: Cash needs an amount, Kind needs an item
  if (this.type === "Cash" && (!this.amount || this.amount <= 0)) {
    return next(new Error("Cash donations require an amount greater than 0"));
  }
  if (this.type === "Kind" && (!this.itemName || !this.quantity || this.quantity <= 0)) {
    return next(new Error("In-kind donations require an itemName and a quantity greater than 0"));
  }

  next();
});

donationSchema.index({ status: 1, type: 1 });

module.exports = mongoose.model("Donation", donationSchema);
