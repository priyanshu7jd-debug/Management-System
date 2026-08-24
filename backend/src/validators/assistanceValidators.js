const { body } = require("express-validator");
const validate = require("../middleware/validate");

const CATEGORIES = ["Medical", "Housing", "Livelihood", "Food", "Other"];

const createAssistanceRequestRules = [
  body("reason").trim().notEmpty().withMessage("Please describe why assistance is needed"),
  body("amountRequested").isFloat({ gt: 0 }).withMessage("amountRequested must be greater than 0"),
  body("category").optional().isIn(CATEGORIES).withMessage(`category must be one of: ${CATEGORIES.join(", ")}`),
  body("relatedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDisaster must be a valid id"),
  body("relatedShelter").optional({ checkFalsy: true }).isMongoId().withMessage("relatedShelter must be a valid id"),
  body("relatedCampaign").optional({ checkFalsy: true }).isMongoId().withMessage("relatedCampaign must be a valid id"),
  validate,
];

const uploadDocumentsRules = [
  body("documents").isArray({ min: 1 }).withMessage("documents must be a non-empty array"),
  body("documents.*.url").notEmpty().withMessage("Each document requires a url"),
  validate,
];

const fieldVerifyRules = [body("notes").optional().isString().trim(), validate];

const verifyRules = [validate];

const approveRules = [body("notes").optional().isString().trim(), validate];

const rejectRules = [body("reason").trim().notEmpty().withMessage("Please provide a rejection reason"), validate];

const allocateRules = [
  body("amount").optional().isFloat({ gt: 0 }).withMessage("amount must be greater than 0"),
  body("campaignId").optional().isMongoId().withMessage("campaignId must be a valid id"),
  validate,
];

module.exports = {
  createAssistanceRequestRules,
  uploadDocumentsRules,
  fieldVerifyRules,
  verifyRules,
  approveRules,
  rejectRules,
  allocateRules,
};
