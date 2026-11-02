/**
 * Reassignment Service
 *
 * Handles a worker dropping a booking they had accepted. If the booking
 * configuration allows it, the booking goes back to searching and the wave
 * scheduler alerts the next workers on the ranked list, skipping everyone who
 * has already rejected or dropped it. Otherwise the booking is cancelled.
 */

const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const BookingRequest = require('../models/BookingRequest');
const { BOOKING_STATUS } = require('../utils/constants');
const Transaction = require('../models/Transaction');
const { getBookingConfig } = require('../utils/bookingConfig');
const { evaluateCancellation } = require('../utils/cancellationPolicy');
const { createNotification } = require('../controllers/notificationControllers/notificationController');

// A worker can drop a job until they have arrived; after that the customer
// should raise it with support instead.
const WORKER_CANCELLABLE_STATUSES = [
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ASSIGNED,
  BOOKING_STATUS.JOURNEY_STARTED,
  BOOKING_STATUS.AWAITING_PAYMENT
];

const emit = (room, event, payload) => {
  try {
    const { getIO } = require('../sockets');
    getIO().to(room).emit(event, payload);
  } catch (_) {
    // Best effort.
  }
};

/**
 * Workers on the ranked list who could still be alerted.
 */
const remainingCandidates = (booking) => {
  const skip = new Set([
    ...(booking.excludedVendors || []).map(String),
    ...(booking.notifiedVendors || []).map(String)
  ]);
  return (booking.potentialVendors || []).filter((p) => p.vendorId && !skip.has(String(p.vendorId)));
};

/**
 * Called when the assigned worker cancels.
 * Returns { reassigned: boolean, booking }.
 */
