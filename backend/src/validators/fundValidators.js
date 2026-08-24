const { body } = require("express-validator");
const validate = require("../middleware/validate");

const adjustBalanceRules = [
  body("amount").isFloat({ gt: 0 }).withMessage("amount must be greater than 0"),
  body("direction").isIn(["credit", "debit"]).withMessage("direction must be 'credit' or 'debit'"),
  body("notes").optional().isString().trim(),
  validate,
];

const sendNotificationRules = [
  body("title").trim().notEmpty().withMessage("Please provide a notification title"),
  body("message").optional().isString().trim(),
  validate,
];

const reportMisuseRules = [
  body("description").trim().notEmpty().withMessage("Please describe the concern"),
  body("relatedCampaign").optional({ checkFalsy: true }).isMongoId().withMessage("relatedCampaign must be a valid id"),
  body("relatedDonation").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDonation must be a valid id"),
  body("relatedAssistanceRequest").optional({ checkFalsy: true }).isMongoId().withMessage("relatedAssistanceRequest must be a valid id"),
  validate,
];

const updateMisuseReportRules = [
  body("status").isIn(["Reviewing", "Resolved", "Dismissed"]).withMessage("Invalid status"),
  body("resolutionNotes").optional().isString().trim(),
  validate,
];

module.exports = { adjustBalanceRules, sendNotificationRules, reportMisuseRules, updateMisuseReportRules };
