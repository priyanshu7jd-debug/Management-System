const path = require("path");
const fs = require("fs");
const asyncHandler = require("express-async-handler");
const AssistanceRequest = require("../models/AssistanceRequest");
const { UPLOAD_ROOT } = require("../middleware/uploadMiddleware");
const Campaign = require("../models/Campaign");
const FundTransaction = require("../models/FundTransaction");
const FundActivityLog = require("../models/FundActivityLog");
const { notify } = require("../utils/notify");
const { SCOPE } = require("../config/fundPermissions");
const { getVolunteerAssignment } = require("../middleware/fundAccessMiddleware");

const loadRequestOr404 = async (id) => {
  const request = await AssistanceRequest.findById(id);
  if (!request) {
    const err = new Error("Assistance request not found");
    err.statusCode = 404;
    throw err;
  }
  return request;
};

// @desc    File a request for direct financial assistance -
//          "Request financial assistance" (Admin/Authority/Citizen; not Volunteer)
// @route   POST /api/assistance-requests
// @access  Private (Admin, Authority, Citizen)
const createAssistanceRequest = asyncHandler(async (req, res) => {
  const { relatedDisaster, relatedShelter, relatedCampaign, category, reason, amountRequested } = req.body;

  if (!reason || !amountRequested) {
    res.status(400);
    throw new Error("Please provide a reason and the amount requested");
  }

  const request = await AssistanceRequest.create({
    requestedBy: req.user._id,
    relatedDisaster,
    relatedShelter,
    relatedCampaign,
    category,
    reason,
    amountRequested,
  });

  await FundActivityLog.record({
    action: "assistance_request_created",
    relatedAssistanceRequest: request._id,
    user: req.user,
    details: { amountRequested, category },
  });

  res.status(201).json({ success: true, data: request });
});

