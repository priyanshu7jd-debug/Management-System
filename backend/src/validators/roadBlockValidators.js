const { body } = require("express-validator");
const validate = require("../middleware/validate");

const reportRoadBlockRules = [
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("reason")
    .optional()
    .isIn(["Flooding", "Debris", "Landslide", "Accident", "Structural Damage", "Other"])
    .withMessage("Invalid reason"),
  body("coordinates.lat").optional().isFloat({ min: -90, max: 90 }).withMessage("lat must be between -90 and 90"),
  body("coordinates.lng").optional().isFloat({ min: -180, max: 180 }).withMessage("lng must be between -180 and 180"),
  body("district").optional().isString().trim(),
  validate,
];

module.exports = { reportRoadBlockRules };
