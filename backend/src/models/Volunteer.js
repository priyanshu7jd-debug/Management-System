const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const volunteerSchema = new mongoose.Schema(
  {
    volunteerId: {
      type: String,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one volunteer profile per user account
    },
    skills: {
      type: [String],
      default: [],
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    availability: {
      type: String,
      enum: ["Available", "Unavailable"],
      default: "Available",
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Inactive"],
      default: "Pending",
    },
    assignedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    assignedShelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      default: null,
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      default: null, // the NGO this volunteer works under, if any
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like VL-201 on creation
volunteerSchema.pre("save", async function (next) {
  if (this.isNew && !this.volunteerId) {
    const seq = await getNextSequence("volunteerId");
    this.volunteerId = `VL-${200 + seq}`;
  }
  next();
});

volunteerSchema.index({ status: 1, availability: 1 });
volunteerSchema.index({ ngo: 1 });

module.exports = mongoose.model("Volunteer", volunteerSchema);
