const asyncHandler = require("express-async-handler");
const NewsCategory = require("../models/NewsCategory");
const News = require("../models/News");

// @desc    List news categories
// @route   GET /api/news-categories?active=
// @access  Private (any authenticated role - needed for filters/authoring dropdowns)
const getCategories = asyncHandler(async (req, res) => {
  const { active } = req.query;
  const filter = {};
  if (active !== undefined && active !== "all") filter.active = active === "true";

  const categories = await NewsCategory.find(filter).sort({ name: 1 });
  res.json({ success: true, count: categories.length, data: categories });
});

// @desc    Create a news category
// @route   POST /api/news-categories
// @access  Private (Admin)
const createCategory = asyncHandler(async (req, res) => {
  const { name, description, active } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Category name is required");
  }

  const exists = await NewsCategory.findOne({ name: name.trim() });
  if (exists) {
    res.status(400);
    throw new Error("A category with this name already exists");
  }

  const category = await NewsCategory.create({
    name,
    description,
    active,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: category });
});

// @desc    Update a news category
// @route   PUT /api/news-categories/:id
// @access  Private (Admin)
const updateCategory = asyncHandler(async (req, res) => {
  const category = await NewsCategory.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  const fields = ["name", "description", "active"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) category[field] = req.body[field];
  });

  const updated = await category.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete a news category (blocked while any news item still uses it)
// @route   DELETE /api/news-categories/:id
// @access  Private (Admin)
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await NewsCategory.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  const inUse = await News.countDocuments({ category: category._id });
  if (inUse > 0) {
    res.status(400);
    throw new Error(`Cannot delete: ${inUse} news item(s) still use this category`);
  }

  await category.deleteOne();
  res.json({ success: true, message: "Category deleted" });
});

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
