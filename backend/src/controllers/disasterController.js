const path = require("path");
const fs = require("fs");
const asyncHandler = require("express-async-handler");
const Disaster = require("../models/Disaster");
const User = require("../models/User");
const NGO = require("../models/NGO");
const Task = require("../models/Task");
const MapActivityLog = require("../models/MapActivityLog");
const { UPLOAD_ROOT } = require("../middleware/uploadMiddleware");
const { SCOPE, getScope } = require("../config/incidentPermissions");
const { isIncidentInScope, incidentScopeFilter } = require("../middleware/incidentAccessMiddleware");
const { notify } = require("../utils/notify");

// Records an incident-level audit entry. Reuses MapActivityLog, which
// already supports entityType "Disaster" - see models/MapActivityLog.js.
const logIncidentActivity = (action, disaster, user, details) =>
  MapActivityLog.record({
    action,
    entityType: "Disaster",
    entityId: disaster._id,
    district: disaster.location,
    user,
    details,
  });

// @desc    Report a new disaster/incident
// @route   POST /api/disasters
// @access  Private (any authenticated user)
const createDisaster = asyncHandler(async (req, res) => {
  const { type, location, coordinates, severity, description, images } = req.body;

  if (!type || !location) {
    res.status(400);
    throw new Error("Please provide disaster type and location");
  }

  const disaster = await Disaster.create({
    type,
    location,
    coordinates,
    severity,
    description,
    images,
    reportedBy: req.user._id,
    reportedByName: req.user.name,
  });

  logIncidentActivity("Incident reported", disaster, req.user, { type, severity });

  res.status(201).json({ success: true, data: disaster });
});

// @desc    Find reported disasters near a point, closest first (uses the 2dsphere geo index)
// @route   GET /api/disasters/nearby?lat=&lng=&maxDistance=&status=&limit=
// @access  Private
const getNearbyDisasters = asyncHandler(async (req, res) => {
  const { lat, lng, maxDistance = 10000, status, limit = 20 } = req.query;

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    res.status(400);
    throw new Error("Please provide numeric lat and lng query parameters");
  }

  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const maxDistanceNum = Math.min(parseInt(maxDistance, 10) || 10000, 200000); // cap at 200km

  const matchStage = {};
  if (status) matchStage.status = status;

  const disasters = await Disaster.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [longitude, latitude] },
        distanceField: "distanceMeters",
        maxDistance: maxDistanceNum,
        spherical: true,
        query: matchStage,
      },
    },
    { $limit: limitNum },
  ]);

  res.json({ success: true, count: disasters.length, data: disasters });
});

// @desc    Get all disasters (supports filtering + pagination)
// @route   GET /api/disasters?status=&type=&severity=&mine=&page=&limit=
// @access  Private - scoped per incidentPermissions.viewIncidents
//          (Admin: all, Authority: assigned/area, Citizen: own, Volunteer: reported/assigned)
const getDisasters = asyncHandler(async (req, res) => {
  const { status, type, severity, mine, search, page = 1, limit = 20 } = req.query;

  const scope = req.incidentScope || getScope("viewIncidents", req.user.role);
  const filter = incidentScopeFilter(req.user, scope);

  if (status) filter.status = status;
  if (type) filter.type = type;
  if (severity) filter.severity = severity;
  if (mine === "true") filter.reportedBy = req.user._id;
  if (search) filter.location = { $regex: search, $options: "i" };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [disasters, total] = await Promise.all([
    Disaster.find(filter)
      .populate("reportedBy", "name email role")
      .populate("verifiedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Disaster.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: disasters.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: disasters,
  });
});

// @desc    Get a single disaster by ID
// @route   GET /api/disasters/:id
// @access  Private - scoped per incidentPermissions.viewIncidents
const getDisasterById = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id)
    .populate("reportedBy", "name email role")
    .populate("verifiedBy", "name role")
    .populate("assignedAuthority", "name role")
    .populate("assignedVolunteers", "name role")
    .populate("assignedNgo", "name ngoId");

  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("viewIncidents", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to view this incident");
  }

  const data = disaster.toObject();
  // Investigation notes and resolution recommendations are staff-only detail,
  // regardless of whether the requester can otherwise view the incident.
  if (!["Admin", "Authority"].includes(req.user.role)) {
    delete data.investigationNotes;
    delete data.resolutionRecommendations;
  }

  res.json({ success: true, data });
});

