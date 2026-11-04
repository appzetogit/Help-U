const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Worker = require('../../models/Worker');
const Review = require('../../models/Review');
const { validationResult } = require('express-validator');
const { BOOKING_STATUS, PAYMENT_STATUS, USER_CANCELLABLE_STATUSES } = require('../../utils/constants');
const { claimCancellation, rollbackCancellation, explainRefusal } = require('../../services/bookingCancellation');
const { computeBookingTotals } = require('../../utils/bookingTotals');
const { createNotification } = require('../notificationControllers/notificationController');
const cloudinaryService = require('../../services/cloudinaryService');
const { placeBooking } = require('../../services/bookingCreationService');
const { getBookingConfig } = require('../../utils/bookingConfig');
const { RescheduleError, describeSlot, assertReschedulable, validateNewSlot, applyReschedule, emitBookingUpdated } = require('../../services/rescheduleService');
const { evaluateCancellation, onTheWayFee } = require('../../utils/cancellationPolicy');
const { expectedPaymentCode, clearPaymentCode } = require('../../utils/paymentCode');
const { resolveFieldsForCategories, validateDetailAnswers } = require('../../utils/detailFields');

// The customer can change their answers (brand, vehicle type...) until the professional is on the way
const DETAILS_EDITABLE_STATUSES = [
  BOOKING_STATUS.PENDING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED
];
const canEditDetails = (booking) => !booking.journeyStartedAt && DETAILS_EDITABLE_STATUSES.includes(booking.status);

/**
 * Create a new booking
 * Pricing, validation and worker dispatch live in services/bookingCreationService.js
 * so recurring visits are created through exactly the same path.
 */
const createBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const result = await placeBooking(req.user.id, req.body);
    res.status(result.statusCode).json(result.body);

    // Alerting workers, notifications and emails run after the response.
    if (result.afterResponse) setImmediate(result.afterResponse);
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking. Please try again.'
    });
  }
};

/**
 * The customer must not see the amount to pay, the pay buttons or the verification code until the
 * worker has sent the finished bill (Collect Cash / Online QR). Until then those fields are blanked.
 */
const hideUnsentBill = (booking) => {
  if (booking && booking.status === BOOKING_STATUS.WORK_DONE && !booking.billFinalizedAt) {
    clearPaymentCode(booking);
    booking.customerConfirmationOTP = null;
    booking.qrPaymentInitiated = false;
  }
  return booking;
};

