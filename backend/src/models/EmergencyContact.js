const mongoose = require("mongoose");

const emergencyContactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Contact name is required"],
      trim: true,
    },
    number: {
      type: String,
      required: [true, "Contact number is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["Police", "Fire", "Medical", "Disaster Management", "Relief", "Other"],
      default: "Other",
    },
    // Lower numbers sort first in the public list (e.g. Police/Fire/Ambulance before others)
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

emergencyContactSchema.index({ order: 1 });

module.exports = mongoose.model("EmergencyContact", emergencyContactSchema);
