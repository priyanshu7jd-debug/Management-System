const { body } = require("express-validator");
const validate = require("../middleware/validate");

const createTeamRules = [
  body("name").trim().notEmpty().withMessage("Team name is required"),
  body("description").optional().isString().trim(),
  body("leader").optional({ checkFalsy: true }).isMongoId().withMessage("leader must be a valid id"),
  body("members").optional().isArray().withMessage("members must be an array of volunteer ids"),
  body("members.*").optional().isMongoId().withMessage("Each member must be a valid volunteer id"),
  body("assignedDisaster").optional({ checkFalsy: true }).isMongoId(),
  body("assignedShelter").optional({ checkFalsy: true }).isMongoId(),
  body("district").optional().isString().trim(),
  body("notes").optional().isString().trim(),
  validate,
];

const updateTeamRules = [
  body("name").optional().trim().notEmpty().withMessage("Team name cannot be empty"),
  body("description").optional().isString().trim(),
  body("leader").optional({ checkFalsy: true }).isMongoId().withMessage("leader must be a valid id"),
  body("assignedDisaster").optional({ checkFalsy: true }).isMongoId(),
  body("assignedShelter").optional({ checkFalsy: true }).isMongoId(),
  body("district").optional().isString().trim(),
  body("status").optional().isIn(["Active", "Disbanded"]).withMessage("Invalid status"),
  body("notes").optional().isString().trim(),
  validate,
];

const addMembersRules = [
  body("members").isArray({ min: 1 }).withMessage("Provide at least one volunteer id"),
  body("members.*").isMongoId().withMessage("Each member must be a valid volunteer id"),
  validate,
];

const notifyTeamRules = [
  body("title").trim().notEmpty().withMessage("Provide a message title"),
  body("message").optional().isString().trim(),
  validate,
];

module.exports = {
  createTeamRules,
  updateTeamRules,
  addMembersRules,
  notifyTeamRules,
};
