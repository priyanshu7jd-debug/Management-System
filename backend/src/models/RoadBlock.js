const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const roadBlockSchema = new mongoose.Schema(
  {
    blockId: {
      type: String,
      unique: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    reason: {
      type: String,
      enum: ["Flooding", "Debris", "Landslide", "Accident", "Structural Damage", "Other"],
      default: "Other",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // Citizens/Volunteers can only ever create a "Reported" block (their
    // scope is REPORT, not FULL). Admin/Authority mark it "Confirmed"
    // (equivalent to the table's "Mark road blocked") or "Cleared".
    status: {
      type: String,
      enum: ["Reported", "Confirmed", "Cleared"],
      default: "Reported",
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    clearedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

roadBlockSchema.pre("save", async function (next) {
  if (this.isNew && !this.blockId) {
    const seq = await getNextSequence("roadBlockId");
    this.blockId = `RB-${100 + seq}`;
  }
  next();
});

roadBlockSchema.index({ district: 1, status: 1 });

module.exports = mongoose.model("RoadBlock", roadBlockSchema);
