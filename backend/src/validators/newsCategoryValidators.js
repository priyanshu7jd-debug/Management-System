const { body } = require("express-validator");
const validate = require("../middleware/validate");

const createCategoryRules = [
  body("name").trim().notEmpty().withMessage("Category name is required"),
  body("description").optional().isString().trim(),
  body("active").optional().isBoolean().withMessage("active must be true or false"),
  validate,
];

const updateCategoryRules = [
  body("name").optional().trim().notEmpty().withMessage("Category name cannot be empty"),
  body("description").optional().isString().trim(),
  body("active").optional().isBoolean().withMessage("active must be true or false"),
  validate,
];

module.exports = { createCategoryRules, updateCategoryRules };
