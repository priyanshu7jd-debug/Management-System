const asyncHandler = require("express-async-handler");
const RoadBlock = require("../models/RoadBlock");
const MapActivityLog = require("../models/MapActivityLog");
const { SCOPE } = require("../config/mapPermissions");

// @desc    Report or mark a road as blocked - "Mark road blocked"
//          Citizen/Volunteer scope is REPORT: they can only create a
//          "Reported" entry. Admin/Authority (FULL) can create it directly
//          as "Confirmed".
// @route   POST /api/map/road-blocks
// @access  Private
const reportRoadBlock = asyncHandler(async (req, res) => {
  const { location, district, coordinates, reason, description } = req.body;

  if (!location) {
    res.status(400);
    throw new Error("Please provide a location");
  }

  const status = req.mapScope === SCOPE.FULL ? "Confirmed" : "Reported";

  const block = await RoadBlock.create({
    location,
    district,
    coordinates,
    reason,
    description,
    status,
    reportedBy: req.user._id,
    confirmedBy: status === "Confirmed" ? req.user._id : undefined,
  });

  await MapActivityLog.record({
    action: status === "Confirmed" ? "road_block_marked" : "road_block_reported",
    entityType: "RoadBlock",
    entityId: block._id,
    district: block.district,
    user: req.user,
  });

  res.status(201).json({ success: true, data: block });
});

// @desc    List road blocks - "View blocked roads" (full for every role)
// @route   GET /api/map/road-blocks?district=&status=
// @access  Private
const getRoadBlocks = asyncHandler(async (req, res) => {
  const { district, status } = req.query;

  const filter = {};
  if (district) filter.district = district;
  if (status) filter.status = status;

  const blocks = await RoadBlock.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, count: blocks.length, data: blocks });
});

// @desc    Get a single road block
// @route   GET /api/map/road-blocks/:id
// @access  Private
const getRoadBlockById = asyncHandler(async (req, res) => {
  const block = await RoadBlock.findById(req.params.id);
  if (!block) {
    res.status(404);
    throw new Error("Road block not found");
  }
  res.json({ success: true, data: block });
});

// @desc    Confirm a reported road block (promotes Reported -> Confirmed)
// @route   PATCH /api/map/road-blocks/:id/confirm
// @access  Private (Admin, Authority)
const confirmRoadBlock = asyncHandler(async (req, res) => {
  const block = await RoadBlock.findById(req.params.id);
  if (!block) {
    res.status(404);
    throw new Error("Road block not found");
  }

  block.status = "Confirmed";
  block.confirmedBy = req.user._id;
  const updated = await block.save();

  res.json({ success: true, data: updated });
});

// @desc    Clear a road block once the road is passable again
// @route   PATCH /api/map/road-blocks/:id/clear
// @access  Private (Admin, Authority)
const clearRoadBlock = asyncHandler(async (req, res) => {
  const block = await RoadBlock.findById(req.params.id);
  if (!block) {
    res.status(404);
    throw new Error("Road block not found");
  }

  block.status = "Cleared";
  block.clearedBy = req.user._id;
  const updated = await block.save();

  await MapActivityLog.record({
    action: "road_block_cleared",
    entityType: "RoadBlock",
    entityId: block._id,
    district: block.district,
    user: req.user,
  });

  res.json({ success: true, data: updated });
});

// @desc    Delete a road block record
// @route   DELETE /api/map/road-blocks/:id
// @access  Private (Admin)
const deleteRoadBlock = asyncHandler(async (req, res) => {
  const block = await RoadBlock.findById(req.params.id);
  if (!block) {
    res.status(404);
    throw new Error("Road block not found");
  }
  await block.deleteOne();
  res.json({ success: true, message: "Road block deleted" });
});

module.exports = {
  reportRoadBlock,
  getRoadBlocks,
  getRoadBlockById,
  confirmRoadBlock,
  clearRoadBlock,
  deleteRoadBlock,
};
