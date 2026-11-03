const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS, ADMIN_CANCELLABLE_STATUSES } = require('../../utils/constants');
const { claimCancellation, rollbackCancellation, explainRefusal } = require('../../services/bookingCancellation');
const escapeRegex = require('../../utils/escapeRegex');
const adminAssignment = require('../../services/adminAssignmentService');
const { OPEN_STATUSES } = adminAssignment;

/**
 * Get all bookings with filters and search
 */
const getAllBookings = async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      userId,
      vendorId,
      awaitingAdmin,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (status) query.status = new RegExp(`^${escapeRegex(status)}$`, 'i');
    if (paymentStatus) query.paymentStatus = new RegExp(`^${escapeRegex(paymentStatus)}$`, 'i');
    if (userId) query.userId = userId;
    if (vendorId) query.vendorId = vendorId;
    // The admin assignment queue: open bookings nobody could take automatically
    if (awaitingAdmin === 'true' || awaitingAdmin === true) {
      query.awaitingAdmin = true;
      query.vendorId = null;
      query.status = { $in: OPEN_STATUSES };
    }

    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    // Search by booking number or service name
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { bookingNumber: { $regex: safeSearch, $options: 'i' } },
        { serviceName: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .select('-workPhotos') // list views never show them; they can be megabytes
      .populate('userId', 'name phone email')
      .populate('vendorId', 'name businessName phone')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings. Please try again.'
    });
  }
};

/**
 * Get booking details by ID
 */
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('userId', 'name phone email addresses')
      .populate('vendorId', 'name businessName phone email address')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking. Please try again.'
    });
  }
};

/**
 * Cancel booking (admin)
 */
const cancelBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { cancellationReason } = req.body;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Support can cancel up to and including work in progress; a finished booking can only be disputed.
    if (!ADMIN_CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({ success: false, message: explainRefusal(booking.status) });
    }

    // Claim the cancellation in one conditional update before any money moves, so a booking that was
    // completed or cancelled in the meantime is never refunded or overwritten.
    const reason = cancellationReason || 'Cancelled by admin';
    const previous = await claimCancellation(booking._id, {
      allowedStatuses: ADMIN_CANCELLABLE_STATUSES,
      by: 'admin',
      reason,
      extra: { awaitingAdmin: false }
    });
    if (!previous) {
      const current = await Booking.findById(booking._id).select('status').lean();
      return res.status(400).json({ success: false, message: explainRefusal(current?.status) });
    }

    let refundedNow = 0;
    try {
    // Process refund if booking was paid
    const isPaid = [PAYMENT_STATUS.SUCCESS, 'paid'].includes(booking.paymentStatus);
    const advancePaid = booking.advancePayment?.status === 'paid' ? Number(booking.advancePayment?.paidAmount || 0) : 0;
    const totalToRefund = (isPaid ? Number(booking.finalAmount || 0) : 0) + advancePaid;

    if (totalToRefund > 0) {
      const User = require('../../models/User');
      const Transaction = require('../../models/Transaction');
      await User.findByIdAndUpdate(booking.userId, { $inc: { 'wallet.balance': totalToRefund } }).catch(() => null);
      await Transaction.create({
        userId: booking.userId,
        bookingId: booking._id,
        type: 'refund',
        amount: totalToRefund,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `Admin cancellation refund for booking #${booking.bookingNumber}`
      }).catch(() => null);

      refundedNow = totalToRefund;
    }

    // Restore coupon usage if applicable
    if (booking.couponId) {
      try {
        const Coupon = require('../../models/Coupon');
        const CouponRedemption = require('../../models/CouponRedemption');
        await Coupon.findByIdAndUpdate(booking.couponId, { $inc: { usedCount: -1 } });
        await CouponRedemption.deleteOne({ bookingId: booking._id });
      } catch (couponErr) {
        console.warn('[AdminCancelBooking] Failed to restore coupon usage:', couponErr.message);
      }
    }

    // Reset worker availability if assigned
    if (booking.vendorId) {
      const Worker = require('../../models/Worker');
      await Worker.findOneAndUpdate(
        { _id: booking.vendorId, availability: 'ON_JOB' },
        { $set: { availability: 'AVAILABLE' } }
      ).catch(err => console.error('[AdminCancelBooking] Failed to reset worker availability:', err.message));
    }

    } catch (effectError) {
      // Put the booking back (including its place in the admin queue) so the cancel can be retried
      await rollbackCancellation(booking._id, previous, { by: 'admin', restore: { awaitingAdmin: !!previous.awaitingAdmin } }).catch((rbErr) =>
        console.error(`[AdminCancelBooking] Could not roll back booking ${booking._id}:`, rbErr.message));
      throw effectError;
    }

    // Record the refund on the booking (the status itself was already set by the claim above)
    const finalBooking = refundedNow > 0
      ? await Booking.findOneAndUpdate(
        { _id: booking._id },
        { $set: { refundedAmount: (booking.refundedAmount || 0) + refundedNow, paymentStatus: PAYMENT_STATUS.REFUNDED } },
        { new: true, actor: 'admin' }
      )
      : await Booking.findById(booking._id);

    const { createNotification } = require('../notificationControllers/notificationController');
    if (booking.userId) {
      await createNotification({
        userId: booking.userId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled by Admin',
        message: `Your booking ${booking.bookingNumber} was cancelled by support. Reason: ${cancellationReason || 'Administrative cancellation'}.`,
        relatedId: booking._id,
        relatedType: 'booking'
      }).catch(() => null);
    }
    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled by Admin',
        message: `Booking ${booking.bookingNumber} was cancelled by support.`,
        relatedId: booking._id,
        relatedType: 'booking'
      }).catch(() => null);
    }

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: finalBooking || booking
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking. Please try again.'
    });
  }
};

