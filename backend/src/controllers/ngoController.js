const asyncHandler = require("express-async-handler");
const NGO = require("../models/NGO");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const Resource = require("../models/Resource");
const Volunteer = require("../models/Volunteer");
const Task = require("../models/Task");
const { notify } = require("../utils/notify");

const isAdmin = (user) => user.role === "Admin";
const isStaff = (user) => user.role === "Authority" || user.role === "Admin";
const isAssignedAuthority = (ngo, user) =>
  user.role === "Authority" && ngo.assignedAuthorities.some((id) => id.toString() === user._id.toString());

// An Authority may act on a given NGO if they're specifically assigned to it; an
// Admin may always act. Used for the table's "Assigned NGOs" scoped permissions.
const canManageAssigned = (ngo, user) => isAdmin(user) || isAssignedAuthority(ngo, user);

// Attach real campaign count + total raised to a list of NGO documents, computed
// from actual Campaign/Donation records rather than stored (and easily stale) counters.
async function withStats(ngos) {
  const ids = ngos.map((n) => n._id);
  if (ids.length === 0) return [];

  const campaigns = await Campaign.find({ ngo: { $in: ids } }).select("_id ngo");
  const campaignIdsByNgo = new Map();
  campaigns.forEach((c) => {
    const list = campaignIdsByNgo.get(c.ngo.toString()) || [];
    list.push(c._id);
    campaignIdsByNgo.set(c.ngo.toString(), list);
  });

  const raisedByCampaign = await Donation.aggregate([
    { $match: { relatedCampaign: { $ne: null }, type: "Cash", status: { $ne: "Cancelled" } } },
    { $group: { _id: "$relatedCampaign", total: { $sum: "$amount" }, donors: { $sum: 1 } } },
  ]);
  const raisedMap = new Map(raisedByCampaign.map((r) => [r._id.toString(), r]));

  return ngos.map((ngo) => {
    const campaignIds = campaignIdsByNgo.get(ngo._id.toString()) || [];
    let totalRaised = 0;
    let totalDonors = 0;
    campaignIds.forEach((cid) => {
      const stats = raisedMap.get(cid.toString());
      if (stats) {
        totalRaised += stats.total;
        totalDonors += stats.donors;
      }
    });
    return {
      ...ngo.toObject(),
      campaignCount: campaignIds.length,
      totalRaised,
      totalDonors,
    };
  });
}

// Compute rating average/count from the embedded ratings array rather than storing
// (and risking staleness of) a running total.
function ratingSummary(ngo) {
  const ratings = ngo.ratings || [];
  if (ratings.length === 0) return { averageRating: 0, ratingCount: 0 };
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
  return { averageRating: Math.round((sum / ratings.length) * 10) / 10, ratingCount: ratings.length };
}

// Strip fields that shouldn't leave the server to anyone but staff or the NGO's own
// registrant: submitted documents and banking details. Everyone else (including the
// public/Citizen/Volunteer) gets the rest of the profile.
function sanitizeNgo(ngoObj, user) {
  const isOwner = user && ngoObj.registeredBy && String(ngoObj.registeredBy._id || ngoObj.registeredBy) === String(user._id);
  if (user && (isStaff(user) || isOwner)) return ngoObj;

  const { documents, bankName, ifsc, accountNumber, auditLog, assistanceRequests, ...rest } = ngoObj;
  return rest;
}

// @desc    Register a new NGO/organization (pending ASDMA verification)
// @route   POST /api/ngos
// @access  Private (Authority, Admin)
const registerNgo = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    registrationNumber,
    areaOfOperation,
    activities,
    contactPhone,
    contactEmail,
    website,
    bankName,
    ifsc,
    accountNumber,
    documents,
  } = req.body;

  const ngo = await NGO.create({
    name,
    type,
    registrationNumber,
    areaOfOperation,
    activities,
    contactPhone,
    contactEmail,
    website,
    bankName,
    ifsc,
    accountNumber,
    documents,
    registeredBy: req.user._id,
  });

  ngo.logAudit("Registered", req.user, `Submitted for ASDMA verification`);
  await ngo.save();

  res.status(201).json({ success: true, data: ngo });
});

