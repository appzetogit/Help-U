/**
 * Booking Scheduler Service — Optimized
 * Handles Wave-Based Worker Alerting
 *
 * Wave Logic:
 * - Wave 1: First 3 closest workers (alerted immediately on booking creation)
 * - Wave 2: Next 3 workers (after 15s if no accept)
 * - Wave 3: Next 4 workers (after another 15s)
 * - Wave 4+: All remaining workers
 *
 * OPTIMIZATIONS:
 * - All active bookings processed in PARALLEL (Promise.all, not serial for-loop)
 * - Circuit breaker: if no searching bookings exist, extend check interval to 30s
 * - Single Worker.find per wave instead of per booking
 */

const Booking = require('../models/Booking');
const Worker = require('../models/Worker');
const mongoose = require('mongoose');
const { BOOKING_STATUS } = require('../utils/constants');
const { createNotification } = require('../controllers/notificationControllers/notificationController');

const Settings = require('../models/Settings');

// Wave configuration
let WAVE_CONFIG = {
  1: { count: 3, duration: 60000 },
  2: { count: 3, duration: 60000 },
  3: { count: 4, duration: 60000 },
  4: { count: Infinity, duration: 0 }
};

let MAX_SEARCH_TIME_MS = 5 * 60 * 1000; // 5 mins fallback

const ACTIVE_INTERVAL_MS = 5000;  // Poll every 5s when bookings exist
const IDLE_INTERVAL_MS = 30000;   // Poll every 30s when no active bookings (circuit breaker)

