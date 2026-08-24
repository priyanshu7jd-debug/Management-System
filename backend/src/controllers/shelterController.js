const path = require("path");
const fs = require("fs");
const asyncHandler = require("express-async-handler");
const Shelter = require("../models/Shelter");
const ShelterOccupant = require("../models/ShelterOccupant");
const ShelterProblem = require("../models/ShelterProblem");
const ShelterActivityLog = require("../models/ShelterActivityLog");
const Resource = require("../models/Resource");
const Task = require("../models/Task");
const Volunteer = require("../models/Volunteer");
const Alert = require("../models/Alert");
const { UPLOAD_ROOT } = require("../middleware/uploadMiddleware");
const { notify, notifyMany } = require("../utils/notify");
const { SCOPE } = require("../config/shelterPermissions");
const { isShelterAssignedToVolunteer, getAssignedShelterId } = require("../middleware/shelterAccessMiddleware");

const loadShelterOr404 = async (id) => {
  const shelter = await Shelter.findById(id);
  if (!shelter) {
    const err = new Error("Shelter not found");
    err.statusCode = 404;
    throw err;
  }
  return shelter;
};

// ---------------------------------------------------------------------------
// View shelters / Add / Edit / Delete / Approve
// ---------------------------------------------------------------------------

// @desc    Register a new shelter - "Add shelter"
//          Admin-created shelters are auto-approved; Authority-created ones
//          start Pending until an Admin approves them ("Approve shelter").
// @route   POST /api/shelters
// @access  Private (Authority, Admin)
const createShelter = asyncHandler(async (req, res) => {
  const { name, location, coordinates, capacity, resources, contactPerson, contactPhone, relatedDisaster } = req.body;

  if (!name || !location || capacity === undefined) {
    res.status(400);
    throw new Error("Please provide shelter name, location and capacity");
  }

  const autoApproved = req.user.role === "Admin";

  const shelter = await Shelter.create({
    name,
    location,
    coordinates,
    capacity,
    resources,
    contactPerson,
    contactPhone,
    managedBy: req.user._id,
    relatedDisaster: relatedDisaster || null,
    approvalStatus: autoApproved ? "Approved" : "Pending",
    approvedBy: autoApproved ? req.user._id : null,
    approvedAt: autoApproved ? new Date() : null,
  });

  await ShelterActivityLog.record({
    action: "shelter_created",
    shelter: shelter._id,
    user: req.user,
    details: { autoApproved, relatedDisaster: relatedDisaster || null },
  });

  const populated = await shelter.populate("relatedDisaster", "disasterId type location");

  res.status(201).json({ success: true, data: populated });
});

// @desc    Find shelters near a point, closest first (uses the 2dsphere geo index)
// @route   GET /api/shelters/nearby?lat=&lng=&maxDistance=&status=&limit=
// @access  Public
const getNearbyShelters = asyncHandler(async (req, res) => {
  const { lat, lng, maxDistance = 10000, status, limit = 20 } = req.query;

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    res.status(400);
    throw new Error("Please provide numeric lat and lng query parameters");
  }

  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const maxDistanceNum = Math.min(parseInt(maxDistance, 10) || 10000, 200000); // cap at 200km

  const matchStage = { approvalStatus: "Approved" };
  if (status) matchStage.status = status;

  const shelters = await Shelter.aggregate([
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

  res.json({ success: true, count: shelters.length, data: shelters });
});

// @desc    Get all shelters (supports filtering + pagination) - "View shelters"
//          Full for every role. Non-staff callers only see Approved shelters;
//          Authority/Admin can filter by approvalStatus to see Pending ones.
// @route   GET /api/shelters?status=&approvalStatus=&search=&page=&limit=
// @access  Private (any authenticated role)
const getShelters = asyncHandler(async (req, res) => {
  const { status, approvalStatus, search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const isStaff = req.user && ["Authority", "Admin"].includes(req.user.role);
  if (isStaff) {
    if (approvalStatus) filter.approvalStatus = approvalStatus;
  } else {
    filter.approvalStatus = "Approved";
  }

  if (search) filter.location = { $regex: search, $options: "i" };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [shelters, total] = await Promise.all([
    Shelter.find(filter)
      .populate("managedBy", "name role")
      .populate("relatedDisaster", "disasterId type location")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Shelter.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: shelters.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: shelters,
  });
});

// @desc    Get a single shelter by ID
// @route   GET /api/shelters/:id
// @access  Private (any authenticated role)
const getShelterById = asyncHandler(async (req, res) => {
  const shelter = await Shelter.findById(req.params.id)
    .populate("managedBy", "name role")
    .populate("relatedDisaster", "disasterId type location");

  if (!shelter) {
    res.status(404);
    throw new Error("Shelter not found");
  }

  res.json({ success: true, data: shelter });
});

// @desc    Update full shelter details - "Edit shelter"
// @route   PUT /api/shelters/:id
// @access  Private (Authority, Admin)
const updateShelter = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  const fields = [
    "name",
    "location",
    "coordinates",
    "capacity",
    "resources",
    "contactPerson",
    "contactPhone",
    "status",
  ];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) shelter[field] = req.body[field];
  });

  const updated = await shelter.save();

  await ShelterActivityLog.record({
    action: "shelter_updated",
    shelter: shelter._id,
    user: req.user,
    details: { fields: Object.keys(req.body) },
  });

  res.json({ success: true, data: updated });
});

