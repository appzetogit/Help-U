const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { normalizeWorkPhotos, persistWorkPhotos } = require('../../utils/workPhotos');
const otpGuard = require('../../utils/otpGuard');
const { expectedPaymentCode, issuePaymentCode, clearPaymentCode, CODE_NOT_ISSUED } = require('../../utils/paymentCode');
const { summariseBookedDetails } = require('../../utils/detailFields');
const { createNotification } = require('../notificationControllers/notificationController');
const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');
const { resolveCommission, computeWorkerEarnings, toPayoutConfig, describeCommission } = require('../../services/commissionService');
const { handleWorkerCancellation, remainingCandidates, WORKER_CANCELLABLE_STATUSES } = require('../../services/reassignmentService');
const { getBookingConfig } = require('../../utils/bookingConfig');
const { computeBookingTotals } = require('../../utils/bookingTotals');
const escapeRegex = require('../../utils/escapeRegex');
const { RescheduleError, describeSlot, assertReschedulable, validateNewSlot, emitBookingUpdated } = require('../../services/rescheduleService');

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

    const vId = new mongoose.Types.ObjectId(vendorId);

    // ── Build Base Query ──
    // This Or condition ensures workers see their own jobs OR relevant unassigned alerts
    const query = {
      $or: [
        { vendorId: vId, status: { $ne: BOOKING_STATUS.AWAITING_PAYMENT } },
        {
          vendorId: null,
          status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING] },
          // Only jobs that have actually been SENT to this worker. That is already decided by the
          // alert matching (service, category or parent category), so no second, exact-text match on
          // serviceCategory is made here: it hid requests whose booking names the parent category
          // ("AC & Appliance Repair") while the worker lists the appliance ("Geyser").
          // (potentialVendors lists everyone
          // in range, including workers whose alert wave has not started; listing by that
          // let any worker see and sync a job before its wave, which defeated the waves.)
          notifiedVendors: vId
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
      const safeQ = escapeRegex(q);
      query.$and = [
        {
          $or: [
            { serviceName: { $regex: safeQ, $options: 'i' } },
            { bookingNumber: { $regex: safeQ, $options: 'i' } }
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
                'bookedItems.details': 1,
                'bookedItems.quantity': 1,
                'bookedItems.card.title': 1,
                brandIcon: 1,
                issuePhotos: 1,
                issueVideos: 1,
                customerNotes: 1,
                addOns: 1,
                isEmergency: 1,
                bookingType: 1,
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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;

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

    // The running total: what the booking costs now (including repair services the customer added), what has
    // been paid and what is still to collect. The professional's invoice and amount to collect use this.
    const { serviceGstPercentage } = await getBookingConfig();
    const data = booking.toJSON();
    data.totals = computeBookingTotals(booking, { gstPct: serviceGstPercentage });

    res.status(200).json({
      success: true,
      data
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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;

    // Availability rules, enforced again at the moment of acceptance (the alert may be old):
    //  - a scheduled job must not overlap another of this worker's jobs
    //  - an instant job cannot be taken while he is at work on another one
    const target = await Booking.findById(id).select('bookingType scheduledDate timeSlot vendorId status isEmergency').lean();
    if (target && !target.vendorId && [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING].includes(target.status)) {
      const { getBookingConfig } = require('../../utils/bookingConfig');
      const { getBusyWorkerIds, getConflictingWorkerIds, slotStartMs } = require('../../services/workerAvailabilityService');
      const availabilityConfig = await getBookingConfig();

      if (target.bookingType === 'scheduled' && !target.isEmergency) {
        const slotStart = slotStartMs(target);
        if (Number.isFinite(slotStart)) {
          const conflicts = await getConflictingWorkerIds([vendorId], { slotStart, config: availabilityConfig });
          if (conflicts.size > 0) {
            return res.status(409).json({
              success: false,
              message: 'You already have a job around this time. Pick a booking that does not overlap.'
            });
          }
        }
      } else if (availabilityConfig.excludeBusyWorkersForInstant) {
        const busy = await getBusyWorkerIds([vendorId]);
        if (busy.size > 0) {
          return res.status(409).json({
            success: false,
            message: 'Finish your current job before accepting a new instant booking.'
          });
        }
      }
    }

    // ATOMIC UPDATE: Check status and vendorId in query to prevent race conditions
    // Only accept if status is REQUESTED/SEARCHING/CONFIRMED (upfront paid) and NO worker is assigned yet
    const updatedBooking = await Booking.findOneAndUpdate(
      {
        _id: id,
        status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.CONFIRMED] },
        vendorId: null, // Crucial: Ensures another request didn't just take it
        // A booking waiting in the admin queue has no alerted workers; only the admin can hand it out
        awaitingAdmin: { $ne: true },
        // A worker who rejected or dropped this booking cannot take it back.
        excludedVendors: { $ne: vendorId },
        // ...and only a worker the booking was sent to can take it (an older booking with no
        // recorded notifications stays acceptable, so nothing already in flight breaks)
        $or: [{ notifiedVendors: vendorId }, { notifiedVendors: { $size: 0 } }, { notifiedVendors: { $exists: false } }]
      },
      {
        $set: {
          vendorId: vendorId,
          acceptedAt: new Date(),
          // Check payment method for optimized status update logic
          status: BOOKING_STATUS.CONFIRMED // Default to confirmed
        }
      },
      { new: true, actor: 'worker' } // Return updated doc
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
    // A scheduled job is for later; only an instant one puts the worker "on a job" now.
    if (updatedBooking.bookingType !== 'scheduled') {
      await Worker.findByIdAndUpdate(vendorId, { availability: 'ON_JOB' });
    }

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

    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
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

    // The admin picked this professional by hand and they said no: the booking goes back to the
    // admin queue so someone else can be chosen (it has no later waves to fall back on).
    const isAdminPick = booking.adminAssignedAt && !booking.vendorId
      && (booking.notifiedVendors || []).some((v) => v.toString() === vendorId.toString());
    if (isAdminPick) {
      const requeued = await require('../../services/adminAssignmentService').requeueAfterDecline(booking._id, vendorId);
      if (requeued) {
        return res.status(200).json({
          success: true,
          message: 'Booking rejected successfully',
          data: { bookingId: id }
        });
      }
      // Queue switched off: fall through to the normal "nobody left" handling below
    }

    // Remove worker from notifiedVendors (they've responded) and exclude them
    // from later waves. potentialVendors is left intact: the scheduler picks
    // each wave from it by skipping notified and excluded workers, so removing
    // entries would shift the list and skip someone.
    booking.notifiedVendors = booking.notifiedVendors.filter(
      v => v.toString() !== vendorId.toString()
    );
    if (!booking.excludedVendors.some(v => v.toString() === vendorId.toString())) {
      booking.excludedVendors.push(vendorId);
    }

    // Check if ALL workers have rejected
    const pendingRequests = await BookingRequest.countDocuments({
      bookingId: id,
      status: { $in: ['PENDING', 'VIEWED'] }
    });

    const remainingPotential = remainingCandidates(booking).length;

    // Everyone alerted so far has said no: alert the next wave now instead
    // of waiting out the wave timer.
    if (pendingRequests === 0 && remainingPotential > 0) {
      const config = await getBookingConfig();
      if (config.autoReassignOnReject && booking.status === BOOKING_STATUS.SEARCHING) {
        booking.waveStartedAt = new Date(0);
      }
    }

    if (pendingRequests === 0 && remainingPotential === 0) {
      // Everyone nearby has said no: an admin can still pick someone by hand
      const adminAssignment = require('../../services/adminAssignmentService');
      if (await adminAssignment.isQueueEnabled()) {
        await booking.save(); // keeps this professional excluded
        const queued = await adminAssignment.queueForAdmin(booking._id, { reason: 'no_worker_accepted' });
        if (queued) {
          return res.status(200).json({
            success: true,
            message: 'Booking rejected successfully',
            data: { bookingId: id }
          });
        }
      }

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
 * What dropping this job would cost the professional right now, shown before they confirm.
 */
const getCancelJobPreview = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (!WORKER_CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({ success: false, message: 'This job can no longer be cancelled from the app' });
    }

    const { getBookingConfig } = require('../../utils/bookingConfig');
    const { evaluateCancellation } = require('../../utils/cancellationPolicy');
    const policy = evaluateCancellation(booking, 'worker', await getBookingConfig());
    res.status(200).json({
      success: true,
      data: { fee: policy.fee, isFree: policy.isFree, stage: policy.reason, freeUntil: policy.freeUntil, windowHours: policy.windowHours }
    });
  } catch (error) {
    console.error('Cancel job preview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load cancellation details' });
  }
};

/**
 * Worker cancels a job they accepted.
 * The booking is handed to another worker when the booking configuration
 * allows it, otherwise it is cancelled for the customer.
 */
const cancelJob = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
    const { reason } = req.body;

    const result = await handleWorkerCancellation(id, vendorId, reason);

    const io = req.app.get('io');
    if (io) {
      io.to(`vendor_${vendorId}`).emit('removeWorkerBooking', { id: String(id) });
    }

    const base = result.reassigned
      ? 'Job cancelled. The customer is being matched with another professional.'
      : 'Job cancelled.';
    res.status(200).json({
      success: true,
      reassigned: result.reassigned,
      penalty: result.penalty || 0,
      message: result.penalty > 0 ? `${base} A penalty of ₹${result.penalty} was deducted from your earnings.` : base
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Cancel job error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel job. Please try again.' });
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

    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
    const { status, finalSettlementStatus } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Cancelling before arrival goes through the reassignment flow so the
    // customer is matched with someone else rather than left without a worker.
    if (status === BOOKING_STATUS.CANCELLED && WORKER_CANCELLABLE_STATUSES.includes(booking.status)) {
      return cancelJob(req, res);
    }

    // Validate status transition if status is changing
    if (status && status !== booking.status) {
      const validTransitions = {
        [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.REJECTED, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.AWAITING_PAYMENT]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED],
        [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.ASSIGNED, BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.ASSIGNED]: [BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.JOURNEY_STARTED]: [BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.CANCELLED],
        [BOOKING_STATUS.VISITED]: [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.WORK_DONE],
        [BOOKING_STATUS.IN_PROGRESS]: [BOOKING_STATUS.WORK_DONE, BOOKING_STATUS.COMPLETED],
        [BOOKING_STATUS.WORK_DONE]: [BOOKING_STATUS.COMPLETED]
      };

      if (!validTransitions[booking.status]?.includes(status)) {
        // Past arrival a job is never "cancelled" with a bare status change: that would skip the refund,
        // the customer's fee and the coupon, and could undo finished work. It goes through support.
        if (status === BOOKING_STATUS.CANCELLED) {
          return res.status(400).json({
            success: false,
            message: 'This job can no longer be cancelled from the app. Please contact support.'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${booking.status} to ${status}`
        });
      }

      // Save only if the booking is still in the status this change was based on. If the customer cancelled
      // (or anything else moved it) in the meantime, the save is refused instead of overwriting that.
      booking.$where = { status: booking.status };

      // Marking work done needs photo proof of the finished work, whichever route is used
      if (status === BOOKING_STATUS.WORK_DONE
        && !normalizeWorkPhotos(booking.workPhotos).some((photo) => photo.type === 'after')) {
        return res.status(400).json({ success: false, message: 'Add at least one photo of the finished work first.' });
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
        if (booking.vendorId) {
          const Worker = require('../../models/Worker');
          await Worker.findByIdAndUpdate(booking.vendorId, { availability: 'AVAILABLE' }).catch(() => null);
        }
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
    // Mongoose reports a save whose booking changed underneath it as either of these
    if (['DocumentNotFoundError', 'VersionError'].includes(error?.name)) {
      return res.status(409).json({
        success: false,
        message: 'This booking was just updated by someone else, for example the customer cancelled it. Please refresh to see its current status.'
      });
    }
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

    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;

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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;

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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
    const { otp, location } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).select('+visitOtp');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.JOURNEY_STARTED) return res.status(400).json({ success: false, message: 'Journey not started' });
    const visitLock = otpGuard.lockedMinutes(booking, 'visit');
    if (visitLock) { const r = otpGuard.lockedResponse(visitLock); return res.status(r.statusCode).json(r.body); }
    if (!booking.visitOtp || booking.visitOtp !== String(otp ?? '').trim()) {
      const failure = await otpGuard.registerFailure(booking._id, 'visit');
      return res.status(failure.locked ? 429 : 400).json({ success: false, message: otpGuard.wrongCodeMessage('Invalid OTP.', failure) });
    }
    await otpGuard.clearFailures(booking._id, 'visit');

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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
    const { workPhotos, workDoneDetails, billDetails } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Status guard
    if (booking.status !== BOOKING_STATUS.VISITED && booking.status !== BOOKING_STATUS.IN_PROGRESS) {
      return res.status(400).json({ success: false, message: 'Cannot complete from current status' });
    }

    // Proof of the finished work is required here, not only in the app: at least one "after" photo
    // (a photo with no type counts as one). "Before" photos are optional extras.
    const incomingPhotos = normalizeWorkPhotos(workPhotos);
    if (!incomingPhotos.some((photo) => photo.type === 'after')) {
      return res.status(400).json({ success: false, message: 'Add at least one photo of the finished work to complete the job.' });
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
    const serviceGstPct = settings?.serviceGstPercentage ?? 18;
    const partsGstPct = settings?.partsGstPercentage ?? 18;

    // Commission for this worker and category (global, category, worker or
    // worker+category rule), frozen into the bill.
    const commission = await resolveCommission({ workerId: vendorId, categoryId: booking.categoryId });

    // ═══════════════════════════════════════════
    // STEP 1: BUILD LINE ITEMS
    // ═══════════════════════════════════════════

    // -- Original booking service (from basePrice, which already includes
    //    add-ons and any emergency surcharge). On a plan booking the plan
    //    covers the service itself; only those extras are charged.
    // The bill must preserve the discount the customer was granted, and reuse
    // the GST recorded on the booking so the original line matches what the user saw.
    const isPlanBooking = booking.paymentMethod === 'plan_benefit';
    const bookingExtras = (Number(booking.addOnsTotal) || 0) + (Number(booking.emergencyCharge) || 0);
    const bookingDiscount = Math.max(0, Number(booking.discount) || 0);
    const originalServiceBaseForBill = isPlanBooking
      ? bookingExtras
      : Math.max(0, parseFloat(((booking.basePrice || 0) - bookingDiscount).toFixed(2)));
    const originalServiceBaseForEarnings = Number(booking.basePrice) || 0;
    const originalGST = parseFloat((Number(booking.tax) || 0).toFixed(2));
    const originalGstPct = originalServiceBaseForBill > 0
      ? parseFloat(((originalGST / originalServiceBaseForBill) * 100).toFixed(2))
      : 0;

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
    const totalServiceBaseForBill = parseFloat((originalServiceBaseForBill + vendorServiceBase).toFixed(2));
    const totalServiceBaseForEarnings = parseFloat((originalServiceBaseForEarnings + vendorServiceBase).toFixed(2));
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
    const penaltyCharges = Math.max(0, Number(booking.penalty) || 0);
    const grandTotal = parseFloat((totalServiceBaseForBill + totalPartsBase + totalGST + visitingCharges + penaltyCharges).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 5: REVENUE SPLIT (internal only)
    // ═══════════════════════════════════════════
    // Worker % is applied ONLY on base — never on GST

    // On plan bookings the worker is still paid for the covered service.
    const earningsServiceBase = isPlanBooking
      ? parseFloat(((Number(booking.basePrice) || 0) + vendorServiceBase).toFixed(2))
      : totalServiceBaseForEarnings;
    const { vendorServiceEarning, vendorPartsEarning, vendorTotalEarning } = computeWorkerEarnings(commission, {
      serviceBase: earningsServiceBase,
      partsBase: totalPartsBase
    });
    const companyRevenue = parseFloat((grandTotal - vendorTotalEarning).toFixed(2));

    // ═══════════════════════════════════════════
    // STEP 6: PERSIST BILL
    // ═══════════════════════════════════════════

    // Include original service as line item for completeness
    const allServices = [
      {
        name: booking.serviceName || 'Original Service',
        price: originalServiceBaseForBill,
        gstPercentage: originalGstPct,
        quantity: 1,
        gstAmount: originalGST,
        total: parseFloat((originalServiceBaseForBill + originalGST).toFixed(2)),
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
      originalServiceBase: originalServiceBaseForBill,
      vendorServiceBase,
      totalServiceBase: totalServiceBaseForBill,
      totalPartsBase,
      visitingCharges,
      penaltyCharges,

      // GST totals
      originalGST,
      vendorServiceGST,
      partsGST,
      totalGST,

      // Bill total
      grandTotal,

      // Payout config snapshot
      payoutConfig: toPayoutConfig(commission, {
        serviceGstPercentage: serviceGstPct,
        partsGstPercentage: partsGstPct
      }),

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

    const advancePaidAmount = booking.advancePayment?.status === 'paid'
      ? Number(booking.advancePayment?.paidAmount || booking.advancePayment?.requestedAmount || 0)
      : 0;

    booking.status = BOOKING_STATUS.WORK_DONE;
    booking.finalAmount = grandTotal;
    booking.userPayableAmount = Math.max(0, parseFloat((grandTotal - advancePaidAmount).toFixed(2)));
    booking.vendorBillId = bill._id;

    // Reuse existing Payment OTP for cash collection or generate new one
    issuePaymentCode(booking);

    // Accepts either the new { url, type } objects or legacy URL strings.
    if (workPhotos) {
      try {
        booking.workPhotos = await persistWorkPhotos(workPhotos);
      } catch (uploadError) {
        console.error('Work photo upload failed:', uploadError.message);
        return res.status(502).json({ success: false, message: 'Could not upload the work photos. Please try again.' });
      }
    }

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

    // The bill, amount and verification code reach the customer only when the worker sends the
    // finished bill (cashCollectionController sets billFinalizedAt and notifies them then).

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
          totalServiceBase: totalServiceBaseForBill,
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
    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
    const { otp } = req.body;

    const booking = await Booking.findOne({ _id: id, vendorId }).select('+paymentOtp +customerConfirmationOTP');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.status !== BOOKING_STATUS.WORK_DONE) return res.status(400).json({ success: false, message: 'Work not done yet' });
    const expectedOtp = expectedPaymentCode(booking);
    if (!expectedOtp) return res.status(CODE_NOT_ISSUED.statusCode).json(CODE_NOT_ISSUED.body);
    const payLock = otpGuard.lockedMinutes(booking, 'payment');
    if (payLock) { const r = otpGuard.lockedResponse(payLock); return res.status(r.statusCode).json(r.body); }
    if (expectedOtp !== String(otp ?? '').trim()) {
      const failure = await otpGuard.registerFailure(booking._id, 'payment');
      return res.status(failure.locked ? 429 : 400).json({ success: false, message: otpGuard.wrongCodeMessage('Invalid OTP. Please check the code with the customer.', failure) });
    }
    await otpGuard.clearFailures(booking._id, 'payment');

    // ── Fetch the WorkerBill (single source of truth) ──
    const WorkerBill = require('../../models/WorkerBill');
    const bill = await WorkerBill.findOne({ bookingId: booking._id });
    if (!bill) return res.status(500).json({ success: false, message: 'Bill not found — cannot process payment' });

    const grandTotal = Number(bill.grandTotal) || 0;
    const vendorEarning = Number(bill.vendorTotalEarning) || 0;
    const advancePaid = booking.advancePayment?.status === 'paid'
      ? Number(booking.advancePayment?.paidAmount || booking.advancePayment?.requestedAmount || 0)
      : 0;
    const cashCollectedAmount = booking.userPayableAmount != null
      ? Math.max(0, Number(booking.userPayableAmount))
      : Math.max(0, parseFloat((grandTotal - advancePaid).toFixed(2)));

    // ── Update Booking status ──
    booking.status = BOOKING_STATUS.COMPLETED;
    booking.paymentMethod = 'cash collected'; // Standardized label
    booking.paymentStatus = PAYMENT_STATUS.COLLECTED_BY_WORKER;
    booking.cashCollected = true;
    booking.cashCollectedBy = 'vendor';
    booking.cashCollectorId = vendorId;
    booking.cashCollectedAt = new Date();
    booking.completedAt = new Date();
    clearPaymentCode(booking);
    await booking.save();

    // Clear user penalty now that booking is completed
    if (booking.penalty > 0 && booking.userId) {
      const User = require('../../models/User');
      await User.findByIdAndUpdate(booking.userId, { $set: { 'wallet.penalty': 0 } });
    }

    // ── Update WorkerBill status ──
    bill.status = 'paid';
    bill.paidAt = new Date();
    await bill.save();

    // ── Update Worker Wallet (Atomic with $inc) ──
    const Worker = require('../../models/Worker');
    const workerDoc = await Worker.findById(vendorId).select('wallet');

    if (workerDoc) {
      const currentDues = (workerDoc.wallet.dues || 0) + cashCollectedAmount;
      const cashLimit = workerDoc.wallet.cashLimit || 10000;
      // Net owed = dues − earnings (worker keeps their share from cash)
      const netOwed = currentDues - ((workerDoc.wallet.earnings || 0) + vendorEarning);
      const isBlocked = netOwed > cashLimit;

      const updateQuery = {
        $inc: {
          'wallet.dues': cashCollectedAmount,
          'wallet.earnings': vendorEarning,
          'wallet.totalCashCollected': cashCollectedAmount
        }
      };

      if (isBlocked) {
        updateQuery.$set = {
          'wallet.isBlocked': true,
          'wallet.blockedAt': new Date(),
          'wallet.blockReason': `Cash limit exceeded. Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${cashLimit}`
        };
      } else {
        updateQuery.$set = { availability: 'AVAILABLE' };
      }

      await Worker.findByIdAndUpdate(vendorId, updateQuery);

      // ── Create Transaction Records ──
      const Transaction = require('../../models/Transaction');

      // Transaction 1: Cash Collected (Platform is owed this amount)
      await Transaction.create({
        vendorId,
        bookingId: booking._id,
        type: 'cash_collected',
        amount: cashCollectedAmount,
        status: 'completed',
        paymentMethod: 'cash collected', // Standardized label
        description: `Cash ₹${cashCollectedAmount} collected for booking #${booking.bookingNumber}. Dues increased.`,
        metadata: {
          type: 'dues_increase',
          collectedBy: 'vendor',
          billId: bill._id.toString(),
          grandTotal,
          cashCollectedAmount,
          advancePaid,
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
          description: `Earnings ₹${vendorEarning} credited for booking #${booking.bookingNumber} (${describeCommission(bill.payoutConfig)})`,
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

    const vendorId = req.user?.id || req.user?._id;
    const id = req.params.id || req.params.bookingId;
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
      issuePhotos: req.bookingId.issuePhotos || [],
      issueVideos: req.bookingId.issueVideos || [],
      customerNotes: req.bookingId.customerNotes || null,
      bookedDetails: summariseBookedDetails(req.bookingId),
      addOns: (req.bookingId.addOns || []).map(a => ({ title: a.title, quantity: a.quantity })),
      isEmergency: !!req.bookingId.isEmergency,
      bookingType: req.bookingId.bookingType,
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

/**
 * The assigned professional asks the customer to move the visit. Nothing changes until the customer accepts.
 */
const requestReschedule = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const vendorId = req.user?.id || req.user?._id;
    const { scheduledDate, scheduledTime, timeSlot, reason } = req.body;

    const booking = await Booking.findOne({ _id: req.params.id, vendorId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (booking.rescheduleRequest?.status === 'pending') {
      return res.status(400).json({ success: false, message: 'You already asked the customer for a new time. Please wait for their answer.' });
    }

    const config = await getBookingConfig();
    assertReschedulable(booking, config, 'worker');
    await validateNewSlot(booking, { scheduledDate, timeSlot }, config);

    const when = describeSlot(scheduledDate, scheduledTime);
    booking.rescheduleRequest = {
      status: 'pending',
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      timeSlot: { start: timeSlot.start, end: timeSlot.end },
      reason: reason || null,
      requestedAt: new Date(),
      respondedAt: null
    };
    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({
      status: booking.status,
      event: 'reschedule_requested',
      note: reason ? `${when} — ${reason}` : when,
      by: 'worker',
      at: new Date()
    });
    await booking.save();

    await createNotification({
      userId: booking.userId,
      type: 'booking_rescheduled',
      title: 'New Time Requested',
      message: `Your professional asked to move booking ${booking.bookingNumber} to ${when}.${reason ? ` Reason: ${reason}` : ''} Open the booking to accept or decline.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: { type: 'booking_rescheduled', bookingId: booking._id.toString(), link: `/bookings/${booking._id}` }
    });
    emitBookingUpdated(req.app.get('io'), booking, { rescheduleRequested: true });

    res.status(200).json({ success: true, message: 'Request sent. The customer will be asked to accept the new time.', data: booking });
  } catch (error) {
    if (error instanceof RescheduleError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Request reschedule error:', error);
    res.status(500).json({ success: false, message: 'Failed to send the request. Please try again.' });
  }
};

module.exports = {
  requestReschedule,
  getWorkerBookings,
  getBookingById,
  acceptBooking,
  rejectBooking,
  cancelJob,
  getCancelJobPreview,
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
