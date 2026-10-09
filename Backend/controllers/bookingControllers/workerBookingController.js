const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');
const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');

const ADVANCE_REQUEST_ALLOWED_STATUSES = [
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ASSIGNED,
  BOOKING_STATUS.JOURNEY_STARTED,
  BOOKING_STATUS.VISITED,
  BOOKING_STATUS.IN_PROGRESS
];

/**
 * Get worker bookings with filters
 */
const getWorkerBookings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, q, page = 1, limit = 20 } = req.query;

    // ── Get worker categories from req.user (set in auth middleware) ──
    let workerCategories = req.user.categories || req.user.service || [];
    if (!workerCategories.length) {
      const Worker = require('../../models/Worker');
      const v = await Worker.findById(vendorId, 'service').lean();
      workerCategories = v?.service || [];
    }

    const vId = new mongoose.Types.ObjectId(vendorId);

    // ── Build Base Query ──
    // This Or condition ensures workers see their own jobs OR relevant unassigned alerts
    const query = {
      $or: [
        { vendorId: vId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } },
        {
          vendorId: null,
          status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
          serviceCategory: { $in: workerCategories },
          'potentialVendors.vendorId': vId // Only show jobs where THIS worker is within range
        }
      ]
    };

    // ── Apply Status Group Filters ──
    if (status && status !== 'all') {
      if (status === 'in_progress') {
        query.status = {
          $in: [
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.ASSIGNED,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.JOURNEY_STARTED,
            BOOKING_STATUS.VISITED,
            BOOKING_STATUS.IN_PROGRESS,
            BOOKING_STATUS.WORK_DONE,
            'started', 'reached', 'on_the_way' // Supporting minor variants if they exist
          ]
        };
      } else if (status === 'completed') {
        query.status = {
          $in: [
            BOOKING_STATUS.COMPLETED,
            'settlement_pending', 'paid', 'closed'
          ]
        };
      } else if (status === 'assigned') {
        query.status = BOOKING_STATUS.ASSIGNED;
      } else {
        query.status = status;
      }
    }

    // ── Apply Search Filter (Simple regex on serviceName or bookingNumber) ──
    if (q) {
      query.$and = [
        {
          $or: [
            { serviceName: { $regex: q, $options: 'i' } },
            { bookingNumber: { $regex: q, $options: 'i' } }
          ]
        }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ── Single DB round-trip: list + total via $facet ──
    const [result] = await Booking.aggregate([
      { $match: query },
      {
        $facet: {
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) },
            {
              $project: {
                _id: 1,
                bookingNumber: 1,
                status: 1,
                paymentMethod: 1,
                finalAmount: 1,
                scheduledDate: 1,
                scheduledTime: 1,
                serviceName: 1,
                serviceCategory: 1,
                categoryIcon: 1,
                createdAt: 1,
                'address.addressLine1': 1,
                'address.city': 1,
                userId: 1,
                serviceId: 1,
                acceptedAt: 1,
                assignedAt: 1,
                brandName: 1,
                brandIcon: 1,
                expiresAt: 1
              }
            }
          ],
          total: [{ $count: 'n' }]
        }
      }
    ]);

    const bookings = result.data || [];
    const total = result.total?.[0]?.n || 0;

    // ── Populate only required fields ──
    await Booking.populate(bookings, [
      { path: 'userId', select: 'name phone', options: { lean: true } },
      {
        path: 'serviceId',
        select: 'title iconUrl categoryId',
        populate: { path: 'categoryId', select: 'title' },
        options: { lean: true }
      }
    ]);

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
    console.error('Get worker bookings error:', error);
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
    const vendorId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({
      _id: id,
      $or: [
        { vendorId },
        { vendorId: null, status: { $in: ['requested', 'searching'] } }
      ]
    })
      .populate('userId', 'name phone email profilePhoto')
      .populate('vendorId', 'name businessName phone email')
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
 * Accept booking
 */
