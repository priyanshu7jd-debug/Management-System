const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// A Team groups Volunteer profiles together so Admin can organize the
// volunteer workforce (e.g. "Kamrup Flood Response Team") and volunteers can
// see who they're working with. Members/leader reference Volunteer profiles
// (not User accounts directly) since a Volunteer profile carries the
// skills/district/availability info the roster views already rely on.
const teamSchema = new mongoose.Schema(
  {
    teamId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Team name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Volunteer",
      default: null,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Volunteer",
      },
    ],
    // Optional context for what this team is currently working - purely
    // informational, doesn't change any Volunteer's own assignedDisaster/
    // assignedShelter fields.
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
    district: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Active", "Disbanded"],
      default: "Active",
    },
    createdBy: {
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

// Auto-generate a human friendly ID like TM-701 on creation
teamSchema.pre("save", async function (next) {
  if (this.isNew && !this.teamId) {
    const seq = await getNextSequence("teamId");
    this.teamId = `TM-${700 + seq}`;
  }
  next();
});

teamSchema.index({ status: 1 });
teamSchema.index({ members: 1 });

module.exports = mongoose.model("Team", teamSchema);
