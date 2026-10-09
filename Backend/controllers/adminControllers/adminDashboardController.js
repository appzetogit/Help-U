const User = require('../../models/User');
const Worker = require('../../models/Worker');
const Booking = require('../../models/Booking');
const Withdrawal = require('../../models/Withdrawal');
const Settlement = require('../../models/Settlement');
const Scrap = require('../../models/Scrap');
const WorkerBill = require('../../models/WorkerBill');
const Transaction = require('../../models/Transaction');
const { BOOKING_STATUS, PAYMENT_STATUS, WORKER_STATUS } = require('../../utils/constants');

/**
 * Get overall dashboard stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    // Revenue date filter (use completedAt for revenue consistency)
    const revenueDateFilter = {};
    if (startDate || endDate) {
      revenueDateFilter.completedAt = {};
      if (startDate) revenueDateFilter.completedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        revenueDateFilter.completedAt.$lte = end;
      }
    }

    const workerBillDateFilter = {};
    if (startDate || endDate) {
      workerBillDateFilter.paidAt = {};
      if (startDate) workerBillDateFilter.paidAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        workerBillDateFilter.paidAt.$lte = end;
      }
    }

    const [
      totalUsers,
      totalWorkers,
      totalBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      revenueResult,
      workerBillRevenueResult,
      pendingWorkers,
      approvedWorkers,
      pendingWithdrawals,
      pendingSettlementsCount,
      pendingScraps,
      recentActivityDocs
    ] = await Promise.all([
      User.countDocuments({ isActive: true, ...dateFilter }),
      Worker.countDocuments({ isActive: true, ...dateFilter }),
      Booking.countDocuments(dateFilter),
      Booking.countDocuments({
        ...dateFilter,
        status: { $nin: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED] }
      }),
      Booking.countDocuments({
        ...dateFilter,
        status: BOOKING_STATUS.COMPLETED
      }),
      Booking.countDocuments({
        ...dateFilter,
        status: BOOKING_STATUS.CANCELLED
      }),
      Booking.aggregate([
        {
          $match: {
            status: BOOKING_STATUS.COMPLETED,
            paymentStatus: { $in: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_WORKER, 'success', 'collected_by_vendor', 'paid'] },
            ...revenueDateFilter
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$finalAmount' },
            totalBookings: { $sum: 1 }
          }
        }
      ]),
      WorkerBill.aggregate([
        {
          $match: {
            status: 'paid',
            ...workerBillDateFilter
          }
        },
        {
          $group: {
            _id: null,
            totalPlatformFeeCollected: { $sum: '$companyRevenue' },
            totalWorkerEarnings: { $sum: '$vendorTotalEarning' },
            totalGSTCollected: { $sum: '$totalGST' }
          }
        }
      ]),
      Worker.countDocuments({ approvalStatus: WORKER_STATUS.PENDING, ...dateFilter }),
      Worker.countDocuments({ approvalStatus: WORKER_STATUS.APPROVED, ...dateFilter }),
      Withdrawal.countDocuments({ status: 'pending', ...dateFilter }),
      Settlement.countDocuments({ status: 'pending', ...dateFilter }),
      Scrap.countDocuments({ status: 'pending', ...dateFilter }),
      Booking.find(dateFilter)
        .populate('userId', 'name phone')
        .populate('vendorId', 'name businessName')
        .populate('serviceId', 'title')
        .sort({ createdAt: -1 })
        .limit(20)
    ]);

    const revenue = revenueResult[0] || { totalRevenue: 0, totalBookings: 0 };
    const workerBillRevenue = workerBillRevenueResult[0] || {
      totalPlatformFeeCollected: 0,
      totalWorkerEarnings: 0,
      totalGSTCollected: 0
    };
    const platformCommission = workerBillRevenue.totalPlatformFeeCollected || (revenue.totalRevenue * 0.2);

    const recentBookings = recentActivityDocs.map(b => ({
      id: b.bookingNumber || b._id,
      _id: b._id,
      status: b.status,
      user: { name: b.userId?.name || 'Customer' },
      serviceType: b.serviceId?.title || b.serviceName,
      price: b.finalAmount || b.basePrice || 0,
      createdAt: b.createdAt,
      acceptedAt: b.acceptedAt,
      assignedAt: b.assignedAt,
      visitedAt: b.visitedAt,
      completedAt: b.completedAt
    }));

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalWorkers,
          totalBookings,
          pendingBookings,
          completedBookings,
          cancelledBookings,
          totalRevenue: revenue.totalRevenue,
          platformCommission,
          totalPlatformFeeCollected: workerBillRevenue.totalPlatformFeeCollected || 0,
          totalWorkerEarnings: workerBillRevenue.totalWorkerEarnings || 0,
          totalGSTCollected: workerBillRevenue.totalGSTCollected || 0,
          pendingWorkers,
          approvedWorkers,
          pendingWithdrawals,
          pendingSettlements: pendingSettlementsCount,
          pendingScraps
        },
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard stats. Please try again.'
    });
  }
};

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;

    let groupFormat = '%Y-%m';
    if (period === 'daily') {
      groupFormat = '%Y-%m-%d';
    } else if (period === 'weekly') {
      groupFormat = '%Y-%W';
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.completedAt = {};
      if (startDate) dateFilter.completedAt.$gte = new Date(startDate);
      if (endDate) dateFilter.completedAt.$lte = new Date(endDate);
    }

    // Revenue analytics
    const revenueData = await Booking.aggregate([
      {
        $match: {
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: { $in: [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_WORKER, 'success', 'collected_by_vendor', 'paid'] },
          ...dateFilter
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$completedAt'
            }
          },
          revenue: { $sum: '$finalAmount' },
          bookings: { $sum: 1 },
          platformCommission: { $sum: { $multiply: ['$finalAmount', 0.2] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        revenueData
      }
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue analytics. Please try again.'
    });
  }
};

/**
 * Get booking trends
 */
const getBookingTrends = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Daily booking trends
    const trends = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.CANCELLED] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        days: parseInt(days),
        trends
      }
    });
  } catch (error) {
    console.error('Get booking trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking trends. Please try again.'
    });
  }
};

/**
 * Get user growth metrics
 */
const getUserGrowthMetrics = async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // User growth
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Worker growth
    const workerGrowth = await Worker.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        days: parseInt(days),
        userGrowth,
        workerGrowth
      }
    });
  } catch (error) {
    console.error('Get user growth metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user growth metrics. Please try again.'
    });
  }
};

module.exports = {
  getDashboardStats,
  getRevenueAnalytics,
  getBookingTrends,
  getUserGrowthMetrics
};