// @desc    Update capacity/occupancy count directly - "Manage capacity"
// @route   PATCH /api/shelters/:id/occupancy
// @access  Private (Authority, Admin)
const updateOccupancy = asyncHandler(async (req, res) => {
  const { currentOccupancy, capacity } = req.body;

  const shelter = await loadShelterOr404(req.params.id);
  await assertShelterInScope(shelter._id, req);

  // A Volunteer (ASSIGNED scope) may adjust the headcount at their own
  // shelter but never the total capacity - that stays Admin/Authority
  // (FULL) only, same as editShelter.
  if (capacity !== undefined && req.shelterScope !== SCOPE.FULL) {
    res.status(403);
    throw new Error("Only Admin/Authority can change a shelter's total capacity");
  }

  if (currentOccupancy !== undefined) {
    if (currentOccupancy < 0) {
      res.status(400);
      throw new Error("Occupancy cannot be negative");
    }
    shelter.currentOccupancy = currentOccupancy;
  }
  if (capacity !== undefined) {
    if (capacity < 0) {
      res.status(400);
      throw new Error("Capacity cannot be negative");
    }
    shelter.capacity = capacity;
  }

  const updated = await shelter.save();
  res.json({ success: true, data: updated });
});

// @desc    Approve or reject a Pending shelter - "Approve shelter"
// @route   PATCH /api/shelters/:id/approve
// @access  Private (Admin only)
const approveShelter = asyncHandler(async (req, res) => {
  const { decision } = req.body; // "Approved" | "Rejected"
  if (!["Approved", "Rejected"].includes(decision)) {
    res.status(400);
    throw new Error("decision must be 'Approved' or 'Rejected'");
  }

  const shelter = await loadShelterOr404(req.params.id);

  shelter.approvalStatus = decision;
  shelter.approvedBy = req.user._id;
  shelter.approvedAt = new Date();
  const updated = await shelter.save();

  await ShelterActivityLog.record({
    action: decision === "Approved" ? "shelter_approved" : "shelter_rejected",
    shelter: shelter._id,
    user: req.user,
  });

  await notify({
    recipient: shelter.managedBy,
    type: "Shelter",
    title: `Shelter ${decision.toLowerCase()}`,
    message: `Your shelter "${shelter.name}" was ${decision.toLowerCase()} by an administrator.`,
    createdBy: req.user._id,
    related: { relatedShelter: shelter._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Request that a shelter be deleted/deactivated - "Delete/deactivate
//          shelter" (Authority scope: REQUEST only, cannot delete directly)
// @route   POST /api/shelters/:id/request-delete
// @access  Private (Authority)
const requestShelterDeletion = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const shelter = await loadShelterOr404(req.params.id);

  shelter.deletionRequested = true;
  shelter.deletionRequestedBy = req.user._id;
  shelter.deletionRequestedAt = new Date();
  shelter.deletionRequestReason = reason || "";
  const updated = await shelter.save();

  await ShelterActivityLog.record({
    action: "shelter_deletion_requested",
    shelter: shelter._id,
    user: req.user,
    details: { reason },
  });

  res.json({ success: true, message: "Deletion request submitted for Admin review", data: updated });
});

// @desc    Delete a shelter - "Delete/deactivate shelter" (Admin only, direct)
// @route   DELETE /api/shelters/:id
// @access  Private (Admin)
const deleteShelter = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  await shelter.deleteOne();

  await ShelterActivityLog.record({
    action: "shelter_deleted",
    shelter: shelter._id,
    user: req.user,
  });

  res.json({ success: true, message: "Shelter deleted" });
});

// ---------------------------------------------------------------------------
// View reports/statistics
// ---------------------------------------------------------------------------

// @desc    Dashboard stats - counts by status, total capacity vs occupancy -
//          "View reports/statistics" (Admin/Authority full, Volunteer LIMITED
//          to their own assigned shelter, Citizen no access)
// @route   GET /api/shelters/stats/summary
// @access  Private (Admin, Authority, Volunteer-limited)
const getShelterStats = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.shelterScope === SCOPE.LIMITED) {
    const assignedId = await getAssignedShelterId(req.user);
    if (!assignedId) {
      return res.json({
        success: true,
        scope: req.shelterScope,
        data: { total: 0, byStatus: [], totalCapacity: 0, totalOccupancy: 0 },
      });
    }
    filter = { _id: assignedId };
  }

  const [byStatus, totals, total] = await Promise.all([
    Shelter.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Shelter.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalCapacity: { $sum: "$capacity" },
          totalOccupancy: { $sum: "$currentOccupancy" },
        },
      },
    ]),
    Shelter.countDocuments(filter),
  ]);

  res.json({
    success: true,
    scope: req.shelterScope,
    data: {
      total,
      byStatus,
      totalCapacity: totals[0]?.totalCapacity || 0,
      totalOccupancy: totals[0]?.totalOccupancy || 0,
    },
  });
});

