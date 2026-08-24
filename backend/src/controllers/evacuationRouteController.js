const asyncHandler = require("express-async-handler");
const EvacuationRoute = require("../models/EvacuationRoute");
const MapActivityLog = require("../models/MapActivityLog");

// @desc    Create an evacuation route - "Create evacuation zone" (Admin, Authority)
// @route   POST /api/map/evacuation-routes
// @access  Private (Admin, Authority)
const createEvacuationRoute = asyncHandler(async (req, res) => {
  const { name, district, from, to, path, relatedDisaster, notes } = req.body;

  if (!name || !from || !to) {
    res.status(400);
    throw new Error("Please provide a name, from point and to point");
  }

  const route = await EvacuationRoute.create({
    name,
    district,
    from,
    to,
    path,
    relatedDisaster,
    notes,
    createdBy: req.user._id,
  });

  await MapActivityLog.record({
    action: "evacuation_route_created",
    entityType: "EvacuationRoute",
    entityId: route._id,
    district: route.district,
    user: req.user,
  });

  res.status(201).json({ success: true, data: route });
});

// @desc    List evacuation routes - "View evacuation routes" (full for every role)
// @route   GET /api/map/evacuation-routes?district=&status=
// @access  Private
const getEvacuationRoutes = asyncHandler(async (req, res) => {
  const { district, status } = req.query;

  const filter = {};
  if (district) filter.district = district;
  if (status) filter.status = status;

  const routes = await EvacuationRoute.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, count: routes.length, data: routes });
});

// @desc    Get a single evacuation route
// @route   GET /api/map/evacuation-routes/:id
// @access  Private
const getEvacuationRouteById = asyncHandler(async (req, res) => {
  const route = await EvacuationRoute.findById(req.params.id);
  if (!route) {
    res.status(404);
    throw new Error("Evacuation route not found");
  }
  res.json({ success: true, data: route });
});

// @desc    Update an evacuation route
// @route   PUT /api/map/evacuation-routes/:id
// @access  Private (Admin, Authority)
const updateEvacuationRoute = asyncHandler(async (req, res) => {
  const route = await EvacuationRoute.findById(req.params.id);
  if (!route) {
    res.status(404);
    throw new Error("Evacuation route not found");
  }

  const fields = ["name", "district", "from", "to", "path", "status", "relatedDisaster", "notes"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) route[field] = req.body[field];
  });

  const updated = await route.save();
  res.json({ success: true, data: updated });
});

// @desc    Mark the route's destination area as evacuated - "Mark area evacuated"
// @route   PATCH /api/map/evacuation-routes/:id/mark-evacuated
// @access  Private (Admin, Authority)
const markAreaEvacuated = asyncHandler(async (req, res) => {
  const route = await EvacuationRoute.findById(req.params.id);
  if (!route) {
    res.status(404);
    throw new Error("Evacuation route not found");
  }

  route.areaEvacuated = true;
  route.evacuatedAt = new Date();
  route.evacuatedBy = req.user._id;
  const updated = await route.save();

  await MapActivityLog.record({
    action: "area_marked_evacuated",
    entityType: "EvacuationRoute",
    entityId: route._id,
    district: route.district,
    user: req.user,
  });

  res.json({ success: true, data: updated });
});

// @desc    Delete an evacuation route
// @route   DELETE /api/map/evacuation-routes/:id
// @access  Private (Admin)
const deleteEvacuationRoute = asyncHandler(async (req, res) => {
  const route = await EvacuationRoute.findById(req.params.id);
  if (!route) {
    res.status(404);
    throw new Error("Evacuation route not found");
  }
  await route.deleteOne();
  res.json({ success: true, message: "Evacuation route deleted" });
});

module.exports = {
  createEvacuationRoute,
  getEvacuationRoutes,
  getEvacuationRouteById,
  updateEvacuationRoute,
  markAreaEvacuated,
  deleteEvacuationRoute,
};
