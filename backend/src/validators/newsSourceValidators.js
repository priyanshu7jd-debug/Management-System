const { body } = require("express-validator");
const validate = require("../middleware/validate");

const SOURCE_TYPES = ["Government", "NGO", "Media", "International", "Other"];

const createSourceRules = [
  body("name").trim().notEmpty().withMessage("Source name is required"),
  body("url").optional().isString().trim(),
  body("type").optional().isIn(SOURCE_TYPES).withMessage(`Type must be one of: ${SOURCE_TYPES.join(", ")}`),
  body("active").optional().isBoolean().withMessage("active must be true or false"),
  validate,
];

const updateSourceRules = [
  body("name").optional().trim().notEmpty().withMessage("Source name cannot be empty"),
  body("url").optional().isString().trim(),
  body("type").optional().isIn(SOURCE_TYPES).withMessage(`Type must be one of: ${SOURCE_TYPES.join(", ")}`),
  body("active").optional().isBoolean().withMessage("active must be true or false"),
  validate,
];

module.exports = { createSourceRules, updateSourceRules };
