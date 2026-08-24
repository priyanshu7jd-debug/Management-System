const express = require("express");
const {
  createDonation,
  getDonations,
  getMyDonations,
  getDonationById,
  updateDonation,
  updateDonationStatus,
  verifyDonation,
  deleteDonation,
  getDonationStats,
} = require("../controllers/donationController");
const { protect } = require("../middleware/authMiddleware");
const { requireFundPermission, requireFullFundAccess } = require("../middleware/fundAccessMiddleware");
const { createDonationRules, updateDonationRules, updateDonationStatusRules } = require("../validators/donationValidators");

const router = express.Router();

router.use(protect); // every donation route requires login

// Fixed-path routes must come before the "/:id" param route below
router.get("/stats/summary", requireFullFundAccess("generateFundReports"), getDonationStats);
router.get("/me", requireFundPermission("viewDonationHistory"), getMyDonations);

router
  .route("/")
  .post(requireFundPermission("makeDonation"), createDonationRules, createDonation)
  .get(requireFundPermission("viewDonations"), getDonations);

router.get("/:id", getDonationById);
router.patch("/:id/status", requireFullFundAccess("verifyDonation"), updateDonationStatusRules, updateDonationStatus);
router.patch("/:id/verify", requireFullFundAccess("verifyDonation"), verifyDonation);
router.put("/:id", requireFullFundAccess("verifyDonation"), updateDonationRules, updateDonation);
router.delete("/:id", requireFullFundAccess("verifyDonation"), (req, res, next) => {
  if (req.user.role !== "Admin") {
    res.status(403);
    throw new Error("Only Admin may delete a donation record");
  }
  next();
}, deleteDonation);

module.exports = router;
