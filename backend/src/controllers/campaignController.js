const asyncHandler = require("express-async-handler");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const NGO = require("../models/NGO");
const FundActivityLog = require("../models/FundActivityLog");
const { notify } = require("../utils/notify");
const { SCOPE } = require("../config/fundPermissions");
const { isCampaignAssignedToAuthority } = require("../middleware/fundAccessMiddleware");

// Attach real raised/donor totals to a list of campaigns, computed live from
// Donation records rather than a stored (and easily stale) counter.
async function withRaisedTotals(campaigns) {
  const ids = campaigns.map((c) => c._id);
  if (ids.length === 0) return [];

  const totals = await Donation.aggregate([
    { $match: { relatedCampaign: { $in: ids }, type: "Cash", status: { $ne: "Cancelled" } } },
    { $group: { _id: "$relatedCampaign", raised: { $sum: "$amount" }, donors: { $sum: 1 } } },
  ]);
  const totalsMap = new Map(totals.map((t) => [t._id.toString(), t]));

  return campaigns.map((c) => {
    const t = totalsMap.get(c._id.toString());
    return {
      ...c.toObject(),
      raised: t ? t.raised : 0,
      donors: t ? t.donors : 0,
    };
  });
}

const loadCampaignOr404 = async (id) => {
  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error("Campaign not found");
    err.statusCode = 404;
    throw err;
  }
  return campaign;
};

// @desc    Create a relief campaign for a registered (approved) NGO -
//          "Create relief fund campaign". Admin-created campaigns are
//          auto-approved; Authority-created ones start Pending until an
//          Admin approves them ("Approve fund campaign").
// @route   POST /api/campaigns
// @access  Private (Authority, Admin)
const createCampaign = asyncHandler(async (req, res) => {
  const { title, ngo, relatedDisaster, description, location, target, deadline, bankDetails } = req.body;

  const ngoDoc = await NGO.findById(ngo);
  if (!ngoDoc) {
    res.status(404);
    throw new Error("NGO not found");
  }
  if (ngoDoc.status !== "Approved") {
    res.status(400);
    throw new Error("Only an ASDMA-verified NGO can run a campaign");
  }

  const autoApproved = req.user.role === "Admin";

  const campaign = await Campaign.create({
    title,
    ngo,
    relatedDisaster,
    description,
    location,
    target,
    deadline,
    bankDetails,
    createdBy: req.user._id,
    approvalStatus: autoApproved ? "Approved" : "Pending",
    approvedBy: autoApproved ? req.user._id : null,
    approvedAt: autoApproved ? new Date() : null,
  });

  await FundActivityLog.record({
    action: "campaign_created",
    relatedCampaign: campaign._id,
    user: req.user,
    details: { title, target, autoApproved },
  });

  res.status(201).json({ success: true, data: campaign });
});

// @desc    List campaigns (defaults to Active only) - "View relief funds"
// @route   GET /api/campaigns?status=&approvalStatus=&ngo=&page=&limit=
// @access  Private (any authenticated user)
const getCampaigns = asyncHandler(async (req, res) => {
  const { status = "Active", approvalStatus, ngo, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (status !== "all") filter.status = status;
  if (ngo) filter.ngo = ngo;

  const isStaff = ["Authority", "Admin"].includes(req.user.role);
  if (isStaff) {
    // Staff can look at Pending/Rejected campaigns too (e.g. to review
    // before approving); everyone else only ever sees Approved ones.
    if (approvalStatus) filter.approvalStatus = approvalStatus;
  } else {
    filter.approvalStatus = "Approved";
  }

  // Authority's scope on campaigns beyond viewing is ASSIGNED (their own),
  // but "View relief funds" itself is FULL for Authority - so no extra
  // filter here. A Volunteer's LIMITED view just means the response is
  // trimmed of bank details (below), not fewer rows.

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 50, 100);

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .populate("ngo", "name status")
      .populate("relatedDisaster", "disasterId type location")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Campaign.countDocuments(filter),
  ]);

  let data = await withRaisedTotals(campaigns);

  // Volunteer's LIMITED scope on "View relief funds": trim bank details.
  if (req.user.role === "Volunteer") {
    data = data.map((c) => ({ ...c, bankDetails: undefined }));
  }

  res.json({
    success: true,
    scope: req.fundScope,
    count: data.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data,
  });
});

// @desc    Get a single campaign by ID
// @route   GET /api/campaigns/:id
// @access  Private (any authenticated user)
const getCampaignById = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findById(req.params.id)
    .populate("ngo", "name status contactEmail")
    .populate("relatedDisaster", "disasterId type location")
    .populate("createdBy", "name role");

  if (!campaign) {
    res.status(404);
    throw new Error("Campaign not found");
  }

  const isStaff = ["Authority", "Admin"].includes(req.user.role);
  if (!isStaff && campaign.approvalStatus !== "Approved") {
    res.status(404);
    throw new Error("Campaign not found");
  }

  const [data] = await withRaisedTotals([campaign]);
  if (req.user.role === "Volunteer") data.bankDetails = undefined;

  res.json({ success: true, data });
});