// Calculate worker index range for a wave
const getWorkerRange = (wave) => {
  let start = 0;
  for (let i = 1; i < wave; i++) {
    start += WAVE_CONFIG[i]?.count || 0;
  }
  const config = WAVE_CONFIG[wave] || WAVE_CONFIG[4];
  const end = config.count === Infinity ? Infinity : start + config.count;
  return { start, end };
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
      console.log('[BookingScheduler] Stopped.');
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

      // --- REFRESH SETTINGS ---
      try {
        const globalSettings = await Settings.findOne({ type: 'global' }).lean();
        if (globalSettings) {
          const waveDur = (globalSettings.waveDuration || 60) * 1000;
          WAVE_CONFIG = {
            1: { count: 3, duration: waveDur },
            2: { count: 3, duration: waveDur },
            3: { count: 4, duration: waveDur },
            4: { count: Infinity, duration: 0 }
          };
          MAX_SEARCH_TIME_MS = (globalSettings.maxSearchTime || 5) * 60 * 1000;
        }
      } catch (sErr) {
        console.error('[BookingScheduler] Settings fetch error:', sErr);
      }

      // --- CIRCUIT BREAKER: Fast query to detect if any work is needed ---
      const activeBookings = await Booking.find(
        {
          status: BOOKING_STATUS.SEARCHING,
          waveStartedAt: { $ne: null },
          potentialVendors: { $exists: true, $not: { $size: 0 } }
        },
        '_id currentWave waveStartedAt potentialVendors notifiedVendors bookingNumber createdAt userId expiresAt' // Added createdAt, userId, expiresAt
      ).lean();

      if (activeBookings.length === 0) {
        return false; // Idle — caller will use longer interval
      }

      const now = Date.now();

      // --- PARALLEL PROCESSING: All ready bookings processed simultaneously ---
      await Promise.all(
        activeBookings.map(async (booking) => {
          try {
            const currentWave = booking.currentWave || 1;
            const waveConfig = WAVE_CONFIG[currentWave] || WAVE_CONFIG[4];
            const startTime = new Date(booking.createdAt || booking.waveStartedAt).getTime();
            const totalElapsed = now - startTime;

            // --- PERSISTENCE: Save expiresAt to DB if missing ---
            if (!booking.expiresAt) {
              const expiresAtDate = new Date(startTime + MAX_SEARCH_TIME_MS);
              await Booking.findByIdAndUpdate(booking._id, { $set: { expiresAt: expiresAtDate } });
            }

            // --- EXPIRY CHECK ---
            if (totalElapsed > MAX_SEARCH_TIME_MS) {
              console.log(`[BookingScheduler] ${booking.bookingNumber}: Search timed out. Cancelling.`);

              await Booking.findByIdAndUpdate(booking._id, {
                $set: {
                  status: BOOKING_STATUS.CANCELLED || 'cancelled',
                  waveStartedAt: null,
                  cancellationReason: 'No worker accepted within time limit'
                }
              });

              // Notify User
              if (this.io) {
                this.io.to(`user_${booking.userId}`).emit('booking_search_failed', {
                  bookingId: booking._id,
                  message: 'No workers available at the moment. Please try again later.'
                });
              }

              // Remove from all notified workers
              if (booking.notifiedVendors && booking.notifiedVendors.length > 0) {
                booking.notifiedVendors.forEach(vId => {
                  this.io.to(`vendor_${vId}`).emit('removeWorkerBooking', { id: booking._id });
                });
              }

              return;
            }

            const waveElapsed = now - new Date(booking.waveStartedAt).getTime();
            // Only process if this booking's wave timer has expired
            if (waveConfig.duration === 0 || waveElapsed < waveConfig.duration) return;

            const nextWave = currentWave + 1;
            const { start, end } = getWorkerRange(nextWave);

            // Get workers to notify in this wave
            let workersToNotify = booking.potentialVendors.slice(
              start,
              end === Infinity ? undefined : end
            );

            if (workersToNotify.length === 0) {
              console.log(`[BookingScheduler] Booking ${booking.bookingNumber}: No workers left in Wave ${nextWave}`);
              return;
            }

            // Filter to only online+available workers (single batch find for this booking)
            const workerIds = workersToNotify.map(v => v.vendorId);
            const onlineWorkers = await Worker.find(
              { _id: { $in: workerIds }, isOnline: true, availability: { $in: ['AVAILABLE', 'BUSY'] } },
              '_id'
            ).lean();

            const onlineSet = new Set(onlineWorkers.map(v => v._id.toString()));
            workersToNotify = workersToNotify.filter(v => onlineSet.has(v.vendorId.toString()));

            // Advance wave in DB — use findByIdAndUpdate for atomicity (avoids race with accept)
            const notifyIds = workersToNotify.map(v => v.vendorId);
            await Booking.findByIdAndUpdate(booking._id, {
              $set: { currentWave: nextWave, waveStartedAt: new Date() },
              $addToSet: { notifiedVendors: { $each: notifyIds } }
            });

            if (workersToNotify.length === 0) {
              console.log(`[BookingScheduler] Booking ${booking.bookingNumber}: Wave ${nextWave} all offline, advancing quietly`);
              return;
            }

            console.log(`[BookingScheduler] ${booking.bookingNumber}: Wave ${nextWave} → notifying ${workersToNotify.length} workers`);

            // Insert BookingRequest records + send notifications (both in parallel)
            const bookingRequests = workersToNotify.map(v => ({
              bookingId: booking._id,
              vendorId: v.vendorId,
              status: 'PENDING',
              createdAt: booking.createdAt || new Date(),
              distance: v.distance || null,
              sentAt: new Date(),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000)
            }));

            await Promise.all([
              BookingRequest.insertMany(bookingRequests, { ordered: false }).catch(err => {
                if (err.code !== 11000) console.error('[BookingScheduler] BookingRequest insert error:', err);
              }),
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

  async notifyWorkers(booking, workers) {
    try {
      // Fetch booking details for notification (single query for the whole wave)
      const populatedBooking = await Booking.findById(booking._id)
        .populate('serviceId', 'title')
        .populate('userId', 'name phone')
        .lean();

      if (!populatedBooking) return;

      const serviceName = populatedBooking.serviceId?.title || populatedBooking.serviceName;
      const customerName = populatedBooking.userId?.name || 'Customer';

      // Send all worker notifications in parallel
      await Promise.all(
        workers.map(async (v) => {
          // Fire socket immediately (synchronous, non-blocking)
          if (this.io) {
            this.io.to(`vendor_${v.vendorId}`).emit('new_booking_request', {
              bookingId: booking._id,
              serviceName,
              customerName,
              scheduledDate: populatedBooking.scheduledDate,
              scheduledTime: populatedBooking.scheduledTime,
              price: populatedBooking.finalAmount,
              address: populatedBooking.address,
              distance: v.distance,
              serviceCategory: populatedBooking.serviceCategory,
              brandName: populatedBooking.brandName,
              brandIcon: populatedBooking.brandIcon,
              categoryIcon: populatedBooking.categoryIcon,
              createdAt: populatedBooking.createdAt,
              expiresAt: new Date(new Date(populatedBooking.createdAt).getTime() + MAX_SEARCH_TIME_MS).toISOString(),
              playSound: true,
              message: `New booking request within ${v.distance?.toFixed(1) || '?'}km!`
            });
          }

          // Create DB notification + FCM push
          await createNotification({
            vendorId: v.vendorId,
            type: 'booking_request',
            title: 'New Booking Request',
            message: `New service request for ${serviceName} from ${customerName}`,
            relatedId: booking._id,
            relatedType: 'booking',
            data: {
              bookingId: booking._id,
              serviceName,
              customerName,
              scheduledDate: populatedBooking.scheduledDate,
              scheduledTime: populatedBooking.scheduledTime,
              location: populatedBooking.address,
              price: populatedBooking.finalAmount,
              distance: v.distance
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