// ---------------------------------------------------------------------------
// Images (facility photos) - unchanged behaviour, kept for compatibility
// ---------------------------------------------------------------------------

// @desc    Upload photos for a shelter (multipart/form-data, field "images", max 5)
// @route   POST /api/shelters/:id/images
// @access  Private (the managing user, or Authority/Admin)
const uploadShelterImages = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  const isManager = shelter.managedBy.toString() === req.user._id.toString();
  if (!isManager && !["Authority", "Admin"].includes(req.user.role)) {
    res.status(403);
    throw new Error("Not authorized to add images to this shelter");
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("Please attach at least one image");
  }

  const urls = req.files.map((file) => `/uploads/shelters/${file.filename}`);
  shelter.images.push(...urls);
  const updated = await shelter.save();

  res.status(201).json({ success: true, data: updated });
});

// @desc    Remove one photo from a shelter
// @route   DELETE /api/shelters/:id/images
// @access  Private (the managing user, or Authority/Admin)
const deleteShelterImage = asyncHandler(async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    res.status(400);
    throw new Error("Please provide the imageUrl to remove");
  }

  const shelter = await loadShelterOr404(req.params.id);

  const isManager = shelter.managedBy.toString() === req.user._id.toString();
  if (!isManager && !["Authority", "Admin"].includes(req.user.role)) {
    res.status(403);
    throw new Error("Not authorized to modify images on this shelter");
  }

  const hadImage = shelter.images.includes(imageUrl);
  shelter.images = shelter.images.filter((img) => img !== imageUrl);
  const updated = await shelter.save();

  if (hadImage) {
    const filename = path.basename(imageUrl);
    fs.unlink(path.join(UPLOAD_ROOT, "shelters", filename), () => {});
  }

  res.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// Citizen check-in/out, assignment, transfer
// ---------------------------------------------------------------------------

// Shared guard for the ASSIGNED-scope actions (citizenCheckInOut, assignShelter,
// manageFoodWater, manageMedicines): a Volunteer may only act on the shelter
// they are currently assigned to. Admin/Authority are always FULL and skip this.
const assertShelterInScope = asyncHandler(async (shelterId, req) => {
  if (req.shelterScope === SCOPE.FULL) return;
  if (req.shelterScope === SCOPE.ASSIGNED) {
    const inScope = await isShelterAssignedToVolunteer(shelterId, req.user);
    if (!inScope) {
      const err = new Error("You are not assigned to this shelter");
      err.statusCode = 403;
      throw err;
    }
    return;
  }
  // SELF (Citizen check-in/out) - any shelter may be looked at; the caller
  // is responsible for pinning citizenId to req.user._id afterwards.
  if (req.shelterScope === SCOPE.SELF) return;
  const err = new Error("You do not have access to this shelter");
  err.statusCode = 403;
  throw err;
});

// For SELF-scope actions (Citizen check-in/out): a citizen may only ever
// act on their own occupant record, no matter what citizenId the client
// sends. Admin/Authority/Volunteer keep using whatever citizenId they pass.
const resolveActingCitizenId = (req, bodyCitizenId) =>
  req.shelterScope === SCOPE.SELF ? req.user._id.toString() : bodyCitizenId;