/**
 * Get user bookings with filters
 */
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { userId };
    if (status) {
      if (status.includes(',')) {
        query.status = { $in: status.split(',') };
      } else {
        query.status = status;
      }
    } else {
      // Default: Fetch all, including SEARCHING. Frontend will filter for active.
    }
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) query.scheduledDate.$gte = new Date(startDate);
      if (endDate) query.scheduledDate.$lte = new Date(endDate);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .select('-workPhotos')
      .populate('vendorId', 'name businessName phone profilePhoto')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);

    // The running total of each booking (repair services the customer added, what was already paid)
    const { serviceGstPercentage } = await getBookingConfig();
    const withTotals = (b) => ({ ...b, totals: computeBookingTotals(b, { gstPct: serviceGstPercentage, forCustomer: true }) });

    res.status(200).json({
      success: true,
      data: bookings.map(withTotals).map(hideUnsentBill),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get user bookings error:', error);
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
    const userId = req.user.id;
    const { id } = req.params;

    const booking = await Booking.findOne({ _id: id, userId })
      .select('+visitOtp +paymentOtp +customerConfirmationOTP') // Include secure OTPs for the user
      .populate('userId', 'name phone email')
      .populate('vendorId', 'name businessName phone email address profilePhoto')
      .populate('serviceId', 'title description iconUrl images')
      .populate('categoryId', 'title slug')
      .lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Fetch Worker Bill if exists
    const WorkerBill = require('../../models/WorkerBill');
    const bill = await WorkerBill.findOne({ bookingId: booking._id });

    // Convert to object to attach bill
    const bookingData = booking;
    if (bill) {
      bookingData.bill = bill;
    }

    // The questions behind the booked items, so the app can offer to change an answer
    const catId = booking.categoryId?._id || booking.categoryId;
    const fieldsByCategory = await resolveFieldsForCategories([catId]);
    bookingData.detailFields = fieldsByCategory.get(String(catId)) || [];
    bookingData.canEditDetails = canEditDetails(booking) && bookingData.detailFields.length > 0;

    // Ensure OTP consistency for user display
    bookingData.customerConfirmationOTP = expectedPaymentCode(booking) || null;
    bookingData.paymentOtp = bookingData.customerConfirmationOTP;
    hideUnsentBill(bookingData);

    // One running total for the order summary: items, repair services added, GST, paid so far, balance due
    const { serviceGstPercentage } = await getBookingConfig();
    bookingData.totals = computeBookingTotals(bookingData, { gstPct: serviceGstPercentage, forCustomer: true });

    res.status(200).json({
      success: true,
      data: bookingData
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
 * Change the answers on a booking's items (PUT /:id/details, body { items: [{ itemId, details }] }).
 * Allowed until the professional starts travelling; the assigned professional is told.
 */
const updateBookingDetails = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!canEditDetails(booking)) {
      return res.status(400).json({
        success: false,
        message: booking.journeyStartedAt
          ? 'Your professional is already on the way, so the details can no longer be changed. Please tell them directly.'
          : `Details cannot be changed on a ${booking.status} booking.`
      });
    }

    const requested = Array.isArray(req.body.items) ? req.body.items : [];
    if (requested.length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' });

    const fieldsByCategory = await resolveFieldsForCategories([booking.categoryId]);
    const fields = fieldsByCategory.get(String(booking.categoryId)) || [];
    if (fields.length === 0) return res.status(400).json({ success: false, message: 'This service has no details to change.' });

    const changes = [];
    for (const entry of requested) {
      const item = booking.bookedItems.id(entry?.itemId);
      if (!item) return res.status(404).json({ success: false, message: 'That item is not part of this booking' });

      const { details, errors, missing } = validateDetailAnswers(fields, entry.details);
      if (errors.length) return res.status(400).json({ success: false, message: errors[0] });
      if (missing.length) {
        const label = fields.find((f) => f.key === missing[0])?.label || 'a required detail';
        return res.status(400).json({ success: false, message: `Please answer "${label}".` });
      }

      const before = (item.details || []).map((d) => `${d.label}: ${d.value}`).join(', ');
      const after = details.map((d) => `${d.label}: ${d.value}`).join(', ');
      if (before !== after) changes.push({ title: item.card?.title || item.serviceName || 'Service', after });
      item.details = details;
    }

    if (changes.length === 0) return res.status(200).json({ success: true, message: 'No changes', data: booking });

    booking.markModified('bookedItems');
    booking.$locals.actor = 'user';
    booking.$locals.timelineNote = 'Customer updated the service details';
    await booking.save();

    if (booking.vendorId) {
      const summary = changes.map((c) => `${c.title}: ${c.after || 'cleared'}`).join(' | ');
      await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_created', // keeping the type used for booking changes (see reschedule)
        title: 'Service details updated',
        message: `The customer updated the details for booking ${booking.bookingNumber}. ${summary}`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: { type: 'booking_updated', bookingId: booking._id.toString(), link: `/worker/booking/${booking._id}` }
      });
      const io = req.app.get('io');
      if (io) io.to(`vendor_${booking.vendorId}`).emit('booking_updated', { bookingId: booking._id.toString(), detailsUpdated: true });
    }

    res.status(200).json({ success: true, message: 'Details updated', data: booking });
  } catch (error) {
    console.error('Update booking details error:', error);
    res.status(500).json({ success: false, message: 'Failed to update the details. Please try again.' });
  }
};

/**
 * What cancelling costs the customer right now.
 * Before the professional is on the way, the cancellation policy decides (free window, then the late
 * fee). Once they are on the way, or have arrived, a flat fee applies that is never lower than the
 * late fee. All of it is set by the admin in Booking Configuration > Cancellation Policy.
 */
const resolveUserCancellation = async (booking) => {
  const config = await getBookingConfig();

  if (booking.journeyStartedAt) {
    const hasReached = !!booking.visitedAt || booking.status === 'visited';
    const fee = onTheWayFee(booking, config, { arrived: hasReached });
    return { fee, isFree: fee === 0, stage: hasReached ? 'arrived' : 'journey', freeUntil: null, windowHours: config.userFreeCancelHours };
  }

  const policy = evaluateCancellation(booking, 'user', config);
  return { fee: policy.fee, isFree: policy.isFree, stage: policy.reason, freeUntil: policy.freeUntil, windowHours: policy.windowHours };
};

