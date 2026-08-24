const express = require("express");
const {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
} = require("../controllers/emergencyContactController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { createContactRules, updateContactRules } = require("../validators/emergencyContactValidators");

const router = express.Router();

// Public: anyone can view the emergency contact list, no login required
router.get("/", getContacts);

// Everything below requires an authenticated Admin
router.post("/", protect, authorize("Admin"), createContactRules, createContact);
router.put("/:id", protect, authorize("Admin"), updateContactRules, updateContact);
router.delete("/:id", protect, authorize("Admin"), deleteContact);

module.exports = router;
