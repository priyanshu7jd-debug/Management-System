const express = require("express");
const {
  createAssistanceRequest,
  getAssistanceRequests,
  getAssistanceRequestById,
  uploadAssistanceDocuments,
  uploadAssistanceDocumentFiles,
  deleteAssistanceDocument,
  fieldVerifyAssistanceRequest,
  verifyAssistanceRequest,
  approveAssistance,
  rejectAssistance,
  allocateReliefMoney,
} = require("../controllers/assistanceController");
const { protect } = require("../middleware/authMiddleware");
const { requireFundPermission, requireFullFundAccess } = require("../middleware/fundAccessMiddleware");
const { assistanceDocumentUpload } = require("../middleware/uploadMiddleware");
const {
  createAssistanceRequestRules,
  uploadDocumentsRules,
  fieldVerifyRules,
  approveRules,
  rejectRules,
  allocateRules,
} = require("../validators/assistanceValidators");

const router = express.Router();

router.use(protect); // every assistance-request route requires login

// Listing has mixed visibility by design (Admin/Authority: every request,
// Volunteer: FIELD scope to their assignment, Citizen: only their own) -
// so it's gated by login only; controller applies the per-role filter.
router
  .route("/")
  .post(requireFundPermission("requestFinancialAssistance"), createAssistanceRequestRules, createAssistanceRequest)
  .get(getAssistanceRequests);

router.get("/:id", getAssistanceRequestById);
router.post(
  "/:id/documents",
  requireFundPermission("uploadProofDocuments"),
  uploadDocumentsRules,
  uploadAssistanceDocuments
);
// Real file upload (multipart/form-data, field "documents", max 5) - see the
// controller comment for why this was missing. Same "uploadProofDocuments"
// permission as the JSON-url variant above; this just accepts an actual file.
router
  .route("/:id/documents/upload")
  .post(
    requireFundPermission("uploadProofDocuments"),
    assistanceDocumentUpload.array("documents", 5),
    uploadAssistanceDocumentFiles
  )
  .delete(requireFundPermission("uploadProofDocuments"), deleteAssistanceDocument);

// Volunteer's field check vs. Admin/Authority's office verification are two
// distinct endpoints, matching the FIELD vs FULL scopes on the same
// "Verify assistance request" permission row.
router.patch(
  "/:id/field-verify",
  (req, res, next) => {
    if (!req.user || req.user.role !== "Volunteer") {
      res.status(403);
      throw new Error("Only a Volunteer performs field verification");
    }
    next();
  },
  fieldVerifyRules,
  fieldVerifyAssistanceRequest
);
router.patch("/:id/verify", requireFullFundAccess("verifyAssistanceRequest"), verifyAssistanceRequest);
router.patch("/:id/approve", requireFullFundAccess("approveAssistance"), approveRules, approveAssistance);
router.patch("/:id/reject", requireFullFundAccess("rejectAssistance"), rejectRules, rejectAssistance);
router.patch("/:id/allocate", requireFullFundAccess("allocateReliefMoney"), allocateRules, allocateReliefMoney);

module.exports = router;
