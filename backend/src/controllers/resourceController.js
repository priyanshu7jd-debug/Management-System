const asyncHandler = require("express-async-handler");
const Resource = require("../models/Resource");

// @desc    Add a new resource / inventory item
// @route   POST /api/resources
// @access  Private (Authority, Admin)
const createResource = asyncHandler(async (req, res) => {
  const { name, category, quantity, unit, lowStockThreshold, shelter, disaster, location, notes } = req.body;

  if (!name || quantity === undefined) {
    res.status(400);
    throw new Error("Please provide resource name and quantity");
  }

  const resource = await Resource.create({
    name,
    category,
    quantity,
    unit,
    lowStockThreshold,
    shelter,
    disaster,
    location,
    notes,
    addedBy: req.user._id,
  });

  res.status(201).json({ success: true, data: resource });
});

// @desc    Get all resources (supports filtering + pagination)
// @route   GET /api/resources?category=&status=&shelter=&disaster=&search=&page=&limit=
// @access  Private
const getResources = asyncHandler(async (req, res) => {
  const { category, status, shelter, disaster, search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (shelter) filter.shelter = shelter;
  if (disaster) filter.disaster = disaster;
  if (search) filter.name = { $regex: search, $options: "i" };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [resources, total] = await Promise.all([
    Resource.find(filter)
      .populate("addedBy", "name role")
      .populate("shelter", "shelterId name location")
      .populate("disaster", "disasterId type location")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Resource.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: resources.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: resources,
  });
});

// @desc    Get a single resource by ID
// @route   GET /api/resources/:id
// @access  Private
const getResourceById = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id)
    .populate("addedBy", "name role")
    .populate("shelter", "shelterId name location")
    .populate("disaster", "disasterId type location");

  if (!resource) {
    res.status(404);
    throw new Error("Resource not found");
  }

  res.json({ success: true, data: resource });
});

// @desc    Update full resource details
// @route   PUT /api/resources/:id
// @access  Private (Authority, Admin)
const updateResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) {
    res.status(404);
    throw new Error("Resource not found");
  }

  const fields = [
    "name",
    "category",
    "quantity",
    "unit",
    "lowStockThreshold",
    "shelter",
    "disaster",
    "location",
    "notes",
  ];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) resource[field] = req.body[field];
  });

  const updated = await resource.save();
  res.json({ success: true, data: updated });
});

// @desc    Adjust stock (increment for restock, decrement for usage/distribution)
// @route   PATCH /api/resources/:id/quantity
// @access  Private (Authority, Admin)
const adjustResourceQuantity = asyncHandler(async (req, res) => {
  const { change } = req.body;

  if (change === undefined || isNaN(change)) {
    res.status(400);
    throw new Error("Please provide a numeric 'change' value (positive to add, negative to deduct)");
  }

  const resource = await Resource.findById(req.params.id);
  if (!resource) {
    res.status(404);
    throw new Error("Resource not found");
  }

  const newQuantity = resource.quantity + Number(change);
  if (newQuantity < 0) {
    res.status(400);
    throw new Error("Resulting quantity cannot be negative");
  }

  resource.quantity = newQuantity;
  const updated = await resource.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete a resource
// @route   DELETE /api/resources/:id
// @access  Private (Admin)
const deleteResource = asyncHandler(async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) {
    res.status(404);
    throw new Error("Resource not found");
  }

  await resource.deleteOne();
  res.json({ success: true, message: "Resource deleted" });
});

// @desc    Dashboard stats - counts by category/status, total quantity
// @route   GET /api/resources/stats/summary
// @access  Private (Authority, Admin)
const getResourceStats = asyncHandler(async (req, res) => {
  const [byCategory, byStatus, totals, total] = await Promise.all([
    Resource.aggregate([{ $group: { _id: "$category", count: { $sum: 1 }, quantity: { $sum: "$quantity" } } }]),
    Resource.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Resource.aggregate([{ $group: { _id: null, totalQuantity: { $sum: "$quantity" } } }]),
    Resource.countDocuments(),
  ]);

  res.json({
    success: true,
    data: {
      total,
      byCategory,
      byStatus,
      totalQuantity: totals[0]?.totalQuantity || 0,
    },
  });
});

module.exports = {
  createResource,
  getResources,
  getResourceById,
  updateResource,
  adjustResourceQuantity,
  deleteResource,
  getResourceStats,
};
