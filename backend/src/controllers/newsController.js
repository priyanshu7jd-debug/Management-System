const path = require("path");
const fs = require("fs");
const asyncHandler = require("express-async-handler");
const News = require("../models/News");
const NewsCategory = require("../models/NewsCategory");
const User = require("../models/User");
const { UPLOAD_ROOT } = require("../middleware/uploadMiddleware");
const { notify } = require("../utils/notify");

// ---------------------------------------------------------------------------
// Role permission matrix (see project README / spec for the full table).
// Admin can do everything. Everyone else is gated as below:
//   Create news              Authority, Admin
//   Edit / Publish news      Admin (any) | Authority (only if assignedTo === self)
//   Delete / Approve / Reject news   Admin only
//   Mark as verified          Authority, Admin (any item, not just assigned)
//   Add disaster updates      Authority, Admin (auto-approved) | Volunteer (Pending, "report only")
//   Upload images/documents   Authority, Admin, Volunteer
//   Add official source       Authority, Admin
//   Report news/problem       everyone
//   Send emergency news       Authority, Admin
//   Schedule publication      Admin (any) | Authority ("Limited": own assigned items, <=72h out)
//   Manage categories/sources Admin only
//   View news analytics       Authority, Admin
//   View audit history        Admin (full) | Authority ("Limited": own created/assigned items only)
// ---------------------------------------------------------------------------

const STAFF_ROLES = ["Admin", "Authority"];
const AUTHORITY_SCHEDULE_WINDOW_MS = 72 * 60 * 60 * 1000; // "Limited" = at most 72h out

const isAdmin = (user) => user.role === "Admin";
const isAuthority = (user) => user.role === "Authority";

// An Authority may edit/publish/schedule only the item they're the assigned
// owner of. Admin can always act, regardless of assignment.
const canManage = (user, news) =>
  isAdmin(user) || (isAuthority(user) && news.assignedTo && news.assignedTo.toString() === user._id.toString());

const addAudit = (news, action, user, note = "") => {
  news.auditLog.push({ action, by: user._id, byRole: user.role, note });
};

// Any Draft/Approved item whose scheduled time has arrived gets flipped live.
// There's no job scheduler in this stack, so this is checked lazily whenever
// the news list is read - good enough for a scheduled-publish feature without
// adding new infrastructure.
const publishDueScheduled = async () => {
  const due = await News.find({
    status: { $in: ["Draft", "Approved"] },
    scheduledFor: { $ne: null, $lte: new Date() },
  });

  for (const item of due) {
    item.status = "Published";
    item.publishedAt = item.scheduledFor;
    item.auditLog.push({ action: "Auto-published (scheduled)", by: null, byRole: "System" });
    await item.save();
  }
};

// @desc    Report or draft a new news item
// @route   POST /api/news
// @access  Private (Authority, Admin)
const createNews = asyncHandler(async (req, res) => {
  const { headline, summary, content, category, region, tags, relatedDisaster, isEmergency } = req.body;

  if (!headline || !content || !category || !region) {
    res.status(400);
    throw new Error("Please provide headline, content, category and region");
  }

  const categoryDoc = await NewsCategory.findById(category);
  if (!categoryDoc) {
    res.status(400);
    throw new Error("Category not found");
  }

  const news = new News({
    headline,
    summary,
    content,
    category,
    region,
    tags,
    relatedDisaster,
    isEmergency: !!isEmergency,
    createdBy: req.user._id,
    // Authority authors are self-assigned by default, so they can manage
    // their own draft end-to-end without needing an Admin. Admin-authored
    // items are left unassigned until an Admin assigns an Authority.
    assignedTo: isAuthority(req.user) ? req.user._id : null,
  });

  addAudit(news, "Created", req.user);
  const created = await news.save();

  res.status(201).json({ success: true, data: created });
});

