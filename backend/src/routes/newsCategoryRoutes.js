const express = require("express");
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/newsCategoryController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { createCategoryRules, updateCategoryRules } = require("../validators/newsCategoryValidators");

const router = express.Router();

router.use(protect); // every role needs to be logged in to see or use categories

router
  .route("/")
  .get(getCategories)
  .post(authorize("Admin"), createCategoryRules, createCategory);

router
  .route("/:id")
  .put(authorize("Admin"), updateCategoryRules, updateCategory)
  .delete(authorize("Admin"), deleteCategory);

module.exports = router;
