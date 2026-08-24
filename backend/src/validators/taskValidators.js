const { body } = require("express-validator");
const validate = require("../middleware/validate");

const CATEGORIES = ["Rescue", "Relief Distribution", "Medical", "Logistics", "Shelter Management", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Pending", "In Progress", "Completed", "Cancelled"];

const createTaskRules = [
  body("title").trim().notEmpty().withMessage("Task title is required"),
  body("category").optional().isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(", ")}`),
  body("priority").optional().isIn(PRIORITIES).withMessage(`Priority must be one of: ${PRIORITIES.join(", ")}`),
  body("assignedTo").optional({ checkFalsy: true }).isMongoId().withMessage("assignedTo must be a valid id"),
  body("relatedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDisaster must be a valid id"),
  body("relatedShelter").optional({ checkFalsy: true }).isMongoId().withMessage("relatedShelter must be a valid id"),
  body("dueDate").optional({ checkFalsy: true }).isISO8601().withMessage("dueDate must be a valid date"),
  body("description").optional().isString().trim(),
  body("notes").optional().isString().trim(),
  validate,
];

const updateTaskRules = [
  body("title").optional().trim().notEmpty().withMessage("Task title cannot be empty"),
  body("category").optional().isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(", ")}`),
  body("priority").optional().isIn(PRIORITIES).withMessage(`Priority must be one of: ${PRIORITIES.join(", ")}`),
  body("assignedTo").optional({ checkFalsy: true }).isMongoId().withMessage("assignedTo must be a valid id"),
  body("relatedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDisaster must be a valid id"),
  body("relatedShelter").optional({ checkFalsy: true }).isMongoId().withMessage("relatedShelter must be a valid id"),
  body("dueDate").optional({ checkFalsy: true }).isISO8601().withMessage("dueDate must be a valid date"),
  body("description").optional().isString().trim(),
  body("notes").optional().isString().trim(),
  validate,
];

const updateTaskStatusRules = [
  body("status").isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(", ")}`),
  validate,
];

module.exports = { createTaskRules, updateTaskRules, updateTaskStatusRules };
