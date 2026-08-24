const asyncHandler = require("express-async-handler");
const NewsSource = require("../models/NewsSource");

// @desc    List the official source directory
// @route   GET /api/news-sources?active=&type=
// @access  Private (any authenticated role - needed when citing a source on a news item)
const getSources = asyncHandler(async (req, res) => {
  const { active, type } = req.query;
  const filter = {};
  if (active !== undefined && active !== "all") filter.active = active === "true";
  if (type) filter.type = type;

  const sources = await NewsSource.find(filter).sort({ name: 1 });
  res.json({ success: true, count: sources.length, data: sources });
});

// @desc    Add a source to the master directory
// @route   POST /api/news-sources
// @access  Private (Admin)
const createSource = asyncHandler(async (req, res) => {
  const { name, url, type, active } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Source name is required");
  }

  const exists = await NewsSource.findOne({ name: name.trim() });
  if (exists) {
    res.status(400);
    throw new Error("A source with this name already exists");
  }

  const source = await NewsSource.create({ name, url, type, active, createdBy: req.user._id });
  res.status(201).json({ success: true, data: source });
});

// @desc    Update a directory source
// @route   PUT /api/news-sources/:id
// @access  Private (Admin)
const updateSource = asyncHandler(async (req, res) => {
  const source = await NewsSource.findById(req.params.id);
  if (!source) {
    res.status(404);
    throw new Error("Source not found");
  }

  const fields = ["name", "url", "type", "active"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) source[field] = req.body[field];
  });

  const updated = await source.save();
  res.json({ success: true, data: updated });
});

// @desc    Remove a directory source
// @route   DELETE /api/news-sources/:id
// @access  Private (Admin)
const deleteSource = asyncHandler(async (req, res) => {
  const source = await NewsSource.findById(req.params.id);
  if (!source) {
    res.status(404);
    throw new Error("Source not found");
  }

  await source.deleteOne();
  res.json({ success: true, message: "Source deleted" });
});

module.exports = { getSources, createSource, updateSource, deleteSource };
