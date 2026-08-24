const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const resourceSchema = new mongoose.Schema(
  {
    resourceId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Resource name is required"],
      trim: true,
    },
    category: {
      type: String,
      enum: ["Food", "Water", "Medical", "Clothing", "Bedding", "Equipment", "Other"],
      default: "Other",
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
    },
    unit: {
      type: String,
      trim: true,
      default: "units",
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
      min: [0, "Threshold cannot be negative"],
    },
    status: {
      type: String,
      enum: ["Available", "Low", "Depleted"],
      default: "Available",
    },
    shelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      default: null,
    },
    disaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    addedBy: {
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

// Auto-generate a human friendly ID like RS-701 on creation, and keep status in sync with quantity
resourceSchema.pre("save", async function (next) {
  if (this.isNew && !this.resourceId) {
    const seq = await getNextSequence("resourceId");
    this.resourceId = `RS-${700 + seq}`;
  }

  if (this.quantity <= 0) {
    this.status = "Depleted";
  } else if (this.quantity <= this.lowStockThreshold) {
    this.status = "Low";
  } else {
    this.status = "Available";
  }

  next();
});

resourceSchema.index({ category: 1, status: 1 });

module.exports = mongoose.model("Resource", resourceSchema);
