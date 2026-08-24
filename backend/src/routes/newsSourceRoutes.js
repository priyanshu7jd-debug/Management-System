const express = require("express");
const {
  getSources,
  createSource,
  updateSource,
  deleteSource,
} = require("../controllers/newsSourceController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { createSourceRules, updateSourceRules } = require("../validators/newsSourceValidators");

const router = express.Router();

router.use(protect); // every role needs to be logged in to see or use the source directory

router
  .route("/")
  .get(getSources)
  .post(authorize("Admin"), createSourceRules, createSource);

router
  .route("/:id")
  .put(authorize("Admin"), updateSourceRules, updateSource)
  .delete(authorize("Admin"), deleteSource);

module.exports = router;
