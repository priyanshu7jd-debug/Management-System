const { validationResult } = require("express-validator");

// Place this after a list of express-validator check(...)/body(...)/query(...) chains.
// Collects any failures and hands them to the app's existing centralized error
// handler, in the same { success: false, message } shape as every other error.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const message = errors
    .array({ onlyFirstError: true })
    .map((e) => `${e.path}: ${e.msg}`)
    .join(", ");

  res.status(400);
  next(new Error(message));
};

module.exports = validate;