const acceptBooking = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    // ATOMIC UPDATE: Check status and vendorId in query to prevent race conditions
    // Only accept if status is REQUESTED/SEARCHING and NO worker is assigned yet
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: id,
        status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
        vendorId: null // Crucial: Ensures another request didn't just take it
      },
      {
        $set: {
          vendorId: vendorId,
          acceptedAt: new Date(),
          // Check payment method for optimized status update logic
          status: BOOKING_STATUS.CONFIRMED // Default to confirmed
        }
      },
      { new: true } // Return updated doc
    );

    if (!updatedBooking) {
      // If update failed, check why (likely already taken)
      const existing = await Booking.findById(id);
      if (existing && existing.vendorId) {
        if (existing.vendorId.toString() === vendorId.toString()) {
          return res.status(200).json({
            success: true,
            data: existing,
            message: 'Booking already accepted by you'
          });
        }
        return res.status(409).json({ // 409 Conflict
          success: false,
          message: 'Sorry, this job has already been accepted by another worker.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Booking is no longer available.'
      });
    }

    // Booking successfully accepted by THIS worker
    const booking = updatedBooking;

    // Update worker availability to ON_JOB
    const Worker = require('../../models/Worker');
    await Worker.findByIdAndUpdate(vendorId, { availability: 'ON_JOB' });

    // Update BookingRequest statuses
    const BookingRequest = require('../../models/BookingRequest');

    // Mark this worker's request as ACCEPTED
    await BookingRequest.findOneAndUpdate(
      { bookingId: id, vendorId },
      { status: 'ACCEPTED', respondedAt: new Date() }
    );

    // Mark all other workers' requests as EXPIRED/CANCELLED
    await BookingRequest.updateMany(
      { bookingId: id, vendorId: { $ne: vendorId } },
      { status: 'EXPIRED', respondedAt: new Date() }
    );

    // Check payment status correction (if needed, though we set CONFIRMED above)
    if (booking.paymentMethod === 'plan_benefit' && booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      // already good
    }

    // NOTIFY OTHER WORKERS to remove this job
    // Use the stored notifiedVendors list
    const io = req.app.get('io');
    if (io && booking.notifiedVendors && booking.notifiedVendors.length > 0) {
      console.log(`[AcceptBooking] Notifying ${booking.notifiedVendors.length} other workers that job ${booking._id} was taken`);
      booking.notifiedVendors.forEach(otherWorkerId => {
        // Skip the current worker
        if (otherWorkerId.toString() !== vendorId.toString()) {
          const room = `vendor_${otherWorkerId.toString()}`;
          console.log(`[AcceptBooking] Emitting booking_taken to room: ${room}`);
          io.to(room).emit('booking_taken', {
            bookingId: booking._id.toString(), // Ensure string for frontend comparison
            message: 'This job has been accepted by someone else.'
          });
        }
      });
    } else {
      console.log('[AcceptBooking] No other workers to notify or io not available');
    }

    // Emit real-time updates to USER
    if (io) {
      const message = 'Worker has accepted your request. Your booking is confirmed!';

      io.to(`user_${booking.userId}`).emit('booking_accepted', {
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        worker: {
          id: vendorId,
          name: req.user.name,
          businessName: req.user.businessName
        },
        message
      });

      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        message: 'Worker has accepted your request'
      });
    }

    // Send notification to user
    const notificationMessage = `Your booking ${booking.bookingNumber} is confirmed! ${req.user.businessName || req.user.name} will arrive at scheduled time.`;

    await createNotification({
      userId: booking.userId,
      type: 'booking_accepted',
      title: 'Booking Confirmed!',
      message: notificationMessage,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_accepted',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
        // dataOnly: true // Ensure user sees this
      }
    });

    // Send Push Notification to user (handled by createNotification)

    res.status(200).json({
      success: true,
      message: 'Booking accepted successfully',
      data: booking
    });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept booking. Please try again.'
    });
  }
};

/**
 * Reject booking
 * IMPORTANT: This only marks the worker's rejection, NOT the booking itself.
 * Booking stays SEARCHING so other workers can accept.
 */
const rejectBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    // Find booking
    const booking = await Booking.findOne({
      _id: id,
      $or: [
        { notifiedVendors: vendorId },
        { vendorId: null, status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] } }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or not available for rejection'
      });
    }

    const validStatuses = [BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING];
    if (!validStatuses.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reject booking with status: ${booking.status}`
      });
    }

    // Update BookingRequest for this worker
    const BookingRequest = require('../../models/BookingRequest');
    await BookingRequest.findOneAndUpdate(
      { bookingId: id, vendorId },
      {
        status: 'REJECTED',
        respondedAt: new Date(),
        rejectReason: reason || 'Rejected by worker'
      }
    );

    // Remove worker from notifiedVendors (they've responded)
    booking.notifiedVendors = booking.notifiedVendors.filter(
      v => v.toString() !== vendorId.toString()
    );

    // Remove from potentialVendors too
    booking.potentialVendors = booking.potentialVendors.filter(
      v => v.vendorId?.toString() !== vendorId.toString()
    );

    // Check if ALL workers have rejected
    const pendingRequests = await BookingRequest.countDocuments({
      bookingId: id,
      status: { $in: ['PENDING', 'VIEWED'] }
    });

    const remainingPotential = booking.potentialVendors.length;

    if (pendingRequests === 0 && remainingPotential === 0) {
      // No workers left - mark booking as rejected/failed
      booking.status = BOOKING_STATUS.REJECTED;
      booking.cancelledAt = new Date();
      booking.cancelledBy = 'system';
      booking.cancellationReason = 'No workers available';

      // Notify user that no workers are available
      await createNotification({
        userId: booking.userId,
        type: 'booking_rejected',
        title: 'No Workers Available',
        message: `Sorry, no workers are available for booking ${booking.bookingNumber}. Please try again later.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'booking_rejected',
          bookingId: booking._id.toString(),
          link: `/user/booking/${booking._id}`
        }
      });
    }
    // Otherwise, booking stays SEARCHING for other workers

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking rejected successfully',
      data: { bookingId: id }
    });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject booking. Please try again.'
    });
  }
};

/**
 * Update booking status
 */
const updateBookingStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { status, finalSettlementStatus } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Validate status transition if status is changing
    if (status && status !== booking.status) {
      const validTransitions = {
        [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.REJECTED, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.AWAITING_PAYMENT]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED],
        [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.ASSIGNED]: [BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.VISITED]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.IN_PROGRESS]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.WORK_DONE]: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED]
      };

      if (!validTransitions[booking.status]?.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${booking.status} to ${status}`
        });
      }

      // Update booking status
      booking.status = status;

      if (status === BOOKING_STATUS.IN_PROGRESS && !booking.startedAt) {
        booking.startedAt = new Date();
      }

      if (status === BOOKING_STATUS.WORK_DONE && !booking.completedAt) {
        // Work done timestamp? Maybe reuse/add field? For now leave it.
      }

      if (status === BOOKING_STATUS.COMPLETED) {
        booking.completedAt = new Date();
      }
    }

    // Update other fields
    if (finalSettlementStatus) booking.finalSettlementStatus = finalSettlementStatus;

    await booking.save();

    // Send notification
    if (status === BOOKING_STATUS.COMPLETED) {
      await createNotification({
        userId: booking.userId,
        type: 'booking_completed',
        title: 'Booking Completed',
        message: `Your booking ${booking.bookingNumber} has been completed. Please rate your experience.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'booking_completed',
          bookingId: booking._id.toString(),
          link: `/user/booking/${booking._id}`
        }
      });

      // Send FCM push notification to user
      // Manual push removed - auto handled by createNotification
      // sendNotificationToUser(booking.userId, { ... });

      // SEND INVOICE EMAILS
      try {
        const { sendBookingCompletionEmails } = require('../../services/emailService');
        const fullBooking = await Booking.findById(booking._id)
          .populate('userId')
          .populate('vendorId')
          .populate('serviceId');

        sendBookingCompletionEmails(fullBooking).catch(err => console.error(err));
      } catch (emailErr) {
        console.error('Failed to send completion emails:', emailErr);
      }
    }

    // Emit socket event for real-time UI refresh
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: booking.status,
        message: `Booking status updated to ${booking.status}`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Booking status updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status. Please try again.'
    });
  }
};

/**
 * Add worker notes to booking
 */
const addWorkerNotes = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { notes } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Update booking
    booking.vendorNotes = notes;

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Notes added successfully',
      data: booking
    });
  } catch (error) {
    console.error('Add worker notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add notes. Please try again.'
    });
  }
};

/**
 * Start Self Job (Worker performing job)
 */