// @desc    List assistance requests - visibility follows "Verify assistance
//          request" scope: Admin/Authority FULL, Volunteer FIELD (limited
//          to their assigned shelter/disaster), Citizen sees only their own.
// @route   GET /api/assistance-requests?status=&category=&page=&limit=
// @access  Private
const getAssistanceRequests = asyncHandler(async (req, res) => {
  const { status, category, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;

  if (req.user.role === "Citizen") {
    filter.requestedBy = req.user._id;
  } else if (req.user.role === "Volunteer") {
    const { assignedShelter, assignedDisaster } = await getVolunteerAssignment(req.user);
    const or = [];
    if (assignedShelter) or.push({ relatedShelter: assignedShelter });
    if (assignedDisaster) or.push({ relatedDisaster: assignedDisaster });
    // A Volunteer with no assignment yet sees nothing rather than everything.
    filter.$or = or.length ? or : [{ _id: null }];
  }
  // Admin/Authority: FULL, no extra filter.

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [requests, total] = await Promise.all([
    AssistanceRequest.find(filter)
      .populate("requestedBy", "name role")
      .populate("relatedDisaster", "disasterId type location")
      .populate("relatedShelter", "shelterId name location")
      .populate("relatedCampaign", "campaignId title")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AssistanceRequest.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: requests.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: requests,
  });
});

// @desc    Get a single assistance request
// @route   GET /api/assistance-requests/:id
// @access  Private (Admin, Authority, Volunteer-if-assigned, or the requester)
const getAssistanceRequestById = asyncHandler(async (req, res) => {
  const request = await AssistanceRequest.findById(req.params.id)
    .populate("requestedBy", "name role")
    .populate("relatedDisaster", "disasterId type location")
    .populate("relatedShelter", "shelterId name location")
    .populate("relatedCampaign", "campaignId title")
    .populate("fieldVerifiedBy verifiedBy decisionBy allocatedBy", "name role");

  if (!request) {
    res.status(404);
    throw new Error("Assistance request not found");
  }

  const isOwner = request.requestedBy._id.toString() === req.user._id.toString();
  const isStaff = ["Authority", "Admin"].includes(req.user.role);

  if (!isStaff && !isOwner) {
    if (req.user.role === "Volunteer") {
      const { assignedShelter, assignedDisaster } = await getVolunteerAssignment(req.user);
      const matches =
        (assignedShelter && request.relatedShelter && request.relatedShelter._id.toString() === assignedShelter) ||
        (assignedDisaster && request.relatedDisaster && request.relatedDisaster._id.toString() === assignedDisaster);
      if (!matches) {
        res.status(403);
        throw new Error("Not authorized to view this assistance request");
      }
    } else {
      res.status(403);
      throw new Error("Not authorized to view this assistance request");
    }
  }

  res.json({ success: true, data: request });
});

// @desc    Attach supporting documents to a request - "Upload proof/documents"
// @route   POST /api/assistance-requests/:id/documents
// @access  Private (any authenticated role)
const uploadAssistanceDocuments = asyncHandler(async (req, res) => {
  const { documents } = req.body; // [{ url, label }]
  if (!Array.isArray(documents) || documents.length === 0) {
    res.status(400);
    throw new Error("Please provide at least one document { url, label }");
  }

  const request = await loadRequestOr404(req.params.id);

  const isOwner = request.requestedBy.toString() === req.user._id.toString();
  const isStaff = ["Authority", "Admin"].includes(req.user.role);
  if (!isOwner && !isStaff && req.user.role !== "Volunteer") {
    res.status(403);
    throw new Error("Not authorized to upload documents for this request");
  }

  documents.forEach((doc) => {
    if (!doc.url) return;
    request.documents.push({ url: doc.url, label: doc.label || "", uploadedBy: req.user._id });
  });
  const updated = await request.save();

  await FundActivityLog.record({
    action: "assistance_documents_uploaded",
    relatedAssistanceRequest: request._id,
    user: req.user,
    details: { count: documents.length },
  });

  res.json({ success: true, data: updated });
});

// @desc    Attach supporting documents via a real file upload
//          (multipart/form-data, field "documents", max 5) - a generic
//          "upload a file, get a hosted url" route didn't exist anywhere on
//          this backend, so the documents-by-url endpoint above was unusable
//          from a UI that only has a raw file. This saves the files to disk
//          (same pattern as disaster/shelter image uploads) and appends them
//          to request.documents using each file's original name as the label.
// @route   POST /api/assistance-requests/:id/documents/upload
// @access  Private (the requester, any Volunteer, or Authority/Admin)
const uploadAssistanceDocumentFiles = asyncHandler(async (req, res) => {
  const request = await loadRequestOr404(req.params.id);

  const isOwner = request.requestedBy.toString() === req.user._id.toString();
  const isStaff = ["Authority", "Admin"].includes(req.user.role);
  if (!isOwner && !isStaff && req.user.role !== "Volunteer") {
    res.status(403);
    throw new Error("Not authorized to upload documents for this request");
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("Please attach at least one document");
  }

  req.files.forEach((file) => {
    request.documents.push({
      url: `/uploads/assistance/${file.filename}`,
      label: file.originalname,
      uploadedBy: req.user._id,
    });
  });
  const updated = await request.save();

  await FundActivityLog.record({
    action: "assistance_documents_uploaded",
    relatedAssistanceRequest: request._id,
    user: req.user,
    details: { count: req.files.length },
  });

  res.status(201).json({ success: true, data: updated });
});

// @desc    Remove one proof document from a request
// @route   DELETE /api/assistance-requests/:id/documents
// @access  Private (the requester, or Authority/Admin)
const deleteAssistanceDocument = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400);
    throw new Error("Please provide the document url to remove");
  }

  const request = await loadRequestOr404(req.params.id);

  const isOwner = request.requestedBy.toString() === req.user._id.toString();
  const isStaff = ["Authority", "Admin"].includes(req.user.role);
  if (!isOwner && !isStaff) {
    res.status(403);
    throw new Error("Not authorized to modify documents on this request");
  }

  const hadDoc = request.documents.some((doc) => doc.url === url);
  request.documents = request.documents.filter((doc) => doc.url !== url);
  const updated = await request.save();

  if (hadDoc && url.startsWith("/uploads/assistance/")) {
    const filename = path.basename(url);
    fs.unlink(path.join(UPLOAD_ROOT, "assistance", filename), () => {});
  }

  res.json({ success: true, data: updated });
});

// @desc    Volunteer's on-the-ground check of a request - "Verify assistance
//          request" (FIELD scope)
// @route   PATCH /api/assistance-requests/:id/field-verify
// @access  Private (Volunteer)
const fieldVerifyAssistanceRequest = asyncHandler(async (req, res) => {
  const { notes = "" } = req.body;
  const request = await loadRequestOr404(req.params.id);

  const { assignedShelter, assignedDisaster } = await getVolunteerAssignment(req.user);
  const matches =
    (assignedShelter && request.relatedShelter && request.relatedShelter.toString() === assignedShelter) ||
    (assignedDisaster && request.relatedDisaster && request.relatedDisaster.toString() === assignedDisaster);
  if (!matches) {
    res.status(403);
    throw new Error("You can only field-verify requests tied to your assigned shelter/disaster");
  }

  if (request.status !== "Pending") {
    res.status(400);
    throw new Error(`Cannot field-verify a request with status ${request.status}`);
  }

  request.fieldVerifiedBy = req.user._id;
  request.fieldVerifiedAt = new Date();
  request.fieldVerificationNotes = notes;
  request.status = "FieldVerified";
  const updated = await request.save();

  await FundActivityLog.record({
    action: "assistance_field_verified",
    relatedAssistanceRequest: request._id,
    user: req.user,
    details: { notes },
  });

  res.json({ success: true, data: updated });
});

