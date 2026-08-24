const { body } = require("express-validator");
const validate = require("../middleware/validate");

const pointRules = (field) => [
  body(`${field}.lat`).isFloat({ min: -90, max: 90 }).withMessage(`${field}.lat must be between -90 and 90`),
  body(`${field}.lng`).isFloat({ min: -180, max: 180 }).withMessage(`${field}.lng must be between -180 and 180`),
];

const createEvacuationRouteRules = [
  body("name").trim().notEmpty().withMessage("Route name is required"),
  ...pointRules("from"),
  ...pointRules("to"),
  body("path").optional().isArray().withMessage("path must be an array of {lat, lng} points"),
  body("district").optional().isString().trim(),
  validate,
];

const updateEvacuationRouteRules = [
  body("name").optional().trim().notEmpty().withMessage("Route name cannot be empty"),
  body("status").optional().isIn(["Active", "Blocked", "Closed"]).withMessage("Invalid status"),
  body("path").optional().isArray().withMessage("path must be an array of {lat, lng} points"),
  validate,
];

module.exports = { createEvacuationRouteRules, updateEvacuationRouteRules };
