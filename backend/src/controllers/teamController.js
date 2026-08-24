const asyncHandler = require("express-async-handler");
const Team = require("../models/Team");
const Volunteer = require("../models/Volunteer");
const { notifyMany } = require("../utils/notify");

const POPULATE_LEADER = { path: "leader", populate: { path: "user", select: "name email phone" } };
const POPULATE_MEMBERS = { path: "members", populate: { path: "user", select: "name email phone" } };

async function populateTeam(query) {
  return query
    .populate(POPULATE_LEADER)
    .populate(POPULATE_MEMBERS)
    .populate("assignedDisaster", "disasterId type location")
    .populate("assignedShelter", "shelterId name location")
    .populate("createdBy", "name role");
}

// @desc    Create a new volunteer team
// @route   POST /api/teams
// @access  Private (Admin)
const createTeam = asyncHandler(async (req, res) => {
  const { name, description, leader, members = [], assignedDisaster, assignedShelter, district, notes } = req.body;

  if (!name || !name.trim()) {
    res.status(400);
    throw new Error("Team name is required");
  }

  // Only Approved volunteers can be put on a team - matches how
  // assignVolunteer() only lets Approved volunteers be assigned work.
  const memberIds = Array.from(new Set([...(members || []), ...(leader ? [leader] : [])]));
  if (memberIds.length > 0) {
    const found = await Volunteer.find({ _id: { $in: memberIds } });
    if (found.length !== memberIds.length) {
      res.status(400);
      throw new Error("One or more selected volunteers could not be found");
    }
    const notApproved = found.find((v) => v.status !== "Approved");
    if (notApproved) {
      res.status(400);
      throw new Error("Only Approved volunteers can be added to a team");
    }
  }
  if (leader && !members.includes(leader)) members.push(leader);

  const team = await Team.create({
    name,
    description,
    leader: leader || null,
    members,
    assignedDisaster: assignedDisaster || null,
    assignedShelter: assignedShelter || null,
    district,
    notes,
    createdBy: req.user._id,
  });

  const populated = await populateTeam(Team.findById(team._id));

  if (members.length) {
    const vols = await Volunteer.find({ _id: { $in: members } }).select("user");
    notifyMany(vols.map((v) => v.user), {
      type: "System",
      title: `You've been added to team: ${team.name}`,
      message: description || "",
      createdBy: req.user._id,
    });
  }

  res.status(201).json({ success: true, data: populated });
});

// @desc    Get all teams (Admin/Authority see everything, Volunteer sees only their own)
// @route   GET /api/teams?status=&district=
// @access  Private
const getTeams = asyncHandler(async (req, res) => {
  const { status, district } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (district) filter.district = { $regex: district, $options: "i" };

  if (req.user.role === "Volunteer") {
    const own = await Volunteer.findOne({ user: req.user._id });
    if (!own) {
      return res.json({ success: true, count: 0, data: [] });
    }
    filter.members = own._id;
  }

  const teams = await populateTeam(Team.find(filter).sort({ createdAt: -1 }));
  res.json({ success: true, count: teams.length, data: teams });
});

// @desc    Get the logged-in volunteer's own team(s)
// @route   GET /api/teams/me
// @access  Private (Volunteer)
const getMyTeams = asyncHandler(async (req, res) => {
  const own = await Volunteer.findOne({ user: req.user._id });
  if (!own) {
    return res.json({ success: true, count: 0, data: [] });
  }
  const teams = await populateTeam(Team.find({ members: own._id, status: "Active" }).sort({ createdAt: -1 }));
  res.json({ success: true, count: teams.length, data: teams });
});

// @desc    Get a single team
// @route   GET /api/teams/:id
// @access  Private (Admin, Authority, or a member of the team)
const getTeamById = asyncHandler(async (req, res) => {
  const team = await populateTeam(Team.findById(req.params.id));
  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  if (req.user.role === "Volunteer") {
    const own = await Volunteer.findOne({ user: req.user._id });
    const isMember = own && team.members.some((m) => m._id.toString() === own._id.toString());
    if (!isMember) {
      res.status(403);
      throw new Error("Not authorized to view this team");
    }
  }

  res.json({ success: true, data: team });
});

