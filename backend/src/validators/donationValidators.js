const { body } = require("express-validator");
const validate = require("../middleware/validate");

const PAYMENT_METHODS = ["UPI", "Bank Transfer", "Card", "Cash", "Other"];
const STATUSES = ["Pending", "Received", "Utilized", "Cancelled"];

const createDonationRules = [
  body("donorName").trim().notEmpty().withMessage("Donor name is required"),
  body("type").isIn(["Cash", "Kind"]).withMessage("Type must be Cash or Kind"),
  body("donorEmail").optional({ checkFalsy: true }).isEmail().withMessage("donorEmail must be a valid email"),
  body("donorPhone").optional().isString().trim(),
  // Cross-field rules mirror the model's own pre-save validation, so the client
  // gets a clear 400 instead of a generic Mongoose ValidationError
  body("amount")
    .if(body("type").equals("Cash"))
    .isFloat({ gt: 0 })
    .withMessage("Cash donations require an amount greater than 0"),
  body("paymentMethod").optional().isIn(PAYMENT_METHODS).withMessage(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`),
  body("itemName")
    .if(body("type").equals("Kind"))
    .trim()
    .notEmpty()
    .withMessage("In-kind donations require an itemName"),
  body("quantity")
    .if(body("type").equals("Kind"))
    .isFloat({ gt: 0 })
    .withMessage("In-kind donations require a quantity greater than 0"),
  body("relatedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDisaster must be a valid id"),
  body("relatedShelter").optional({ checkFalsy: true }).isMongoId().withMessage("relatedShelter must be a valid id"),
  body("relatedCampaign").optional({ checkFalsy: true }).isMongoId().withMessage("relatedCampaign must be a valid id"),
  body("isAnonymous").optional().isBoolean().withMessage("isAnonymous must be true or false"),
  validate,
];

const updateDonationRules = [
  body("donorName").optional().trim().notEmpty().withMessage("Donor name cannot be empty"),
  body("type").optional().isIn(["Cash", "Kind"]).withMessage("Type must be Cash or Kind"),
  body("donorEmail").optional({ checkFalsy: true }).isEmail().withMessage("donorEmail must be a valid email"),
  body("amount").optional().isFloat({ min: 0 }).withMessage("amount must be non-negative"),
  body("paymentMethod").optional().isIn(PAYMENT_METHODS).withMessage(`paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`),
  body("quantity").optional().isFloat({ min: 0 }).withMessage("quantity must be non-negative"),
  body("relatedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("relatedDisaster must be a valid id"),
  body("relatedShelter").optional({ checkFalsy: true }).isMongoId().withMessage("relatedShelter must be a valid id"),
  body("relatedCampaign").optional({ checkFalsy: true }).isMongoId().withMessage("relatedCampaign must be a valid id"),
  validate,
];

const updateDonationStatusRules = [
  body("status").isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(", ")}`),
  validate,
];

module.exports = { createDonationRules, updateDonationRules, updateDonationStatusRules };
