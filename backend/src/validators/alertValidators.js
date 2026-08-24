const { body } = require("express-validator");
const validate = require("../middleware/validate");

const ALERT_TYPES = ["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const createAlertRules = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("type").isIn(ALERT_TYPES).withMessage(`Type must be one of: ${ALERT_TYPES.join(", ")}`),
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("priority").optional().isIn(PRIORITIES).withMessage(`Priority must be one of: ${PRIORITIES.join(", ")}`),
  body("description").optional().isString().trim(),
  body("relatedDisaster").optional().isMongoId().withMessage("relatedDisaster must be a valid id"),
  validate,
];

const updateAlertRules = [
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
  body("type").optional().isIn(ALERT_TYPES).withMessage(`Type must be one of: ${ALERT_TYPES.join(", ")}`),
  body("location").optional().trim().notEmpty().withMessage("Location cannot be empty"),
  body("priority").optional().isIn(PRIORITIES).withMessage(`Priority must be one of: ${PRIORITIES.join(", ")}`),
  body("description").optional().isString().trim(),
  body("active").optional().isBoolean().withMessage("active must be true or false"),
  body("relatedDisaster").optional().isMongoId().withMessage("relatedDisaster must be a valid id"),
  validate,
];

module.exports = { createAlertRules, updateAlertRules };
