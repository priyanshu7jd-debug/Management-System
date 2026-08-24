const express = require("express");
const {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  approveCampaign,
  closeCampaign,
  suspendCampaign,
  deleteCampaign,
} = require("../controllers/campaignController");
const { protect } = require("../middleware/authMiddleware");
const { requireFundPermission, requireFullFundAccess } = require("../middleware/fundAccessMiddleware");
const {
  createCampaignRules,
  updateCampaignRules,
  approveCampaignRules,
  closeCampaignRules,
  suspendCampaignRules,
} = require("../validators/campaignValidators");

const router = express.Router();

router.use(protect); // every campaign route requires login

router
  .route("/")
  .get(requireFundPermission("viewReliefFunds"), getCampaigns)
  .post(requireFullFundAccess("createCampaign"), createCampaignRules, createCampaign);

router.get("/:id", requireFundPermission("viewReliefFunds"), getCampaignById);
router.put("/:id", requireFundPermission("editCampaign"), updateCampaignRules, updateCampaign);
router.patch("/:id/approve", requireFullFundAccess("approveCampaign"), approveCampaignRules, approveCampaign);
router.patch("/:id/close", requireFullFundAccess("closeCampaign"), closeCampaignRules, closeCampaign);
router.patch("/:id/suspend", requireFullFundAccess("suspendCampaign"), suspendCampaignRules, suspendCampaign);
router.delete("/:id", requireFullFundAccess("closeCampaign"), deleteCampaign);

module.exports = router;