// @desc    List news (defaults to Published for Citizen/Volunteer; staff see all statuses)
// @route   GET /api/news?status=&category=&region=&emergency=&verified=&mine=&search=&page=&limit=
// @access  Private (any authenticated role)
const getNews = asyncHandler(async (req, res) => {
  await publishDueScheduled();

  const { status, category, region, emergency, verified, mine, search, page = 1, limit = 20 } = req.query;
  const filter = {};

  if (STAFF_ROLES.includes(req.user.role)) {
    if (status) filter.status = status;
  } else {
    // Citizens and Volunteers only ever see published news, regardless of what they ask for
    filter.status = "Published";
  }

  if (category) filter.category = category;
  if (region) filter.region = region;
  if (emergency !== undefined) filter.isEmergency = emergency === "true";
  if (verified !== undefined) filter.verified = verified === "true";
  if (mine === "true" && STAFF_ROLES.includes(req.user.role)) {
    filter.$or = [{ createdBy: req.user._id }, { assignedTo: req.user._id }];
  }
  if (search) filter.$text = { $search: search };

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);

  const [news, total] = await Promise.all([
    News.find(filter)
      .populate("category", "name slug")
      .populate("createdBy", "name role")
      .populate("assignedTo", "name role")
      .populate("verifiedBy", "name role")
      .sort({ isEmergency: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    News.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: news.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: news,
  });
});

// @desc    Get a single news item by ID
// @route   GET /api/news/:id
// @access  Private (any authenticated role - Citizen/Volunteer only for Published items)
const getNewsById = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id)
    .populate("category", "name slug")
    .populate("createdBy", "name role")
    .populate("assignedTo", "name role")
    .populate("verifiedBy", "name role")
    .populate("relatedDisaster", "type location");

  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (!STAFF_ROLES.includes(req.user.role) && news.status !== "Published") {
    res.status(404);
    throw new Error("News item not found");
  }

  if (news.status === "Published") {
    news.views += 1;
    await news.save();
  }

  res.json({ success: true, data: news });
});

// @desc    Edit a news item's content fields
// @route   PUT /api/news/:id
// @access  Private (Admin any | Authority if assigned)
const updateNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (!canManage(req.user, news)) {
    res.status(403);
    throw new Error("Only an Admin, or the Authority assigned to this item, can edit it");
  }

  const fields = ["headline", "summary", "content", "category", "region", "tags", "relatedDisaster"];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) news[field] = req.body[field];
  });

  addAudit(news, "Edited", req.user);
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Delete a news item
// @route   DELETE /api/news/:id
// @access  Private (Admin)
const deleteNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  await news.deleteOne();
  res.json({ success: true, message: "News item deleted" });
});

// @desc    Assign the responsible Authority for a news item
// @route   PATCH /api/news/:id/assign
// @access  Private (Admin)
const assignNews = asyncHandler(async (req, res) => {
  const { assignedTo } = req.body;

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (assignedTo) {
    const authority = await User.findById(assignedTo);
    if (!authority || authority.role !== "Authority") {
      res.status(400);
      throw new Error("assignedTo must be an existing Authority user");
    }
  }

  news.assignedTo = assignedTo || null;
  addAudit(news, "Reassigned", req.user, assignedTo ? `Assigned to ${assignedTo}` : "Unassigned");
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Submit a draft for Admin approval
// @route   PATCH /api/news/:id/submit
// @access  Private (Admin any | Authority if assigned)
const submitForApproval = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (!canManage(req.user, news)) {
    res.status(403);
    throw new Error("Only an Admin, or the Authority assigned to this item, can submit it for approval");
  }

  if (!["Draft", "Rejected"].includes(news.status)) {
    res.status(400);
    throw new Error(`Cannot submit a news item that is currently ${news.status}`);
  }

  news.status = "Pending Approval";
  news.rejectionReason = "";
  addAudit(news, "Submitted for approval", req.user);
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Approve a pending news item
// @route   PATCH /api/news/:id/approve
// @access  Private (Admin)
const approveNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (news.status !== "Pending Approval") {
    res.status(400);
    throw new Error("Only a news item that is Pending Approval can be approved");
  }

  news.status = "Approved";
  news.approvedBy = req.user._id;
  addAudit(news, "Approved", req.user);
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Reject a pending news item
// @route   PATCH /api/news/:id/reject
// @access  Private (Admin)
const rejectNews = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (news.status !== "Pending Approval") {
    res.status(400);
    throw new Error("Only a news item that is Pending Approval can be rejected");
  }

  news.status = "Rejected";
  news.rejectedBy = req.user._id;
  news.rejectionReason = reason || "";
  addAudit(news, "Rejected", req.user, reason || "");
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Publish a news item (skips approval for an Authority's own assigned Draft)
// @route   PATCH /api/news/:id/publish
// @access  Private (Admin any | Authority if assigned)
const publishNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (!canManage(req.user, news)) {
    res.status(403);
    throw new Error("Only an Admin, or the Authority assigned to this item, can publish it");
  }

  if (!["Draft", "Approved"].includes(news.status)) {
    res.status(400);
    throw new Error(`Cannot publish a news item that is currently ${news.status}. Submit it for approval first.`);
  }

  news.status = "Published";
  news.publishedAt = new Date();
  news.scheduledFor = null;
  addAudit(news, "Published", req.user);
  const updated = await news.save();

  notify({
    recipient: null,
    type: "News",
    title: updated.headline,
    message: updated.summary || "",
    createdBy: req.user._id,
    related: { relatedNews: updated._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Mark a news item as verified
// @route   PATCH /api/news/:id/verify
// @access  Private (Authority, Admin)
const verifyNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  news.verified = true;
  news.verifiedBy = req.user._id;
  addAudit(news, "Marked verified", req.user);
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Add a disaster update. Volunteer submissions land as Pending ("report only").
// @route   POST /api/news/:id/updates
// @access  Private (Authority, Admin, Volunteer)
const addDisasterUpdate = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text) {
    res.status(400);
    throw new Error("Update text is required");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  const status = req.user.role === "Volunteer" ? "Pending" : "Approved";

  news.disasterUpdates.push({
    text,
    addedBy: req.user._id,
    addedByRole: req.user.role,
    status,
  });
  addAudit(news, "Disaster update added", req.user, status === "Pending" ? "Pending review" : "Auto-approved");
  const updated = await news.save();

  res.status(201).json({ success: true, data: updated });
});

// @desc    Approve or dismiss a volunteer-reported disaster update
// @route   PATCH /api/news/:id/updates/:updateId
// @access  Private (Authority, Admin)
const reviewDisasterUpdate = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["Approved", "Dismissed"].includes(status)) {
    res.status(400);
    throw new Error("status must be Approved or Dismissed");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  const update = news.disasterUpdates.id(req.params.updateId);
  if (!update) {
    res.status(404);
    throw new Error("Disaster update not found");
  }

  update.status = status;
  update.reviewedBy = req.user._id;
  addAudit(news, `Disaster update ${status.toLowerCase()}`, req.user);
  const updated = await news.save();

  res.json({ success: true, data: updated });
});

// @desc    Upload images/documents to a news item (multipart/form-data, field "files", max 5)
// @route   POST /api/news/:id/media
// @access  Private (Authority, Admin, Volunteer)
const uploadNewsMedia = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("Please attach at least one file");
  }

  req.files.forEach((file) => {
    const url = `/uploads/news/${file.filename}`;
    if (file.mimetype.startsWith("image/")) {
      news.images.push({ url, uploadedBy: req.user._id });
    } else {
      news.documents.push({ url, name: file.originalname, uploadedBy: req.user._id });
    }
  });

  addAudit(news, "Media uploaded", req.user, `${req.files.length} file(s)`);
  const updated = await news.save();
  res.status(201).json({ success: true, data: updated });
});

