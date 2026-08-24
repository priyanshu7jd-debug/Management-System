const asyncHandler = require("express-async-handler");
const Disaster = require("../models/Disaster");
const Shelter = require("../models/Shelter");
const Volunteer = require("../models/Volunteer");
const Resource = require("../models/Resource");
const Task = require("../models/Task");
const Donation = require("../models/Donation");
const Alert = require("../models/Alert");
const User = require("../models/User");

// @desc    Cross-module admin dashboard - aggregated counts across every module
// @route   GET /api/dashboard/summary
// @access  Private (Authority, Admin)
const getDashboardSummary = asyncHandler(async (req, res) => {
  const [
    disasterTotal,
    disasterByStatus,
    disasterBySeverity,
    shelterTotal,
    shelterByStatus,
    shelterTotals,
    volunteerTotal,
    volunteerByStatus,
    resourceTotal,
    resourceLowStock,
    resourceByCategory,
    taskTotal,
    taskByStatus,
    taskOverdue,
    donationTotal,
    donationCashTotals,
    alertActive,
    userTotal,
    userByRole,
  ] = await Promise.all([
    Disaster.countDocuments(),
    Disaster.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Disaster.aggregate([{ $group: { _id: "$severity", count: { $sum: 1 } } }]),
    Shelter.countDocuments(),
    Shelter.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Shelter.aggregate([
      {
        $group: {
          _id: null,
          totalCapacity: { $sum: "$capacity" },
          totalOccupancy: { $sum: "$currentOccupancy" },
        },
      },
    ]),
    Volunteer.countDocuments(),
    Volunteer.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Resource.countDocuments(),
    Resource.countDocuments({ status: { $in: ["Low", "Depleted"] } }),
    Resource.aggregate([{ $group: { _id: "$category", count: { $sum: 1 }, quantity: { $sum: "$quantity" } } }]),
    Task.countDocuments(),
    Task.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $nin: ["Completed", "Cancelled"] } }),
    Donation.countDocuments(),
    Donation.aggregate([{ $match: { type: "Cash" } }, { $group: { _id: null, totalAmount: { $sum: "$amount" } } }]),
    Alert.countDocuments({ active: true }),
    User.countDocuments(),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
  ]);

  const shelterAgg = shelterTotals[0] || { totalCapacity: 0, totalOccupancy: 0 };
  const activeDisasterCount = disasterByStatus
    .filter((s) => ["Pending", "Verified", "In Progress"].includes(s._id))
    .reduce((sum, s) => sum + s.count, 0);

  res.json({
    success: true,
    data: {
      disasters: {
        total: disasterTotal,
        active: activeDisasterCount,
        byStatus: disasterByStatus,
        bySeverity: disasterBySeverity,
      },
      shelters: {
        total: shelterTotal,
        byStatus: shelterByStatus,
        totalCapacity: shelterAgg.totalCapacity,
        totalOccupancy: shelterAgg.totalOccupancy,
        occupancyRate:
          shelterAgg.totalCapacity > 0
            ? Math.round((shelterAgg.totalOccupancy / shelterAgg.totalCapacity) * 1000) / 10
            : 0,
      },
      volunteers: {
        total: volunteerTotal,
        byStatus: volunteerByStatus,
      },
      resources: {
        total: resourceTotal,
        lowStock: resourceLowStock,
        byCategory: resourceByCategory,
      },
      tasks: {
        total: taskTotal,
        byStatus: taskByStatus,
        overdue: taskOverdue,
      },
      donations: {
        total: donationTotal,
        totalCashRaised: donationCashTotals[0]?.totalAmount || 0,
      },
      alerts: {
        active: alertActive,
      },
      users: {
        total: userTotal,
        byRole: userByRole,
      },
    },
  });
});

// @desc    Cross-module trend data - daily counts over the last N days, for charts
// @route   GET /api/dashboard/trends?days=14
// @access  Private (Authority, Admin)
const getDashboardTrends = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  // Daily created-per-day counts for one model, keyed by "YYYY-MM-DD"
  const dailyCounts = async (Model) => {
    const rows = await Model.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
    ]);
    return rows.reduce((map, r) => {
      map[r._id] = r.count;
      return map;
    }, {});
  };

  const [disasterMap, alertMap, taskMap, donationMap] = await Promise.all([
    dailyCounts(Disaster),
    dailyCounts(Alert),
    dailyCounts(Task),
    dailyCounts(Donation),
  ]);

  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({
      date: key,
      disasters: disasterMap[key] || 0,
      alerts: alertMap[key] || 0,
      tasks: taskMap[key] || 0,
      donations: donationMap[key] || 0,
    });
  }

  res.json({ success: true, days, data: series });
});

module.exports = { getDashboardSummary, getDashboardTrends };