const startSelfJob = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // If journey already started, return current state
    if (booking.status === BOOKING_STATUS.JOURNEY_STARTED) {
      return res.status(200).json({ success: true, message: 'Journey already started', data: booking });
    }

    // Generate Visit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Update booking
    booking.status = BOOKING_STATUS.JOURNEY_STARTED;
    booking.journeyStartedAt = new Date();
    booking.visitOtp = otp;
    booking.assignedAt = booking.assignedAt || new Date();

    await booking.save();

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'journey_started',
      title: 'Worker Started Journey',
      message: `Worker is on the way! OTP for verification: ${otp}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'journey_started',
        bookingId: booking._id.toString(),
        visitOtp: otp,
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.JOURNEY_STARTED,
        visitOtp: otp
      });
    }

    res.status(200).json({ success: true, message: 'Journey started, OTP sent', data: booking });
  } catch (error) {
    console.error('Start self job error:', error);
    res.status(500).json({ success: false, message: 'Failed to start job' });
  }
};

/**
 * Worker Reached Location
 * Notify user to share OTP
 */
const workerReachedLocation = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;

    // Need visitOtp to resend it
    const booking = await Booking.findOne({ _id: id, vendorId }).select('+visitOtp');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    let otp = booking.visitOtp;
    if (!otp) {
      otp = Math.floor(1000 + Math.random() * 9000).toString();
      booking.visitOtp = otp;
      if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED && booking.status !== BOOKING_STATUS.VISITED) {
        booking.status = BOOKING_STATUS.JOURNEY_STARTED;
      }
      await booking.save();
    }

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'vendor_reached',
      title: 'Worker has Reached!',
      message: `Worker has reached your location. Please share this OTP: ${otp}`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'vendor_reached',
        bookingId: booking._id.toString(),
        visitOtp: otp,
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.JOURNEY_STARTED,
        visitOtp: otp,
        workerReached: true
      });
      io.to(`user_${booking.userId}`).emit('vendor_reached', {
        bookingId: booking._id,
        visitOtp: otp
      });
    }

    res.status(200).json({ success: true, message: 'User notified that worker reached', visitOtp: otp });
  } catch (error) {
    console.error('Worker reached location error:', error);
    res.status(500).json({ success: false, message: 'Failed to notify user' });
  }
};

/**
 * Verify Self Visit
 */
const verifySelfVisit = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { otp, location } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).select('+visitOtp');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) return res.status(400).json({ success: false, message: 'Journey not started' });
    if (booking.visitOtp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    booking.status = BOOKING_STATUS.VISITED;
    booking.visitedAt = new Date();
    booking.startedAt = new Date();
    booking.visitOtp = undefined;
    if (location) {
      booking.visitLocation = { ...location, verifiedAt: new Date() };
    }

    await booking.save();

    // Notify user
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'visit_verified',
      title: 'Visit Verified',
      message: `The professional has arrived and verified the visit. Service is now in progress.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high', // Ensure high priority
      pushData: {
        type: 'visit_verified',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.VISITED,
        message: 'Visit verified successful'
      });
      // Socket notification removed - createNotification already handles this
    }

    res.status(200).json({ success: true, message: 'Visit verified', data: booking });
  } catch (error) {
    console.error('Verify self visit error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify visit' });
  }
};

/**
 * Complete Self Job & Generate Bill
 * ──────────────────────────────────
 * Revenue Model:
 *   Worker → 70% of total service BASE (excl GST)
 *   Worker → 10% of total parts BASE  (excl GST)
 *   GST    → 100% retained by company
 *
 * CRITICAL: Worker earnings are NOT written to Booking.
 *           WorkerBill is the single source of truth.
 *           Earnings are only credited to wallet AFTER payment.
 */