// @desc    Assign a citizen to a shelter (before/without checking them in yet) -
//          "Assign shelter"
// @route   POST /api/shelters/:id/assign
// @access  Private (Admin, Authority, Volunteer-assigned)
const assignCitizenToShelter = asyncHandler(async (req, res) => {
  const { citizenId, notes } = req.body;
  if (!citizenId) {
    res.status(400);
    throw new Error("Please provide citizenId");
  }

  const shelter = await loadShelterOr404(req.params.id);
  await assertShelterInScope(shelter._id, req);

  const record = await ShelterOccupant.create({
    shelter: shelter._id,
    citizen: citizenId,
    status: "Assigned",
    assignedBy: req.user._id,
    notes: notes || "",
  });

  await notify({
    recipient: citizenId,
    type: "Shelter",
    title: "Shelter assigned",
    message: `You have been assigned to ${shelter.name} (${shelter.location}).`,
    createdBy: req.user._id,
    related: { relatedShelter: shelter._id },
  });

  res.status(201).json({ success: true, data: record });
});

// @desc    Check a citizen into a shelter - "Citizen check-in/out"
// @route   POST /api/shelters/:id/checkin
// @access  Private (Admin, Authority, Volunteer-assigned)
const checkInCitizen = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const citizenId = resolveActingCitizenId(req, req.body.citizenId);
  if (!citizenId) {
    res.status(400);
    throw new Error("Please provide citizenId");
  }

  const shelter = await loadShelterOr404(req.params.id);
  await assertShelterInScope(shelter._id, req);

  if (shelter.currentOccupancy >= shelter.capacity) {
    res.status(400);
    throw new Error("Shelter is at full capacity");
  }

  let record = await ShelterOccupant.findOne({
    shelter: shelter._id,
    citizen: citizenId,
    status: "Assigned",
  }).sort({ createdAt: -1 });

  if (record) {
    record.status = "CheckedIn";
    record.checkedInAt = new Date();
    record.checkedInBy = req.user._id;
    if (notes) record.notes = notes;
    await record.save();
  } else {
    record = await ShelterOccupant.create({
      shelter: shelter._id,
      citizen: citizenId,
      status: "CheckedIn",
      assignedBy: req.user._id,
      checkedInAt: new Date(),
      checkedInBy: req.user._id,
      notes: notes || "",
    });
  }

  shelter.currentOccupancy += 1;
  await shelter.save();

  await ShelterActivityLog.record({
    action: "citizen_checked_in",
    shelter: shelter._id,
    user: req.user,
    details: { citizenId },
  });

  res.status(201).json({ success: true, data: record });
});

// @desc    Check a citizen out of a shelter - "Citizen check-in/out"
// @route   POST /api/shelters/:id/checkout
// @access  Private (Admin, Authority, Volunteer-assigned)
const checkOutCitizen = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const citizenId = resolveActingCitizenId(req, req.body.citizenId);
  if (!citizenId) {
    res.status(400);
    throw new Error("Please provide citizenId");
  }

  const shelter = await loadShelterOr404(req.params.id);
  await assertShelterInScope(shelter._id, req);

  const record = await ShelterOccupant.findOne({
    shelter: shelter._id,
    citizen: citizenId,
    status: "CheckedIn",
  }).sort({ createdAt: -1 });

  if (!record) {
    res.status(404);
    throw new Error("No active check-in found for this citizen at this shelter");
  }

  record.status = "CheckedOut";
  record.checkedOutAt = new Date();
  record.checkedOutBy = req.user._id;
  if (notes) record.notes = notes;
  await record.save();

  shelter.currentOccupancy = Math.max(0, shelter.currentOccupancy - 1);
  await shelter.save();

  await ShelterActivityLog.record({
    action: "citizen_checked_out",
    shelter: shelter._id,
    user: req.user,
    details: { citizenId },
  });

  res.json({ success: true, data: record });
});

// @desc    Get the logged-in citizen's own current shelter status (which
//          shelter, if any, they're Assigned/CheckedIn at) - powers the
//          Citizen dashboard's self check-in/out card without them needing
//          to already know a shelter id. "Citizen check-in/out" (SELF).
// @route   GET /api/shelters/me/status
// @access  Private (Citizen; also works for any role, scoped to self)
const getMyShelterStatus = asyncHandler(async (req, res) => {
  const records = await ShelterOccupant.find({
    citizen: req.user._id,
    status: { $in: ["Assigned", "CheckedIn"] },
  })
    .populate("shelter", "shelterId name location capacity currentOccupancy status")
    .sort({ createdAt: -1 });

  res.json({ success: true, data: records });
});