// @desc    Remove one image or document from a news item
// @route   DELETE /api/news/:id/media
// @access  Private (Authority, Admin, or the Volunteer who uploaded it)
const deleteNewsMedia = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400);
    throw new Error("Please provide the url to remove");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  const item = [...news.images, ...news.documents].find((m) => m.url === url);
  if (!item) {
    res.status(404);
    throw new Error("File not found on this news item");
  }

  const isUploader = item.uploadedBy && item.uploadedBy.toString() === req.user._id.toString();
  if (!isUploader && !STAFF_ROLES.includes(req.user.role)) {
    res.status(403);
    throw new Error("Not authorized to remove this file");
  }

  news.images = news.images.filter((img) => img.url !== url);
  news.documents = news.documents.filter((doc) => doc.url !== url);
  addAudit(news, "Media removed", req.user, url);
  const updated = await news.save();

  const filename = path.basename(url);
  fs.unlink(path.join(UPLOAD_ROOT, "news", filename), () => {});

  res.json({ success: true, data: updated });
});

// @desc    Attach an official source citation to a news item
// @route   POST /api/news/:id/sources
// @access  Private (Authority, Admin)
const addSource = asyncHandler(async (req, res) => {
  const { name, url } = req.body;
  if (!name) {
    res.status(400);
    throw new Error("Source name is required");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  news.sources.push({ name, url, addedBy: req.user._id });
  addAudit(news, "Source added", req.user, name);
  const updated = await news.save();
  res.status(201).json({ success: true, data: updated });
});

// @desc    Remove a source citation from a news item
// @route   DELETE /api/news/:id/sources/:sourceId
// @access  Private (Authority, Admin)
const removeSource = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  const source = news.sources.id(req.params.sourceId);
  if (!source) {
    res.status(404);
    throw new Error("Source not found on this news item");
  }

  source.deleteOne();
  addAudit(news, "Source removed", req.user);
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Report a problem with a news item (inaccurate, outdated, abusive, ...)
// @route   POST /api/news/:id/report
// @access  Private (any authenticated role)
const reportNews = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400);
    throw new Error("Please provide a reason for the report");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  news.reports.push({ reportedBy: req.user._id, reason });
  const updated = await news.save();

  res.status(201).json({ success: true, data: updated });
});

