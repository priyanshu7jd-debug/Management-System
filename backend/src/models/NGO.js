const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const ngoSchema = new mongoose.Schema(
  {
    ngoId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
    },
    type: {
      type: String,
      trim: true,
      default: "General Relief",
    },
    registrationNumber: {
      type: String,
      required: [true, "Registration number is required"],
      trim: true,
    },
    areaOfOperation: {
      type: String,
      trim: true,
      default: "",
    },
    activities: {
      type: String,
      trim: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    contactEmail: {
      type: String,
      required: [true, "Contact email is required"],
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },
    bankName: {
      type: String,
      trim: true,
      default: "",
    },
    ifsc: {
      type: String,
      trim: true,
      default: "",
    },
    accountNumber: {
      type: String,
      trim: true,
      default: "",
    },
    documents: [{ type: String, trim: true }], // names of documents the registrant says they're submitting
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewNotes: {
      type: String,
      trim: true,
      default: "",
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // --- Lifecycle / trust flags (separate from status: an Approved NGO can still be
    // suspended or deactivated without losing its approval history) ---
    isActive: {
      type: Boolean,
      default: true, // soft "deactivate" flips this instead of a hard delete
    },
    suspended: {
      type: Boolean,
      default: false,
    },
    suspendedReason: { type: String, trim: true, default: "" },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    suspendedAt: { type: Date, default: null },

    documentsVerified: { type: Boolean, default: false },
    documentsVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    documentsVerifiedAt: { type: Date, default: null },

    identityVerified: { type: Boolean, default: false },
    identityVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    identityVerifiedAt: { type: Date, default: null },

    // --- Assignment (who oversees this NGO, and where/what it's been deployed to) ---
    // Authority users in this list get "assigned" edit/manage/view rights on the NGO.
    // Only an Admin may change this list (see ngoController.updateNgo).
    assignedAuthorities: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    assignedDisasters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Disaster" }],
    assignedShelters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Shelter" }],
    assignedAreas: [{ type: String, trim: true }],

    // --- Services this NGO offers (managed by Admin, or Authority if assigned) ---
    services: [
      {
        name: { type: String, trim: true, required: true },
        description: { type: String, trim: true, default: "" },
        active: { type: Boolean, default: true },
      },
    ],

    // --- Ratings/reviews from any role; one per user (upserted) ---
    ratings: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        rating: { type: Number, min: 1, max: 5, required: true },
        review: { type: String, trim: true, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // --- Field activity reports filed by Authority/Admin/Volunteer ---
    activityReports: [
      {
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        reportedByRole: { type: String, trim: true },
        description: { type: String, trim: true, required: true },
        relatedDisaster: { type: mongoose.Schema.Types.ObjectId, ref: "Disaster", default: null },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // --- Assistance requests: Authority/Admin request or accept/decline NGO assistance ---
    assistanceRequests: [
      {
        disaster: { type: mongoose.Schema.Types.ObjectId, ref: "Disaster", default: null },
        notes: { type: String, trim: true, default: "" },
        status: { type: String, enum: ["Pending", "Accepted", "Declined"], default: "Pending" },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
        respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        respondedAt: { type: Date, default: null },
      },
    ],

    // --- Audit trail of significant actions taken on this NGO record ---
    auditLog: [
      {
        action: { type: String, trim: true, required: true },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        performedByRole: { type: String, trim: true },
        notes: { type: String, trim: true, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Record an audit entry on an already-loaded (not-yet-saved) NGO document.
// Caller is still responsible for calling ngo.save() afterwards.
ngoSchema.methods.logAudit = function (action, user, notes = "") {
  this.auditLog.push({
    action,
    performedBy: user._id,
    performedByRole: user.role,
    notes,
  });
  // Keep the embedded log bounded so the document can't grow unbounded over time
  if (this.auditLog.length > 200) {
    this.auditLog = this.auditLog.slice(-200);
  }
};

ngoSchema.pre("save", async function (next) {
  if (this.isNew && !this.ngoId) {
    const seq = await getNextSequence("ngoId");
    this.ngoId = `NGO-${String(seq).padStart(3, "0")}`;
  }
  next();
});

ngoSchema.index({ status: 1 });
ngoSchema.index({ assignedAuthorities: 1 });
ngoSchema.index({ name: "text", registrationNumber: "text" });

module.exports = mongoose.model("NGO", ngoSchema);