// @desc    Office verification of a request - "Verify assistance request" (FULL scope)
// @route   PATCH /api/assistance-requests/:id/verify
// @access  Private (Admin, Authority)
const verifyAssistanceRequest = asyncHandler(async (req, res) => {
  const request = await loadRequestOr404(req.params.id);

  if (!["Pending", "FieldVerified"].includes(request.status)) {
    res.status(400);
    throw new Error(`Cannot verify a request with status ${request.status}`);
  }

  request.verifiedBy = req.user._id;
  request.verifiedAt = new Date();
  request.status = "Verified";
  const updated = await request.save();

  await FundActivityLog.record({
    action: "assistance_verified",
    relatedAssistanceRequest: request._id,
    user: req.user,
  });

  res.json({ success: true, data: updated });
});

// @desc    Approve a verified request - "Approve assistance"
// @route   PATCH /api/assistance-requests/:id/approve
// @access  Private (Admin, Authority)
const approveAssistance = asyncHandler(async (req, res) => {
  const { notes = "" } = req.body;
  const request = await loadRequestOr404(req.params.id);

  if (!["Pending", "FieldVerified", "Verified"].includes(request.status)) {
    res.status(400);
    throw new Error(`Cannot approve a request with status ${request.status}`);
  }

  request.status = "Approved";
  request.decisionBy = req.user._id;
  request.decisionAt = new Date();
  request.decisionNotes = notes;
  const updated = await request.save();

  await FundActivityLog.record({
    action: "assistance_approved",
    relatedAssistanceRequest: request._id,
    user: req.user,
    details: { notes },
  });

  await notify({
    recipient: request.requestedBy,
    type: "System",
    title: "Assistance request approved",
    message: `Your assistance request ${request.requestId} has been approved.`,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: updated });
});

// @desc    Reject a request - "Reject assistance"
// @route   PATCH /api/assistance-requests/:id/reject
// @access  Private (Admin, Authority)
const rejectAssistance = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400);
    throw new Error("Please provide a rejection reason");
  }

  const request = await loadRequestOr404(req.params.id);

  if (["Rejected", "Allocated"].includes(request.status)) {
    res.status(400);
    throw new Error(`Cannot reject a request with status ${request.status}`);
  }

  request.status = "Rejected";
  request.decisionBy = req.user._id;
  request.decisionAt = new Date();
  request.rejectionReason = reason;
  const updated = await request.save();

  await FundActivityLog.record({
    action: "assistance_rejected",
    relatedAssistanceRequest: request._id,
    user: req.user,
    details: { reason },
  });

  await notify({
    recipient: request.requestedBy,
    type: "System",
    title: "Assistance request rejected",
    message: `Your assistance request ${request.requestId} was rejected: ${reason}`,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: updated });
});

// @desc    Disburse relief money against an approved request -
//          "Allocate relief money". Debits the funding campaign's balance.
// @route   PATCH /api/assistance-requests/:id/allocate
// @access  Private (Admin, Authority)
const allocateReliefMoney = asyncHandler(async (req, res) => {
  const { amount, campaignId } = req.body;
  const request = await loadRequestOr404(req.params.id);

  if (request.status !== "Approved") {
    res.status(400);
    throw new Error("Only an Approved request can have relief money allocated");
  }

  const sourceCampaignId = campaignId || request.relatedCampaign;
  if (!sourceCampaignId) {
    res.status(400);
    throw new Error("Please specify which campaign to allocate the money from");
  }

  const campaign = await Campaign.findById(sourceCampaignId);
  if (!campaign) {
    res.status(404);
    throw new Error("Funding campaign not found");
  }

  const allocateAmount = amount || request.amountRequested;
  const { balance } = await FundTransaction.getCampaignBalance(sourceCampaignId);
  if (allocateAmount > balance) {
    res.status(400);
    throw new Error(`Insufficient campaign balance: available ${balance}, requested ${allocateAmount}`);
  }

  await FundTransaction.record({
    type: "Allocation",
    direction: "debit",
    amount: allocateAmount,
    relatedCampaign: sourceCampaignId,
    relatedDisaster: request.relatedDisaster,
    relatedAssistanceRequest: request._id,
    performedBy: req.user._id,
    notes: `Relief money allocated for request ${request.requestId}`,
  });

  request.relatedCampaign = sourceCampaignId;
  request.allocatedAmount = allocateAmount;
  request.allocatedBy = req.user._id;
  request.allocatedAt = new Date();
  request.status = "Allocated";
  const updated = await request.save();

  await FundActivityLog.record({
    action: "relief_money_allocated",
    relatedAssistanceRequest: request._id,
    relatedCampaign: sourceCampaignId,
    user: req.user,
    details: { amount: allocateAmount },
  });

  await notify({
    recipient: request.requestedBy,
    type: "System",
    title: "Relief money allocated",
    message: `Rs ${allocateAmount} has been allocated for your assistance request ${request.requestId}.`,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: updated });
});

module.exports = {
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
};