/**
 * Preview what cancelling this booking would cost, so the app can show it before the customer confirms.
 */
const getCancellationPreview = async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, userId: req.user.id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    if (!USER_CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({ success: false, message: explainRefusal(booking.status) });
    }

    const { fee, isFree, stage, freeUntil, windowHours } = await resolveUserCancellation(booking);
    res.status(200).json({ success: true, data: { fee, isFree, stage, freeUntil, windowHours } });
  } catch (error) {
    console.error('Cancellation preview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load cancellation details' });
  }
};

/**
 * Cancel booking
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

    const userId = req.user.id;
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // A customer can cancel until the work starts. From then on the booking can only be completed;
    // a problem is handled as a dispute. (The same rule is enforced again, atomically, below.)
    if (!USER_CANCELLABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({ success: false, message: explainRefusal(booking.status) });
    }

    // --- REFUND & CANCELLATION FEE LOGIC ---
    let refundAmount = 0;
    const { fee: cancellationFee, stage } = await resolveUserCancellation(booking);
    let refundMessage = '';

    const isPaid = [PAYMENT_STATUS.SUCCESS, 'paid', 'collected_by_vendor', 'collected_by_worker'].includes(booking.paymentStatus);
    const advancePaid = booking.advancePayment?.status === 'paid'
      ? Number(booking.advancePayment.paidAmount || booking.advancePayment.requestedAmount || 0)
      : 0;
    const prepaid = Number(booking.prepaidAmount || 0);
    const finalPaid = isPaid ? Number(booking.finalAmount || 0) : 0;
    const totalPaid = Math.max(advancePaid + prepaid, advancePaid + finalPaid);

    const stageLabel = { journey: 'journey start', arrived: 'professional arrival', late: 'the free cancellation period ended' }[stage] || 'scheduled slot';

    const feeCovered = cancellationFee > 0 && totalPaid >= cancellationFee;
    const unpaidFee = cancellationFee > 0 ? Math.max(0, cancellationFee - totalPaid) : 0;

    if (cancellationFee > 0) {
      if (totalPaid > 0) {
        if (totalPaid >= cancellationFee) {
          refundAmount = totalPaid - cancellationFee;
          if (refundAmount > 0) {
            refundMessage = `Booking cancelled after ${stageLabel}. Refund of ₹${refundAmount} initiated (Cancellation Fee: ₹${cancellationFee} deducted).`;
          } else {
            refundMessage = `Booking cancelled after ${stageLabel}. Your cancellation fee of ₹${cancellationFee} was covered by your advance/payment. No amount is due.`;
          }
        } else {
          refundAmount = 0;
          refundMessage = `Booking cancelled after ${stageLabel}. ₹${totalPaid} paid was applied to your cancellation fee of ₹${cancellationFee}. The remaining ₹${unpaidFee} will be charged on your next booking.`;
        }
      } else {
        refundAmount = 0;
        refundMessage = `Booking cancelled after ${stageLabel}. A cancellation fee of ₹${cancellationFee} has been added to your account and will be charged on your next booking.`;
      }
    } else if (totalPaid > 0) {
      refundAmount = totalPaid;
      refundMessage = `Booking cancelled successfully. Full refund of ₹${refundAmount} initiated to your wallet.`;
    } else {
      refundAmount = 0;
      refundMessage = 'Booking cancelled successfully.';
    }

    // Claim the cancellation first, in one conditional update. If the booking was completed (or the work
    // started) since it was loaded, or another cancel got there first, nothing below runs, so no refund,
    // fee or coupon change is ever made for a booking that is not actually cancelled.
    const cancelReason = cancellationReason || 'Cancelled by user';
    const previous = await claimCancellation(booking._id, {
      allowedStatuses: USER_CANCELLABLE_STATUSES,
      by: 'user',
      reason: cancelReason,
      filter: { userId },
      extra: {
        cancellationFee,
        feeCovered: feeCovered || (cancellationFee === 0)
      }
    });
    if (!previous) {
      const current = await Booking.findById(booking._id).select('status').lean();
      return res.status(400).json({ success: false, message: explainRefusal(current?.status) });
    }

    let refundedNow = 0;
    try {
    // Update User Wallet
    if (refundAmount > 0 || unpaidFee > 0) {
      const User = require('../../models/User');
      const Transaction = require('../../models/Transaction');

      const user = await User.findById(userId);

      // 1. Process Refund
      if (refundAmount > 0) {
        user.wallet.balance = (user.wallet.balance || 0) + refundAmount;

        await Transaction.create({
          userId: user._id,
          type: 'refund',
          amount: refundAmount,
          status: 'completed',
          paymentMethod: 'wallet',
          description: `Refund for cancelled booking #${booking.bookingNumber}`,
          bookingId: booking._id,
          balanceAfter: user.wallet.balance
        });

        refundedNow = refundAmount;
      }

      // 2. Process Cancellation Fee (Add unpaid deficit to Penalty Bucket if any)
      if (unpaidFee > 0) {
        user.wallet.penalty = (user.wallet.penalty || 0) + unpaidFee;
        console.log(`[CancelBooking] Added penalty of ₹${unpaidFee} to user ${userId}. Total Penalty: ${user.wallet.penalty}`);
      }

      await user.save();
    }

    // Restore coupon usage if applicable
    if (booking.couponId) {
      try {
        const Coupon = require('../../models/Coupon');
        const CouponRedemption = require('../../models/CouponRedemption');
        await Coupon.findByIdAndUpdate(booking.couponId, { $inc: { usedCount: -1 } });
        await CouponRedemption.deleteOne({ bookingId: booking._id });
      } catch (couponErr) {
        console.warn('[CancelBooking] Failed to restore coupon usage:', couponErr.message);
      }
    }

    // Reset worker availability if assigned
    if (booking.vendorId) {
      const Worker = require('../../models/Worker');
      await Worker.findOneAndUpdate(
        { _id: booking.vendorId, availability: 'ON_JOB' },
        { $set: { availability: 'AVAILABLE' } }
      ).catch(err => console.error('[CancelBooking] Failed to reset worker availability:', err.message));
    }

    } catch (effectError) {
      // The money side failed part-way: put the booking back so the customer can simply try again
      await rollbackCancellation(booking._id, previous, { by: 'user' }).catch((rbErr) =>
        console.error(`[CancelBooking] Could not roll back booking ${booking._id}:`, rbErr.message));
      throw effectError;
    }

    // Record the refund/settlement on the booking (the status itself was already set by the claim above)
    const bookingUpdate = {};
    if (refundedNow > 0) {
      bookingUpdate.refundedAmount = (booking.refundedAmount || 0) + refundedNow;
      bookingUpdate.paymentStatus = PAYMENT_STATUS.REFUNDED;
    } else if (feeCovered) {
      bookingUpdate.paymentStatus = PAYMENT_STATUS.FEE_SETTLED;
    }

    const finalBooking = Object.keys(bookingUpdate).length > 0
      ? await Booking.findOneAndUpdate(
        { _id: booking._id },
        { $set: bookingUpdate },
        { new: true, actor: 'user' }
      )
      : await Booking.findById(booking._id);

    // Send notification to user
    await createNotification({
      userId,
      type: 'booking_cancelled',
      title: 'Booking Cancelled',
      message: refundMessage || `Your booking ${booking.bookingNumber} has been cancelled.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_cancelled',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    // Manual FCM push removed (handled by createNotification)

    // Send notification to worker
    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_cancelled',
        title: 'Booking Cancelled',
        message: `Booking ${booking.bookingNumber} has been cancelled by the customer.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'booking_cancelled',
          bookingId: booking._id.toString(),
          link: `/worker/bookings/${booking._id}`
        }
      });
      // Manual FCM push removed
    }

    res.status(200).json({
      success: true,
      message: refundMessage || 'Booking cancelled successfully',
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
 * Reschedule booking
 */