const handleWorkerCancellation = async (bookingId, workerId, reason = '') => {
  const booking = await Booking.findOne({ _id: bookingId, vendorId: workerId });
  if (!booking) {
    const err = new Error('Booking not found');
    err.statusCode = 404;
    throw err;
  }
  if (!WORKER_CANCELLABLE_STATUSES.includes(booking.status)) {
    const err = new Error('This job can no longer be cancelled from the app. Please contact support.');
    err.statusCode = 400;
    throw err;
  }

  const config = await getBookingConfig();
  const cleanReason = String(reason || '').trim().slice(0, 300) || 'Cancelled by professional';

  // The dropping worker is never alerted again for this booking.
  const excluded = new Set((booking.excludedVendors || []).map(String));
  excluded.add(String(workerId));
  booking.excludedVendors = [...excluded];

  // Everyone notified earlier is eligible again except those excluded, so the
  // fresh search draws from the whole ranked list.
  booking.notifiedVendors = [];
  const candidates = remainingCandidates(booking);

  // With nobody left on the ranked list the booking goes to the admin queue (when switched on)
  // so an admin can pick another professional, rather than being cancelled on the customer.
  const adminCanTakeOver = candidates.length === 0 && config.isAdminAssignmentEnabled !== false;
  const canReassign = config.autoReassignOnWorkerCancel
    && (booking.reassignmentCount || 0) < config.maxReassignments
    && (candidates.length > 0 || adminCanTakeOver);

  // Dropping a job late costs the professional the admin's penalty, taken from their earnings
  // (which may go negative; settlements already handle that).
  const { fee: penalty } = evaluateCancellation(booking, 'worker', config);
  const workerUpdate = { availability: 'AVAILABLE', $inc: { cancelledJobs: 1 } };
  if (penalty > 0) workerUpdate.$inc['wallet.earnings'] = -penalty;

  await Promise.all([
    Worker.findByIdAndUpdate(workerId, workerUpdate),
    BookingRequest.updateOne(
      { bookingId: booking._id, vendorId: workerId },
      { status: 'CANCELLED', respondedAt: new Date(), rejectReason: cleanReason }
    )
  ]);

  if (penalty > 0) {
    await Transaction.create({
      vendorId: workerId,
      bookingId: booking._id,
      type: 'penalty',
      amount: penalty,
      status: 'completed',
      paymentMethod: 'system',
      description: `Late cancellation penalty for booking #${booking.bookingNumber}`,
      metadata: { reason: 'late_cancellation' }
    });
  }

  if (canReassign) {
    const maxSearchMins = booking.isEmergency ? config.emergencyMaxSearchTime : config.maxSearchTime;

    booking.vendorId = null;
    booking.status = BOOKING_STATUS.SEARCHING;
    booking.acceptedAt = null;
    booking.assignedAt = null;
    booking.journeyStartedAt = null;
    booking.visitOtp = undefined;
    booking.reassignmentCount = (booking.reassignmentCount || 0) + 1;
    booking.currentWave = 0;
    // An old timestamp makes the scheduler start wave 1 on its next tick.
    booking.waveStartedAt = new Date(0);
    // A scheduled booking keeps its long window (open until the cut-off before its slot);
    // anything else gets the normal search time again.
    const { slotStartMs } = require('./workerAvailabilityService');
    const normalDeadline = Date.now() + maxSearchMins * 60 * 1000;
    const slotStart = booking.bookingType === 'scheduled' && !booking.isEmergency ? slotStartMs(booking) : null;
    booking.expiresAt = new Date(
      Number.isFinite(slotStart)
        ? Math.max(normalDeadline, slotStart - (config.scheduledBookingCutoffHours || 0) * 60 * 60 * 1000)
        : normalDeadline
    );
    booking.statusHistory.push({
      status: BOOKING_STATUS.SEARCHING,
      event: 'reassigned',
      note: cleanReason,
      by: 'worker',
      at: new Date()
    });
    // The status change above is already recorded as 'reassigned'.
    booking.$locals.skipStatusEntry = true;
    booking.$locals.actor = 'worker';
    await booking.save();

    if (adminCanTakeOver && candidates.length === 0) {
      await require('./adminAssignmentService').queueForAdmin(booking._id, { reason: 'worker_declined' });
    }

    emit(`user_${booking.userId}`, 'booking_updated', {
      bookingId: booking._id,
      status: BOOKING_STATUS.SEARCHING,
      reassigned: true,
      message: 'Your professional had to cancel. We are finding you another one.'
    });

    await createNotification({
      userId: booking.userId,
      type: 'booking_reassigned',
      title: 'Finding a new professional',
      message: `Your professional had to cancel booking ${booking.bookingNumber}. We are finding you another one right away.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: 'high',
      pushData: {
        type: 'booking_reassigned',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });

    return { reassigned: true, booking, penalty };
  }

  // Automatic refund if booking was paid or advance paid
  const { PAYMENT_STATUS } = require('../utils/constants');
  const isPaid = [PAYMENT_STATUS.SUCCESS, 'paid'].includes(booking.paymentStatus);
  const advancePaid = booking.advancePayment?.status === 'paid' ? Number(booking.advancePayment?.paidAmount || 0) : 0;
  const totalToRefund = (isPaid ? Number(booking.finalAmount || 0) : 0) + advancePaid;

  if (totalToRefund > 0) {
    const User = require('../models/User');
    await User.findByIdAndUpdate(booking.userId, { $inc: { 'wallet.balance': totalToRefund } }).catch(() => null);
    await Transaction.create({
      userId: booking.userId,
      bookingId: booking._id,
      type: 'refund',
      amount: totalToRefund,
      status: 'completed',
      paymentMethod: 'wallet',
      description: `Automatic refund for booking ${booking.bookingNumber} (worker cancelled and no candidates available)`
    }).catch(() => null);

    booking.refundedAmount = (booking.refundedAmount || 0) + totalToRefund;
    booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
  }

  // Restore coupon usage if applicable
  if (booking.couponId) {
    try {
      const Coupon = require('../models/Coupon');
      const CouponRedemption = require('../models/CouponRedemption');
      await Coupon.findByIdAndUpdate(booking.couponId, { $inc: { usedCount: -1 } });
      await CouponRedemption.deleteOne({ bookingId: booking._id });
    } catch (couponErr) {
      console.warn('[ReassignCancel] Failed to restore coupon usage:', couponErr.message);
    }
  }

  booking.status = BOOKING_STATUS.CANCELLED;
  booking.cancelledAt = new Date();
  booking.cancelledBy = 'worker';
  booking.cancellationReason = cleanReason;
  booking.$locals.actor = 'worker';
  booking.$locals.timelineNote = cleanReason;
  await booking.save();

  emit(`user_${booking.userId}`, 'booking_updated', {
    bookingId: booking._id,
    status: BOOKING_STATUS.CANCELLED,
    message: 'Your booking was cancelled by the professional.'
  });

  await createNotification({
    userId: booking.userId,
    type: 'booking_cancelled',
    title: 'Booking Cancelled',
    message: `Sorry, your professional cancelled booking ${booking.bookingNumber} and no one else is available right now. Please book again.`,
    relatedId: booking._id,
    relatedType: 'booking',
    pushData: {
      type: 'booking_cancelled',
      bookingId: booking._id.toString(),
      link: `/user/booking/${booking._id}`
    }
  });

  return { reassigned: false, booking, penalty };
};

module.exports = {
  WORKER_CANCELLABLE_STATUSES,
  remainingCandidates,
  handleWorkerCancellation
};