// @desc    List occupant records for a shelter (roster, not just the count) -
//          supports "Citizen check-in/out" / "Assign shelter" views
// @route   GET /api/shelters/:id/occupants?status=
// @access  Private (Admin, Authority, Volunteer-assigned)
const getShelterOccupants = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);
  await assertShelterInScope(shelter._id, req);

  const filter = { shelter: shelter._id };
  if (req.query.status) filter.status = req.query.status;
  // SELF scope (Citizen) only ever sees their own occupant record(s) at
  // this shelter, never the full roster.
  if (req.shelterScope === SCOPE.SELF) filter.citizen = req.user._id;

  const occupants = await ShelterOccupant.find(filter)
    .populate("citizen", "name email phone")
    .populate("assignedBy checkedInBy checkedOutBy transferredBy", "name role")
    .populate("transferredTo", "shelterId name")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: occupants.length, data: occupants });
});

// @desc    Transfer a citizen from this shelter to another - "Transfer citizen"
// @route   POST /api/shelters/:id/transfer
// @access  Private (Admin, Authority)
const transferCitizen = asyncHandler(async (req, res) => {
  const { citizenId, toShelterId, reason } = req.body;
  if (!citizenId || !toShelterId) {
    res.status(400);
    throw new Error("Please provide citizenId and toShelterId");
  }

  const fromShelter = await loadShelterOr404(req.params.id);
  const toShelter = await loadShelterOr404(toShelterId);

  if (toShelter.currentOccupancy >= toShelter.capacity) {
    res.status(400);
    throw new Error("Destination shelter is at full capacity");
  }

  const activeRecord = await ShelterOccupant.findOne({
    shelter: fromShelter._id,
    citizen: citizenId,
    status: { $in: ["Assigned", "CheckedIn"] },
  }).sort({ createdAt: -1 });

  if (!activeRecord) {
    res.status(404);
    throw new Error("This citizen has no active record at the source shelter");
  }

  const wasCheckedIn = activeRecord.status === "CheckedIn";

  activeRecord.status = "TransferredOut";
  activeRecord.transferredTo = toShelter._id;
  activeRecord.transferredBy = req.user._id;
  activeRecord.transferredAt = new Date();
  activeRecord.transferReason = reason || "";
  await activeRecord.save();

  const newRecord = await ShelterOccupant.create({
    shelter: toShelter._id,
    citizen: citizenId,
    status: wasCheckedIn ? "CheckedIn" : "Assigned",
    assignedBy: req.user._id,
    checkedInAt: wasCheckedIn ? new Date() : null,
    checkedInBy: wasCheckedIn ? req.user._id : null,
    notes: `Transferred from ${fromShelter.name}${reason ? `: ${reason}` : ""}`,
  });

  if (wasCheckedIn) {
    fromShelter.currentOccupancy = Math.max(0, fromShelter.currentOccupancy - 1);
    toShelter.currentOccupancy += 1;
    await Promise.all([fromShelter.save(), toShelter.save()]);
  }

  await Promise.all([
    ShelterActivityLog.record({
      action: "citizen_transferred_out",
      shelter: fromShelter._id,
      user: req.user,
      details: { citizenId, toShelterId },
    }),
    ShelterActivityLog.record({
      action: "citizen_transferred_in",
      shelter: toShelter._id,
      user: req.user,
      details: { citizenId, fromShelterId: fromShelter._id },
    }),
    notify({
      recipient: citizenId,
      type: "Shelter",
      title: "Shelter transfer",
      message: `You have been transferred from ${fromShelter.name} to ${toShelter.name}.`,
      createdBy: req.user._id,
      related: { relatedShelter: toShelter._id },
    }),
  ]);

  res.status(201).json({ success: true, data: { closedRecord: activeRecord, newRecord } });
});

// ---------------------------------------------------------------------------
// Food/water/medicine supplies (backed by the shared Resource model)
// ---------------------------------------------------------------------------

const RESOURCE_CATEGORY_ACTION = {
  Food: "manageFoodWater",
  Water: "manageFoodWater",
  Medical: "manageMedicines",
};

