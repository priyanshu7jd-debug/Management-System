const asyncHandler = require("express-async-handler");
const Donation = require("../models/Donation");
const Campaign = require("../models/Campaign");
const FundActivityLog = require("../models/FundActivityLog");
const FundTransaction = require("../models/FundTransaction");
const { notify } = require("../utils/notify");
const { SCOPE } = require("../config/fundPermissions");
const { getVolunteerAssignment } = require("../middleware/fundAccessMiddleware");

const isStaff = (user) => user.role === "Authority" || user.role === "Admin";

// Hides donor identity on an anonymous donation from anyone who isn't
// staff or the person who recorded it. The donation record itself always
// keeps the real donor info - this only affects what's returned here.
function maskIfAnonymous(donation, viewer) {
  const obj = donation.toObject ? donation.toObject() : donation;
  if (!obj.isAnonymous) return obj;

  const recordedById = obj.recordedBy && obj.recordedBy._id ? obj.recordedBy._id.toString() : obj.recordedBy?.toString();
  const isOwner = viewer && recordedById === viewer._id.toString();
  if (isStaff(viewer) || isOwner) return obj;

  return { ...obj, donorName: "Anonymous", donorEmail: "", donorPhone: "" };
}

// Trims a donation down for a role with only LIMITED visibility (Volunteer
// on "View donations") - no donor PII, just the shape of the activity.
function trimForLimitedView(donation) {
  const { donorName, donorEmail, donorPhone, transactionId, ...rest } = donation;
  return { ...rest, donorName: "Donor" };
}

// @desc    Record a new donation (cash or in-kind) - "Make donation"
// @route   POST /api/donations
// @access  Private (any authenticated user)
const createDonation = asyncHandler(async (req, res) => {
  const {
    donorName,
    donorEmail,
    donorPhone,
    type,
    amount,
    paymentMethod,
    transactionId,
    itemName,
    quantity,
    unit,
    relatedDisaster,
    relatedShelter,
    relatedCampaign,
    notes,
    isAnonymous,
  } = req.body;

  if (!donorName || !type) {
    res.status(400);
    throw new Error("Please provide donor name and donation type");
  }

  // "Anonymous donation" is NONE for Volunteer per the Fund permission table.
  if (isAnonymous && req.user.role === "Volunteer") {
    res.status(403);
    throw new Error("Volunteers are not authorized to record an anonymous donation");
  }

  const donation = await Donation.create({
    donorName,
    donorEmail,
    donorPhone,
    type,
    amount,
    paymentMethod,
    transactionId,
    itemName,
    quantity,
    unit,
    relatedDisaster,
    relatedShelter,
    relatedCampaign,
    notes,
    isAnonymous: Boolean(isAnonymous),
    recordedBy: req.user._id,
  });

  await FundActivityLog.record({
    action: "donation_created",
    relatedDonation: donation._id,
    relatedCampaign: relatedCampaign || null,
    user: req.user,
    details: { type, amount, isAnonymous: Boolean(isAnonymous) },
  });

  res.status(201).json({ success: true, data: maskIfAnonymous(donation, req.user) });
});