// @desc    List/search/filter NGOs (defaults to Approved only; Authority/Admin can see all/filter by status)
// @route   GET /api/ngos?status=&type=&area=&search=&page=&limit=
// @access  Public (Approved only) / Private (Authority, Admin - any status)
const getNgos = asyncHandler(async (req, res) => {
  const { status, type, area, search, page = 1, limit = 50 } = req.query;
  const isStaffUser = req.user && isStaff(req.user);

  const filter = {};
  if (isStaffUser && status) filter.status = status;
  if (!isStaffUser) filter.status = "Approved";
  if (type) filter.type = { $regex: type, $options: "i" };
  if (area) filter.areaOfOperation = { $regex: area, $options: "i" };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { registrationNumber: { $regex: search, $options: "i" } },
      { activities: { $regex: search, $options: "i" } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 50, 100);

  const [ngos, total] = await Promise.all([
    NGO.find(filter)
      .populate("registeredBy", "name email")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    NGO.countDocuments(filter),
  ]);

  const withStatsData = await withStats(ngos);
  const data = withStatsData.map((n) => ({ ...sanitizeNgo(n, req.user), ...ratingSummary(n) }));

  res.json({
    success: true,
    count: data.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data,
  });
});

// @desc    Get a single NGO by ID
// @route   GET /api/ngos/:id
// @access  Public (Approved only) / Private (any status for staff or the registrant)
const getNgoById = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id)
    .populate("registeredBy", "name email")
    .populate("reviewedBy", "name role")
    .populate("assignedAuthorities", "name email")
    .populate("assignedDisasters", "disasterId type location")
    .populate("assignedShelters", "shelterId name location");
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const isOwnerOrStaff = req.user && (isStaff(req.user) || ngo.registeredBy._id.toString() === req.user._id.toString());
  if (ngo.status !== "Approved" && !isOwnerOrStaff) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const [withStatsData] = await withStats([ngo]);
  const data = { ...sanitizeNgo(withStatsData, req.user), ...ratingSummary(ngo) };
  res.json({ success: true, data });
});

// @desc    Approve or reject an NGO registration
// @route   PATCH /api/ngos/:id/status
// @access  Private (Admin)
const updateNgoStatus = asyncHandler(async (req, res) => {
  const { status, reviewNotes } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.status = status;
  ngo.reviewNotes = reviewNotes || "";
  ngo.reviewedBy = req.user._id;
  ngo.logAudit(`Status set to ${status}`, req.user, reviewNotes || "");
  const updated = await ngo.save();

  notify({
    recipient: updated.registeredBy,
    type: "NGO",
    title: `NGO registration ${status.toLowerCase()}`,
    message: `Your registration for "${updated.name}" was ${status.toLowerCase()} by ASDMA.${reviewNotes ? " " + reviewNotes : ""}`,
    createdBy: req.user._id,
    related: { relatedNgo: updated._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Edit NGO details (Admin: any NGO; Authority: only NGOs assigned to them)
// @route   PUT /api/ngos/:id
// @access  Private (Admin, Authority [assigned])
const updateNgo = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  if (!canManageAssigned(ngo, req.user)) {
    res.status(403);
    throw new Error("Not authorized to edit this NGO - it is not assigned to you");
  }

  const fields = [
    "name",
    "type",
    "registrationNumber",
    "areaOfOperation",
    "activities",
    "contactPhone",
    "contactEmail",
    "website",
    "bankName",
    "ifsc",
    "accountNumber",
    "documents",
  ];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) ngo[field] = req.body[field];
  });

  // Only an Admin may change which Authority users oversee this NGO.
  if (req.body.assignedAuthorities !== undefined && isAdmin(req.user)) {
    ngo.assignedAuthorities = req.body.assignedAuthorities;
  }

  ngo.logAudit("Details edited", req.user);
  const updated = await ngo.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete an NGO registration (hard delete)
// @route   DELETE /api/ngos/:id
// @access  Private (Admin)
const deleteNgo = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }
  await ngo.deleteOne();
  res.json({ success: true, message: "NGO deleted" });
});

