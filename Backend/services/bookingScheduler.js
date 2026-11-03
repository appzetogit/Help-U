/**
 * Booking Scheduler Service — Optimized
 * Handles Wave-Based Worker Alerting
 *
 * Wave Logic (sizes and timing come from the booking configuration):
 * - Wave 1: the first `wave1Size` workers on the ranked list (alerted on
 *           booking creation; emergency bookings use emergencyFirstWaveSize)
 * - Wave 2: the next `wave2Size` workers once the wave timer runs out
 * - Wave 3: the next `wave3Size` workers
 * - Wave 4+: all remaining workers
 *
 * Each wave is picked from potentialVendors by skipping workers already
 * notified or excluded (rejected, offline when their turn came, or dropped
 * the job), so the list never has to be edited in place.
 *
 * A wave is cut short when every alerted worker has rejected
 * (workerBookingController sets waveStartedAt to the epoch), and a booking
 * whose worker cancelled restarts at wave 1 the same way.
 *
 * OPTIMIZATIONS:
 * - All active bookings processed in PARALLEL (Promise.all, not serial for-loop)
 * - Circuit breaker: if no searching bookings exist, extend check interval to 30s
 * - Single Worker.find per wave instead of per booking
 */

const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { getBookingConfig } = require('../utils/bookingConfig');
const { getBusyWorkerIds } = require('./workerAvailabilityService');

const ACTIVE_INTERVAL_MS = 5000;  // Poll every 5s when bookings exist
const IDLE_INTERVAL_MS = 30000;   // Poll every 30s when no active bookings (circuit breaker)

/**
 * How many workers a wave alerts. Infinity means "everyone left".
 */
const waveSize = (wave, config, isEmergency) => {
  if (wave === 1) return isEmergency ? config.emergencyFirstWaveSize : config.wave1Size;
  if (wave === 2) return config.wave2Size;
  if (wave === 3) return config.wave3Size;
  return Infinity;
};

class BookingScheduler {
  constructor(io) {
    this.io = io;
    this.intervalId = null;
    this.isRunning = false;
    this.isIdle = false; // Circuit breaker state
  }

  start() {
    if (this.isRunning) {
      console.log('[BookingScheduler] Already running.');
      return;
    }
    this.isRunning = true;
    console.log('[BookingScheduler] Started — active interval: 5s, idle interval: 30s');
    this.scheduleNext(ACTIVE_INTERVAL_MS);
  }

