const { body } = require("express-validator");
const validate = require("../middleware/validate");

const createCampaignRules = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("ngo").isMongoId().withMessage("A valid ngo id is required"),
  body("target").isFloat({ gt: 0 }).withMessage("Target amount must be greater than 0"),
  body("description").optional().isString().trim(),
  body("location").optional().isString().trim(),
  body("deadline").optional().isISO8601().withMessage("deadline must be a valid date"),
  body("bankDetails").optional().isString().trim(),
  body("relatedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDisaster must be a valid id"),
  validate,
];

const updateCampaignRules = [
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
  body("target").optional().isFloat({ gt: 0 }).withMessage("Target amount must be greater than 0"),
  body("description").optional().isString().trim(),
  body("location").optional().isString().trim(),
  body("deadline").optional().isISO8601().withMessage("deadline must be a valid date"),
  body("bankDetails").optional().isString().trim(),
  validate,
];

const approveCampaignRules = [
  body("decision").isIn(["Approved", "Rejected"]).withMessage("decision must be 'Approved' or 'Rejected'"),
  validate,
];

const closeCampaignRules = [
  body("outcome").optional().isIn(["Completed", "Cancelled"]).withMessage("outcome must be 'Completed' or 'Cancelled'"),
  validate,
];

const suspendCampaignRules = [
  body("reason").optional().isString().trim(),
  validate,
];

module.exports = {
  createCampaignRules,
  updateCampaignRules,
  approveCampaignRules,
  closeCampaignRules,
  suspendCampaignRules,
};
