const { body } = require("express-validator");
const validate = require("../middleware/validate");

const createRiskZoneRules = [
  body("name").trim().notEmpty().withMessage("Zone name is required"),
  body("center.lat").isFloat({ min: -90, max: 90 }).withMessage("center.lat must be between -90 and 90"),
  body("center.lng").isFloat({ min: -180, max: 180 }).withMessage("center.lng must be between -180 and 180"),
  body("radiusMeters").optional().isFloat({ min: 0 }).withMessage("radiusMeters must be non-negative"),
  body("riskLevel").optional().isIn(["Low", "Medium", "High", "Critical"]).withMessage("Invalid risk level"),
  body("district").optional().isString().trim(),
  validate,
];

const updateRiskZoneRules = [
  body("name").optional().trim().notEmpty().withMessage("Zone name cannot be empty"),
  body("center.lat").optional().isFloat({ min: -90, max: 90 }).withMessage("center.lat must be between -90 and 90"),
  body("center.lng").optional().isFloat({ min: -180, max: 180 }).withMessage("center.lng must be between -180 and 180"),
  body("radiusMeters").optional().isFloat({ min: 0 }).withMessage("radiusMeters must be non-negative"),
  body("riskLevel").optional().isIn(["Low", "Medium", "High", "Critical"]).withMessage("Invalid risk level"),
  body("status").optional().isIn(["Active", "Monitoring", "Cleared"]).withMessage("Invalid status"),
  validate,
];

const overrideScoreRules = [
  body("value").isFloat({ min: 0, max: 100 }).withMessage("value must be between 0 and 100"),
  body("reason").optional().isString().trim(),
  validate,
];

module.exports = { createRiskZoneRules, updateRiskZoneRules, overrideScoreRules };