  scheduleNext(intervalMs) {
    if (this.intervalId) clearTimeout(this.intervalId);
    this.intervalId = setTimeout(async () => {
      const hadWork = await this.processWaves();
      // Adaptive interval: if idle, slow down; if active, stay fast
      this.scheduleNext(hadWork ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
    }
  }

  /**
   * Process all active searching bookings in PARALLEL.
   * @returns {boolean} true if any booking was processed, false if idle
   */
  async processWaves() {
    try {
      if (mongoose.connection.readyState !== 1) {
        return false; // Skip if database is not connected yet
      }

      const BookingRequest = require('../models/BookingRequest');
      const config = await getBookingConfig();
      const waveDurationMs = (config.waveDuration || 60) * 1000;

      // --- CIRCUIT BREAKER: Fast query to detect if any work is needed ---
      const adminHandled = await this.processAdminQueue(config).catch((err) => {
        console.error('[BookingScheduler] Admin queue error:', err);
        return 0;
      });

      const activeBookings = await Booking.find(
        {
          status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.CONFIRMED] },
          vendorId: null,
          awaitingAdmin: { $ne: true },
          waveStartedAt: { $ne: null },
          potentialVendors: { $exists: true, $not: { $size: 0 } }
        },
        '_id currentWave waveStartedAt potentialVendors notifiedVendors excludedVendors bookingNumber createdAt userId expiresAt isEmergency bookingType paymentStatus finalAmount advancePayment couponId awaitingAdmin scheduledDate timeSlot scheduledTime'
      ).lean();

      if (activeBookings.length === 0) {
        return adminHandled > 0; // Idle — caller will use longer interval
      }

      const now = Date.now();

      // --- PARALLEL PROCESSING: All ready bookings processed simultaneously ---
      await Promise.all(
        activeBookings.map(async (booking) => {
          try {
            const currentWave = booking.currentWave || 0;
            const maxSearchMs = (booking.isEmergency ? config.emergencyMaxSearchTime : config.maxSearchTime) * 60 * 1000;

            // --- PERSISTENCE: Save expiresAt to DB if missing ---
            let expiresAt = booking.expiresAt ? new Date(booking.expiresAt).getTime() : null;
            if (!expiresAt) {
              expiresAt = new Date(booking.createdAt || booking.waveStartedAt).getTime() + maxSearchMs;
              await Booking.findByIdAndUpdate(booking._id, { $set: { expiresAt: new Date(expiresAt) } });
            }

            // --- EXPIRY CHECK ---
            // expiresAt (not createdAt) so a booking put back to searching
            // after a worker cancelled gets a fresh search window.
            if (now > expiresAt) {
              // Before giving up, hand the booking to an admin who can pick a professional by hand
              await this.escalateOrCancel(booking, config);
              return;
            }

            // Only process if this booking's wave timer has expired
            const waveElapsed = now - new Date(booking.waveStartedAt).getTime();
            if (waveElapsed < waveDurationMs) return;

            // Workers who can still be alerted, in ranked order.
            const skip = new Set([
              ...(booking.notifiedVendors || []).map(String),
              ...(booking.excludedVendors || []).map(String)
            ]);
            const candidates = booking.potentialVendors.filter(
              (v) => v.vendorId && !skip.has(String(v.vendorId))
            );

            if (candidates.length === 0) {
              // Nothing left to alert; wait for the expiry check above.
              return;
            }

            const nextWave = currentWave + 1;
            const size = waveSize(nextWave, config, booking.isEmergency);
            let workersToNotify = candidates.slice(0, size === Infinity ? undefined : size);

            // Filter to only online+available workers (single batch find for this booking)
            const workerIds = workersToNotify.map((v) => v.vendorId);
            // Instant: needs an online worker who is not at work right now (worked out from his
            // real bookings, not the old availability flag). Scheduled: offline or busy-now
            // workers still qualify; overlaps were already filtered when the booking was created.
            const isScheduled = booking.bookingType === 'scheduled' && !booking.isEmergency;
            const onlineWorkers = await Worker.find(
              { _id: { $in: workerIds }, ...(isScheduled ? {} : { isOnline: true }) },
              '_id'
            ).lean();
            const busy = (!isScheduled && config.excludeBusyWorkersForInstant)
              ? await getBusyWorkerIds(workerIds)
              : new Set();

            const onlineSet = new Set(
              onlineWorkers.map((v) => v._id.toString()).filter((id) => !busy.has(id))
            );
            const offlineIds = workersToNotify
              .filter((v) => !onlineSet.has(v.vendorId.toString()))
              .map((v) => v.vendorId);
            workersToNotify = workersToNotify.filter((v) => onlineSet.has(v.vendorId.toString()));

            // Advance wave in DB — atomic, and only while still searching
            // (avoids a race with accept). Offline workers are excluded so the
            // next wave moves on to new people.
            const notifyIds = workersToNotify.map((v) => v.vendorId);
            const advanced = await Booking.findOneAndUpdate(
              { _id: booking._id, status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.CONFIRMED] }, vendorId: null },
              {
                $set: { currentWave: nextWave, waveStartedAt: new Date() },
                $addToSet: {
                  notifiedVendors: { $each: notifyIds },
                  excludedVendors: { $each: offlineIds }
                }
              }
            );
            if (!advanced) return;

            // Keep the customer's searching popup in step with the search
            if (this.io && notifyIds.length > 0) {
              const notifiedCount = new Set(
                [...(booking.notifiedVendors || []), ...notifyIds].map(String)
              ).size;
              this.io.to(`user_${booking.userId}`).emit('booking_search_progress', {
                bookingId: booking._id,
                wave: nextWave,
                notifiedCount,
                nearbyCount: booking.potentialVendors.length
              });
            }

            if (workersToNotify.length === 0) {
              console.log(`[BookingScheduler] Booking ${booking.bookingNumber}: Wave ${nextWave} all offline, advancing quietly`);
              return;
            }

            console.log(`[BookingScheduler] ${booking.bookingNumber}: Wave ${nextWave} → notifying ${workersToNotify.length} workers`);

            // Upsert BookingRequest records + send notifications (both in parallel).
            // A worker can be notified again on the same booking after a
            // reassignment, which would collide with their earlier
            // EXPIRED/CANCELLED request on the unique (bookingId, vendorId)
            // index; upsert resets that record instead of silently failing.
            const writeRequests = BookingRequest.bulkWrite(
              workersToNotify.map((v) => ({
                updateOne: {
                  filter: { bookingId: booking._id, vendorId: v.vendorId },
                  update: {
                    $set: {
                      status: 'PENDING',
                      wave: nextWave,
                      distance: v.distance || null,
                      sentAt: new Date(),
                      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                      viewedAt: null,
                      respondedAt: null,
                      socketDelivered: false,
                      pushDelivered: false,
                      rejectReason: null
                    }
                  },
                  upsert: true
                }
              })),
              { ordered: false }
            ).catch((err) => console.error('[BookingScheduler] BookingRequest upsert error:', err));

            await Promise.all([
              writeRequests,
              this.notifyWorkers(booking, workersToNotify)
            ]);

          } catch (bookingErr) {
            console.error(`[BookingScheduler] Error processing booking ${booking._id}:`, bookingErr);
          }
        })
      );