const rescheduleBooking = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { scheduledDate, scheduledTime, timeSlot } = req.body;

    const booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const config = await getBookingConfig();
    assertReschedulable(booking, config, 'user');
    const newStart = await validateNewSlot(booking, { scheduledDate, timeSlot }, config);

    // The status is left alone: a confirmed booking stays confirmed
    await applyReschedule(booking, { scheduledDate, scheduledTime, timeSlot }, newStart, { by: 'user', config, io: req.app.get('io') });

    res.status(200).json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: booking
    });
  } catch (error) {
    if (error instanceof RescheduleError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Reschedule booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule booking. Please try again.'
    });
  }
};

/**
 * Accept or decline the new time the assigned professional asked for.
 */
const respondToRescheduleRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const accept = req.body.accept === true || req.body.accept === 'true';

    const booking = await Booking.findOne({ _id: id, userId: req.user.id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const request = booking.rescheduleRequest;
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'There is no reschedule request waiting for your answer.' });
    }

    const io = req.app.get('io');
    const config = await getBookingConfig();

    if (!accept) {
      request.status = 'declined';
      request.respondedAt = new Date();
      booking.statusHistory = booking.statusHistory || [];
      booking.statusHistory.push({
        status: booking.status,
        event: 'reschedule_declined',
        note: describeSlot(request.scheduledDate, request.scheduledTime),
        by: 'user',
        at: new Date()
      });
      await booking.save();
      if (booking.vendorId) await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_rescheduled',
        title: 'Reschedule Declined',
        message: `The customer declined the new time you asked for on booking ${booking.bookingNumber}. The booking stays as it was.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: { type: 'booking_rescheduled', bookingId: booking._id.toString(), link: `/worker/bookings/${booking._id}` }
      });
      emitBookingUpdated(io, booking);
      return res.status(200).json({ success: true, message: 'Request declined. Your booking stays as it was.', data: booking });
    }

    assertReschedulable(booking, config, 'worker');
    const slot = { scheduledDate: request.scheduledDate, scheduledTime: request.scheduledTime, timeSlot: { start: request.timeSlot.start, end: request.timeSlot.end } };
    let newStart;
    try {
      newStart = await validateNewSlot(booking, slot, config);
    } catch (err) {
      if (err instanceof RescheduleError) {
        // The asked-for time is no longer usable (passed, or the professional got another job), so the request is void
        request.status = 'declined';
        request.respondedAt = new Date();
        await booking.save();
        emitBookingUpdated(io, booking);
      }
      throw err;
    }
    await applyReschedule(booking, slot, newStart, { by: 'worker', config, io });

    res.status(200).json({ success: true, message: 'Booking rescheduled to the new time.', data: booking });
  } catch (error) {
    if (error instanceof RescheduleError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    console.error('Respond to reschedule request error:', error);
    res.status(500).json({ success: false, message: 'Failed to answer the request. Please try again.' });
  }
};

/**
 * Add review and rating after completion
 */
const addReview = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { id } = req.params;
    const { rating, review, reviewImages } = req.body;

    const booking = await Booking.findOne({ _id: id, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if booking is completed or work is done
    if (booking.status !== BOOKING_STATUS.COMPLETED && booking.status !== BOOKING_STATUS.WORK_DONE) {
      return res.status(400).json({
        success: false,
        message: 'Can only review bookings after work is done'
      });
    }

    // Check if already reviewed
    if (booking.rating) {
      return res.status(400).json({
        success: false,
        message: 'Booking already reviewed'
      });
    }

    // Update booking
    booking.rating = rating;
    booking.review = review || null;
    booking.reviewImages = reviewImages || [];
    booking.reviewedAt = new Date();

    await booking.save();

    // Create a new Review document for the Review model (used by Admin)
    try {
      await Review.create({
        bookingId: booking._id,
        userId: booking.userId,
        serviceId: booking.serviceId,
        vendorId: booking.vendorId,
        rating: rating,
        review: review || '',
        images: reviewImages || [],
        status: 'active'
      });
    } catch (reviewErr) {
      console.error('Error creating separate review document:', reviewErr);
      // We don't fail the request if the separate review creation fails
    }

    // Helper to update cumulative rating on Model
    const updateCumulativeRating = async (Model, docId, newRating) => {
      try {
        const doc = await Model.findById(docId);
        if (!doc) return;

        const oldTotal = doc.totalReviews || 0;
        const oldRating = doc.rating || 0;

        const newTotal = oldTotal + 1;
        const updatedRating = ((oldRating * oldTotal) + newRating) / newTotal;

        await Model.findByIdAndUpdate(docId, {
          rating: Number(updatedRating.toFixed(2)),
          totalReviews: newTotal
        });
      } catch (err) {
        console.error(`Error updating rating for ${Model.modelName}:`, err);
      }
    };

    // Update Service Rating
    if (booking.serviceId) {
      const UserService = require('../../models/UserService');
      await updateCumulativeRating(UserService, booking.serviceId, rating);
    }

    // The service's public rating just changed
    require('../../utils/catalogCache').invalidatePublicCatalogKeys().catch(() => {});

    // Update Worker Rating (Always)
    if (booking.vendorId) {
      await updateCumulativeRating(Worker, booking.vendorId, rating);

      // Send notification to worker
      await createNotification({
        vendorId: booking.vendorId,
        type: 'review_submitted',
        title: 'New Review Received',
        message: `You have received a ${rating}-star review for booking ${booking.bookingNumber}.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Review added successfully',
      data: booking
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add review. Please try again.'
    });
  }
};

