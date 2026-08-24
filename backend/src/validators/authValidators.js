const { body } = require("express-validator");
const validate = require("../middleware/validate");

const registerRules = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("role").optional().isIn(["Citizen", "Volunteer", "Authority"]).withMessage("Invalid role"),
  body("district").optional().isString().trim(),
  body("phone").optional().isString().trim(),
  validate,
];

const loginRules = [
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  validate,
];

const updateMeRules = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
  body("district").optional().isString().trim(),
  body("phone").optional().isString().trim(),
  validate,
];

const updatePasswordRules = [
  body("currentPassword").notEmpty().withMessage("Current password is required"),
  body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  validate,
];

module.exports = { registerRules, loginRules, updateMeRules, updatePasswordRules };