// @desc    Update disaster status / team assignment
// @route   PATCH /api/disasters/:id/status
// @access  Private - Admin/Authority full; Volunteer limited to their own
//          assigned incident, and only into "In Progress" (see
//          incidentPermissions.updateIncidentStatus: SCOPE.ASSIGNED_TASK_ONLY)
const updateDisasterStatus = asyncHandler(async (req, res) => {
  const { status, team } = req.body;
  const validStatuses = ["Pending", "Verified", "In Progress", "Resolved", "Rejected"];

  if (status && !validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${validStatuses.join(", ")}`);
  }

  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("updateIncidentStatus", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to update status on this incident");
  }

  if (scope === SCOPE.ASSIGNED_TASK_ONLY && req.user.role === "Volunteer") {
    // Volunteers may only move their assigned incident into progress -
    // verifying, resolving, and rejecting stay with Admin/Authority.
    if (status && status !== "In Progress") {
      res.status(403);
      throw new Error("Volunteers may only update an assigned incident's status to 'In Progress'");
    }
    if (team) {
      res.status(403);
      throw new Error("Volunteers may not reassign the response team");
    }
  }

  if (status) {
    disaster.status = status;
    if (status === "Verified") disaster.verifiedBy = req.user._id;
  }
  if (team) disaster.team = team;

  const updated = await disaster.save();
  logIncidentActivity("Status updated", disaster, req.user, { status, team });
  res.json({ success: true, data: updated });
});

// @desc    Update full disaster details
// @route   PUT /api/disasters/:id
// @access  Private - Admin full, Authority (assigned/area), Citizen/Volunteer
//          may edit their own report only while still Pending
//          (incidentPermissions.editIncident)
const updateDisaster = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("editIncident", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to edit this incident");
  }

  // A reporter editing their own pending report can only touch the report
  // content itself, never workflow state (status/team/verification).
  const isReporterEdit = scope === SCOPE.OWN_BEFORE_REVIEW;
  const fields = isReporterEdit
    ? ["type", "location", "coordinates", "severity", "description", "images"]
    : ["type", "location", "coordinates", "severity", "description", "status", "team", "images"];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) disaster[field] = req.body[field];
  });

  const updated = await disaster.save();
  logIncidentActivity("Incident edited", disaster, req.user, {});
  res.json({ success: true, data: updated });
});

// @desc    Delete a disaster report
// @route   DELETE /api/disasters/:id
// @access  Private - Admin full; Authority limited to incidents in their own
//          district (incidentPermissions.deleteIncident)
const deleteDisaster = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  if (req.user.role === "Authority") {
    const sameDistrict = req.user.district && disaster.location && disaster.location.includes(req.user.district);
    if (!sameDistrict) {
      res.status(403);
      throw new Error("Authority may only delete incidents within their own district");
    }
  }

  await disaster.deleteOne();
  logIncidentActivity("Incident deleted", disaster, req.user, {});
  res.json({ success: true, message: "Disaster report deleted" });
});

// @desc    Dashboard stats - counts by status/type/severity
// @route   GET /api/disasters/stats/summary
// @access  Private (Authority, Admin)
const getDisasterStats = asyncHandler(async (req, res) => {
  const [byStatus, byType, bySeverity, total] = await Promise.all([
    Disaster.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Disaster.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
    Disaster.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]),
    Disaster.countDocuments(),
  ]);

  res.json({ success: true, data: { total, byStatus, byType, bySeverity } });
});

// @desc    Upload evidence photos for a disaster report (multipart/form-data, field "images", max 5)
// @route   POST /api/disasters/:id/images
// @access  Private (the reporter, or Authority/Admin)
const uploadDisasterImages = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const isOwner = disaster.reportedBy.toString() === req.user._id.toString();
  if (!isOwner && !["Authority", "Admin"].includes(req.user.role)) {
    res.status(403);
    throw new Error("Not authorized to add images to this report");
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("Please attach at least one image");
  }

  const urls = req.files.map((file) => `/uploads/disasters/${file.filename}`);
  disaster.images.push(...urls);
  const updated = await disaster.save();

  res.status(201).json({ success: true, data: updated });
});

// @desc    Remove one evidence photo from a disaster report
// @route   DELETE /api/disasters/:id/images
// @access  Private (the reporter, or Authority/Admin)
const deleteDisasterImage = asyncHandler(async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    res.status(400);
    throw new Error("Please provide the imageUrl to remove");
  }

  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const isOwner = disaster.reportedBy.toString() === req.user._id.toString();
  if (!isOwner && !["Authority", "Admin"].includes(req.user.role)) {
    res.status(403);
    throw new Error("Not authorized to modify images on this report");
  }

  const hadImage = disaster.images.includes(imageUrl);
  disaster.images = disaster.images.filter((img) => img !== imageUrl);
  const updated = await disaster.save();

  // Best-effort cleanup of the file from disk - only if it's actually one of ours,
  // and never let a missing/already-deleted file turn into a 500.
  if (hadImage) {
    const filename = path.basename(imageUrl);
    fs.unlink(path.join(UPLOAD_ROOT, "disasters", filename), () => {});
  }

  res.json({ success: true, data: updated });
});

// @desc    Verify an incident report
// @route   PATCH /api/disasters/:id/verify
// @access  Private (Admin, Authority)
const verifyIncident = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  disaster.status = "Verified";
  disaster.verifiedBy = req.user._id;
  const updated = await disaster.save();

  logIncidentActivity("Incident verified", disaster, req.user, {});
  notify({
    recipient: disaster.reportedBy,
    type: "Disaster",
    title: `Your report ${disaster.disasterId} was verified`,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Reject an incident report
// @route   PATCH /api/disasters/:id/reject
// @access  Private (Admin, Authority)
const rejectIncident = asyncHandler(async (req, res) => {
  const { reason = "" } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  disaster.status = "Rejected";
  disaster.rejectedBy = req.user._id;
  disaster.rejectionReason = reason;
  const updated = await disaster.save();

  logIncidentActivity("Incident rejected", disaster, req.user, { reason });
  notify({
    recipient: disaster.reportedBy,
    type: "Disaster",
    title: `Your report ${disaster.disasterId} was rejected`,
    message: reason,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Change an incident's operational priority
// @route   PATCH /api/disasters/:id/priority
// @access  Private (Admin, Authority)
const changePriority = asyncHandler(async (req, res) => {
  const { priority } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  disaster.priority = priority;
  disaster.priorityChangedBy = req.user._id;
  disaster.priorityChangedAt = new Date();
  const updated = await disaster.save();

  logIncidentActivity("Priority changed", disaster, req.user, { priority });
  res.json({ success: true, data: updated });
});

// @desc    Assign an Authority user to an incident
// @route   PATCH /api/disasters/:id/assign-authority
// @access  Private (Admin only)
const assignAuthority = asyncHandler(async (req, res) => {
  const { authorityId } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const authorityUser = await User.findById(authorityId);
  if (!authorityUser || authorityUser.role !== "Authority") {
    res.status(400);
    throw new Error("authorityId must belong to a user with the Authority role");
  }

  disaster.assignedAuthority = authorityUser._id;
  const updated = await disaster.save();

  logIncidentActivity("Authority assigned", disaster, req.user, { authorityId });
  notify({
    recipient: authorityUser._id,
    type: "Disaster",
    title: `You were assigned to incident ${disaster.disasterId}`,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Assign a Volunteer to an incident
// @route   PATCH /api/disasters/:id/assign-volunteer
// @access  Private (Admin, Authority)
const assignVolunteer = asyncHandler(async (req, res) => {
  const { volunteerId } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const volunteerUser = await User.findById(volunteerId);
  if (!volunteerUser || volunteerUser.role !== "Volunteer") {
    res.status(400);
    throw new Error("volunteerId must belong to a user with the Volunteer role");
  }

  const alreadyAssigned = disaster.assignedVolunteers.some((v) => v.toString() === volunteerUser._id.toString());
  if (!alreadyAssigned) disaster.assignedVolunteers.push(volunteerUser._id);
  const updated = await disaster.save();

  logIncidentActivity("Volunteer assigned", disaster, req.user, { volunteerId });
  notify({
    recipient: volunteerUser._id,
    type: "Disaster",
    title: `You were assigned to incident ${disaster.disasterId}`,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Assign an NGO to an incident
// @route   PATCH /api/disasters/:id/assign-ngo
// @access  Private (Admin, Authority)
const assignNgo = asyncHandler(async (req, res) => {
  const { ngoId } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const ngo = await NGO.findById(ngoId);
  if (!ngo) {
    res.status(400);
    throw new Error("ngoId does not match an existing NGO");
  }

  disaster.assignedNgo = ngo._id;
  const updated = await disaster.save();

  logIncidentActivity("NGO assigned", disaster, req.user, { ngoId });
  res.json({ success: true, data: updated });
});

// @desc    Add an investigation note to an incident
// @route   POST /api/disasters/:id/notes
// @access  Private (Admin, Authority)
const addInvestigationNote = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  disaster.investigationNotes.push({ note, addedBy: req.user._id, addedByRole: req.user.role });
  const updated = await disaster.save();

  logIncidentActivity("Investigation note added", disaster, req.user, {});
  res.status(201).json({ success: true, data: updated });
});

// @desc    Request emergency response for an incident (any authenticated role)
// @route   POST /api/disasters/:id/request-response
// @access  Private
const requestEmergencyResponse = asyncHandler(async (req, res) => {
  const { notes = "" } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  logIncidentActivity("Emergency response requested", disaster, req.user, { notes });

  // Broadcast to Admin/Authority - no single "district responders" list exists
  // yet, so this is a best-effort broadcast notification, not a targeted one.
  notify({
    recipient: null,
    type: "Disaster",
    title: `Emergency response requested for ${disaster.disasterId}`,
    message: notes || `${disaster.type} at ${disaster.location}`,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.status(201).json({ success: true, message: "Emergency response requested" });
});

// @desc    Create a response task tied to an incident
// @route   POST /api/disasters/:id/response-task
// @access  Private (Admin, Authority)
const createResponseTask = asyncHandler(async (req, res) => {
  const { title, description, category, priority, assignedTo, dueDate, notes } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

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
    relatedDisaster: disaster._id,
    dueDate,
    notes,
    assignedBy: req.user._id,
  });

  if (task.assignedTo) {
    notify({
      recipient: task.assignedTo,
      type: "Task",
      title: `New response task: ${task.title}`,
      message: task.description || `Priority: ${task.priority}`,
      createdBy: req.user._id,
      related: { relatedTask: task._id, relatedDisaster: disaster._id },
    });
  }

  logIncidentActivity("Response task created", disaster, req.user, { taskId: task.taskId });
  res.status(201).json({ success: true, data: task });
});

// @desc    Log a response coordination note on an incident
// @route   PATCH /api/disasters/:id/coordinate
// @access  Private (Admin, Authority full; Volunteer if assigned)
const coordinateResponse = asyncHandler(async (req, res) => {
  const { team, notes = "" } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("coordinateResponse", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to coordinate response for this incident");
  }

  if (team) disaster.team = team;
  const updated = await disaster.save();

  logIncidentActivity("Response coordinated", disaster, req.user, { team, notes });
  res.json({ success: true, data: updated });
});

// @desc    Escalate an incident
// @route   PATCH /api/disasters/:id/escalate
// @access  Private (Admin, Authority, Volunteer)
const escalateIncident = asyncHandler(async (req, res) => {
  const { reason = "" } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  disaster.escalated = true;
  disaster.escalatedBy = req.user._id;
  disaster.escalatedAt = new Date();
  disaster.escalationReason = reason;
  if (disaster.priority !== "Critical") disaster.priority = "High";
  const updated = await disaster.save();

  logIncidentActivity("Incident escalated", disaster, req.user, { reason });
  notify({
    recipient: null,
    type: "Disaster",
    title: `Incident ${disaster.disasterId} escalated`,
    message: reason,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Resolve an incident, or (Volunteer) submit a resolution recommendation
// @route   PATCH /api/disasters/:id/resolve
// @access  Private (Admin, Authority full; Volunteer recommend-only)
const resolveIncident = asyncHandler(async (req, res) => {
  const { notes = "" } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("resolveIncident", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to resolve this incident");
  }

  if (scope === SCOPE.RECOMMEND) {
    disaster.resolutionRecommendations.push({ note: notes, recommendedBy: req.user._id });
    const updated = await disaster.save();
    logIncidentActivity("Resolution recommended", disaster, req.user, {});
    return res.status(201).json({ success: true, data: updated, message: "Recommendation submitted" });
  }

  disaster.status = "Resolved";
  disaster.resolvedBy = req.user._id;
  disaster.resolvedAt = new Date();
  disaster.resolutionNotes = notes;
  const updated = await disaster.save();

  logIncidentActivity("Incident resolved", disaster, req.user, {});
  notify({
    recipient: disaster.reportedBy,
    type: "Disaster",
    title: `Incident ${disaster.disasterId} resolved`,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Reopen an incident, or (Volunteer) request that it be reopened
// @route   PATCH /api/disasters/:id/reopen
// @access  Private (Admin, Authority full; Volunteer request-only)
const reopenIncident = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("reopenIncident", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to reopen this incident");
  }

  if (scope === SCOPE.REQUEST) {
    disaster.reopenRequests.push({ reason, requestedBy: req.user._id });
    const updated = await disaster.save();
    logIncidentActivity("Reopen requested", disaster, req.user, { reason });
    return res.status(201).json({ success: true, data: updated, message: "Reopen request submitted" });
  }

  disaster.status = "In Progress";
  disaster.reopenCount += 1;
  disaster.resolvedBy = null;
  disaster.resolvedAt = null;
  const updated = await disaster.save();

  logIncidentActivity("Incident reopened", disaster, req.user, { reason });
  notify({
    recipient: disaster.reportedBy,
    type: "Disaster",
    title: `Incident ${disaster.disasterId} reopened`,
    message: reason,
    createdBy: req.user._id,
    related: { relatedDisaster: disaster._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    View an incident's activity history (audit trail scoped to this record)
// @route   GET /api/disasters/:id/history
// @access  Private - Admin/Authority full, Citizen own, Volunteer assigned
const getIncidentHistory = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);
  if (!disaster) {
    res.status(404);
    throw new Error("Disaster report not found");
  }

  const scope = req.incidentScope || getScope("viewIncidentHistory", req.user.role);
  if (!isIncidentInScope(disaster, req.user, scope)) {
    res.status(403);
    throw new Error("Not authorized to view this incident's history");
  }

  const history = await MapActivityLog.find({ entityType: "Disaster", entityId: disaster._id })
    .populate("performedBy", "name role")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: history.length, data: history });
});

// @desc    View incident audit logs across the system
// @route   GET /api/disasters/audit-logs?page=&limit=
// @access  Private - Admin full, Authority limited to their district,
//          Citizen/Volunteer limited to their own actions
const getIncidentAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const scope = req.incidentScope || getScope("viewAuditLogs", req.user.role);

  const filter = { entityType: "Disaster" };
  if (scope === SCOPE.OWN) {
    filter.performedBy = req.user._id;
  } else if (scope === SCOPE.LIMITED && req.user.role === "Authority") {
    if (req.user.district) filter.district = { $regex: req.user.district, $options: "i" };
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [logs, total] = await Promise.all([
    MapActivityLog.find(filter)
      .populate("performedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    MapActivityLog.countDocuments(filter),
  ]);

  res.json({ success: true, count: logs.length, total, page: pageNum, data: logs });
});

module.exports = {
  createDisaster,
  getDisasters,
  getNearbyDisasters,
  getDisasterById,
  updateDisasterStatus,
  updateDisaster,
  deleteDisaster,
  getDisasterStats,
  uploadDisasterImages,
  verifyIncident,
  rejectIncident,
  changePriority,
  assignAuthority,
  assignVolunteer,
  assignNgo,
  addInvestigationNote,
  requestEmergencyResponse,
  createResponseTask,
  coordinateResponse,
  escalateIncident,
  resolveIncident,
  reopenIncident,
  getIncidentHistory,
  getIncidentAuditLogs,
  deleteDisasterImage,
};
