const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

// One record per citizen's stay at a shelter. Powers "Assign shelter",
// "Citizen check-in/out" and "Transfer citizen" from the Shelter
// role-permission table. A citizen can have several records over time
// (assigned -> checked in -> transferred -> checked out elsewhere), so this
// is an append-style history rather than a single mutable field on Shelter.
const shelterOccupantSchema = new mongoose.Schema(
  {
    occupantRecordId: {
      type: String,
      unique: true,
    },
    shelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      required: true,
    },
    citizen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["Assigned", "CheckedIn", "CheckedOut", "TransferredOut"],
      default: "Assigned",
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    checkedInAt: { type: Date, default: null },
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    checkedOutAt: { type: Date, default: null },
    checkedOutBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // Set when this record was closed out by a transfer to another shelter.
    // The new shelter gets its own fresh "Assigned"/"CheckedIn" record.
    transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: "Shelter", default: null },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    transferredAt: { type: Date, default: null },
    transferReason: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

shelterOccupantSchema.pre("save", async function (next) {
  if (this.isNew && !this.occupantRecordId) {
    const seq = await getNextSequence("shelterOccupantId");
    this.occupantRecordId = `SO-${seq}`;
  }
  next();
});

shelterOccupantSchema.index({ shelter: 1, status: 1 });
shelterOccupantSchema.index({ citizen: 1, status: 1 });

module.exports = mongoose.model("ShelterOccupant", shelterOccupantSchema);
