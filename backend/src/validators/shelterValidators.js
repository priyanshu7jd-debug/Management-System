const { body, query, param } = require("express-validator");
const validate = require("../middleware/validate");

const createShelterRules = [
  body("name").trim().notEmpty().withMessage("Shelter name is required"),
  body("location").trim().notEmpty().withMessage("Location is required"),
  body("capacity").isInt({ min: 0 }).withMessage("Capacity must be a non-negative integer"),
  body("coordinates.lat").optional().isFloat({ min: -90, max: 90 }).withMessage("lat must be between -90 and 90"),
  body("coordinates.lng").optional().isFloat({ min: -180, max: 180 }).withMessage("lng must be between -180 and 180"),
  body("contactPerson").optional().isString().trim(),
  body("contactPhone").optional().isString().trim(),
  validate,
];

const updateShelterRules = [
  body("name").optional().trim().notEmpty().withMessage("Shelter name cannot be empty"),
  body("location").optional().trim().notEmpty().withMessage("Location cannot be empty"),
  body("capacity").optional().isInt({ min: 0 }).withMessage("Capacity must be a non-negative integer"),
  body("coordinates.lat").optional().isFloat({ min: -90, max: 90 }).withMessage("lat must be between -90 and 90"),
  body("coordinates.lng").optional().isFloat({ min: -180, max: 180 }).withMessage("lng must be between -180 and 180"),
  body("status").optional().isIn(["Active", "Full", "Closed"]).withMessage("Invalid status"),
  body("contactPerson").optional().isString().trim(),
  body("contactPhone").optional().isString().trim(),
  validate,
];

const updateOccupancyRules = [
  body("currentOccupancy").isInt({ min: 0 }).withMessage("currentOccupancy must be a non-negative integer"),
  validate,
];

const nearbyQueryRules = [
  query("lat").isFloat({ min: -90, max: 90 }).withMessage("lat must be a number between -90 and 90"),
  query("lng").isFloat({ min: -180, max: 180 }).withMessage("lng must be a number between -180 and 180"),
  query("maxDistance").optional().isInt({ min: 1 }).withMessage("maxDistance must be a positive integer (meters)"),
  validate,
];

const approveShelterRules = [
  body("decision").isIn(["Approved", "Rejected"]).withMessage("decision must be 'Approved' or 'Rejected'"),
  validate,
];

const requestDeletionRules = [
  body("reason").optional().isString().trim(),
  validate,
];

const citizenIdRules = [
  body("citizenId").notEmpty().withMessage("citizenId is required").isMongoId().withMessage("citizenId must be a valid id"),
  body("notes").optional().isString().trim(),
  validate,
];

const assignShelterRules = [
  body("citizenId").notEmpty().withMessage("citizenId is required").isMongoId().withMessage("citizenId must be a valid id"),
  body("notes").optional().isString().trim(),
  validate,
];

const transferCitizenRules = [
  body("citizenId").notEmpty().withMessage("citizenId is required").isMongoId().withMessage("citizenId must be a valid id"),
  body("toShelterId").notEmpty().withMessage("toShelterId is required").isMongoId().withMessage("toShelterId must be a valid id"),
  body("reason").optional().isString().trim(),
  validate,
];

const addShelterResourceRules = [
  body("name").trim().notEmpty().withMessage("Resource name is required"),
  body("category").isIn(["Food", "Water", "Medical"]).withMessage("category must be Food, Water or Medical"),
  body("quantity").isInt({ min: 0 }).withMessage("quantity must be a non-negative integer"),
  body("unit").optional().isString().trim(),
  body("lowStockThreshold").optional().isInt({ min: 0 }),
  body("notes").optional().isString().trim(),
  validate,
];

const updateShelterResourceRules = [
  body("quantity").optional().isInt({ min: 0 }).withMessage("quantity must be a non-negative integer"),
  body("notes").optional().isString().trim(),
  validate,
];

const updateFacilitiesRules = [
  body("food").optional().isBoolean(),
  body("water").optional().isBoolean(),
  body("medical").optional().isBoolean(),
  body("bedding").optional().isBoolean(),
  validate,
];

const assignVolunteerRules = [
  param("volunteerId").isMongoId().withMessage("volunteerId must be a valid id"),
  validate,
];

const createShelterTaskRules = [
  body("title").trim().notEmpty().withMessage("Task title is required"),
  body("description").optional().isString().trim(),
  body("priority").optional().isIn(["Low", "Medium", "High", "Critical"]),
  body("assignedTo").optional().isMongoId().withMessage("assignedTo must be a valid id"),
  body("dueDate").optional().isISO8601().withMessage("dueDate must be a valid date"),
  validate,
];

const reportShelterProblemRules = [
  body("description").trim().notEmpty().withMessage("Please describe the problem"),
  body("category")
    .optional()
    .isIn(["Facility", "Food", "Water", "Medical", "Safety", "Overcrowding", "Other"])
    .withMessage("Invalid category"),
  body("severity").optional().isIn(["Low", "Medium", "High", "Critical"]),
  validate,
];

const resolveShelterProblemRules = [
  body("status").isIn(["In Progress", "Resolved"]).withMessage("status must be 'In Progress' or 'Resolved'"),
  body("resolutionNotes").optional().isString().trim(),
  validate,
];

const sendShelterAlertRules = [
  body("title").trim().notEmpty().withMessage("Alert title is required"),
  body("type").optional().isIn(["Flood", "Cyclone", "Earthquake", "Landslide", "Fire", "Accident", "Other"]),
  body("priority").optional().isIn(["Low", "Medium", "High", "Critical"]),
  body("description").optional().isString().trim(),
  validate,
];

module.exports = {
  createShelterRules,
  updateShelterRules,
  updateOccupancyRules,
  nearbyQueryRules,
  approveShelterRules,
  requestDeletionRules,
  citizenIdRules,
  assignShelterRules,
  transferCitizenRules,
  addShelterResourceRules,
  updateShelterResourceRules,
  updateFacilitiesRules,
  assignVolunteerRules,
  createShelterTaskRules,
  reportShelterProblemRules,
  resolveShelterProblemRules,
  sendShelterAlertRules,
};