/**
 * Get user ratings and reviews (given by the user)
 */
const getUserRatings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch bookings where rating is not null
    const bookings = await Booking.find({ userId, rating: { $ne: null } })
      .populate('vendorId', 'name businessName profilePhoto')
      .populate('serviceId', 'title iconUrl')
      .sort({ reviewedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments({ userId, rating: { $ne: null } });

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
    console.error('Get user ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your ratings'
    });
  }
};

/**
 * Upload one issue photo before the booking exists.
 * The app calls this once per photo as the customer adds it at checkout, then
 * sends the returned URLs as `issuePhotos` when creating the booking.
 */
const uploadIssuePhoto = async (req, res) => {
  try {
    const { photo } = req.body;

    if (typeof photo !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(photo)) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a JPG, PNG or WEBP image'
      });
    }

    // ~7.5MB of base64 is ~5.6MB of image; the app compresses well below this.
    if (photo.length > 7.5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Photo is too large. Maximum size is 5MB.'
      });
    }

    const uploadRes = await cloudinaryService.uploadFile(photo, {
      folder: `bookings/issue-photos/${req.user.id}`,
      resource_type: 'image',
      transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }]
    });

    if (!uploadRes.success) {
      return res.status(502).json({
        success: false,
        message: 'Failed to upload photo. Please try again.'
      });
    }

    res.status(201).json({
      success: true,
      url: uploadRes.url
    });
  } catch (error) {
    console.error('Upload issue photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload photo. Please try again.'
    });
  }
};