// @desc    List a shelter's supplies (food/water/medical/etc)
// @route   GET /api/shelters/:id/resources?category=
// @access  Private (Admin, Authority, Volunteer-assigned)
const getShelterResources = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  // Any of the supply scopes (manageFoodWater/manageMedicines) is enough to
  // view the shelter's supplies, not just add/edit them.
  const canView =
    req.shelterScope === SCOPE.FULL ||
    (req.shelterScope === SCOPE.ASSIGNED && (await isShelterAssignedToVolunteer(shelter._id, req.user)));
  if (!canView) {
    res.status(403);
    throw new Error("You do not have access to this shelter's supplies");
  }

  const filter = { shelter: shelter._id };
  if (req.query.category) filter.category = req.query.category;

  const resources = await Resource.find(filter).populate("addedBy", "name role").sort({ createdAt: -1 });
  res.json({ success: true, count: resources.length, data: resources });
});

// @desc    Add or restock a supply item at a shelter - "Manage food/water" /
//          "Manage medicines" depending on category
// @route   POST /api/shelters/:id/resources
// @access  Private (Admin, Authority, Volunteer-assigned - category-gated)
const addShelterResource = asyncHandler(async (req, res) => {
  const { name, category, quantity, unit, lowStockThreshold, notes } = req.body;

  if (!name || !category || quantity === undefined) {
    res.status(400);
    throw new Error("Please provide name, category and quantity");
  }

  const requiredAction = RESOURCE_CATEGORY_ACTION[category];
  if (!requiredAction) {
    res.status(400);
    throw new Error("category must be Food, Water or Medical for shelter supply management");
  }

  const shelter = await loadShelterOr404(req.params.id);
  await assertShelterInScope(shelter._id, req);

  const resource = await Resource.create({
    name,
    category,
    quantity,
    unit,
    lowStockThreshold,
    shelter: shelter._id,
    addedBy: req.user._id,
    notes,
  });

  await ShelterActivityLog.record({
    action: "shelter_resource_added",
    shelter: shelter._id,
    user: req.user,
    details: { name, category, quantity },
  });

  res.status(201).json({ success: true, data: resource });
});