// @desc    Update a campaign - "Edit campaign" (Admin: any campaign,
//          Authority: only campaigns they created)
// @route   PUT /api/campaigns/:id
// @access  Private (Authority-assigned, Admin)
const updateCampaign = asyncHandler(async (req, res) => {
  const campaign = await loadCampaignOr404(req.params.id);

  if (req.fundScope === SCOPE.ASSIGNED && !isCampaignAssignedToAuthority(campaign, req.user)) {
    res.status(403);
    throw new Error("You can only edit campaigns you created");
  }

  const fields = ["title", "description", "location", "target", "deadline", "bankDetails"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) campaign[field] = req.body[field];
  });

  const updated = await campaign.save();

  await FundActivityLog.record({
    action: "campaign_updated",
    relatedCampaign: campaign._id,
    user: req.user,
    details: { fields: Object.keys(req.body) },
  });

  res.json({ success: true, data: updated });
});

// @desc    Approve or reject a Pending campaign - "Approve fund campaign"
// @route   PATCH /api/campaigns/:id/approve
// @access  Private (Admin only)
const approveCampaign = asyncHandler(async (req, res) => {
  const { decision } = req.body; // "Approved" | "Rejected"
  if (!["Approved", "Rejected"].includes(decision)) {
    res.status(400);
    throw new Error("decision must be 'Approved' or 'Rejected'");
  }

  const campaign = await loadCampaignOr404(req.params.id);

  campaign.approvalStatus = decision;
  campaign.approvedBy = req.user._id;
  campaign.approvedAt = new Date();
  const updated = await campaign.save();

  await FundActivityLog.record({
    action: decision === "Approved" ? "campaign_approved" : "campaign_rejected",
    relatedCampaign: campaign._id,
    user: req.user,
  });

  await notify({
    recipient: campaign.createdBy,
    type: "System",
    title: `Campaign ${decision.toLowerCase()}`,
    message: `Your campaign "${campaign.title}" was ${decision.toLowerCase()} by an admin.`,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: updated });
});

// @desc    Close a campaign (Completed or Cancelled) - "Close campaign"
// @route   PATCH /api/campaigns/:id/close
// @access  Private (Admin only)
const closeCampaign = asyncHandler(async (req, res) => {
  const { outcome = "Completed" } = req.body; // "Completed" | "Cancelled"
  if (!["Completed", "Cancelled"].includes(outcome)) {
    res.status(400);
    throw new Error("outcome must be 'Completed' or 'Cancelled'");
  }

  const campaign = await loadCampaignOr404(req.params.id);

  campaign.status = outcome;
  campaign.closedBy = req.user._id;
  campaign.closedAt = new Date();
  const updated = await campaign.save();

  await FundActivityLog.record({
    action: "campaign_closed",
    relatedCampaign: campaign._id,
    user: req.user,
    details: { outcome },
  });

  await notify({
    recipient: campaign.createdBy,
    type: "System",
    title: `Campaign closed (${outcome})`,
    message: `"${campaign.title}" has been closed as ${outcome}.`,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: updated });
});

// @desc    Suspend an active campaign, pending investigation - "Suspend campaign"
// @route   PATCH /api/campaigns/:id/suspend
// @access  Private (Admin only)
const suspendCampaign = asyncHandler(async (req, res) => {
  const { reason = "" } = req.body;

  const campaign = await loadCampaignOr404(req.params.id);

  campaign.status = "Suspended";
  campaign.suspendedBy = req.user._id;
  campaign.suspendedAt = new Date();
  campaign.suspendedReason = reason;
  const updated = await campaign.save();

  await FundActivityLog.record({
    action: "campaign_suspended",
    relatedCampaign: campaign._id,
    user: req.user,
    details: { reason },
  });

  await notify({
    recipient: campaign.createdBy,
    type: "System",
    title: "Campaign suspended",
    message: `"${campaign.title}" has been suspended.${reason ? ` Reason: ${reason}` : ""}`,
    createdBy: req.user._id,
  });

  res.json({ success: true, data: updated });
});

// @desc    Delete a campaign
// @route   DELETE /api/campaigns/:id
// @access  Private (Admin)
const deleteCampaign = asyncHandler(async (req, res) => {
  const campaign = await loadCampaignOr404(req.params.id);
  await campaign.deleteOne();

  await FundActivityLog.record({
    action: "campaign_deleted",
    user: req.user,
    details: { campaignId: campaign.campaignId, title: campaign.title },
  });

  res.json({ success: true, message: "Campaign deleted" });
});

module.exports = {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  approveCampaign,
  closeCampaign,
  suspendCampaign,
  deleteCampaign,
};
