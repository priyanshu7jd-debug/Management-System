const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const evacuationRouteSchema = new mongoose.Schema(
  {
    routeId: {
      type: String,
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Route name is required"],
      trim: true,
    },
    district: {
      type: String,
      trim: true,
      default: "",
    },
    from: {
      label: { type: String, trim: true, default: "" },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    to: {
      label: { type: String, trim: true, default: "" },
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    // Ordered waypoints drawn on the map between from -> to
    path: [
      {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    ],
    status: {
      type: String,
      enum: ["Active", "Blocked", "Closed"],
      default: "Active",
    },
    // Set when an Admin/Authority marks the destination area as evacuated
    areaEvacuated: {
      type: Boolean,
      default: false,
    },
    evacuatedAt: {
      type: Date,
    },
    evacuatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

evacuationRouteSchema.pre("save", async function (next) {
  if (this.isNew && !this.routeId) {
    const seq = await getNextSequence("evacuationRouteId");
    this.routeId = `EV-${100 + seq}`;
  }
  next();
});

evacuationRouteSchema.index({ district: 1, status: 1 });

module.exports = mongoose.model("EvacuationRoute", evacuationRouteSchema);
