const mongoose = require("mongoose");
const getNextSequence = require("../utils/getNextSequence");

const taskSchema = new mongoose.Schema(
  {
    taskId: {
      type: String,
      unique: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    category: {
      type: String,
      enum: ["Rescue", "Relief Distribution", "Medical", "Logistics", "Shelter Management", "Other"],
      default: "Other",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed", "Cancelled"],
      default: "Pending",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relatedDisaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disaster",
      default: null,
    },
    relatedShelter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelter",
      default: null,
    },
    relatedNgo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NGO",
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-generate a human friendly ID like TK-901 on creation
taskSchema.pre("save", async function (next) {
  if (this.isNew && !this.taskId) {
    const seq = await getNextSequence("taskId");
    this.taskId = `TK-${900 + seq}`;
  }

  if (this.isModified("status")) {
    this.completedAt = this.status === "Completed" ? new Date() : null;
  }

  next();
});

taskSchema.index({ status: 1, priority: 1, assignedTo: 1 });

module.exports = mongoose.model("Task", taskSchema);
