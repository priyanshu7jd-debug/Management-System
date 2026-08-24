const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const notificationSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      unique: true,
    },
    // A specific user, or null for a broadcast notification visible to everyone
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: ["Alert", "Task", "Donation", "Disaster", "Shelter", "NGO", "News", "System"],
      required: [true, "Notification type is required"],
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
    // Optional links back to the record this notification is about
    relatedAlert: { type: mongoose.Schema.Types.ObjectId, ref: "Alert", default: null },
    relatedTask: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    relatedDonation: { type: mongoose.Schema.Types.ObjectId, ref: "Donation", default: null },
    relatedDisaster: { type: mongoose.Schema.Types.ObjectId, ref: "Disaster", default: null },
    relatedShelter: { type: mongoose.Schema.Types.ObjectId, ref: "Shelter", default: null },
    relatedNgo: { type: mongoose.Schema.Types.ObjectId, ref: "NGO", default: null },
    relatedNews: { type: mongoose.Schema.Types.ObjectId, ref: "News", default: null },
    // Who has read this notification. Works the same way for a direct notification
    // (one recipient) and a broadcast one (many recipients) - just check membership.
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null for system-generated notifications (e.g. auto low-stock alerts)
    },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like NT-1 on creation
notificationSchema.pre("save", async function (next) {
  if (this.isNew && !this.notificationId) {
    const seq = await getNextSequence("notificationId");
    this.notificationId = `NT-${seq}`;
  }
  next();
});

// Fast lookup of "my feed": direct-to-me OR broadcast, newest first
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