// @desc    Review a report (mark reviewed/dismissed)
// @route   PATCH /api/news/:id/reports/:reportId
// @access  Private (Authority, Admin)
const reviewReport = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["Reviewed", "Dismissed"].includes(status)) {
    res.status(400);
    throw new Error("status must be Reviewed or Dismissed");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  const report = news.reports.id(req.params.reportId);
  if (!report) {
    res.status(404);
    throw new Error("Report not found");
  }

  report.status = status;
  addAudit(news, `Report ${status.toLowerCase()}`, req.user);
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    Send emergency news - publishes immediately and broadcasts to everyone
// @route   PATCH /api/news/:id/emergency
// @access  Private (Authority, Admin)
const sendEmergencyNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  news.isEmergency = true;
  news.status = "Published";
  news.publishedAt = new Date();
  news.scheduledFor = null;
  addAudit(news, "Sent as emergency news", req.user);
  const updated = await news.save();

  notify({
    recipient: null,
    type: "News",
    title: `EMERGENCY: ${updated.headline}`,
    message: updated.summary || "",
    createdBy: req.user._id,
    related: { relatedNews: updated._id },
  });

  res.json({ success: true, data: updated });
});

// @desc    Schedule a future publish time. Admin: any item, any time.
//          Authority ("Limited"): only their own assigned item, <=72h out.
// @route   PATCH /api/news/:id/schedule
// @access  Private (Admin any | Authority limited)
const schedulePublication = asyncHandler(async (req, res) => {
  const { scheduledFor } = req.body;
  const when = new Date(scheduledFor);

  if (!scheduledFor || Number.isNaN(when.getTime()) || when <= new Date()) {
    res.status(400);
    throw new Error("scheduledFor must be a valid future date");
  }

  const news = await News.findById(req.params.id);
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  if (!canManage(req.user, news)) {
    res.status(403);
    throw new Error("Only an Admin, or the Authority assigned to this item, can schedule it");
  }

  if (isAuthority(req.user) && when.getTime() - Date.now() > AUTHORITY_SCHEDULE_WINDOW_MS) {
    res.status(403);
    throw new Error("Authority users can only schedule publication up to 72 hours ahead");
  }

  if (!["Draft", "Approved"].includes(news.status)) {
    res.status(400);
    throw new Error(`Cannot schedule a news item that is currently ${news.status}`);
  }

  news.scheduledFor = when;
  addAudit(news, "Scheduled", req.user, when.toISOString());
  const updated = await news.save();
  res.json({ success: true, data: updated });
});

// @desc    News analytics - counts by status/category/region/emergency, most viewed
// @route   GET /api/news/stats/summary
// @access  Private (Authority, Admin)
const getNewsStats = asyncHandler(async (req, res) => {
  const [byStatus, byCategory, byRegion, emergencyCount, verifiedCount, total, mostViewed] = await Promise.all([
    News.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    News.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    News.aggregate([{ $group: { _id: "$region", count: { $sum: 1 } } }]),
    News.countDocuments({ isEmergency: true }),
    News.countDocuments({ verified: true }),
    News.countDocuments(),
    News.find({ status: "Published" }).sort({ views: -1 }).limit(5).select("newsId headline views"),
  ]);

  res.json({
    success: true,
    data: { total, emergencyCount, verifiedCount, byStatus, byCategory, byRegion, mostViewed },
  });
});

// @desc    View a news item's audit trail. Admin: full. Authority: own created/assigned items only.
// @route   GET /api/news/:id/audit
// @access  Private (Authority limited, Admin full)
const getAuditHistory = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id).select("+auditLog createdBy assignedTo");
  if (!news) {
    res.status(404);
    throw new Error("News item not found");
  }

  const isOwnItem =
    (news.createdBy && news.createdBy.toString() === req.user._id.toString()) ||
    (news.assignedTo && news.assignedTo.toString() === req.user._id.toString());

  if (isAuthority(req.user) && !isOwnItem) {
    res.status(403);
    throw new Error("Authority users can only view audit history for news they created or are assigned to");
  }

  res.json({ success: true, data: news.auditLog });
});

module.exports = {
  createNews,
  getNews,
  getNewsById,
  updateNews,
  deleteNews,
  assignNews,
  submitForApproval,
  approveNews,
  rejectNews,
  publishNews,
  verifyNews,
  addDisasterUpdate,
  reviewDisasterUpdate,
  uploadNewsMedia,
  deleteNewsMedia,
  addSource,
  removeSource,
  reportNews,
  reviewReport,
  sendEmergencyNews,
  schedulePublication,
  getNewsStats,
  getAuditHistory,
};
