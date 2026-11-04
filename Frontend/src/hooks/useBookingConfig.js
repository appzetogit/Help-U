import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Admin-controlled booking features (notes, media, add-ons, emergency, chat,
 * disputes, recurring) from /public/config.
 *
 * The config is fetched once per page load and shared by every component that
 * uses the hook. SocketContext dispatches 'bookingConfigUpdated' when an admin
 * changes it, so open screens update without a reload.
 */

// Mirrors the backend defaults (utils/bookingConfig.js) so the UI behaves
// sensibly before the first response arrives.
export const BOOKING_CONFIG_DEFAULTS = {
  isCustomerNotesEnabled: true,
  customerNotesMaxLength: 500,
  maxIssuePhotos: 5,
  isIssueVideoEnabled: true,
  maxIssueVideos: 1,
  maxIssueVideoSizeMB: 25,
  maxIssueVideoDurationSec: 60,
  isAddOnsEnabled: true,
  isEmergencyEnabled: false,
  emergencySurchargeType: 'fixed',
  emergencySurchargeValue: 199,
  isChatEnabled: true,
  isChatImageEnabled: true,
  isDisputeEnabled: true,
  disputeWindowDays: 7,
  maxDisputeEvidence: 5,
  disputeReasons: [
    'Service not completed',
    'Poor quality of work',
    'Overcharged / billing issue',
    'Professional misbehaved',
    'Damage to property',
    'Professional did not arrive',
    'Payment issue',
    'Other'
  ],
  workerDisputeReasons: [
    'Customer unavailable / Not at location',
    'Customer refused to pay',
    'Customer misbehaved / Inappropriate behavior',
    'Incorrect address / Location unreachable',
    'Scope mismatch / Extra work demanded',
    'Customer cancelled at doorstep',
    'Safety or security concern',
    'Payment or settlement issue',
    'Other'
  ],
  minWithdrawalAmount: 100,
  isRecurringEnabled: true,
  recurringFrequencies: ['weekly', 'biweekly', 'monthly'],
  recurringMaxOccurrences: 12,
  recurringDiscountPercentage: 0,
  // Time-slot window for scheduled bookings (admin: Booking Configuration)
  slotStartHour: 9,
  slotEndHour: 20,
  slotDurationMinutes: 60,
  slotMaxDaysAhead: 7,
  slotMinLeadMinutes: 60,
  // Cancellation policy (admin: Booking Configuration)
  userFreeCancelHours: 2,
  userFreeCancelGraceMinutes: 5,
  userLateCancelFeeType: 'fixed',
  userLateCancelFeeValue: 49,
  userLateCancelFeeMax: 0,
  cancellationPenalty: 49,
  visitedCharges: 149,
  workerFreeCancelHours: 2,
  workerFreeCancelGraceMinutes: 5,
  workerLateCancelPenaltyType: 'fixed',
  workerLateCancelPenaltyValue: 0,
  workerLateCancelPenaltyMax: 0,
  // Scrap payout: wallet by default; the customer may choose cash when this is on
  scrapAllowCashPayout: false,
  // What a professional earns for a scrap pickup (off by default)
  scrapWorkerPayoutEnabled: false,
  scrapWorkerPayoutType: 'fixed',
  scrapWorkerPayoutValue: 0,
  scrapWorkerPayoutMax: 0,
  // Customer wallet top-up limits (₹)
  isWorkerServiceRadiusEnabled: false,
  workerServiceRadiusMinKm: 2,
  workerServiceRadiusMaxKm: 25,
  isRescheduleEnabled: true,
  isWorkerRescheduleEnabled: true,
  rescheduleMaxCount: 0,
  rescheduleCutoffHours: 0,
  walletMinTopup: 100,
  walletMaxTopup: 50000
};

let cached = null;
let inflight = null;

export const loadBookingConfig = async (force = false) => {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;

  inflight = api.get('/public/config')
    .then((res) => {
      cached = { ...BOOKING_CONFIG_DEFAULTS, ...(res.data?.settings?.bookingConfig || {}) };
      return cached;
    })
    .catch(() => cached || BOOKING_CONFIG_DEFAULTS)
    .finally(() => { inflight = null; });

  return inflight;
};

export const setBookingConfigCache = (config) => {
  cached = { ...BOOKING_CONFIG_DEFAULTS, ...(config || {}) };
  window.dispatchEvent(new CustomEvent('bookingConfigUpdated', { detail: cached }));
};

const useBookingConfig = () => {
  const [config, setConfig] = useState(cached || BOOKING_CONFIG_DEFAULTS);

  useEffect(() => {
    let active = true;
    loadBookingConfig().then((c) => { if (active) setConfig(c); });

    const onUpdate = (e) => setConfig(e.detail || cached || BOOKING_CONFIG_DEFAULTS);
    window.addEventListener('bookingConfigUpdated', onUpdate);
    return () => {
      active = false;
      window.removeEventListener('bookingConfigUpdated', onUpdate);
    };
  }, []);

  return config;
};

export default useBookingConfig;
