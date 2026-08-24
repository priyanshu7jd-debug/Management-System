const { body } = require("express-validator");
const validate = require("../middleware/validate");

const sendMapAlertRules = [
  body("title").trim().notEmpty().withMessage("Alert title is required"),
  body("type")
    .isIn(["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"])
    .withMessage("Invalid alert type"),
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("priority").optional().isIn(["Low", "Medium", "High", "Critical"]).withMessage("Invalid priority"),
  validate,
];

const overrideDisasterRiskRules = [
  body("value").isFloat({ min: 0, max: 100 }).withMessage("value must be between 0 and 100"),
  body("reason").optional().isString().trim(),
  validate,
];

module.exports = { sendMapAlertRules, overrideDisasterRiskRules };
