const { body } = require("express-validator");
const validate = require("../middleware/validate");

const CATEGORIES = ["Food", "Water", "Medical", "Clothing", "Bedding", "Equipment", "Other"];

const createResourceRules = [
  body("name").trim().notEmpty().withMessage("Resource name is required"),
  body("quantity").isFloat({ min: 0 }).withMessage("Quantity must be a non-negative number"),
  body("category").optional().isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(", ")}`),
  body("unit").optional().isString().trim(),
  body("lowStockThreshold").optional().isFloat({ min: 0 }).withMessage("lowStockThreshold must be non-negative"),
  body("shelter").optional({ checkFalsy: true }).isMongoId().withMessage("shelter must be a valid id"),
  body("disaster").optional({ checkFalsy: true }).isMongoId().withMessage("disaster must be a valid id"),
  validate,
];

const updateResourceRules = [
  body("name").optional().trim().notEmpty().withMessage("Resource name cannot be empty"),
  body("quantity").optional().isFloat({ min: 0 }).withMessage("Quantity must be a non-negative number"),
  body("category").optional().isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(", ")}`),
  body("unit").optional().isString().trim(),
  body("lowStockThreshold").optional().isFloat({ min: 0 }).withMessage("lowStockThreshold must be non-negative"),
  body("shelter").optional({ checkFalsy: true }).isMongoId().withMessage("shelter must be a valid id"),
  body("disaster").optional({ checkFalsy: true }).isMongoId().withMessage("disaster must be a valid id"),
  validate,
];

const adjustQuantityRules = [
  body("change").isFloat().withMessage("change must be a number (positive to add, negative to deduct)"),
  validate,
];

module.exports = { createResourceRules, updateResourceRules, adjustQuantityRules };