const completeSelfJob = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { workPhotos, workDoneDetails, billDetails } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Status guard
    if (booking.status !== BOOKING_STATUS.VISITED && booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'Cannot complete from current status' });
    }

    // Prevent duplicate bills
    const WorkerBill = require('../../models/WorkerBill');
    const existingBill = await WorkerBill.findOne({ bookingId: booking._id });
    if (existingBill) {
      return res.status(400).json({ success: false, message: 'Bill already generated for this booking' });
    }

    // ── Fetch Settings (frozen snapshot for this bill) ──
    const Settings = require('../../models/Settings');
    const settings = await Settings.findOne({ type: 'global' });
    const serviceSplitPct = settings?.servicePayoutPercentage ?? 70;
    const partsSplitPct = settings?.partsPayoutPercentage ?? 10;
    const serviceGstPct = settings?.serviceGstPercentage ?? 18;
    const partsGstPct = settings?.partsGstPercentage ?? 18;

    // ═══════════════════════════════════════════
    // STEP 1: BUILD LINE ITEMS
    // ═══════════════════════════════════════════

    // -- Original booking service (from basePrice) --
    const originalBase = Number(booking.basePrice) || 0;
    const originalGST = parseFloat(((originalBase * serviceGstPct) / 100).toFixed(2));

    // -- Worker-added services --
    const billServices = (billDetails?.services || []).map(svc => {
      const price = Number(svc.price) || 0;
      const qty = Number(svc.quantity) || 1;
      const base = price * qty;
      const gst = parseFloat(((base * serviceGstPct) / 100).toFixed(2));
      return {
        catalogId: svc.catalogId || undefined,
        name: svc.name || 'Service',
        price,
        gstPercentage: serviceGstPct,
        quantity: qty,
        gstAmount: gst,
        total: parseFloat((base + gst).toFixed(2)),
        isOriginal: false
      };
    });

    // -- Parts --
    const billParts = (billDetails?.parts || []).map(part => {
      const price = Number(part.price) || 0;
      const qty = Number(part.quantity) || 1;
      const pGstPct = (part.gstPercentage != null) ? Number(part.gstPercentage) : partsGstPct;
      const base = price * qty;
      const gst = parseFloat(((base * pGstPct) / 100).toFixed(2));
      return {
        catalogId: part.catalogId || undefined,
        name: part.name || 'Part',
        price,
        gstPercentage: pGstPct,
        quantity: qty,
        gstAmount: gst,
        total: parseFloat((base + gst).toFixed(2))
      };
    });

    // ═══════════════════════════════════════════
    // STEP 2: CALCULATE BASE TOTALS
    // ═══════════════════════════════════════════

    const vendorServiceBase = billServices.reduce((s, sv) => s + (sv.price * sv.quantity), 0);
    const totalServiceBase = parseFloat((originalBase + vendorServiceBase).toFixed(2));
    const totalPartsBase = parseFloat(billParts.reduce((s, p) => s + (p.price * p.quantity), 0).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 3: CALCULATE GST TOTALS
    // ═══════════════════════════════════════════

    const vendorServiceGST = parseFloat(billServices.reduce((s, sv) => s + sv.gstAmount, 0).toFixed(2));
    const partsGST = parseFloat(billParts.reduce((s, p) => s + p.gstAmount, 0).toFixed(2));
    const totalGST = parseFloat((originalGST + vendorServiceGST + partsGST).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 4: FINAL BILL (what user pays)
    // ═══════════════════════════════════════════

    const visitingCharges = Number(booking.visitingCharges) || 0;
    const grandTotal = parseFloat((totalServiceBase + totalPartsBase + totalGST + visitingCharges).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 5: REVENUE SPLIT (internal only)
    // ═══════════════════════════════════════════
    // Worker % is applied ONLY on base — never on GST

    const vendorServiceEarning = parseFloat(((totalServiceBase * serviceSplitPct) / 100).toFixed(2));
    const vendorPartsEarning = parseFloat(((totalPartsBase * partsSplitPct) / 100).toFixed(2));
    const vendorTotalEarning = parseFloat((vendorServiceEarning + vendorPartsEarning).toFixed(2));
    const companyRevenue = parseFloat((grandTotal - vendorTotalEarning).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 6: PERSIST BILL
    // ═══════════════════════════════════════════

    // Include original service as line item for completeness
    const allServices = [
      {
        name: booking.serviceName || 'Original Service',
        price: originalBase,
        gstPercentage: serviceGstPct,
        quantity: 1,
        gstAmount: originalGST,
        total: parseFloat((originalBase + originalGST).toFixed(2)),
        isOriginal: true
      },
      ...billServices
    ];

    const bill = await WorkerBill.create({
      bookingId: booking._id,
      vendorId,

      // Line items
      services: allServices,
      parts: billParts,

      // Base totals
      originalServiceBase: originalBase,
      vendorServiceBase,
      totalServiceBase,
      totalPartsBase,
      visitingCharges,

      // GST totals
      originalGST,
      vendorServiceGST,
      partsGST,
      totalGST,

      // Bill total
      grandTotal,

      // Payout config snapshot
      payoutConfig: {
        serviceSplitPercentage: serviceSplitPct,
        partsSplitPercentage: partsSplitPct,
        serviceGstPercentage: serviceGstPct,
        partsGstPercentage: partsGstPct
      },

      // Revenue split
      vendorServiceEarning,
      vendorPartsEarning,
      vendorTotalEarning,
      companyRevenue,

      status: 'generated',
      generatedAt: new Date()
    });

    // ═══════════════════════════════════════════
    // STEP 7: UPDATE BOOKING (no earnings!)
    // ═══════════════════════════════════════════

    booking.status = BOOKING_STATUS.WORK_DONE;
    booking.finalAmount = grandTotal;
    booking.userPayableAmount = grandTotal; // Ensure consistency
    booking.vendorBillId = bill._id;

    // Reuse existing Payment OTP for cash collection or generate new one
    const payOtp = booking.customerConfirmationOTP || booking.paymentOtp || Math.floor(1000 + Math.random() * 9000).toString();
    booking.paymentOtp = payOtp;
    booking.customerConfirmationOTP = payOtp;

    if (workPhotos) booking.workPhotos = workPhotos;

    // Store bill summary in workDoneDetails for frontend display
    booking.workDoneDetails = {
      ...(typeof workDoneDetails === 'object' ? workDoneDetails : {}),
      billId: bill._id.toString(),
      items: [
        ...allServices.map(s => ({ title: s.name, qty: s.quantity, price: s.total })),
        ...billParts.map(p => ({ title: p.name, qty: p.quantity, price: p.total }))
      ]
    };
    booking.markModified('workDoneDetails');

    await booking.save();

    // ── Notify user ──
    const { createNotification } = require('../notificationControllers/notificationController');
    
    // 1. Notify user that work is completed
    await createNotification({
      userId: booking.userId,
      type: 'work_completed',
      title: 'Work Completed',
      message: `Work finished! Your bill is being prepared.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'work_completed',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    // 2. Notify user with Final Bill and OTP (The missing piece)
    await createNotification({
      userId: booking.userId,
      type: 'work_done',
      title: 'Billing Ready',
      message: `Bill Generated: ₹${grandTotal}. Your verification OTP is ${payOtp}. Please share this with the professional to complete.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'work_done',
        bookingId: booking._id.toString(),
        paymentOtp: payOtp,
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.WORK_DONE,
        finalAmount: grandTotal
      });
    }

    // Response: bill totals only, NO worker earnings exposed
    res.status(200).json({
      success: true,
      message: 'Work done, bill generated',
      data: {
        booking,
        bill: {
          id: bill._id,
          grandTotal,
          totalGST,
          totalServiceBase,
          totalPartsBase
        }
      }
    });
  } catch (error) {
    console.error('Complete self job error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete job' });
  }
};