// @desc    Deactivate (soft-delete) or reactivate an NGO without losing its history
// @route   PATCH /api/ngos/:id/deactivate
// @access  Private (Admin)
const deactivateNgo = asyncHandler(async (req, res) => {
  const { isActive = false } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.isActive = !!isActive;
  ngo.logAudit(ngo.isActive ? "Reactivated" : "Deactivated", req.user);
  const updated = await ngo.save();
  res.json({ success: true, data: updated });
});

// @desc    Suspend an NGO (e.g. pending investigation) without deleting or unapproving it
// @route   PATCH /api/ngos/:id/suspend
// @access  Private (Admin)
const suspendNgo = asyncHandler(async (req, res) => {
  const { reason = "" } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.suspended = true;
  ngo.suspendedReason = reason;
  ngo.suspendedBy = req.user._id;
  ngo.suspendedAt = new Date();
  ngo.logAudit("Suspended", req.user, reason);
  const updated = await ngo.save();

  notify({
    recipient: updated.registeredBy,
    type: "NGO",
    title: `NGO suspended: ${updated.name}`,
    message: reason || "Your organization has been suspended by ASDMA.",
    createdBy: req.user._id,
    related: { relatedNgo: updated._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Lift a suspension
// @route   PATCH /api/ngos/:id/unsuspend
// @access  Private (Admin)
const unsuspendNgo = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.suspended = false;
  ngo.suspendedReason = "";
  ngo.suspendedBy = null;
  ngo.suspendedAt = null;
  ngo.logAudit("Suspension lifted", req.user);
  const updated = await ngo.save();
  res.json({ success: true, data: updated });
});

// @desc    Verify (or unverify) an NGO's submitted documents
// @route   PATCH /api/ngos/:id/verify-documents
// @access  Private (Admin) - Authority gets read-only visibility via GET /:id
const verifyNgoDocuments = asyncHandler(async (req, res) => {
  const { verified = true } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.documentsVerified = !!verified;
  ngo.documentsVerifiedBy = req.user._id;
  ngo.documentsVerifiedAt = new Date();
  ngo.logAudit(ngo.documentsVerified ? "Documents verified" : "Documents verification revoked", req.user);
  const updated = await ngo.save();
  res.json({ success: true, data: updated });
});

// @desc    Verify (or unverify) an NGO's identity
// @route   PATCH /api/ngos/:id/verify-identity
// @access  Private (Admin)
const verifyNgoIdentity = asyncHandler(async (req, res) => {
  const { verified = true } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.identityVerified = !!verified;
  ngo.identityVerifiedBy = req.user._id;
  ngo.identityVerifiedAt = new Date();
  ngo.logAudit(ngo.identityVerified ? "Identity verified" : "Identity verification revoked", req.user);
  const updated = await ngo.save();
  res.json({ success: true, data: updated });
});

// @desc    Assign an NGO to disaster(s), area(s) and/or shelter(s) (additive/removable)
// @route   PATCH /api/ngos/:id/assign
// @access  Private (Authority, Admin)
const assignNgo = asyncHandler(async (req, res) => {
  const { disasters = {}, areas = {}, shelters = {} } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const applySet = (currentArr, { add = [], remove = [] } = {}) => {
    const asStrings = currentArr.map((v) => v.toString());
    const removedSet = new Set(remove.map(String));
    let next = asStrings.filter((v) => !removedSet.has(v));
    add.forEach((v) => {
      if (!next.includes(String(v))) next.push(String(v));
    });
    return next;
  };

  ngo.assignedDisasters = applySet(ngo.assignedDisasters, disasters);
  ngo.assignedShelters = applySet(ngo.assignedShelters, shelters);

  if (areas.add || areas.remove) {
    const removedSet = new Set((areas.remove || []).map(String));
    let next = ngo.assignedAreas.filter((a) => !removedSet.has(a));
    (areas.add || []).forEach((a) => {
      if (!next.includes(a)) next.push(a);
    });
    ngo.assignedAreas = next;
  }

  ngo.logAudit("Assignment updated", req.user, "disasters/areas/shelters");
  const updated = await ngo.save();

  notify({
    recipient: updated.registeredBy,
    type: "NGO",
    title: `Assignment updated for ${updated.name}`,
    message: "Your organization's disaster, area or shelter assignments were updated by ASDMA.",
    createdBy: req.user._id,
    related: { relatedNgo: updated._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Manage (replace) the list of services an NGO offers
// @route   PUT /api/ngos/:id/services
// @access  Private (Admin, Authority [assigned])
const manageNgoServices = asyncHandler(async (req, res) => {
  const { services } = req.body;

  if (!Array.isArray(services)) {
    res.status(400);
    throw new Error("Please provide a services array");
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  if (!canManageAssigned(ngo, req.user)) {
    res.status(403);
    throw new Error("Not authorized to manage services for this NGO - it is not assigned to you");
  }

  ngo.services = services;
  ngo.logAudit("Services updated", req.user);
  const updated = await ngo.save();
  res.json({ success: true, data: updated });
});

// @desc    View resources belonging to an NGO (full detail for staff, limited fields otherwise)
// @route   GET /api/ngos/:id/resources
// @access  Private (Admin, Authority: full; Citizen, Volunteer: limited)
const getNgoResources = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const resources = await Resource.find({ ngo: ngo._id }).sort({ createdAt: -1 });

  if (isStaff(req.user)) {
    return res.json({ success: true, count: resources.length, data: resources });
  }

  // Limited view for Citizen/Volunteer: just what's available, not stock levels/location
  const limited = resources.map((r) => ({
    resourceId: r.resourceId,
    name: r.name,
    category: r.category,
    status: r.status,
    unit: r.unit,
  }));
  res.json({ success: true, count: limited.length, data: limited });
});

// @desc    View volunteers attached to an NGO
// @route   GET /api/ngos/:id/volunteers
// @access  Private (Admin: full; Authority: assigned NGOs only)
const getNgoVolunteers = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  if (!canManageAssigned(ngo, req.user)) {
    res.status(403);
    throw new Error("Not authorized to view volunteers for this NGO - it is not assigned to you");
  }

  const volunteers = await Volunteer.find({ ngo: ngo._id })
    .populate("user", "name email phone role")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: volunteers.length, data: volunteers });
});

// @desc    Create a task tied to an NGO's work
// @route   POST /api/ngos/:id/tasks
// @access  Private (Admin: any NGO; Authority: assigned NGOs only)
const createNgoTask = asyncHandler(async (req, res) => {
  const { title, description, category, priority, assignedTo, relatedDisaster, relatedShelter, dueDate, notes } =
    req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  // Unlike editing/services/volunteers, task creation isn't "assigned"-scoped in the
  // permission spec - any Authority or Admin may create a task for any NGO.
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
    relatedNgo: ngo._id,
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

// @desc    Request assistance from an NGO for a disaster
// @route   POST /api/ngos/:id/assistance
// @access  Private (Authority, Admin)
const requestNgoAssistance = asyncHandler(async (req, res) => {
  const { disaster = null, notes = "" } = req.body;

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.assistanceRequests.push({
    disaster,
    notes,
    requestedBy: req.user._id,
  });
  ngo.logAudit("Assistance requested", req.user, notes);
  const updated = await ngo.save();

  notify({
    recipient: updated.registeredBy,
    type: "NGO",
    title: `Assistance requested from ${updated.name}`,
    message: notes || "ASDMA has requested your organization's assistance.",
    createdBy: req.user._id,
    related: { relatedNgo: updated._id },
  });

  res.status(201).json({ success: true, data: updated });
});

// @desc    Accept or decline a previously-made assistance request
// @route   PATCH /api/ngos/:id/assistance/:requestId
// @access  Private (Authority, Admin)
const respondNgoAssistance = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["Accepted", "Declined"].includes(status)) {
    res.status(400);
    throw new Error("Status must be 'Accepted' or 'Declined'");
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const request = ngo.assistanceRequests.id(req.params.requestId);
  if (!request) {
    res.status(404);
    throw new Error("Assistance request not found");
  }

  request.status = status;
  request.respondedBy = req.user._id;
  request.respondedAt = new Date();
  ngo.logAudit(`Assistance request ${status.toLowerCase()}`, req.user);
  const updated = await ngo.save();

  res.json({ success: true, data: updated });
});

// @desc    File a field activity report about an NGO
// @route   POST /api/ngos/:id/activity-reports
// @access  Private (Admin, Authority, Volunteer)
const reportNgoActivity = asyncHandler(async (req, res) => {
  const { description, relatedDisaster = null } = req.body;

  if (!description) {
    res.status(400);
    throw new Error("Please provide a description of the activity");
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  ngo.activityReports.push({
    reportedBy: req.user._id,
    reportedByRole: req.user.role,
    description,
    relatedDisaster,
  });
  const updated = await ngo.save();

  res.status(201).json({ success: true, data: updated.activityReports[updated.activityReports.length - 1] });
});

// @desc    Rate/review an NGO (one rating per user; re-rating replaces the previous one)
// @route   POST /api/ngos/:id/ratings
// @access  Private (any authenticated role)
const rateNgo = asyncHandler(async (req, res) => {
  const { rating, review = "" } = req.body;
  const numRating = Number(rating);

  if (!numRating || numRating < 1 || numRating > 5) {
    res.status(400);
    throw new Error("Rating must be a number between 1 and 5");
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const existing = ngo.ratings.find((r) => r.user.toString() === req.user._id.toString());
  if (existing) {
    existing.rating = numRating;
    existing.review = review;
    existing.createdAt = new Date();
  } else {
    ngo.ratings.push({ user: req.user._id, rating: numRating, review });
  }

  const updated = await ngo.save();
  res.status(201).json({ success: true, data: ratingSummary(updated) });
});

// @desc    View an NGO's performance (campaigns/donations/tasks/ratings)
// @route   GET /api/ngos/:id/performance
// @access  Private (Admin, Authority: full; Volunteer: limited; Citizen: not authorized)
const getNgoPerformance = asyncHandler(async (req, res) => {
  if (req.user.role === "Citizen") {
    res.status(403);
    throw new Error("Not authorized to view NGO performance");
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const [tasks, ratings] = [
    await Task.find({ relatedNgo: ngo._id }).select("status"),
    ratingSummary(ngo),
  ];
  const completedTasks = tasks.filter((t) => t.status === "Completed").length;
  const taskCompletionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : null;

  if (req.user.role === "Volunteer") {
    return res.json({
      success: true,
      data: { ...ratings, taskCompletionRate },
    });
  }

  const [withStatsData] = await withStats([ngo]);
  res.json({
    success: true,
    data: {
      ...ratings,
      taskCompletionRate,
      taskCount: tasks.length,
      campaignCount: withStatsData.campaignCount,
      totalRaised: withStatsData.totalRaised,
      totalDonors: withStatsData.totalDonors,
      activityReportCount: ngo.activityReports.length,
    },
  });
});

// @desc    Send a notification to an NGO's registrant
// @route   POST /api/ngos/:id/notify
// @access  Private (Admin, Authority)
const sendNgoNotification = asyncHandler(async (req, res) => {
  const { title, message = "" } = req.body;
  if (!title) {
    res.status(400);
    throw new Error("Please provide a notification title");
  }

  const ngo = await NGO.findById(req.params.id);
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  notify({
    recipient: ngo.registeredBy,
    type: "NGO",
    title,
    message,
    createdBy: req.user._id,
    related: { relatedNgo: ngo._id },
  });

  res.status(201).json({ success: true, message: "Notification sent" });
});

// @desc    View an NGO's audit/history log (Admin: full; Authority: limited)
// @route   GET /api/ngos/:id/audit
// @access  Private (Admin, Authority)
const getNgoAudit = asyncHandler(async (req, res) => {
  if (!isStaff(req.user)) {
    res.status(403);
    throw new Error("Not authorized to view NGO audit history");
  }

  const ngo = await NGO.findById(req.params.id)
    .select("auditLog")
    .populate("auditLog.performedBy", "name role");
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const sorted = [...ngo.auditLog].sort((a, b) => b.createdAt - a.createdAt);

  if (isAdmin(req.user)) {
    return res.json({ success: true, count: sorted.length, data: sorted });
  }

  // Authority gets a limited view: most recent entries only, no free-text notes
  const limited = sorted.slice(0, 15).map(({ action, performedBy, performedByRole, createdAt }) => ({
    action,
    performedBy,
    performedByRole,
    createdAt,
  }));
  res.json({ success: true, count: limited.length, data: limited });
});

// @desc    Generate a consolidated report for an NGO (performance + assignment + status)
// @route   GET /api/ngos/:id/report
// @access  Private (Admin, Authority)
const generateNgoReport = asyncHandler(async (req, res) => {
  const ngo = await NGO.findById(req.params.id)
    .populate("registeredBy", "name email")
    .populate("assignedAuthorities", "name email")
    .populate("assignedDisasters", "disasterId type location")
    .populate("assignedShelters", "shelterId name location");
  if (!ngo) {
    res.status(404);
    throw new Error("NGO not found");
  }

  const [withStatsData] = await withStats([ngo]);
  const tasks = await Task.find({ relatedNgo: ngo._id }).select("status");
  const completedTasks = tasks.filter((t) => t.status === "Completed").length;
  const volunteerCount = await Volunteer.countDocuments({ ngo: ngo._id });
  const resourceCount = await Resource.countDocuments({ ngo: ngo._id });

  res.json({
    success: true,
    data: {
      ngo: {
        ngoId: ngo.ngoId,
        name: ngo.name,
        type: ngo.type,
        status: ngo.status,
        isActive: ngo.isActive,
        suspended: ngo.suspended,
        documentsVerified: ngo.documentsVerified,
        identityVerified: ngo.identityVerified,
        registeredBy: ngo.registeredBy,
      },
      assignment: {
        authorities: ngo.assignedAuthorities,
        disasters: ngo.assignedDisasters,
        shelters: ngo.assignedShelters,
        areas: ngo.assignedAreas,
      },
      performance: {
        ...ratingSummary(ngo),
        campaignCount: withStatsData.campaignCount,
        totalRaised: withStatsData.totalRaised,
        totalDonors: withStatsData.totalDonors,
        taskCount: tasks.length,
        completedTasks,
        taskCompletionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : null,
        volunteerCount,
        resourceCount,
        activityReportCount: ngo.activityReports.length,
      },
      generatedAt: new Date(),
      generatedBy: { id: req.user._id, name: req.user.name, role: req.user.role },
    },
  });
});

// @desc    Dashboard stats - counts by status/type
// @route   GET /api/ngos/stats/summary
// @access  Private (Authority, Admin)
const getNgoStats = asyncHandler(async (req, res) => {
  const [byStatus, byType, total, suspendedCount] = await Promise.all([
    NGO.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    NGO.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
    NGO.countDocuments(),
    NGO.countDocuments({ suspended: true }),
  ]);

  res.json({ success: true, data: { total, byStatus, byType, suspendedCount } });
});

module.exports = {
  registerNgo,
  getNgos,
  getNgoById,
  updateNgo,
  updateNgoStatus,
  deleteNgo,
  deactivateNgo,
  suspendNgo,
  unsuspendNgo,
  verifyNgoDocuments,
  verifyNgoIdentity,
  assignNgo,
  manageNgoServices,
  getNgoResources,
  getNgoVolunteers,
  createNgoTask,
  requestNgoAssistance,
  respondNgoAssistance,
  reportNgoActivity,
  rateNgo,
  getNgoPerformance,
  sendNgoNotification,
  getNgoAudit,
  generateNgoReport,
  getNgoStats,
};
