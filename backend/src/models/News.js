const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// Draft -> Pending Approval -> Approved -> Published, with Rejected/Archived
// as terminal side-states. An Authority who is the assigned owner of an item
// can go straight Draft -> Published (see newsController); anyone else's
// content must pass through an Admin's Approve/Reject/Publish.
const NEWS_STATUSES = ["Draft", "Pending Approval", "Approved", "Published", "Rejected", "Archived"];

// A disaster update entry. Authority/Admin entries are auto-approved; a
// Volunteer can only ever "report" one in (status starts Pending) - this is
// the "Report only" cell in the permission matrix.
const disasterUpdateSchema = new mongoose.Schema(
  {
    text: { type: String, required: [true, "Update text is required"], trim: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    addedByRole: { type: String },
    status: { type: String, enum: ["Pending", "Approved", "Dismissed"], default: "Approved" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// An official source citation attached to this specific news item.
const sourceRefSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Source name is required"], trim: true },
    url: { type: String, trim: true, default: "" },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// A flag from any user that a news item looks wrong, outdated or abusive.
const reportSchema = new mongoose.Schema(
  {
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: [true, "Reason is required"], trim: true },
    status: { type: String, enum: ["Open", "Reviewed", "Dismissed"], default: "Open" },
  },
  { timestamps: true }
);

// Append-only trail of who did what to this item. Never returned on the
// normal read routes (select: false) - only via the dedicated audit-history
// endpoint, which itself applies the Admin (full) / Authority (own items
// only) split from the permission matrix.
const auditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byRole: { type: String },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const newsSchema = new mongoose.Schema(
  {
    newsId: {
      type: String,
      unique: true,
    },
    headline: {
      type: String,
      required: [true, "Headline is required"],
      trim: true,
    },
    summary: {
      type: String,
      trim: true,
      default: "",
    },
    content: {
      type: String,
      required: [true, "Content is required"],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NewsCategory",
      required: [true, "Category is required"],
    },
    region: {
      type: String,
      required: [true, "Region is required"],
      trim: true,
    },
    tags: [{ type: String, trim: true }],

    status: {
      type: String,
      enum: NEWS_STATUSES,
      default: "Draft",
    },
    isEmergency: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    images: [
      {
        url: { type: String, required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    documents: [
      {
        url: { type: String, required: true },
        name: { type: String, default: "" },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    sources: [sourceRefSchema],
    disasterUpdates: [disasterUpdateSchema],
    reports: [reportSchema],
    auditLog: { type: [auditEntrySchema], select: false },

    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // The Authority responsible for this item. Admin can always edit/publish;
    // an Authority may only do so when assignedTo === themselves ("Assigned"
    // in the permission matrix). Defaults to the creating Authority.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    rejectionReason: { type: String, trim: true, default: "" },

    scheduledFor: { type: Date, default: null },
    publishedAt: { type: Date, default: null },

    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like NW-501 on creation
newsSchema.pre("save", async function (next) {
  if (this.isNew && !this.newsId) {
    const seq = await getNextSequence("newsId");
    this.newsId = `NW-${500 + seq}`;
  }
  next();
});

newsSchema.index({ status: 1, category: 1, region: 1, createdAt: -1 });
newsSchema.index({ headline: "text", summary: "text", content: "text" });

const News = mongoose.model("News", newsSchema);
News.STATUSES = NEWS_STATUSES;

module.exports = News;
