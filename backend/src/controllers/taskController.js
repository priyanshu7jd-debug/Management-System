const asyncHandler = require("express-async-handler");
const Task = require("../models/Task");
const { notify } = require("../utils/notify");

const isStaff = (user) => user.role === "Authority" || user.role === "Admin";

// @desc    Create and assign a new task
// @route   POST /api/tasks
// @access  Private (Authority, Admin)
const createTask = asyncHandler(async (req, res) => {
  const { title, description, category, priority, assignedTo, relatedDisaster, relatedShelter, dueDate, notes } =
    req.body;

  if (!title) {
    res.status(400);
    throw new Error("Please provide a task title");
  }

  const task = await Task.create({
    title,
    description,
    category,
    priority,
    assignedTo,
    relatedDisaster,
    relatedShelter,
    dueDate,
    notes,
    assignedBy: req.user._id,
  });

  if (task.assignedTo) {
    notify({
      recipient: task.assignedTo,
      type: "Task",
      title: `New task assigned: ${task.title}`,
      message: task.description || `Priority: ${task.priority}`,
      createdBy: req.user._id,
      related: { relatedTask: task._id },
    });
  }

  res.status(201).json({ success: true, data: task });
});

// @desc    Get all tasks (supports filtering + pagination)
// @route   GET /api/tasks?status=&priority=&category=&assignedTo=&disaster=&shelter=&page=&limit=
// @access  Private (Authority, Admin)
const getTasks = asyncHandler(async (req, res) => {
  const {
    status,
    priority,
    category,
    assignedTo,
    disaster,
    shelter,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (disaster) filter.relatedDisaster = disaster;
  if (shelter) filter.relatedShelter = shelter;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignedTo", "name email phone role")
      .populate("assignedBy", "name role")
      .populate("relatedDisaster", "disasterId type location")
      .populate("relatedShelter", "shelterId name location")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Task.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: tasks.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: tasks,
  });
});

// @desc    Get tasks assigned to the logged-in user
// @route   GET /api/tasks/me?status=&page=&limit=
// @access  Private
const getMyTasks = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = { assignedTo: req.user._id };
  if (status) filter.status = status;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate("assignedBy", "name role")
      .populate("relatedDisaster", "disasterId type location")
      .populate("relatedShelter", "shelterId name location")
      .sort({ dueDate: 1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Task.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: tasks.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: tasks,
  });
});

// @desc    Get a single task by ID
// @route   GET /api/tasks/:id
// @access  Private (Authority, Admin, or the assignee)
const getTaskById = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id)
    .populate("assignedTo", "name email phone role")
    .populate("assignedBy", "name role")
    .populate("relatedDisaster", "disasterId type location")
    .populate("relatedShelter", "shelterId name location");

  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  const isAssignee = task.assignedTo && task.assignedTo._id.toString() === req.user._id.toString();
  if (!isStaff(req.user) && !isAssignee) {
    res.status(403);
    throw new Error("Not authorized to view this task");
  }

  res.json({ success: true, data: task });
});

// @desc    Update full task details (reassign, reprioritize, edit description, etc.)
// @route   PUT /api/tasks/:id
// @access  Private (Authority, Admin)
const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  const previousAssignee = task.assignedTo ? task.assignedTo.toString() : null;

  const fields = [
    "title",
    "description",
    "category",
    "priority",
    "assignedTo",
    "relatedDisaster",
    "relatedShelter",
    "dueDate",
    "notes",
  ];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) task[field] = req.body[field];
  });

  const updated = await task.save();

  const newAssignee = updated.assignedTo ? updated.assignedTo.toString() : null;
  if (newAssignee && newAssignee !== previousAssignee) {
    notify({
      recipient: newAssignee,
      type: "Task",
      title: `Task assigned to you: ${updated.title}`,
      message: updated.description || `Priority: ${updated.priority}`,
      createdBy: req.user._id,
      related: { relatedTask: updated._id },
    });
  }

  res.json({ success: true, data: updated });
});

// @desc    Update task status (e.g. assignee marks In Progress / Completed)
// @route   PATCH /api/tasks/:id/status
// @access  Private (Authority, Admin, or the assignee)
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["Pending", "In Progress", "Completed", "Cancelled"];

  if (!status || !validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${validStatuses.join(", ")}`);
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString();
  if (!isStaff(req.user) && !isAssignee) {
    res.status(403);
    throw new Error("Not authorized to update this task");
  }

  task.status = status;
  const updated = await task.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin)
const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  await task.deleteOne();
  res.json({ success: true, message: "Task deleted" });
});

// @desc    Dashboard stats - counts by status/priority/category
// @route   GET /api/tasks/stats/summary
// @access  Private (Authority, Admin)
const getTaskStats = asyncHandler(async (req, res) => {
  const [byStatus, byPriority, byCategory, total] = await Promise.all([
    Task.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Task.aggregate([{ $group: { _id: "$priority", count: { $sum: 1 } } }]),
    Task.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    Task.countDocuments(),
  ]);

  res.json({ success: true, data: { total, byStatus, byPriority, byCategory } });
});

module.exports = {
  createTask,
  getTasks,
  getMyTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskStats,
};