// @desc    Adjust the quantity of an existing supply item (restock/consume)
// @route   PATCH /api/shelters/:id/resources/:resourceId
// @access  Private (Admin, Authority, Volunteer-assigned - category-gated)
const updateShelterResource = asyncHandler(async (req, res) => {
  const { quantity, notes } = req.body;

  const shelter = await loadShelterOr404(req.params.id);
  const resource = await Resource.findOne({ _id: req.params.resourceId, shelter: shelter._id });
  if (!resource) {
    res.status(404);
    throw new Error("Supply item not found at this shelter");
  }

  const requiredAction = RESOURCE_CATEGORY_ACTION[resource.category];
  if (requiredAction) {
    await assertShelterInScope(shelter._id, req);
  }

  if (quantity !== undefined) {
    if (quantity < 0) {
      res.status(400);
      throw new Error("Quantity cannot be negative");
    }
    resource.quantity = quantity;
  }
  if (notes !== undefined) resource.notes = notes;

  const updated = await resource.save();
  res.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

// @desc    Toggle a shelter's facility flags (bedding/food/water/medical
//          availability) - "Manage shelter facilities" (Admin/Authority FULL
//          only; Volunteer's REPORT scope goes through reportShelterProblem
//          with category "Facility" instead of this endpoint)
// @route   PATCH /api/shelters/:id/facilities
// @access  Private (Admin, Authority)
const updateShelterFacilities = asyncHandler(async (req, res) => {
  const { food, water, medical, bedding } = req.body;

  const shelter = await loadShelterOr404(req.params.id);

  if (food !== undefined) shelter.resources.food = food;
  if (water !== undefined) shelter.resources.water = water;
  if (medical !== undefined) shelter.resources.medical = medical;
  if (bedding !== undefined) shelter.resources.bedding = bedding;

  const updated = await shelter.save();

  await ShelterActivityLog.record({
    action: "shelter_facilities_updated",
    shelter: shelter._id,
    user: req.user,
    details: req.body,
  });

  res.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// Volunteers: assign to a shelter, create/list shelter tasks
// ---------------------------------------------------------------------------

// @desc    Assign an approved Volunteer to work at this shelter - "Assign volunteers"
// @route   PATCH /api/shelters/:id/volunteers/:volunteerId/assign
// @access  Private (Admin, Authority)
const assignVolunteerToShelter = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  const volunteer = await Volunteer.findById(req.params.volunteerId);
  if (!volunteer) {
    res.status(404);
    throw new Error("Volunteer not found");
  }
  if (volunteer.status !== "Approved") {
    res.status(400);
    throw new Error("Only approved volunteers can be assigned");
  }

  volunteer.assignedShelter = shelter._id;
  const updated = await volunteer.save();

  await notify({
    recipient: volunteer.user,
    type: "Shelter",
    title: "Shelter assignment",
    message: `You have been assigned to volunteer at ${shelter.name}.`,
    createdBy: req.user._id,
    related: { relatedShelter: shelter._id },
  });

  await ShelterActivityLog.record({
    action: "volunteer_assigned",
    shelter: shelter._id,
    user: req.user,
    details: { volunteerId: volunteer._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    List volunteers currently assigned to this shelter
// @route   GET /api/shelters/:id/volunteers
// @access  Private (Admin, Authority)
const getShelterVolunteers = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  const volunteers = await Volunteer.find({ assignedShelter: shelter._id }).populate(
    "user",
    "name email phone"
  );

  res.json({ success: true, count: volunteers.length, data: volunteers });
});

// @desc    Create a task for a volunteer at this shelter - "Create volunteer tasks"
// @route   POST /api/shelters/:id/tasks
// @access  Private (Admin, Authority)
const createShelterVolunteerTask = asyncHandler(async (req, res) => {
  const { title, description, priority, assignedTo, dueDate } = req.body;

  if (!title) {
    res.status(400);
    throw new Error("Please provide a task title");
  }

  const shelter = await loadShelterOr404(req.params.id);

  const task = await Task.create({
    title,
    description,
    category: "Shelter Management",
    priority,
    assignedTo: assignedTo || null,
    assignedBy: req.user._id,
    relatedShelter: shelter._id,
    dueDate,
  });

  if (assignedTo) {
    await notify({
      recipient: assignedTo,
      type: "Task",
      title: "New shelter task assigned",
      message: `You've been assigned "${title}" at ${shelter.name}.`,
      createdBy: req.user._id,
      related: { relatedTask: task._id, relatedShelter: shelter._id },
    });
  }

  res.status(201).json({ success: true, data: task });
});

// @desc    List every task created for this shelter - part of "Create
//          volunteer tasks" (Admin/Authority only). A Volunteer sees their
//          own shelter tasks via the existing GET /api/tasks/me instead.
// @route   GET /api/shelters/:id/tasks
// @access  Private (Admin, Authority)
const getShelterTasks = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  const tasks = await Task.find({ relatedShelter: shelter._id })
    .populate("assignedTo assignedBy", "name role")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: tasks.length, data: tasks });
});

// ---------------------------------------------------------------------------
// Problems: report (everyone) / resolve (Admin, Authority)
// ---------------------------------------------------------------------------

// @desc    Report a problem at a shelter - "Report shelter problem" (full for
//          every role). A Volunteer flagging a facility issue under their
//          REPORT-only "Manage shelter facilities" scope also comes through
//          here with category "Facility".
// @route   POST /api/shelters/:id/problems
// @access  Private (any authenticated role)
const reportShelterProblem = asyncHandler(async (req, res) => {
  const { category, description, severity } = req.body;

  if (!description) {
    res.status(400);
    throw new Error("Please describe the problem");
  }

  const shelter = await loadShelterOr404(req.params.id);

  const problem = await ShelterProblem.create({
    shelter: shelter._id,
    category,
    description,
    severity,
    reportedBy: req.user._id,
  });

  await notifyMany(
    [shelter.managedBy].filter(Boolean),
    {
      type: "Shelter",
      title: "Shelter problem reported",
      message: `${req.user.name} reported a problem at ${shelter.name}: ${description}`,
      createdBy: req.user._id,
      related: { relatedShelter: shelter._id },
    }
  );

  res.status(201).json({ success: true, data: problem });
});

// @desc    List problems reported at a shelter - Admin/Authority full,
//          Volunteer sees problems at their assigned shelter, Citizen sees
//          only the ones they personally reported.
// @route   GET /api/shelters/:id/problems?status=
// @access  Private (any authenticated role, response scoped by role)
const getShelterProblems = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  const filter = { shelter: shelter._id };
  if (req.query.status) filter.status = req.query.status;

  if (req.user.role === "Citizen") {
    filter.reportedBy = req.user._id;
  } else if (req.user.role === "Volunteer") {
    const assignedId = await getAssignedShelterId(req.user);
    if (!assignedId || assignedId !== shelter._id.toString()) {
      filter.reportedBy = req.user._id;
    }
  }

  const problems = await ShelterProblem.find(filter)
    .populate("reportedBy resolvedBy", "name role")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: problems.length, data: problems });
});

