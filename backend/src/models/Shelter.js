const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const shelterSchema = new mongoose.Schema(
  {
    shelterId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Shelter name is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    // GeoJSON mirror of `coordinates`, kept in sync automatically below. This is what
    // powers 2dsphere "nearby" queries - Mongo can't geo-index a plain {lat,lng} object.
    geo: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
    capacity: {
      type: Number,
      required: [true, "Total capacity is required"],
      min: [0, "Capacity cannot be negative"],
    },
    currentOccupancy: {
      type: Number,
      default: 0,
      min: [0, "Occupancy cannot be negative"],
    },
    resources: {
      food: { type: Boolean, default: false },
      water: { type: Boolean, default: false },
      medical: { type: Boolean, default: false },
      bedding: { type: Boolean, default: false },
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    images: [{ type: String }], // URLs to uploaded shelter photos, if any
    status: {
      type: String,
      enum: ["Active", "Full", "Closed"],
      default: "Active",
    },
    managedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Optional link back to the incident this shelter was opened for (e.g.
    // via a Disaster row's "Add shelter record" action). Purely informational -
    // nothing in the app requires it, and shelters created any other way
    // simply leave this null.
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    // "Approve shelter" (Admin only). A shelter created by an Authority
    // starts Pending and isn't considered fully live until an Admin
    // approves it; a shelter created by an Admin is auto-approved.
    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    // "Delete/deactivate shelter" - Authority can only REQUEST deletion,
    // not perform it. Admin sees the flag and either deletes the shelter
    // (DELETE /api/shelters/:id) or clears the request.
    deletionRequested: {
      type: Boolean,
      default: false,
    },
    deletionRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deletionRequestedAt: {
      type: Date,
      default: null,
    },
    deletionRequestReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like SH-501 on creation
shelterSchema.pre("save", async function (next) {
  if (this.isNew && !this.shelterId) {
    const seq = await getNextSequence("shelterId");
    this.shelterId = `SH-${500 + seq}`;
  }

  // Auto-flip status to Full when occupancy reaches capacity (unless manually closed)
  if (this.status !== "Closed") {
    this.status = this.currentOccupancy >= this.capacity ? "Full" : "Active";
  }

  // Keep the GeoJSON mirror in sync whenever lat/lng change (or are cleared)
  if (
    this.coordinates &&
    typeof this.coordinates.lat === "number" &&
    typeof this.coordinates.lng === "number"
  ) {
    this.geo = { type: "Point", coordinates: [this.coordinates.lng, this.coordinates.lat] };
  } else {
    this.geo = undefined;
  }

  next();
});

shelterSchema.index({ status: 1 });
shelterSchema.index({ approvalStatus: 1 });
shelterSchema.index({ geo: "2dsphere" });
shelterSchema.index({ relatedDisaster: 1 });

module.exports = mongoose.model("Shelter", shelterSchema);