// @desc    Get all donations (supports filtering + pagination) - "View donations"
//          Admin: FULL. Authority: ASSIGNED (their own campaigns or
//          donations they personally recorded). Citizen: OWN. Volunteer:
//          LIMITED (donor identity trimmed).
// @route   GET /api/donations?type=&status=&disaster=&shelter=&campaign=&search=&page=&limit=
// @access  Private
const getDonations = asyncHandler(async (req, res) => {
  const { type, status, disaster, shelter, campaign, search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (disaster) filter.relatedDisaster = disaster;
  if (shelter) filter.relatedShelter = shelter;
  if (campaign) filter.relatedCampaign = campaign;
  if (search) filter.donorName = { $regex: search, $options: "i" };

  if (req.fundScope === SCOPE.OWN) {
    filter.recordedBy = req.user._id;
  } else if (req.fundScope === SCOPE.ASSIGNED) {
    const ownCampaigns = await Campaign.find({ createdBy: req.user._id }).select("_id");
    filter.$or = [
      { recordedBy: req.user._id },
      { relatedCampaign: { $in: ownCampaigns.map((c) => c._id) } },
    ];
  }
  // SCOPE.LIMITED (Volunteer) and SCOPE.FULL (Admin) see every row matching
  // the query filters; LIMITED just gets a trimmed response below.

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [donations, total] = await Promise.all([
    Donation.find(filter)
      .populate("recordedBy", "name role")
      .populate("receivedBy", "name role")
      .populate("verifiedBy", "name role")
      .populate("relatedDisaster", "disasterId type location")
      .populate("relatedShelter", "shelterId name location")
      .populate("relatedCampaign", "campaignId title")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Donation.countDocuments(filter),
  ]);

  let data = donations.map((d) => maskIfAnonymous(d, req.user));
  if (req.fundScope === SCOPE.LIMITED) data = data.map(trimForLimitedView);

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

// @desc    Get donations recorded by / relevant to the logged-in user -
//          "View donation history" (Admin: FULL via /donations above,
//          Authority: ASSIGNED, Citizen: OWN, Volunteer: ASSIGNED to
//          their shelter)
// @route   GET /api/donations/me?status=&page=&limit=
// @access  Private
const getMyDonations = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) filter.status = status;

  if (req.user.role === "Volunteer") {
    const { assignedShelter } = await getVolunteerAssignment(req.user);
    filter.$or = [{ recordedBy: req.user._id }, ...(assignedShelter ? [{ relatedShelter: assignedShelter }] : [])];
  } else if (req.user.role === "Authority") {
    const ownCampaigns = await Campaign.find({ createdBy: req.user._id }).select("_id");
    filter.$or = [
      { recordedBy: req.user._id },
      { relatedCampaign: { $in: ownCampaigns.map((c) => c._id) } },
    ];
  } else {
    // Admin and Citizen: their own recorded donations (Admin's "own history",
    // full cross-user visibility for Admin is via GET /api/donations instead).
    filter.recordedBy = req.user._id;
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [donations, total] = await Promise.all([
    Donation.find(filter)
      .populate("relatedDisaster", "disasterId type location")
      .populate("relatedShelter", "shelterId name location")
      .populate("relatedCampaign", "campaignId title")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Donation.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: donations.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: donations.map((d) => maskIfAnonymous(d, req.user)),
  });
});

// @desc    Get a single donation by ID
// @route   GET /api/donations/:id
// @access  Private (Authority, Admin, or the user who recorded it)
const getDonationById = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id)
    .populate("recordedBy", "name role")
    .populate("receivedBy", "name role")
    .populate("verifiedBy", "name role")
    .populate("relatedDisaster", "disasterId type location")
    .populate("relatedShelter", "shelterId name location");

  if (!donation) {
    res.status(404);
    throw new Error("Donation not found");
  }

  const isOwner = donation.recordedBy && donation.recordedBy._id.toString() === req.user._id.toString();
  if (!isStaff(req.user) && !isOwner) {
    res.status(403);
    throw new Error("Not authorized to view this donation");
  }

  res.json({ success: true, data: maskIfAnonymous(donation, req.user) });
});

// @desc    Update full donation details
// @route   PUT /api/donations/:id
// @access  Private (Authority, Admin)
const updateDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  if (!donation) {
    res.status(404);
    throw new Error("Donation not found");
  }

  const fields = [
    "donorName",
    "donorEmail",
    "donorPhone",
    "type",
    "amount",
    "paymentMethod",
    "transactionId",
    "itemName",
    "quantity",
    "unit",
    "relatedDisaster",
    "relatedShelter",
    "relatedCampaign",
    "notes",
  ];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) donation[field] = req.body[field];
  });

  const updated = await donation.save();
  res.json({ success: true, data: updated });
});

