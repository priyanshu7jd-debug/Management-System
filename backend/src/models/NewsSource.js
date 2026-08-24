const mongoose = require("mongoose");

// Admin-managed master directory of official sources (ASDMA, IMD, PIB, ...).
// This is distinct from the `sources` array embedded on a News document:
// this collection is "Manage sources" (Admin only); the embedded array is
// "Add official source", attaching a citation to one specific news item
// (Admin/Authority) - which may or may not reference an entry here.
const newsSourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Source name is required"],
      trim: true,
      unique: true,
    },
    url: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["Government", "NGO", "Media", "International", "Other"],
      default: "Other",
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NewsSource", newsSourceSchema);
