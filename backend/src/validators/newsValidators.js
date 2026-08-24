const { body } = require("express-validator");
const validate = require("../middleware/validate");

const createNewsRules = [
  body("headline").trim().notEmpty().withMessage("Headline is required"),
  body("content").trim().notEmpty().withMessage("Content is required"),
  body("category").isMongoId().withMessage("category must be a valid category id"),
  body("region").trim().notEmpty().withMessage("Region is required"),
  body("summary").optional().isString().trim(),
  body("tags").optional().isArray().withMessage("tags must be an array"),
  body("relatedDisaster").optional().isMongoId().withMessage("relatedDisaster must be a valid id"),
  body("isEmergency").optional().isBoolean(),
  validate,
];

const updateNewsRules = [
  body("headline").optional().trim().notEmpty().withMessage("Headline cannot be empty"),
  body("content").optional().trim().notEmpty().withMessage("Content cannot be empty"),
  body("category").optional().isMongoId().withMessage("category must be a valid category id"),
  body("region").optional().trim().notEmpty().withMessage("Region cannot be empty"),
  body("summary").optional().isString().trim(),
  body("tags").optional().isArray().withMessage("tags must be an array"),
  body("relatedDisaster").optional().isMongoId().withMessage("relatedDisaster must be a valid id"),
  validate,
];

const assignNewsRules = [
  body("assignedTo").optional({ nullable: true }).isMongoId().withMessage("assignedTo must be a valid user id"),
  validate,
];

const rejectNewsRules = [body("reason").optional().isString().trim(), validate];

const disasterUpdateRules = [body("text").trim().notEmpty().withMessage("Update text is required"), validate];

const reviewUpdateRules = [
  body("status").isIn(["Approved", "Dismissed"]).withMessage("status must be Approved or Dismissed"),
  validate,
];

const sourceRules = [
  body("name").trim().notEmpty().withMessage("Source name is required"),
  body("url").optional().isString().trim(),
  validate,
];

const reportRules = [body("reason").trim().notEmpty().withMessage("Reason is required"), validate];

const reviewReportRules = [
  body("status").isIn(["Reviewed", "Dismissed"]).withMessage("status must be Reviewed or Dismissed"),
  validate,
];

const scheduleRules = [
  body("scheduledFor").isISO8601().withMessage("scheduledFor must be a valid date").toDate(),
  validate,
];

module.exports = {
  createNewsRules,
  updateNewsRules,
  assignNewsRules,
  rejectNewsRules,
  disasterUpdateRules,
  reviewUpdateRules,
  sourceRules,
  reportRules,
  reviewReportRules,
  scheduleRules,
};
