const { body, param } = require("express-validator");
const validate = require("../middleware/validate");

const registerNgoRules = [
  body("name").trim().notEmpty().withMessage("Organization name is required"),
  body("registrationNumber").trim().notEmpty().withMessage("Registration number is required"),
  body("contactEmail").trim().isEmail().withMessage("A valid contact email is required"),
  body("type").optional().isString().trim(),
  body("areaOfOperation").optional().isString().trim(),
  body("activities").optional().isString().trim(),
  body("contactPhone").optional().isString().trim(),
  body("website").optional().isString().trim(),
  body("bankName").optional().isString().trim(),
  body("ifsc").optional().isString().trim(),
  body("accountNumber").optional().isString().trim(),
  body("documents").optional().isArray().withMessage("documents must be an array of strings"),
  validate,
];

const updateNgoRules = [
  body("name").optional().trim().notEmpty().withMessage("Organization name cannot be empty"),
  body("registrationNumber").optional().trim().notEmpty().withMessage("Registration number cannot be empty"),
  body("contactEmail").optional().trim().isEmail().withMessage("Contact email must be valid"),
  body("type").optional().isString().trim(),
  body("areaOfOperation").optional().isString().trim(),
  body("activities").optional().isString().trim(),
  body("contactPhone").optional().isString().trim(),
  body("website").optional().isString().trim(),
  body("bankName").optional().isString().trim(),
  body("ifsc").optional().isString().trim(),
  body("accountNumber").optional().isString().trim(),
  body("documents").optional().isArray(),
  body("assignedAuthorities").optional().isArray(),
  validate,
];

const updateNgoStatusRules = [
  body("status").isIn(["Pending", "Approved", "Rejected"]).withMessage("status must be Pending, Approved or Rejected"),
  body("reviewNotes").optional().isString().trim(),
  validate,
];

const deactivateNgoRules = [
  body("isActive").optional().isBoolean().withMessage("isActive must be true or false"),
  validate,
];

const suspendNgoRules = [
  body("reason").optional().isString().trim(),
  validate,
];

const verifyRules = [
  body("verified").optional().isBoolean().withMessage("verified must be true or false"),
  validate,
];

const assignRangeRules = (field) => [
  body(field).optional().isObject(),
  body(`${field}.add`).optional().isArray(),
  body(`${field}.remove`).optional().isArray(),
];

const assignNgoRules = [
  ...assignRangeRules("disasters"),
  ...assignRangeRules("shelters"),
  ...assignRangeRules("areas"),
  validate,
];

const manageServicesRules = [
  body("services").isArray().withMessage("services must be an array"),
  body("services.*.name").if(body("services").exists()).trim().notEmpty().withMessage("Each service needs a name"),
  body("services.*.description").optional().isString().trim(),
  body("services.*.active").optional().isBoolean(),
  validate,
];

const createNgoTaskRules = [
  body("title").trim().notEmpty().withMessage("Task title is required"),
  body("description").optional().isString().trim(),
  body("category")
    .optional()
    .isIn(["Rescue", "Relief Distribution", "Medical", "Logistics", "Shelter Management", "Other"]),
  body("priority").optional().isIn(["Low", "Medium", "High", "Critical"]),
  body("assignedTo").optional().isMongoId(),
  body("relatedDisaster").optional().isMongoId(),
  body("relatedShelter").optional().isMongoId(),
  body("dueDate").optional().isISO8601(),
  body("notes").optional().isString().trim(),
  validate,
];

const requestAssistanceRules = [
  body("disaster").optional().isMongoId(),
  body("notes").optional().isString().trim(),
  validate,
];

const respondAssistanceRules = [
  param("requestId").isMongoId().withMessage("Invalid assistance request id"),
  body("status").isIn(["Accepted", "Declined"]).withMessage("status must be Accepted or Declined"),
  validate,
];

const reportActivityRules = [
  body("description").trim().notEmpty().withMessage("Please describe the activity"),
  body("relatedDisaster").optional().isMongoId(),
  validate,
];

const rateNgoRules = [
  body("rating").isInt({ min: 1, max: 5 }).withMessage("rating must be an integer between 1 and 5"),
  body("review").optional().isString().trim(),
  validate,
];

const sendNotificationRules = [
  body("title").trim().notEmpty().withMessage("Notification title is required"),
  body("message").optional().isString().trim(),
  validate,
];

module.exports = {
  registerNgoRules,
  updateNgoRules,
  updateNgoStatusRules,
  deactivateNgoRules,
  suspendNgoRules,
  verifyRules,
  assignNgoRules,
  manageServicesRules,
  createNgoTaskRules,
  requestAssistanceRules,
  respondAssistanceRules,
  reportActivityRules,
  rateNgoRules,
  sendNotificationRules,
};