/**
 * Bookings waiting for an admin to pick a professional, oldest first.
 * GET /api/admin/bookings/unassigned
 */
const getUnassignedBookings = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = { awaitingAdmin: true, vendorId: null, status: { $in: OPEN_STATUSES } };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .select('-workPhotos -potentialVendors')
        .populate('userId', 'name phone email')
        .populate('serviceId', 'title iconUrl')
        .populate('categoryId', 'title slug')
        .populate('zoneId', 'name')
        .sort({ adminQueuedAt: 1, createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Booking.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Get unassigned bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bookings. Please try again.' });
  }
};

/**
 * Professionals the admin can pick for one booking.
 * GET /api/admin/bookings/:id/assignable-workers?search=
 */
const getAssignableWorkers = async (req, res) => {
  try {
    const data = await adminAssignment.listAssignableWorkers(req.params.id, { search: req.query.search });
    res.status(200).json({ success: true, ...data });
  } catch (error) {
    if (error instanceof adminAssignment.AssignmentError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Get assignable workers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load professionals. Please try again.' });
  }
};

/**
 * Send the booking to a professional chosen by the admin; they accept or decline as usual.
 * POST /api/admin/bookings/:id/assign   { workerId, note? }
 */
const assignBooking = async (req, res) => {
  try {
    const { workerId, note } = req.body || {};
    if (!workerId || !/^[0-9a-fA-F]{24}$/.test(String(workerId))) {
      return res.status(400).json({ success: false, message: 'Choose a professional to assign' });
    }

    const result = await adminAssignment.assignWorker(req.params.id, workerId, req.user?.id || req.user?._id, { note });

    res.status(200).json({
      success: true,
      message: `Request sent to ${result.worker.businessName || result.worker.name}. The booking is confirmed once they accept.`,
      data: result.booking,
      worker: result.worker
    });
  } catch (error) {
    if (error instanceof adminAssignment.AssignmentError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Assign booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign the booking. Please try again.' });
  }
};

/**
 * Get booking analytics
 */
const getBookingAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Total bookings
    const totalBookings = await Booking.countDocuments(dateFilter);

    // Bookings by status
    const bookingsByStatus = await Booking.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Bookings by payment status
    const bookingsByPaymentStatus = await Booking.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    // Revenue analytics
    const revenueStats = await Booking.aggregate([
      {
        $match: {
          ...dateFilter,
          paymentStatus: 'success'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$finalAmount' },
          totalBookings: { $sum: 1 },
          averageBookingValue: { $avg: '$finalAmount' }
        }
      }
    ]);

    // Daily bookings trend (last 30 days)
    const dailyTrend = await Booking.aggregate([
      {
        $match: {
          ...dateFilter,
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$finalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalBookings,
        bookingsByStatus: bookingsByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        bookingsByPaymentStatus: bookingsByPaymentStatus.reduce((acc, item) => {
          acc[item._id] = {
            count: item.count,
            totalAmount: item.totalAmount
          };
          return acc;
        }, {}),
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          totalBookings: 0,
          averageBookingValue: 0
        },
        dailyTrend
      }
    });
  } catch (error) {
    console.error('Get booking analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics. Please try again.'
    });
  }
};

module.exports = {
  getUnassignedBookings,
  getAssignableWorkers,
  assignBooking,
  getAllBookings,
  getBookingById,
  cancelBooking,
  getBookingAnalytics
};

