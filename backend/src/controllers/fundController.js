const asyncHandler = require("express-async-handler");
const Campaign = require("../models/Campaign");
const Donation = require("../models/Donation");
const FundTransaction = require("../models/FundTransaction");
const FundActivityLog = require("../models/FundActivityLog");
const MisuseReport = require("../models/MisuseReport");
const { notify, notifyMany } = require("../utils/notify");
const { SCOPE } = require("../config/fundPermissions");
const { isCampaignAssignedToAuthority, getVolunteerAssignment } = require("../middleware/fundAccessMiddleware");
const User = require("../models/User");

const loadCampaignOr404 = async (id) => {
  const campaign = await Campaign.findById(id);
  if (!campaign) {
    const err = new Error("Campaign not found");
    err.statusCode = 404;
    throw err;
  }
  return campaign;
};

// ---------------------------------------------------------------------------
// Manage fund balance
// ---------------------------------------------------------------------------

// @desc    Get a campaign's current fund balance - "Manage fund balance"
// @route   GET /api/funds/campaigns/:id/balance
// @access  Private (Admin FULL, Authority ASSIGNED to their own campaigns)
const getFundBalance = asyncHandler(async (req, res) => {
  const campaign = await loadCampaignOr404(req.params.id);

  if (req.fundScope === SCOPE.ASSIGNED && !isCampaignAssignedToAuthority(campaign, req.user)) {
    res.status(403);
    throw new Error("You can only view the balance of campaigns you created");
  }

  const totals = await FundTransaction.getCampaignBalance(campaign._id);
  res.json({ success: true, data: { campaign: campaign._id, campaignTitle: campaign.title, ...totals } });
});

// @desc    Manually adjust a campaign's fund balance (reconciliation, e.g.
//          a bank fee or correction) - "Manage fund balance"
// @route   POST /api/funds/campaigns/:id/adjust
// @access  Private (Admin FULL, Authority ASSIGNED to their own campaigns)
const adjustFundBalance = asyncHandler(async (req, res) => {
  const { amount, direction, notes } = req.body;
  if (!amount || amount <= 0 || !["credit", "debit"].includes(direction)) {
    res.status(400);
    throw new Error("Please provide a positive amount and direction ('credit' or 'debit')");
  }

  const campaign = await loadCampaignOr404(req.params.id);

  if (req.fundScope === SCOPE.ASSIGNED && !isCampaignAssignedToAuthority(campaign, req.user)) {
    res.status(403);
    throw new Error("You can only adjust the balance of campaigns you created");
  }

  const txn = await FundTransaction.record({
    type: "Adjustment",
    direction,
    amount,
    relatedCampaign: campaign._id,
    relatedDisaster: campaign.relatedDisaster,
    performedBy: req.user._id,
    notes: notes || "Manual balance adjustment",
  });

  await FundActivityLog.record({
    action: "fund_balance_adjusted",
    relatedCampaign: campaign._id,
    user: req.user,
    details: { amount, direction, notes },
  });

  res.status(201).json({ success: true, data: txn });
});

// ---------------------------------------------------------------------------
// Track fund utilization
// ---------------------------------------------------------------------------

