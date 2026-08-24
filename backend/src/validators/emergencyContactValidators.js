const { body } = require("express-validator");
const validate = require("../middleware/validate");

const CATEGORIES = ["Police", "Fire", "Medical", "Disaster Management", "Relief", "Other"];

const createContactRules = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("number").trim().notEmpty().withMessage("Number is required"),
  body("category").optional().isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(", ")}`),
  body("order").optional().isInt().withMessage("order must be an integer"),
  validate,
];

const updateContactRules = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
  body("number").optional().trim().notEmpty().withMessage("Number cannot be empty"),
  body("category").optional().isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(", ")}`),
  body("order").optional().isInt().withMessage("order must be an integer"),
  validate,
];

module.exports = { createContactRules, updateContactRules };
