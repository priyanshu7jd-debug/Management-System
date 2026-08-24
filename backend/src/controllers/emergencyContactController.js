const asyncHandler = require("express-async-handler");
const EmergencyContact = require("../models/EmergencyContact");

// @desc    Get all emergency contacts
// @route   GET /api/contacts
// @access  Public
const getContacts = asyncHandler(async (req, res) => {
  const contacts = await EmergencyContact.find().sort({ order: 1, createdAt: 1 });
  res.json({ success: true, count: contacts.length, data: contacts });
});

// @desc    Create an emergency contact
// @route   POST /api/contacts
// @access  Private (Admin)
const createContact = asyncHandler(async (req, res) => {
  const { name, number, category, order } = req.body;

  const contact = await EmergencyContact.create({
    name,
    number,
    category,
    order,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: contact });
});

// @desc    Update an emergency contact
// @route   PUT /api/contacts/:id
// @access  Private (Admin)
const updateContact = asyncHandler(async (req, res) => {
  const contact = await EmergencyContact.findById(req.params.id);
  if (!contact) {
    res.status(404);
    throw new Error("Emergency contact not found");
  }

  const fields = ["name", "number", "category", "order"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) contact[field] = req.body[field];
  });

  const updated = await contact.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete an emergency contact
// @route   DELETE /api/contacts/:id
// @access  Private (Admin)
const deleteContact = asyncHandler(async (req, res) => {
  const contact = await EmergencyContact.findById(req.params.id);
  if (!contact) {
    res.status(404);
    throw new Error("Emergency contact not found");
  }

  await contact.deleteOne();
  res.json({ success: true, message: "Emergency contact deleted" });
});

module.exports = { getContacts, createContact, updateContact, deleteContact };
