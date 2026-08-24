const asyncHandler = require("express-async-handler");
const User = require("../models/User");

// @desc    Get all users (supports filtering, search, pagination)
// @route   GET /api/users?role=&status=&district=&search=&page=&limit=
// @access  Private (Admin)
const getUsers = asyncHandler(async (req, res) => {
  const { role, status, district, search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (district) filter.district = { $regex: district, $options: "i" };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: users.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: users,
  });
});

// @desc    Get a single user by ID
// @route   GET /api/users/:id
// @access  Private (Admin)
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.json({ success: true, data: user });
});

// @desc    Update a user's role (e.g. promote Citizen to Authority)
// @route   PATCH /api/users/:id/role
// @access  Private (Admin)
const updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const allowedRoles = ["Citizen", "Authority", "Volunteer", "Admin"];

  if (!role || !allowedRoles.includes(role)) {
    res.status(400);
    throw new Error(`Role must be one of: ${allowedRoles.join(", ")}`);
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Prevent an Admin from demoting their own account and locking themselves out
  if (String(user._id) === String(req.user._id) && role !== "Admin") {
    res.status(400);
    throw new Error("You cannot change your own Admin role");
  }

  user.role = role;
  const updated = await user.save();
  res.json({ success: true, data: updated });
});

// @desc    Block or unblock a user account
// @route   PATCH /api/users/:id/status
// @access  Private (Admin)
const updateUserStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowedStatuses = ["Active", "Blocked"];

  if (!status || !allowedStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${allowedStatuses.join(", ")}`);
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (String(user._id) === String(req.user._id) && status === "Blocked") {
    res.status(400);
    throw new Error("You cannot block your own account");
  }

  user.status = status;
  const updated = await user.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete a user account
// @route   DELETE /api/users/:id
// @access  Private (Admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  if (String(user._id) === String(req.user._id)) {
    res.status(400);
    throw new Error("You cannot delete your own account");
  }

  await user.deleteOne();
  res.json({ success: true, message: "User deleted" });
});

// @desc    Dashboard stats - counts by role and status
// @route   GET /api/users/stats/summary
// @access  Private (Admin)
const getUserStats = asyncHandler(async (req, res) => {
  const [byRole, byStatus, total] = await Promise.all([
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    User.countDocuments(),
  ]);

  res.json({
    success: true,
    data: { total, byRole, byStatus },
  });
});

module.exports = {
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getUserStats,
};