// @desc    Resolve (or move to In Progress) a reported shelter problem -
//          "Resolve shelter problems"
// @route   PATCH /api/shelters/:id/problems/:problemId/resolve
// @access  Private (Admin, Authority)
const resolveShelterProblem = asyncHandler(async (req, res) => {
  const { status, resolutionNotes } = req.body;
  const allowed = ["In Progress", "Resolved"];
  if (!status || !allowed.includes(status)) {
    res.status(400);
    throw new Error(`status must be one of: ${allowed.join(", ")}`);
  }

  const shelter = await loadShelterOr404(req.params.id);
  const problem = await ShelterProblem.findOne({ _id: req.params.problemId, shelter: shelter._id });
  if (!problem) {
    res.status(404);
    throw new Error("Problem not found at this shelter");
  }

  problem.status = status;
  if (status === "Resolved") {
    problem.resolvedBy = req.user._id;
    problem.resolutionNotes = resolutionNotes || "";
  }
  const updated = await problem.save();

  await notify({
    recipient: problem.reportedBy,
    type: "Shelter",
    title: `Shelter problem ${status.toLowerCase()}`,
    message: `Your reported problem at ${shelter.name} is now "${status}".`,
    createdBy: req.user._id,
    related: { relatedShelter: shelter._id },
  });

  res.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

// @desc    Send an alert to everyone connected to this shelter (occupants,
//          assigned volunteers) - "Send shelter alerts"
// @route   POST /api/shelters/:id/alerts
// @access  Private (Admin, Authority)
const sendShelterAlert = asyncHandler(async (req, res) => {
  const { title, type, priority, description } = req.body;
  if (!title) {
    res.status(400);
    throw new Error("Please provide an alert title");
  }

  const shelter = await loadShelterOr404(req.params.id);

  const alert = await Alert.create({
    title,
    type: type || "Other",
    location: shelter.location,
    priority,
    description,
    issuedBy: req.user._id,
    shelterBased: true,
    relatedShelter: shelter._id,
  });

  const [occupants, volunteers] = await Promise.all([
    ShelterOccupant.find({ shelter: shelter._id, status: "CheckedIn" }).select("citizen"),
    Volunteer.find({ assignedShelter: shelter._id }).select("user"),
  ]);

  const recipientIds = [
    ...occupants.map((o) => o.citizen),
    ...volunteers.map((v) => v.user),
  ];

  await notifyMany(recipientIds, {
    type: "Shelter",
    title: `Shelter alert: ${title}`,
    message: description || "",
    createdBy: req.user._id,
    related: { relatedAlert: alert._id, relatedShelter: shelter._id },
  });

  await ShelterActivityLog.record({
    action: "shelter_alert_sent",
    shelter: shelter._id,
    user: req.user,
    details: { title, priority, recipientCount: recipientIds.length },
  });

  res.status(201).json({ success: true, data: alert });
});

// ---------------------------------------------------------------------------
// Audit / history
// ---------------------------------------------------------------------------

// @desc    View a shelter's activity log - "View audit/history" (Admin full,
//          Authority LIMITED to shelters they manage)
// @route   GET /api/shelters/:id/audit
// @access  Private (Admin, Authority-limited)
const getShelterAuditHistory = asyncHandler(async (req, res) => {
  const shelter = await loadShelterOr404(req.params.id);

  if (req.shelterScope === SCOPE.LIMITED && shelter.managedBy.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("You can only view audit history for shelters you manage");
  }

  const logs = await ShelterActivityLog.find({ shelter: shelter._id })
    .populate("performedBy", "name role")
    .sort({ createdAt: -1 })
    .limit(200);

  res.json({ success: true, scope: req.shelterScope, count: logs.length, data: logs });
});

module.exports = {
  createShelter,
  getShelters,
  getNearbyShelters,
  getShelterById,
  updateShelter,
  updateOccupancy,
  approveShelter,
  requestShelterDeletion,
  deleteShelter,
  getShelterStats,
  uploadShelterImages,
  deleteShelterImage,
  assignCitizenToShelter,
  checkInCitizen,
  checkOutCitizen,
  getMyShelterStatus,
  getShelterOccupants,
  transferCitizen,
  getShelterResources,
  addShelterResource,
  updateShelterResource,
  updateShelterFacilities,
  assignVolunteerToShelter,
  getShelterVolunteers,
  createShelterVolunteerTask,
  getShelterTasks,
  reportShelterProblem,
  getShelterProblems,
  resolveShelterProblem,
  sendShelterAlert,
  getShelterAuditHistory,
};
