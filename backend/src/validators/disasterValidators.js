const { body, query } = require("express-validator");
const validate = require("../middleware/validate");

const DISASTER_TYPES = ["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Pending", "Verified", "In Progress", "Resolved", "Rejected"];

const createDisasterRules = [
  body("type").isIn(DISASTER_TYPES).withMessage(`Type must be one of: ${DISASTER_TYPES.join(", ")}`),
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("coordinates.lat").optional().isFloat({ min: -90, max: 90 }).withMessage("lat must be between -90 and 90"),
  body("coordinates.lng").optional().isFloat({ min: -180, max: 180 }).withMessage("lng must be between -180 and 180"),
  body("severity").optional().isIn(SEVERITIES).withMessage(`Severity must be one of: ${SEVERITIES.join(", ")}`),
  body("description").optional().isString().trim(),
  validate,
];

const updateDisasterRules = [
  body("type").optional().isIn(DISASTER_TYPES).withMessage(`Type must be one of: ${DISASTER_TYPES.join(", ")}`),
  body("location").optional().trim().notEmpty().withMessage("Location cannot be empty"),
  body("coordinates.lat").optional().isFloat({ min: -90, max: 90 }).withMessage("lat must be between -90 and 90"),
  body("coordinates.lng").optional().isFloat({ min: -180, max: 180 }).withMessage("lng must be between -180 and 180"),
  body("severity").optional().isIn(SEVERITIES).withMessage(`Severity must be one of: ${SEVERITIES.join(", ")}`),
  body("status").optional().isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(", ")}`),
  body("description").optional().isString().trim(),
  validate,
];

const updateDisasterStatusRules = [
  body("status").optional().isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(", ")}`),
  body("team").optional().isString().trim(),
  validate,
];

const nearbyQueryRules = [
  query("lat").isFloat({ min: -90, max: 90 }).withMessage("lat must be a number between -90 and 90"),
  query("lng").isFloat({ min: -180, max: 180 }).withMessage("lng must be a number between -180 and 180"),
  query("maxDistance").optional().isInt({ min: 1 }).withMessage("maxDistance must be a positive integer (meters)"),
  validate,
];

const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const rejectIncidentRules = [
  body("reason").optional().isString().trim(),
  validate,
];

const changePriorityRules = [
  body("priority").isIn(PRIORITIES).withMessage(`Priority must be one of: ${PRIORITIES.join(", ")}`),
  validate,
];

const assignAuthorityRules = [
  body("authorityId").notEmpty().withMessage("authorityId is required").isMongoId().withMessage("authorityId must be a valid id"),
  validate,
];

const assignVolunteerRules = [
  body("volunteerId").notEmpty().withMessage("volunteerId is required").isMongoId().withMessage("volunteerId must be a valid id"),
  validate,
];

const assignNgoRules = [
  body("ngoId").notEmpty().withMessage("ngoId is required").isMongoId().withMessage("ngoId must be a valid id"),
  validate,
];

const addNoteRules = [
  body("note").trim().notEmpty().withMessage("Note text is required"),
  validate,
];

const escalateRules = [
  body("reason").optional().isString().trim(),
  validate,
];

const resolveRules = [
  body("notes").optional().isString().trim(),
  validate,
];

const reopenRules = [
  body("reason").trim().notEmpty().withMessage("A reason is required to reopen or request reopening"),
  validate,
];

module.exports = {
  createDisasterRules,
  updateDisasterRules,
  updateDisasterStatusRules,
  nearbyQueryRules,
  rejectIncidentRules,
  changePriorityRules,
  assignAuthorityRules,
  assignVolunteerRules,
  assignNgoRules,
  addNoteRules,
  escalateRules,
  resolveRules,
  reopenRules,
};
