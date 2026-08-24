const express = require("express");
const {
  reportRoadBlock,
  getRoadBlocks,
  getRoadBlockById,
  confirmRoadBlock,
  clearRoadBlock,
  deleteRoadBlock,
} = require("../controllers/roadBlockController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { requireMapPermission } = require("../middleware/mapAccessMiddleware");
const { reportRoadBlockRules } = require("../validators/roadBlockValidators");

const router = express.Router();

router.use(protect);

router
  .route("/")
  .get(requireMapPermission("viewBlockedRoads"), getRoadBlocks)
  // Every role can hit this: Admin/Authority get FULL scope and their post
  // lands as "Confirmed" directly; Citizen/Volunteer get REPORT scope and
  // it lands as "Reported" (see reportRoadBlock in the controller).
  .post(requireMapPermission("markRoadBlocked"), reportRoadBlockRules, reportRoadBlock);

router.get("/:id", requireMapPermission("viewBlockedRoads"), getRoadBlockById);
router.patch("/:id/confirm", authorize("Authority", "Admin"), confirmRoadBlock);
router.patch("/:id/clear", authorize("Authority", "Admin"), clearRoadBlock);
router.delete("/:id", authorize("Admin"), deleteRoadBlock);

module.exports = router;
