const { body } = require("express-validator");
const validate = require("../middleware/validate");

const registerVolunteerRules = [
  body("skills").optional().isArray().withMessage("skills must be an array of strings"),
  body("skills.*").optional().isString().trim(),
  body("district").optional().isString().trim(),
  body("availability").optional().isIn(["Available", "Unavailable"]).withMessage("Invalid availability"),
  validate,
];

const updateMyVolunteerProfileRules = [
  body("skills").optional().isArray().withMessage("skills must be an array of strings"),
  body("skills.*").optional().isString().trim(),
  body("district").optional().isString().trim(),
  body("availability").optional().isIn(["Available", "Unavailable"]).withMessage("Invalid availability"),
  validate,
];

const updateVolunteerStatusRules = [
  body("status").isIn(["Pending", "Approved", "Rejected", "Inactive"]).withMessage("Invalid status"),
  validate,
];

const assignVolunteerRules = [
  body("assignedDisaster").optional({ checkFalsy: true }).isMongoId().withMessage("assignedDisaster must be a valid id"),
  body("assignedShelter").optional({ checkFalsy: true }).isMongoId().withMessage("assignedShelter must be a valid id"),
  validate,
];

module.exports = {
  registerVolunteerRules,
  updateMyVolunteerProfileRules,
  updateVolunteerStatusRules,
  assignVolunteerRules,
};
