const User = require('../models/user.model');
const B2BPurchaseRequest = require('../models/b2bPurchaseRequest.model');
const SpecialOrder = require('../models/specialOrder.model');
// const StoreInventory = require('../models/storeInventory.model');
const Skuinventories = require('../models/skuInventory.model');
const Course = require('../models/course.model');
const LoginLog = require('../models/loginLog.model');
const Customer = require('../models/customer.model');

/**
 * GET /api/dashboard/stats
 * Returns counts for admin dashboard (superuser only)
 */
const getDashboardStats = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalCustomer,
      totalOrders,
      totalSpoOrders,
      productsInStockResult,
      totalCourses,
      dailyVisits,
      totalVisits,
    ] = await Promise.all([
      User.countDocuments({ is_superuser: false }),
      Customer.countDocuments(),
      B2BPurchaseRequest.countDocuments(),
      SpecialOrder.countDocuments(),
      Skuinventories.aggregate([
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]),
      Course.countDocuments({ isActive: true }),
      LoginLog.countDocuments({ createdAt: { $gte: startOfToday } }),
      LoginLog.countDocuments(),
    ]);

    const productsInStock = productsInStockResult?.[0]?.total ?? 0;

    return res.status(200).json({
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalCustomer: totalCustomer || 0,
        totalOrders: totalOrders || 0,
        totalSpoOrders: totalSpoOrders || 0,
        productsInStock: Number(productsInStock) || 0,
        totalCourses: totalCourses || 0,
        revenue: 0,
        dailyVisits: dailyVisits ?? 0,
        totalVisits: totalVisits ?? 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch dashboard stats',
    });
  }
};

/**
 * GET /api/dashboard/weekly-sales
 * Returns B2B approved orders / revenue grouped by week (last 7 days)
 */
const getWeeklySales = async (req, res) => {
  try {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const pipeline = [
      {
        $match: {
          status: 'APPROVED',
          createdAt: { $gte: start },
        },
      },
      {
        $addFields: {
          dayKey: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        },
      },
      {
        $group: {
          _id: '$dayKey',
          orderCount: { $sum: 1 },
          revenue: {
            $sum: { $multiply: ['$quantity', { $ifNull: ['$cartItemPrice', 0] }] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const byDay = await B2BPurchaseRequest.aggregate(pipeline);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const found = byDay.find((w) => w._id === key);
      last7.push({
        day: dayNames[d.getDay()],
        date: key,
        orderCount: found?.orderCount ?? 0,
        revenue: found?.revenue ?? 0,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        weekly: last7,
        categories: last7.map((w) => w.day),
        revenueSeries: last7.map((w) => Math.round(w.revenue)),
        ordersSeries: last7.map((w) => w.orderCount),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch weekly sales',
    });
  }
};

/**
 * GET /api/dashboard/yearly-sales
 * Returns B2B approved orders / revenue grouped by month (current year)
 */
const getYearlySales = async (req, res) => {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          status: 'APPROVED',
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          orderCount: { $sum: 1 },
          revenue: {
            $sum: { $multiply: ['$quantity', { $ifNull: ['$cartItemPrice', 0] }] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const byMonth = await B2BPurchaseRequest.aggregate(pipeline);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const series = [];
    let totalRevenue = 0;
    let totalOrders = 0;
    for (let m = 1; m <= 12; m++) {
      const found = byMonth.find((x) => x._id === m);
      const orderCount = found?.orderCount ?? 0;
      const revenue = found?.revenue ?? 0;
      totalRevenue += revenue;
      totalOrders += orderCount;
      series.push({
        month: monthNames[m - 1],
        monthIndex: m,
        orderCount,
        revenue: Math.round(revenue),
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        year,
        monthly: series,
        categories: monthNames,
        revenueSeries: series.map((s) => s.revenue),
        ordersSeries: series.map((s) => s.orderCount),
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch yearly sales',
    });
  }
};

const newUsers = async (req , res) => {

try {

  const last24Hours = new Date(Date.now() -14 * 24 * 60 * 60 * 1000 )
  const newUser = await Customer.find({
  createdAt:{ $gte : last24Hours }
  }).sort({createdAt : -1});
  return res.status(200).json(newUser)
} catch (err) {
  return res.status(500).json({
    success:false,
    message: err?.message || "failed to fetch new users"
  })
}

}

module.exports = {
  getDashboardStats,
  getWeeklySales,
  getYearlySales,
  newUsers
};
