const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const alertSchema = new mongoose.Schema(
  {
    alertId: {
      type: String,
      unique: true,
    },
    title: {
      type: String,
      required: [true, "Alert title is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: ["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"],
      required: [true, "Alert type is required"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
    },
    // True when this alert was issued from the map view ("Send map-based
    // alert" - Admin/Authority full access only, see mapPermissions.js).
    mapBased: {
      type: Boolean,
      default: false,
    },
    relatedRiskZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RiskZone",
    },
    // True when this alert was issued from a shelter view ("Send shelter
    // alerts" - Admin/Authority full access only, see shelterPermissions.js).
    shelterBased: {
      type: Boolean,
      default: false,
    },
    relatedShelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      default: null,
    },
  },
  { timestamps: true }
);

alertSchema.pre("save", async function (next) {
  if (this.isNew && !this.alertId) {
    const seq = await getNextSequence("alertId");
    this.alertId = `AL-${300 + seq}`;
  }
  next();
});

alertSchema.index({ active: 1, priority: 1, type: 1 });

module.exports = mongoose.model("Alert", alertSchema);