/**
 * Collect Self Cash
 * ─────────────────
 * Called after user confirms OTP for cash payment.
 *
 * Wallet logic:
 *   dues     += grandTotal          (worker physically holds this cash)
 *   earnings += vendorTotalEarning  (worker's rightful share)
 *   Net owed to platform = dues − earnings
 *
 * WorkerBill is the ONLY source of truth for earnings.
 */
const collectSelfCash = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { otp } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).select('+paymentOtp +customerConfirmationOTP');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.WORK_DONE) return res.status(400).json({ success: false, message: 'Work not done yet' });
    const expectedOtp = booking.customerConfirmationOTP || booking.paymentOtp;
    if (expectedOtp && expectedOtp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP. Please check code with customer.' });

    // ── Fetch the WorkerBill (single source of truth) ──
    const WorkerBill = require('../../models/WorkerBill');
    const bill = await WorkerBill.findOne({ bookingId: booking._id });
    if (!bill) return res.status(500).json({ success: false, message: 'Bill not found — cannot process payment' });

    const grandTotal = Number(bill.grandTotal) || 0;
    const vendorEarning = Number(bill.vendorTotalEarning) || 0;

    // ── Update Booking status ──
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.paymentMethod = 'cash collected'; // Standardized label
    booking.paymentStatus = PAYMENT_STATUS.COLLECTED_BY_WORKER;
    booking.cashCollected = true;
    booking.cashCollectedBy = 'vendor';
    booking.cashCollectorId = vendorId;
    booking.cashCollectedAt = new Date();
    booking.completedAt = new Date();
    booking.paymentOtp = undefined;
    booking.customerConfirmationOTP = undefined;
    await booking.save();

    // ── Update WorkerBill status ──
    bill.status = 'paid';
    bill.paidAt = new Date();
    await bill.save();

    // ── Update Worker Wallet (Atomic with $inc) ──
    const Worker = require('../../models/Worker');
    const workerDoc = await Worker.findById(vendorId).select('wallet');

    if (workerDoc) {
      const currentDues = (workerDoc.wallet.dues || 0) + grandTotal;
      const cashLimit = workerDoc.wallet.cashLimit || 10000;
      // Net owed = dues − earnings (worker keeps their share from cash)
      const netOwed = currentDues - ((workerDoc.wallet.earnings || 0) + vendorEarning);
      const isBlocked = netOwed > cashLimit;

      const updateQuery = {
        $inc: {
          'wallet.dues': grandTotal,
          'wallet.earnings': vendorEarning,
          'wallet.totalCashCollected': grandTotal
        }
      };

      if (isBlocked) {
        updateQuery.$set = {
          'wallet.isBlocked': true,
          'wallet.blockedAt': new Date(),
          'wallet.blockReason': `Cash limit exceeded. Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${cashLimit}`
        };
      }

      await Worker.findByIdAndUpdate(vendorId, updateQuery);

      // ── Create Transaction Records ──
      const Transaction = require('../../models/Transaction');

      // Transaction 1: Cash Collected (Platform is owed this amount)
      await Transaction.create({
        vendorId,
        bookingId: booking._id,
        type: 'cash_collected',
        amount: grandTotal,
        status: 'completed',
        paymentMethod: 'cash collected', // Standardized label
        description: `Cash ₹${grandTotal} collected for booking #${booking.bookingNumber}. Dues increased.`,
        metadata: {
          type: 'dues_increase',
          collectedBy: 'vendor',
          billId: bill._id.toString(),
          grandTotal,
          vendorEarning,
          companyRevenue: bill.companyRevenue
        }
      });

      // Transaction 2: Earnings Credit (Worker's rightful share)
      if (vendorEarning > 0) {
        await Transaction.create({
          vendorId,
          bookingId: booking._id,
          type: 'earnings_credit',
          amount: vendorEarning,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Earnings ₹${vendorEarning} credited for booking #${booking.bookingNumber} (70% service + 10% parts)`,
          metadata: {
            type: 'earnings_increase',
            billId: bill._id.toString(),
            serviceEarning: bill.vendorServiceEarning,
            partsEarning: bill.vendorPartsEarning
          }
        });
      }
    }

    // ── Notify user ──
    const { createNotification } = require('../notificationControllers/notificationController');
    await createNotification({
      userId: booking.userId,
      type: 'payment_received',
      title: 'Payment Received (Cash)',
      message: `Payment of ₹${grandTotal} received in cash for booking ${booking.bookingNumber}. Job Completed. Thanks!`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high'
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.COMPLETED,
        paymentStatus: PAYMENT_STATUS.COLLECTED_BY_WORKER
      });
      io.to(`user_${booking.userId}`).emit('payment_success', {
        bookingId: booking._id,
        amount: grandTotal,
        paymentMethod: 'cash'
      });
    }

    res.status(200).json({ success: true, message: 'Cash collected, job completed', data: booking });
  } catch (error) {
    console.error('Collect self cash error:', error);
    res.status(500).json({ success: false, message: 'Failed to process cash payment' });
  }
};