// @desc    Utilization breakdown of a campaign's funds (raised vs. allocated
//          vs. remaining) - "Track fund utilization"
// @route   GET /api/funds/campaigns/:id/utilization
// @access  Private (Admin/Authority FULL, Citizen LIMITED, Volunteer ASSIGNED)
const trackFundUtilization = asyncHandler(async (req, res) => {
  const campaign = await loadCampaignOr404(req.params.id);

  if (req.fundScope === SCOPE.ASSIGNED) {
    const { assignedDisaster } = await getVolunteerAssignment(req.user);
    if (!assignedDisaster || !campaign.relatedDisaster || campaign.relatedDisaster.toString() !== assignedDisaster) {
      res.status(403);
      throw new Error("You can only track utilization for your assigned disaster's campaigns");
    }
  }

  const { balance, credits, debits } = await FundTransaction.getCampaignBalance(campaign._id);

  if (req.fundScope === SCOPE.LIMITED) {
    // Citizen: high-level percentages only, no raw transaction amounts.
    res.json({
      success: true,
      scope: req.fundScope,
      data: {
        campaign: campaign._id,
        campaignTitle: campaign.title,
        utilizedPercent: credits > 0 ? Math.round((debits / credits) * 100) : 0,
      },
    });
    return;
  }

  const byType = await FundTransaction.aggregate([
    { $match: { relatedCampaign: campaign._id } },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);

  res.json({
    success: true,
    scope: req.fundScope,
    data: { campaign: campaign._id, campaignTitle: campaign.title, balance, credits, debits, byType },
  });
});

// ---------------------------------------------------------------------------
// Monitor transactions
// ---------------------------------------------------------------------------

// @desc    List fund transactions (the money-movement ledger) - "Monitor transactions"
// @route   GET /api/funds/transactions?campaign=&type=&page=&limit=
// @access  Private (Admin FULL, Authority ASSIGNED, Citizen OWN, Volunteer NONE)
const monitorTransactions = asyncHandler(async (req, res) => {
  const { campaign, type, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (campaign) filter.relatedCampaign = campaign;
  if (type) filter.type = type;

  if (req.fundScope === SCOPE.ASSIGNED) {
    const ownCampaigns = await Campaign.find({ createdBy: req.user._id }).select("_id");
    filter.relatedCampaign = { $in: ownCampaigns.map((c) => c._id) };
  } else if (req.fundScope === SCOPE.OWN) {
    const ownDonations = await Donation.find({ recordedBy: req.user._id }).select("_id");
    filter.$or = [{ relatedDonation: { $in: ownDonations.map((d) => d._id) } }, { performedBy: req.user._id }];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [transactions, total] = await Promise.all([
    FundTransaction.find(filter)
      .populate("relatedCampaign", "campaignId title")
      .populate("performedBy", "name role")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    FundTransaction.countDocuments(filter),
  ]);

  res.json({
    success: true,
    scope: req.fundScope,
    count: transactions.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: transactions,
  });
});

// ---------------------------------------------------------------------------
// Generate / export fund reports
// ---------------------------------------------------------------------------

// @desc    Aggregate fund report across campaigns - "Generate fund reports"
// @route   GET /api/funds/reports?disaster=
// @access  Private (Admin, Authority)
const generateFundReports = asyncHandler(async (req, res) => {
  const { disaster } = req.query;
  const campaignFilter = {};
  if (disaster) campaignFilter.relatedDisaster = disaster;

  const campaigns = await Campaign.find(campaignFilter).select("_id title status approvalStatus target");

  const report = await Promise.all(
    campaigns.map(async (c) => {
      const totals = await FundTransaction.getCampaignBalance(c._id);
      return {
        campaign: c._id,
        title: c.title,
        status: c.status,
        approvalStatus: c.approvalStatus,
        target: c.target,
        ...totals,
      };
    })
  );

  res.json({
    success: true,
    generatedAt: new Date(),
    count: report.length,
    data: report,
  });
});

// @desc    Export a fund report as CSV - "Export reports"
// @route   GET /api/funds/reports/export?disaster=
// @access  Private (Admin, Authority)
const exportFundReports = asyncHandler(async (req, res) => {
  const { disaster } = req.query;
  const campaignFilter = {};
  if (disaster) campaignFilter.relatedDisaster = disaster;

  const campaigns = await Campaign.find(campaignFilter).select("campaignId title status approvalStatus target");

  const rows = await Promise.all(
    campaigns.map(async (c) => {
      const { balance, credits, debits } = await FundTransaction.getCampaignBalance(c._id);
      return [c.campaignId, c.title, c.status, c.approvalStatus, c.target, credits, debits, balance];
    })
  );

  const header = ["Campaign ID", "Title", "Status", "Approval", "Target", "Raised", "Allocated", "Balance"];
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  await FundActivityLog.record({
    action: "fund_report_exported",
    user: req.user,
    details: { disaster: disaster || "all", campaignCount: campaigns.length },
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=fund-report.csv");
  res.send(csv);
});

// ---------------------------------------------------------------------------
// Send fund notifications
// ---------------------------------------------------------------------------

// @desc    Notify everyone who donated to a campaign (e.g. a status update) -
//          "Send fund notifications"
// @route   POST /api/funds/campaigns/:id/notify
// @access  Private (Admin, Authority)
const sendFundNotifications = asyncHandler(async (req, res) => {
  const { title, message } = req.body;
  if (!title) {
    res.status(400);
    throw new Error("Please provide a notification title");
  }

  const campaign = await loadCampaignOr404(req.params.id);

  if (req.fundScope === SCOPE.ASSIGNED && !isCampaignAssignedToAuthority(campaign, req.user)) {
    res.status(403);
    throw new Error("You can only notify donors of campaigns you created");
  }

  // Donors are identified by the User who recorded a Cash/Kind donation
  // against this campaign (donor accounts that aren't logged-in users -
  // e.g. a walk-in cash donor - have no account to notify).
  const donorUserIds = await Donation.find({ relatedCampaign: campaign._id }).distinct("recordedBy");

  await notifyMany(donorUserIds, {
    type: "System",
    title,
    message: message || "",
    createdBy: req.user._id,
  });

  await FundActivityLog.record({
    action: "fund_notification_sent",
    relatedCampaign: campaign._id,
    user: req.user,
    details: { title, recipientCount: donorUserIds.length },
  });

  res.json({ success: true, recipientCount: donorUserIds.length });
});

// ---------------------------------------------------------------------------
// Report misuse
// ---------------------------------------------------------------------------

// @desc    Flag a campaign/donation/assistance request for suspected misuse -
//          "Report misuse"
// @route   POST /api/funds/misuse-reports
// @access  Private (any authenticated role)
const reportMisuse = asyncHandler(async (req, res) => {
  const { description, relatedCampaign, relatedDonation, relatedAssistanceRequest } = req.body;
  if (!description) {
    res.status(400);
    throw new Error("Please describe the concern");
  }

  const report = await MisuseReport.create({
    reportedBy: req.user._id,
    description,
    relatedCampaign,
    relatedDonation,
    relatedAssistanceRequest,
  });

  await FundActivityLog.record({
    action: "misuse_reported",
    relatedCampaign: relatedCampaign || null,
    relatedDonation: relatedDonation || null,
    relatedAssistanceRequest: relatedAssistanceRequest || null,
    user: req.user,
  });

  // Let every Admin know a misuse report just came in.
  const admins = await User.find({ role: "Admin" }).select("_id");
  await notifyMany(admins.map((a) => a._id), {
    type: "System",
    title: "New misuse report",
    message: description,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, data: report });
});

// @desc    List misuse reports - Admin/Authority see reports tied to their
//          scope, everyone else sees only their own submissions.
// @route   GET /api/funds/misuse-reports?status=
// @access  Private
const getMisuseReports = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  if (req.user.role === "Admin") {
    // full visibility
  } else if (req.user.role === "Authority") {
    const ownCampaigns = await Campaign.find({ createdBy: req.user._id }).select("_id");
    filter.$or = [
      { reportedBy: req.user._id },
      { relatedCampaign: { $in: ownCampaigns.map((c) => c._id) } },
    ];
  } else {
    filter.reportedBy = req.user._id;
  }

  const reports = await MisuseReport.find(filter)
    .populate("reportedBy", "name role")
    .populate("reviewedBy", "name role")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: reports.length, data: reports });
});

// @desc    Triage a misuse report
// @route   PATCH /api/funds/misuse-reports/:id
// @access  Private (Admin, Authority)
const updateMisuseReport = asyncHandler(async (req, res) => {
  const { status, resolutionNotes } = req.body;
  const allowed = ["Reviewing", "Resolved", "Dismissed"];
  if (!status || !allowed.includes(status)) {
    res.status(400);
    throw new Error(`status must be one of: ${allowed.join(", ")}`);
  }

  const report = await MisuseReport.findById(req.params.id);
  if (!report) {
    res.status(404);
    throw new Error("Misuse report not found");
  }

  report.status = status;
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();
  if (resolutionNotes !== undefined) report.resolutionNotes = resolutionNotes;
  const updated = await report.save();

  res.json({ success: true, data: updated });
});

// ---------------------------------------------------------------------------
// View audit logs
// ---------------------------------------------------------------------------

// @desc    View the fund module's activity log - "View audit logs"
//          (Admin: FULL, Authority: LIMITED to campaigns they created,
//          Citizen/Volunteer: OWN activity only)
// @route   GET /api/funds/audit?campaign=&assistanceRequest=
// @access  Private
const getFundAuditLogs = asyncHandler(async (req, res) => {
  const { campaign, assistanceRequest } = req.query;
  const filter = {};
  if (campaign) filter.relatedCampaign = campaign;
  if (assistanceRequest) filter.relatedAssistanceRequest = assistanceRequest;

  if (req.fundScope === SCOPE.LIMITED) {
    const ownCampaigns = await Campaign.find({ createdBy: req.user._id }).select("_id");
    const ownCampaignIds = ownCampaigns.map((c) => c._id);
    if (assistanceRequest) {
      // Assistance-request logs aren't always tagged with a campaign (only
      // the allocate step is), so an Authority with LIMITED scope also sees
      // entries on this request that they personally performed (e.g. their
      // own office-verify/approve/reject), in addition to any allocate
      // entry against a campaign they created.
      filter.$or = [
        { relatedCampaign: { $in: ownCampaignIds } },
        { performedBy: req.user._id },
      ];
    } else {
      filter.relatedCampaign = { $in: ownCampaignIds };
    }
  } else if (req.fundScope === SCOPE.OWN) {
    filter.performedBy = req.user._id;
  }

  const logs = await FundActivityLog.find(filter)
    .populate("performedBy", "name role")
    .sort({ createdAt: -1 })
    .limit(200);

  res.json({ success: true, scope: req.fundScope, count: logs.length, data: logs });
});

module.exports = {
  getFundBalance,
  adjustFundBalance,
  trackFundUtilization,
  monitorTransactions,
  generateFundReports,
  exportFundReports,
  sendFundNotifications,
  reportMisuse,
  getMisuseReports,
  updateMisuseReport,
  getFundAuditLogs,
};
