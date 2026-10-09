const Booking = require('../../models/Booking');
const WorkerBill = require('../../models/WorkerBill');
const Service = require('../../models/UserService');
const Settings = require('../../models/Settings');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');

/**
 * Get worker dashboard stats
 */
const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const mongoose = require('mongoose');
    const vId = new mongoose.Types.ObjectId(vendorId);

    // ── Get categories from req.user (from auth middleware) ──
    const workerCategories = [
      ...(Array.isArray(req.user.categories) ? req.user.categories : []),
      ...(Array.isArray(req.user.service) ? req.user.service : [])
    ];

    // ─── SINGLE PARALLEL BLAST ───────────────────────────────────────────────
    const [bookingData, earningsResult, bookingEarningsResult] = await Promise.all([
      // 1. ALL BOOKING DATA (Counts + Recent List + Rating) in ONE round-trip
      Booking.aggregate([
        {
          $facet: {
            // General Stats
            counts: [
              {
                $match: {
                  $or: [
                    { vendorId: vId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } },
                    {
                      vendorId: null,
                      status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
                      'potentialVendors.vendorId': vId
                    }
                  ]
                }
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  completed: { $sum: { $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0] } },
                  inProgress: {
                    $sum: {
                      $cond: [
                        {
                          $in: ['$status', [
                            BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.CONFIRMED,
                            BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS,
                            BOOKING_STATUS.WORK_DONE, 'started', 'reached', 'on_the_way'
                          ]]
                        }, 1, 0
                      ]
                    }
                  },
                  pending: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $and: [{ $eq: ['$vendorId', vId] }, { $eq: ['$status', BOOKING_STATUS.REQUESTED] }] },
                            { $and: [{ $eq: ['$vendorId', null] }, { $in: ['$status', [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING]] }] }
                          ]
                        }, 1, 0
                      ]
                    }
                  }
                }
              }
            ],
            // Average Rating
            rating: [
              { $match: { vendorId: vId, rating: { $ne: null } } },
              { $group: { _id: null, avg: { $avg: '$rating' } } }
            ],
            // Recent Bookings List (Optimized Projection)
            recent: [
              {
                $match: {
                  $or: [
                    { vendorId: vId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } },
                    {
                      vendorId: null,
                      status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
                      'potentialVendors.vendorId': vId
                    }
                  ]
                }
              },
              { $sort: { createdAt: -1 } },
              { $limit: 15 },
              {
                $project: {
                  _id: 1,
                  bookingNumber: 1,
                  status: 1,
                  serviceName: 1,
                  scheduledDate: 1,
                  scheduledTime: 1,
                  finalAmount: 1,
                  vendorEarnings: 1,
                  'address.addressLine1': 1,
                  userId: 1,
                  serviceId: 1,
                  potentialVendors: 1,
                  serviceCategory: 1,
                  brandName: 1,
                  brandIcon: 1,
                  categoryIcon: 1,
                  createdAt: 1,
                  expiresAt: 1
                }
              }
            ]
          }
        }
      ]),


      // 3. Total Earnings from WorkerBill
      WorkerBill.aggregate([
        { $match: { vendorId: vId, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$vendorTotalEarning' } } }
      ]),

      // 4. Completed Bookings Earnings breakdown (Total, Monthly, Today)
      Booking.aggregate([
        {
          $match: {
            vendorId: vId,
            status: BOOKING_STATUS.COMPLETED
          }
        },
        {
          $group: {
            _id: null,
            totalBookingRevenue: {
              $sum: { $ifNull: ['$vendorEarnings', { $multiply: ['$finalAmount', 0.9] }] }
            },
            monthlyBookingRevenue: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', new Date(new Date().getFullYear(), new Date().getMonth(), 1)] },
                  { $ifNull: ['$vendorEarnings', { $multiply: ['$finalAmount', 0.9] }] },
                  0
                ]
              }
            },
            todayBookingRevenue: {
              $sum: {
                $cond: [
                  {
                    $gte: [
                      '$createdAt',
                      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
                    ]
                  },
                  { $ifNull: ['$vendorEarnings', { $multiply: ['$finalAmount', 0.9] }] },
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    // ─── UNPACK & POPULATE ──────────────────────────────────────────────────
    const facet = bookingData[0];
    const counts = facet.counts?.[0] || { total: 0, completed: 0, inProgress: 0, pending: 0 };
    const recentBookings = facet.recent || [];
    const avgRatingVal = facet.rating?.[0]?.avg || req.user.rating || 5.0;
    
    const billEarnings = (earningsResult && earningsResult[0]?.total) || 0;
    const bookingEarnings = (bookingEarningsResult && bookingEarningsResult[0]?.totalBookingRevenue) || 0;
    const monthlyEarnings = (bookingEarningsResult && bookingEarningsResult[0]?.monthlyBookingRevenue) || 0;
    const todayEarnings = (bookingEarningsResult && bookingEarningsResult[0]?.todayBookingRevenue) || 0;
    
    const walletEarnings = req.user.wallet?.earnings || 0;
    const totalEarnings = Math.max(billEarnings, bookingEarnings, walletEarnings);

    // Minimal population for recent bookings (Lean)
    await Booking.populate(recentBookings, [
      { path: 'userId', select: 'name phone', options: { lean: true } },
      {
        path: 'serviceId',
        select: 'title iconUrl categoryId',
        populate: { path: 'categoryId', select: 'title' },
        options: { lean: true }
      }
    ]);

    // 5. Fetch Global Settings for Timing & Referral Reward
    const globalSettings = await Settings.findOne({ type: 'global' }).lean();
    const referralReward = globalSettings?.vendorReferralReward ?? 100;
    const vendorReferralEnabled = globalSettings?.vendorReferralEnabled ?? true;

    res.status(200).json({
      success: true,
      data: {
        config: {
          maxSearchTime: globalSettings?.maxSearchTime || 5, // mins
          waveDuration: globalSettings?.waveDuration || 60,  // secs
          referralReward,
          vendorReferralEnabled
        },
        stats: {
          totalBookings: counts.total,
          pendingBookings: counts.pending,
          completedBookings: counts.completed,
          inProgressBookings: counts.inProgress,
          completedServices: counts.completed,
          pendingServices: counts.pending + counts.inProgress,
          completedJobs: counts.completed,
          activeJobs: counts.inProgress,
          pendingAlerts: counts.pending,
          totalRevenue: Math.round(totalEarnings),
          totalEarnings: Math.round(totalEarnings),
          monthlyEarnings: Math.round(monthlyEarnings || (totalEarnings * 0.4)),
          todayEarnings: Math.round(todayEarnings),
          referralReward,
          vendorReferralEnabled,
          rating: parseFloat(Number(avgRatingVal).toFixed(1)),
          averageRating: parseFloat(Number(avgRatingVal).toFixed(1))
        },
        recentBookings
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { period = 'monthly' } = req.query; // daily, weekly, monthly

    let groupFormat = '%Y-%m-%d';
    if (period === 'weekly') {
      groupFormat = '%Y-%W'; // Year-Week
    } else if (period === 'monthly') {
      groupFormat = '%Y-%m'; // Year-Month
    }

    // Revenue analytics from WorkerBill
    const revenueData = await WorkerBill.aggregate([
      {
        $match: {
          vendorId: vendorId,
          status: 'paid'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: groupFormat,
              date: '$paidAt'
            }
          },
          revenue: { $sum: '$grandTotal' },
          earnings: { $sum: '$vendorTotalEarning' },
          bookings: { $sum: 1 }
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
 * Get service performance metrics
 */
const getServicePerformance = async (req, res) => {
  try {
    const vendorId = req.user.id;

    // Get service stats
    const serviceStats = await Booking.aggregate([
      {
        $match: {
          vendorId: vendorId
        }
      },
      {
        $group: {
          _id: '$serviceId',
          totalBookings: { $sum: 1 },
          completedBookings: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0]
            }
          },
          totalRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', BOOKING_STATUS.COMPLETED] },
                    { $eq: ['$paymentStatus', PAYMENT_STATUS.SUCCESS] }
                  ]
                },
                '$finalAmount',
                0
              ]
            }
          },
          averageRating: { $avg: '$rating' }
        }
      }
    ]);

    // Populate service details
    const serviceIds = serviceStats.map(s => s._id);
    const services = await Service.find({ _id: { $in: serviceIds } })
      .select('title iconUrl slug');

    const performance = serviceStats.map(stat => {
      const service = services.find(s => s._id.toString() === stat._id.toString());
      return {
        serviceId: stat._id,
        serviceName: service?.title || 'Unknown Service',
        iconUrl: service?.iconUrl,
        totalBookings: stat.totalBookings,
        completedBookings: stat.completedBookings,
        totalRevenue: stat.totalRevenue,
        averageRating: stat.averageRating ? stat.averageRating.toFixed(2) : null,
        completionRate: stat.totalBookings
          ? ((stat.completedBookings / stat.totalBookings) * 100).toFixed(2)
          : 0
      };
    });

    res.status(200).json({
      success: true,
      data: performance
    });
  } catch (error) {
    console.error('Get service performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service performance. Please try again.'
    });
  }
};

module.exports = {
  getDashboardStats,
  getRevenueAnalytics,
  getServicePerformance
};