/**
 * Request advance payment from customer
 */
const requestAdvancePayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { id } = req.params;
    const { amount, reason, partsDescription } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!ADVANCE_REQUEST_ALLOWED_STATUSES.includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Advance payment can only be requested during an active booking. Current status: ${booking.status}`
      });
    }

    if (booking.advancePayment?.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Advance payment has already been collected for this booking'
      });
    }

    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid advance payment amount'
      });
    }

    const isUpdate = booking.advancePayment?.status === 'requested';

    booking.advancePayment = {
      status: 'requested',
      requestedAmount,
      paidAmount: 0,
      reason: reason?.trim() || (isUpdate ? booking.advancePayment?.reason : 'Advance requested for costly parts'),
      partsDescription: partsDescription?.trim() || (isUpdate ? booking.advancePayment?.partsDescription : null),
      requestedAt: new Date(),
      requestedBy: vendorId,
      paidAt: null,
      paymentMethod: null,
      paymentId: null,
      razorpayOrderId: null,
      razorpayPaymentId: null
    };

    await booking.save();

    // ── Notify user ──
    await createNotification({
      userId: booking.userId,
      type: 'advance_payment_requested',
      title: 'Advance Payment Requested',
      message: `Worker has requested an advance payment of ₹${requestedAmount}. Please review and pay.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'advance_payment_requested',
        bookingId: booking._id.toString(),
        amount: requestedAmount.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        advancePayment: booking.advancePayment
      });
    }

    res.status(200).json({
      success: true,
      message: isUpdate ? 'Advance payment request updated' : 'Advance payment request sent successfully',
      data: booking.advancePayment
    });
  } catch (error) {
    console.error('Request advance payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request advance payment'
    });
  }
};