      return true; // Had work to do
    } catch (error) {
      console.error('[BookingScheduler] Error processing waves:', error);
      return false;
    }
  }

  /**
   * The search window is over with nobody assigned. The booking goes to the admin queue when that
   * is switched on (and the visit is not already in the past); otherwise it is cancelled and any
   * payment refunded. Returns true once the booking has been dealt with.
   */
  async escalateOrCancel(booking, config) {
    const canEscalate = config.isAdminAssignmentEnabled !== false
      && config.escalateToAdminOnTimeout !== false
      && !booking.awaitingAdmin;

    if (canEscalate) {
      let slotPassed = false;
      if (booking.bookingType === 'scheduled' && !booking.isEmergency) {
        const { slotStartMs } = require('./workerAvailabilityService');
        const slotStart = slotStartMs(booking);
        slotPassed = Number.isFinite(slotStart) && slotStart < Date.now();
      }
      if (!slotPassed) {
        const queued = await require('./adminAssignmentService')
          .queueForAdmin(booking._id, { reason: 'no_worker_accepted' });
        if (queued) {
          console.log(`[BookingScheduler] ${booking.bookingNumber}: Search timed out. Sent to the admin queue.`);
          if (this.io) {
            (booking.notifiedVendors || []).forEach((vId) => {
              this.io.to(`vendor_${vId}`).emit('removeWorkerBooking', { id: booking._id });
            });
          }
          return true;
        }
      }
    }

    await this.cancelExpiredBooking(booking);
    return true;
  }

  /**
   * Cancels a booking nobody took in time, refunds what was paid and releases the coupon.
   */
  async cancelExpiredBooking(booking) {
    console.log(`[BookingScheduler] ${booking.bookingNumber}: Search timed out. Cancelling.`);

    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.CONFIRMED] }, vendorId: null },
      {
        $set: {
          status: BOOKING_STATUS.CANCELLED,
          awaitingAdmin: false,
          waveStartedAt: null,
          cancelledAt: new Date(),
          cancelledBy: 'system',
          cancellationReason: 'No worker accepted within time limit'
        }
      },
      { actor: 'system' }
    );
    // Taken (or cancelled) in the meantime: nothing to refund
    if (!cancelled) return;

    // Process automatic refund to user wallet if customer paid upfront or advance
    const isPaid = [PAYMENT_STATUS.SUCCESS, 'paid'].includes(booking.paymentStatus);
    const advancePaid = booking.advancePayment?.status === 'paid' ? Number(booking.advancePayment?.paidAmount || 0) : 0;
    const totalToRefund = (isPaid ? Number(booking.finalAmount || 0) : 0) + advancePaid;

    if (totalToRefund > 0) {
      const User = require('../models/User');
      const Transaction = require('../models/Transaction');
      await User.findByIdAndUpdate(booking.userId, { $inc: { 'wallet.balance': totalToRefund } }).catch(() => null);
      await Transaction.create({
        userId: booking.userId,
        bookingId: booking._id,
        type: 'refund',
        amount: totalToRefund,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `Automatic refund for booking ${booking.bookingNumber} (no professional accepted within search window)`
      }).catch(() => null);

      await Booking.findByIdAndUpdate(booking._id, {
        $set: { paymentStatus: PAYMENT_STATUS.REFUNDED, refundedAmount: totalToRefund }
      }).catch(() => null);
    }

    // Restore coupon usage if applicable
    if (booking.couponId) {
      const Coupon = require('../models/Coupon');
      const CouponRedemption = require('../models/CouponRedemption');
      await Coupon.findByIdAndUpdate(booking.couponId, { $inc: { usedCount: -1 } }).catch(() => null);
      await CouponRedemption.deleteOne({ bookingId: booking._id }).catch(() => null);
    }

    // Tell the customer: this cancels their booking (and may refund them), so it must reach their phone too
    await createNotification({
      userId: booking.userId,
      type: 'booking_cancelled',
      title: totalToRefund > 0 ? 'Booking cancelled, refund issued' : 'Booking cancelled',
      message: `No professional was available for booking ${booking.bookingNumber}, so it was cancelled.`
        + (totalToRefund > 0 ? ` ₹${totalToRefund} has been refunded to your wallet.` : '')
        + ' Please try booking again.',
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_cancelled',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    }).catch((err) => console.error('[BookingScheduler] Cancellation notification failed:', err.message));

    if (this.io) {
      this.io.to(`user_${booking.userId}`).emit('booking_search_failed', {
        bookingId: booking._id,
        message: 'No workers available at the moment. Please try again later.'
      });

      (booking.notifiedVendors || []).forEach((vId) => {
        this.io.to(`vendor_${vId}`).emit('removeWorkerBooking', { id: booking._id });
      });
    }
  }

  /**
   * Bookings an admin is handling: still in the queue, or sent to a professional who has not
   * answered. When their window runs out, a queued booking is cancelled (and refunded); an
   * unanswered pick goes back to the queue for the admin to choose someone else.
   * @returns {number} how many bookings it dealt with
   */
  async processAdminQueue(config) {
    const adminAssignment = require('./adminAssignmentService');
    const BookingRequest = require('../models/BookingRequest');

    const overdue = await Booking.find(
      {
        status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.CONFIRMED] },
        vendorId: null,
        expiresAt: { $lt: new Date() },
        $or: [{ awaitingAdmin: true }, { adminAssignedAt: { $ne: null } }]
      },
      '_id bookingNumber userId expiresAt isEmergency bookingType paymentStatus finalAmount advancePayment couponId awaitingAdmin adminAssignedAt notifiedVendors'
    ).limit(50).lean();

    for (const booking of overdue) {
      try {
        if (booking.awaitingAdmin) {
          console.log(`[BookingScheduler] ${booking.bookingNumber}: Admin queue timed out. Cancelling.`);
          await this.cancelExpiredBooking(booking);
          continue;
        }

        // The professional the admin picked never answered
        const pickedId = (booking.notifiedVendors || [])[0];
        if (pickedId) {
          await BookingRequest.updateOne(
            { bookingId: booking._id, vendorId: pickedId, status: { $in: ['PENDING', 'VIEWED'] } },
            { status: 'EXPIRED', respondedAt: new Date() }
          ).catch(() => null);
          if (this.io) this.io.to(`vendor_${pickedId}`).emit('removeWorkerBooking', { id: booking._id });
        }
        const requeued = await adminAssignment.requeueAfterDecline(booking._id, pickedId);
        if (!requeued) await this.cancelExpiredBooking(booking);
      } catch (err) {
        console.error(`[BookingScheduler] Admin queue error for ${booking._id}:`, err);
      }
    }
    return overdue.length;
  }

  async notifyWorkers(booking, workers) {
    try {
      // Fetch booking details for notification (single query for the whole wave)
      const populatedBooking = await Booking.findById(booking._id)
        .populate('serviceId', 'title')
        .populate('userId', 'name phone')
        .lean();

      if (!populatedBooking) return;

      // Same payload as the first wave, so every wave shows the same details.
      const { buildWorkerAlertPayload } = require('./bookingCreationService');
      const basePayload = buildWorkerAlertPayload(populatedBooking, populatedBooking.userId, populatedBooking.serviceId);
      const serviceName = basePayload.serviceName;
      const customerName = basePayload.customerName;

      // Send all worker notifications in parallel
      await Promise.all(
        workers.map(async (v) => {
          // Fire socket immediately (synchronous, non-blocking)
          if (this.io) {
            this.io.to(`vendor_${v.vendorId}`).emit('new_booking_request', {
              ...basePayload,
              distance: v.distance,
              message: populatedBooking.isEmergency
                ? `🚨 EMERGENCY request within ${v.distance?.toFixed(1) || '?'}km!`
                : `New booking request within ${v.distance?.toFixed(1) || '?'}km!`
            });
          }

          // Create DB notification + FCM push
          await createNotification({
            vendorId: v.vendorId,
            type: 'booking_request',
            title: populatedBooking.isEmergency ? '🚨 Emergency Booking Request' : 'New Booking Request',
            message: `New service request for ${serviceName} from ${customerName}`,
            relatedId: booking._id,
            relatedType: 'booking',
            priority: populatedBooking.isEmergency ? 'high' : null,
            data: {
              bookingId: booking._id,
              serviceName,
              customerName,
              scheduledDate: populatedBooking.scheduledDate,
              scheduledTime: populatedBooking.scheduledTime,
              location: populatedBooking.address,
              price: populatedBooking.finalAmount,
              distance: v.distance,
              isEmergency: !!populatedBooking.isEmergency
            },
            pushData: {
              type: 'new_booking',
              dataOnly: false,
              link: `/worker/bookings/${booking._id}`
            }
          });
        })
      );

      console.log(`[BookingScheduler] Notified ${workers.length} workers for booking ${booking.bookingNumber}`);
    } catch (error) {
      console.error('[BookingScheduler] Error notifying workers:', error);
    }
  }
}

// Singleton instance
let schedulerInstance = null;

const initializeScheduler = (io) => {
  if (!schedulerInstance) {
    schedulerInstance = new BookingScheduler(io);
    schedulerInstance.start();
  }
  return schedulerInstance;
};

const getScheduler = () => schedulerInstance;

module.exports = { BookingScheduler, initializeScheduler, getScheduler };
