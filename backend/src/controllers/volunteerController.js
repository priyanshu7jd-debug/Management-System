const asyncHandler = require("express-async-handler");
const Volunteer = require("../models/Volunteer");

// @desc    Register the logged-in user as a volunteer (creates a Pending profile)
// @route   POST /api/volunteers
// @access  Private
const registerVolunteer = asyncHandler(async (req, res) => {
  const { skills, district, availability } = req.body;

  const existing = await Volunteer.findOne({ user: req.user._id });
  if (existing) {
    res.status(400);
    throw new Error("You have already registered as a volunteer");
  }

  const volunteer = await Volunteer.create({
    user: req.user._id,
    skills,
    district,
    availability,
  });

  res.status(201).json({ success: true, data: volunteer });
});

// @desc    Get all volunteers (supports filtering + pagination)
// @route   GET /api/volunteers?status=&availability=&district=&skill=&page=&limit=
// @access  Private (Authority, Admin: every volunteer. Volunteer: "Assigned team"
//          only - the map permission table gives Volunteers visibility into
//          their own team, not the whole roster.)
const getVolunteers = asyncHandler(async (req, res) => {
  const { status, availability, district, skill, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (availability) filter.availability = availability;
  if (district) filter.district = { $regex: district, $options: "i" };
  if (skill) filter.skills = { $regex: skill, $options: "i" };

  if (req.user.role === "Volunteer") {
    // Scope to the caller's own team: same NGO if they belong to one,
    // otherwise same assigned disaster, otherwise just themselves.
    const own = await Volunteer.findOne({ user: req.user._id });
    if (own && own.ngo) {
      filter.ngo = own.ngo;
    } else if (own && own.assignedDisaster) {
      filter.assignedDisaster = own.assignedDisaster;
    } else {
      filter.user = req.user._id;
    }
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [volunteers, total] = await Promise.all([
    Volunteer.find(filter)
      .populate("user", "name email phone role")
      .populate("verifiedBy", "name role")
      .populate("assignedDisaster", "disasterId type location")
      .populate("assignedShelter", "shelterId name location")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Volunteer.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: volunteers.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: volunteers,
  });
});

// @desc    Get the logged-in user's own volunteer profile
// @route   GET /api/volunteers/me
// @access  Private
const getMyVolunteerProfile = asyncHandler(async (req, res) => {
  const volunteer = await Volunteer.findOne({ user: req.user._id })
    .populate("assignedDisaster", "disasterId type location")
    .populate("assignedShelter", "shelterId name location");

  if (!volunteer) {
    res.status(404);
    throw new Error("You have not registered as a volunteer yet");
  }

  res.json({ success: true, data: volunteer });
});

// @desc    Get a single volunteer by ID
// @route   GET /api/volunteers/:id
// @access  Private (Authority, Admin)
const getVolunteerById = asyncHandler(async (req, res) => {
  const volunteer = await Volunteer.findById(req.params.id)
    .populate("user", "name email phone role")
    .populate("verifiedBy", "name role")
    .populate("assignedDisaster", "disasterId type location")
    .populate("assignedShelter", "shelterId name location");

  if (!volunteer) {
    res.status(404);
    throw new Error("Volunteer not found");
  }

  res.json({ success: true, data: volunteer });
});

// @desc    Update own skills / district / availability
// @route   PUT /api/volunteers/me
// @access  Private
const updateMyVolunteerProfile = asyncHandler(async (req, res) => {
  const volunteer = await Volunteer.findOne({ user: req.user._id });
  if (!volunteer) {
    res.status(404);
    throw new Error("You have not registered as a volunteer yet");
  }

  const fields = ["skills", "district", "availability"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) volunteer[field] = req.body[field];
  });

  const updated = await volunteer.save();
  res.json({ success: true, data: updated });
});

// @desc    Approve / reject / deactivate a volunteer
// @route   PATCH /api/volunteers/:id/status
// @access  Private (Authority, Admin)
const updateVolunteerStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["Pending", "Approved", "Rejected", "Inactive"];

  if (!status || !validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${validStatuses.join(", ")}`);
  }

  const volunteer = await Volunteer.findById(req.params.id);
  if (!volunteer) {
    res.status(404);
    throw new Error("Volunteer not found");
  }

  volunteer.status = status;
  if (status === "Approved") volunteer.verifiedBy = req.user._id;

  const updated = await volunteer.save();
  res.json({ success: true, data: updated });
});

// @desc    Assign a volunteer to a disaster response and/or a shelter
// @route   PATCH /api/volunteers/:id/assign
// @access  Private (Authority, Admin)
const assignVolunteer = asyncHandler(async (req, res) => {
  const { assignedDisaster, assignedShelter } = req.body;

  const volunteer = await Volunteer.findById(req.params.id);
  if (!volunteer) {
    res.status(404);
    throw new Error("Volunteer not found");
  }

  if (volunteer.status !== "Approved") {
    res.status(400);
    throw new Error("Only approved volunteers can be assigned");
  }

  if (assignedDisaster !== undefined) volunteer.assignedDisaster = assignedDisaster || null;
  if (assignedShelter !== undefined) volunteer.assignedShelter = assignedShelter || null;

  const updated = await volunteer.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete a volunteer profile
// @route   DELETE /api/volunteers/:id
// @access  Private (Admin)
const deleteVolunteer = asyncHandler(async (req, res) => {
  const volunteer = await Volunteer.findById(req.params.id);
  if (!volunteer) {
    res.status(404);
    throw new Error("Volunteer not found");
  }

  await volunteer.deleteOne();
  res.json({ success: true, message: "Volunteer profile deleted" });
});

// @desc    Dashboard stats - counts by status/availability
// @route   GET /api/volunteers/stats/summary
// @access  Private (Authority, Admin)
const getVolunteerStats = asyncHandler(async (req, res) => {
  const [byStatus, byAvailability, total] = await Promise.all([
    Volunteer.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Volunteer.aggregate([{ $group: { _id: "$availability", count: { $sum: 1 } } }]),
    Volunteer.countDocuments(),
  ]);

  res.json({ success: true, data: { total, byStatus, byAvailability } });
});

module.exports = {
  registerVolunteer,
  getVolunteers,
  getMyVolunteerProfile,
  getVolunteerById,
  updateMyVolunteerProfile,
  updateVolunteerStatus,
  assignVolunteer,
  deleteVolunteer,
  getVolunteerStats,
};