// @desc    Update team details (name/description/leader/linked disaster or shelter/status)
// @route   PUT /api/teams/:id
// @access  Private (Admin)
const updateTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  if (req.body.leader !== undefined) {
    if (req.body.leader && !team.members.map((m) => m.toString()).includes(req.body.leader)) {
      res.status(400);
      throw new Error("The team leader must already be a member of the team");
    }
    team.leader = req.body.leader || null;
  }

  const refFields = ["assignedDisaster", "assignedShelter"];
  refFields.forEach((field) => {
    if (req.body[field] !== undefined) team[field] = req.body[field] || null;
  });

  const plainFields = ["name", "description", "district", "status", "notes"];
  plainFields.forEach((field) => {
    if (req.body[field] !== undefined) team[field] = req.body[field];
  });

  const updated = await team.save();
  const populated = await populateTeam(Team.findById(updated._id));
  res.json({ success: true, data: populated });
});

// @desc    Add one or more Approved volunteers to a team
// @route   POST /api/teams/:id/members
// @access  Private (Admin)
const addMembers = asyncHandler(async (req, res) => {
  const { members } = req.body;
  if (!Array.isArray(members) || members.length === 0) {
    res.status(400);
    throw new Error("Provide at least one volunteer id to add");
  }

  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  const found = await Volunteer.find({ _id: { $in: members } });
  if (found.length !== members.length) {
    res.status(400);
    throw new Error("One or more selected volunteers could not be found");
  }
  const notApproved = found.find((v) => v.status !== "Approved");
  if (notApproved) {
    res.status(400);
    throw new Error("Only Approved volunteers can be added to a team");
  }

  const existing = new Set(team.members.map((m) => m.toString()));
  const toAdd = members.filter((m) => !existing.has(m));
  team.members.push(...toAdd);
  await team.save();

  if (toAdd.length) {
    const vols = await Volunteer.find({ _id: { $in: toAdd } }).select("user");
    notifyMany(vols.map((v) => v.user), {
      type: "System",
      title: `You've been added to team: ${team.name}`,
      createdBy: req.user._id,
    });
  }

  const populated = await populateTeam(Team.findById(team._id));
  res.json({ success: true, data: populated });
});

// @desc    Remove a volunteer from a team
// @route   DELETE /api/teams/:id/members/:volunteerId
// @access  Private (Admin)
const removeMember = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  team.members = team.members.filter((m) => m.toString() !== req.params.volunteerId);
  if (team.leader && team.leader.toString() === req.params.volunteerId) team.leader = null;
  await team.save();

  const populated = await populateTeam(Team.findById(team._id));
  res.json({ success: true, data: populated });
});

// @desc    Delete a team
// @route   DELETE /api/teams/:id
// @access  Private (Admin)
const deleteTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }
  await team.deleteOne();
  res.json({ success: true, message: "Team deleted" });
});

// @desc    Send a message/alert to every member of a team
// @route   POST /api/teams/:id/notify
// @access  Private (Admin)
const notifyTeam = asyncHandler(async (req, res) => {
  const { title, message } = req.body;
  if (!title || !title.trim()) {
    res.status(400);
    throw new Error("Provide a message title");
  }

  const team = await Team.findById(req.params.id).populate("members", "user");
  if (!team) {
    res.status(404);
    throw new Error("Team not found");
  }

  const vols = await Volunteer.find({ _id: { $in: team.members } }).select("user");
  notifyMany(vols.map((v) => v.user), {
    type: "System",
    title,
    message: message || "",
    createdBy: req.user._id,
  });

  res.json({ success: true, message: "Notification sent to team members" });
});

module.exports = {
  createTeam,
  getTeams,
  getMyTeams,
  getTeamById,
  updateTeam,
  addMembers,
  removeMember,
  deleteTeam,
  notifyTeam,
};