// @desc    Update donation status (mark Received / Utilized / Cancelled)
// @route   PATCH /api/donations/:id/status
// @access  Private (Authority, Admin)
const updateDonationStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["Pending", "Received", "Utilized", "Cancelled"];

  if (!status || !validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${validStatuses.join(", ")}`);
  }

  const donation = await Donation.findById(req.params.id);
  if (!donation) {
    res.status(404);
    throw new Error("Donation not found");
  }

  donation.status = status;
  if (status === "Received") donation.receivedBy = req.user._id;

  const updated = await donation.save();

  // Let the person who logged the donation know its status changed - skip if
  // they're the one who just changed it themselves (no need to notify yourself)
  if (updated.recordedBy && updated.recordedBy.toString() !== req.user._id.toString()) {
    notify({
      recipient: updated.recordedBy,
      type: "Donation",
      title: `Donation ${updated.donationId} marked as ${status}`,
      message:
        updated.type === "Cash"
          ? `Cash donation of ${updated.amount} from ${updated.donorName} is now ${status}.`
          : `${updated.itemName} (${updated.quantity} ${updated.unit}) from ${updated.donorName} is now ${status}.`,
      createdBy: req.user._id,
      related: { relatedDonation: updated._id },
    });
  }

  res.json({ success: true, data: updated });
});

// @desc    Verify a donation for the fund ledger - "Verify donation".
//          Verifying a Cash donation tied to a campaign posts it as a
//          credit transaction against that campaign's balance.
// @route   PATCH /api/donations/:id/verify
// @access  Private (Authority, Admin)
const verifyDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  if (!donation) {
    res.status(404);
    throw new Error("Donation not found");
  }

  if (donation.verified) {
    res.status(400);
    throw new Error("Donation is already verified");
  }

  donation.verified = true;
  donation.verifiedBy = req.user._id;
  donation.verifiedAt = new Date();
  const updated = await donation.save();

  if (updated.type === "Cash" && updated.relatedCampaign) {
    await FundTransaction.record({
      type: "DonationReceived",
      direction: "credit",
      amount: updated.amount,
      relatedCampaign: updated.relatedCampaign,
      relatedDisaster: updated.relatedDisaster,
      relatedDonation: updated._id,
      performedBy: req.user._id,
      notes: `Verified donation ${updated.donationId}`,
    });
  }

  await FundActivityLog.record({
    action: "donation_verified",
    relatedDonation: donation._id,
    relatedCampaign: updated.relatedCampaign || null,
    user: req.user,
    details: { amount: updated.amount, type: updated.type },
  });

  res.json({ success: true, data: updated });
});

// @desc    Delete a donation record
// @route   DELETE /api/donations/:id
// @access  Private (Admin)
const deleteDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id);
  if (!donation) {
    res.status(404);
    throw new Error("Donation not found");
  }

  await donation.deleteOne();
  res.json({ success: true, message: "Donation deleted" });
});

// @desc    Dashboard stats - counts by status/type, total cash raised, total items
// @route   GET /api/donations/stats/summary
// @access  Private (Authority, Admin)
const getDonationStats = asyncHandler(async (req, res) => {
  const [byStatus, byType, cashTotals, total] = await Promise.all([
    Donation.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Donation.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
    Donation.aggregate([
      { $match: { type: "Cash" } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]),
    Donation.countDocuments(),
  ]);

  res.json({
    success: true,
    data: {
      total,
      byStatus,
      byType,
      totalCashRaised: cashTotals[0]?.totalAmount || 0,
    },
  });
});

module.exports = {
  createDonation,
  getDonations,
  getMyDonations,
  getDonationById,
  updateDonation,
  updateDonationStatus,
  verifyDonation,
  deleteDonation,
  getDonationStats,
};
