const { body } = require("express-validator");
const validate = require("../middleware/validate");

const updateUserRoleRules = [
  body("role").isIn(["Citizen", "Authority", "Volunteer", "Admin"]).withMessage("Invalid role"),
  validate,
];

const updateUserStatusRules = [
  body("status").isIn(["Active", "Blocked"]).withMessage("Invalid status"),
  validate,
];

module.exports = { updateUserRoleRules, updateUserStatusRules };