/**
 * Get worker ratings and reviews
 */
const getWorkerRatings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch bookings where rating is not null
    const bookings = await Booking.find({ vendorId, rating: { $ne: null } })
      .populate('userId', 'name profilePhoto')
      .populate('serviceId', 'title iconUrl')
      .sort({ reviewedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments({ vendorId, rating: { $ne: null } });

    // Calculate average rating
    const stats = await Booking.aggregate([
      { $match: { vendorId: new mongoose.Types.ObjectId(vendorId), rating: { $ne: null } } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: bookings,
      stats: stats[0] || { averageRating: 0, totalReviews: 0, star5: 0, star4: 0, star3: 0, star2: 0, star1: 0 },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ratings'
    });
  }
};

/**
 * Get pending booking requests for worker (for reconnection)
 * Called when worker app reconnects to fetch any missed alerts
 */
const getPendingBookings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const BookingRequest = require('../../models/BookingRequest');

    // Get all pending booking requests for this worker
    const pendingRequests = await BookingRequest.find({
      vendorId,
      status: { $in: ['PENDING', 'VIEWED'] }
    })
      .populate({
        path: 'bookingId',
        match: { status: BOOKING_STATUS.SEARCHING, vendorId: null },
        populate: [
          { path: 'userId', select: 'name phone' },
          {
            path: 'serviceId',
            select: 'title iconUrl categoryId',
            populate: { path: 'categoryId', select: 'title' }
          }
        ]
      })
      .sort({ sentAt: -1 })
      .limit(20);

    // Filter out null bookings (already accepted by others)
    const validRequests = pendingRequests.filter(r => r.bookingId !== null);

    // Format response
    const bookings = validRequests.map(req => ({
      requestId: req._id,
      bookingId: req.bookingId._id,
      bookingNumber: req.bookingId.bookingNumber,
      serviceName: req.bookingId.serviceId?.title || req.bookingId.serviceName,
      customerName: req.bookingId.userId?.name,
      customerPhone: req.bookingId.userId?.phone,
      scheduledDate: req.bookingId.scheduledDate,
      scheduledTime: req.bookingId.scheduledTime,
      address: req.bookingId.address,
      price: req.bookingId.finalAmount,
      distance: req.distance,
      wave: req.wave,
      sentAt: req.sentAt,
      status: req.status,
      serviceCategory: req.bookingId.serviceCategory,
      brandName: req.bookingId.brandName,
      brandIcon: req.bookingId.brandIcon,
      categoryIcon: req.bookingId.categoryIcon,
      createdAt: req.bookingId.createdAt,
      expiresAt: req.bookingId.expiresAt
    }));

    res.status(200).json({
      success: true,
      data: bookings,
      count: bookings.length
    });
  } catch (error) {
    console.error('Get pending bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending bookings'
    });
  }
};

module.exports = {
  getWorkerBookings,
  getBookingById,
  acceptBooking,
  rejectBooking,
  updateBookingStatus,
  addWorkerNotes,
  startSelfJob,
  workerReachedLocation,
  verifySelfVisit,
  completeSelfJob,
  collectSelfCash,
  requestAdvancePayment,
  getWorkerRatings,
  getPendingBookings
};