/**
 * Upload one short video of the problem before the booking exists.
 * Expects multipart/form-data with a 'video' field (see uploadVideoToTemp).
 * Size and duration limits come from the booking configuration.
 */
const uploadIssueVideo = async (req, res) => {
  const fs = require('fs');
  const tempPath = req.file?.path;
  const cleanup = () => {
    if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
  };

  try {
    const config = await getBookingConfig();

    if (!config.isIssueVideoEnabled || config.maxIssueVideos < 1) {
      cleanup();
      return res.status(403).json({ success: false, code: 'FEATURE_DISABLED', message: 'Video upload is currently unavailable' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please choose a video to upload' });
    }
    if (req.file.size > config.maxIssueVideoSizeMB * 1024 * 1024) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: `Video is too large. Maximum size is ${config.maxIssueVideoSizeMB}MB.`
      });
    }

    const uploadRes = await cloudinaryService.uploadVideo(tempPath, {
      folder: `bookings/issue-videos/${req.user.id}`
    });
    cleanup();

    if (!uploadRes.success) {
      return res.status(502).json({ success: false, message: 'Failed to upload video. Please try again.' });
    }

    // Duration is only known after upload; an over-long video is removed again.
    if (uploadRes.duration && uploadRes.duration > config.maxIssueVideoDurationSec + 1) {
      cloudinaryService.deleteFile(uploadRes.public_id, 'video').catch(() => {});
      return res.status(400).json({
        success: false,
        message: `Video is too long. Maximum length is ${config.maxIssueVideoDurationSec} seconds.`
      });
    }

    res.status(201).json({
      success: true,
      url: uploadRes.url,
      duration: uploadRes.duration || null
    });
  } catch (error) {
    cleanup();
    console.error('Upload issue video error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload video. Please try again.' });
  }
};

module.exports = {
  createBooking,
  uploadIssuePhoto,
  uploadIssueVideo,
  getUserBookings,
  getBookingById,
  cancelBooking,
  getCancellationPreview,
  updateBookingDetails,
  rescheduleBooking,
  respondToRescheduleRequest,
  addReview,
  getUserRatings
};

