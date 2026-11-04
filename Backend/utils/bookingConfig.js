/**
 * Booking Configuration
 *
 * Single source of truth for the admin-tunable booking features stored on the
 * global Settings document: notes, problem media, add-ons, emergency bookings,
 * chat, disputes, worker assignment, commission defaults, payouts and
 * recurring bookings.
 *
 * Every reader goes through getBookingConfig() so a field missing from an
 * older settings document resolves to the same default everywhere, and a
 * brief database outage serves the last known values instead of failing the
 * request.
 */

const Settings = require('../models/Settings');

// Each entry: [default, kind, min?, max?]. `kind` drives validation of admin
// updates in sanitizeConfigUpdate(); defaults mirror models/Settings.js.
const CONFIG_SCHEMA = {
  isCustomerNotesEnabled: [true, 'boolean'],
  customerNotesMaxLength: [500, 'number', 50, 2000],

  maxIssuePhotos: [5, 'number', 0, 10],
  isIssueVideoEnabled: [true, 'boolean'],
  maxIssueVideos: [1, 'number', 0, 3],
  maxIssueVideoSizeMB: [25, 'number', 1, 100],
  maxIssueVideoDurationSec: [60, 'number', 5, 300],

  isAddOnsEnabled: [true, 'boolean'],

  isEmergencyEnabled: [false, 'boolean'],
  emergencySurchargeType: ['fixed', 'enum', ['fixed', 'percentage']],
  emergencySurchargeValue: [199, 'number', 0, 100000],
  emergencySearchRadius: [15, 'number', 1, 200],
  emergencyFirstWaveSize: [10, 'number', 1, 50],
  emergencyMaxSearchTime: [3, 'number', 1, 60],

  isChatEnabled: [true, 'boolean'],
  isChatImageEnabled: [true, 'boolean'],
  chatCloseAfterHours: [24, 'number', 0, 720],
  chatMaskPhoneNumbers: [true, 'boolean'],

  isDisputeEnabled: [true, 'boolean'],
  disputeWindowDays: [7, 'number', 1, 90],
  maxDisputeEvidence: [5, 'number', 0, 10],
  disputeReasons: [[
    'Service not completed',
    'Poor quality of work',
    'Overcharged / billing issue',
    'Professional misbehaved',
    'Damage to property',
    'Professional did not arrive',
    'Payment issue',
    'Other'
  ], 'stringList'],
  workerDisputeReasons: [[
    'Customer unavailable / Not at location',
    'Customer refused to pay',
    'Customer misbehaved / Inappropriate behavior',
    'Incorrect address / Location unreachable',
    'Scope mismatch / Extra work demanded',
    'Customer cancelled at doorstep',
    'Safety or security concern',
    'Payment or settlement issue',
    'Other'
  ], 'stringList'],

  // How a booking finds its professionals - ONE rule at a time:
  //   zone      the customer's zone decides: only professionals in that zone, however far away. Addresses
  //             outside every zone are refused. The search radius and a professional's own service radius
  //             are not used. With no active zone it behaves like 'distance'.
  //   distance  zones are not used at all (no out-of-zone block, zone surge or zone category limits):
  //             professionals within the search radius of the address, nearest first.
  dispatchMode: ['zone', 'enum', ['zone', 'distance']],
  // How a search runs (all edited under Booking Config -> Finding professionals). They are stored on the
  // same Settings fields as before, so nothing that reads them changes.
  searchRadius: [10, 'number', 1, 200],      // km around the address ('distance' mode only)
  maxSearchTime: [5, 'number', 1, 60],       // minutes to find a professional before giving up
  waveDuration: [60, 'number', 10, 600],     // seconds before the next batch of professionals is alerted
  assignmentStrategy: ['smart', 'enum', ['distance', 'smart']],
  assignmentDistanceWeight: [40, 'number', 0, 100],
  assignmentRatingWeight: [25, 'number', 0, 100],
  assignmentAcceptanceWeight: [20, 'number', 0, 100],
  assignmentCompletionWeight: [15, 'number', 0, 100],
  // How fast the professional usually accepts. 0 = not part of the ranking (the original behaviour).
  assignmentResponseTimeWeight: [0, 'number', 0, 100],
  assignmentMinRating: [0, 'number', 0, 5],
  assignmentStatsWindowDays: [90, 'number', 7, 365],
  // Partner service area: partners may limit themselves to a radius around their own home address (see utils/serviceArea.js)
  isWorkerServiceRadiusEnabled: [false, 'boolean'],
  workerServiceRadiusMinKm: [2, 'number', 1, 200],
  workerServiceRadiusMaxKm: [25, 'number', 1, 200],
  isRescheduleEnabled: [true, 'boolean'],
  isWorkerRescheduleEnabled: [true, 'boolean'],
  rescheduleMaxCount: [0, 'number', 0, 20],
  rescheduleCutoffHours: [0, 'number', 0, 72],
  wave1Size: [3, 'number', 1, 50],
  wave2Size: [3, 'number', 1, 50],
  wave3Size: [4, 'number', 1, 50],
  autoReassignOnReject: [true, 'boolean'],
  autoReassignOnWorkerCancel: [true, 'boolean'],
  maxReassignments: [3, 'number', 0, 10],
  // Bookings nobody can take wait for an admin to assign a professional instead of being cancelled
  isAdminAssignmentEnabled: [true, 'boolean'],
  escalateToAdminOnTimeout: [true, 'boolean'],
  adminAssignmentWindowMins: [60, 'number', 5, 1440],
  adminAssignedResponseMins: [15, 'number', 1, 240],

  defaultCommissionType: ['percentage', 'enum', ['percentage', 'fixed']],
  defaultFixedCommission: [0, 'number', 0, 100000],

  minWithdrawalAmount: [100, 'number', 0, 1000000],

  isRecurringEnabled: [true, 'boolean'],
  recurringFrequencies: [['weekly', 'biweekly', 'monthly'], 'enumList', ['weekly', 'biweekly', 'monthly']],
  recurringMaxOccurrences: [12, 'number', 2, 52],
  recurringDiscountPercentage: [0, 'number', 0, 50],
  recurringLeadHours: [24, 'number', 1, 168],

  // Time-slot window (Phase 1). Defaults match today's hard-coded Checkout
  // behaviour so no admin edit means no behaviour change.
  slotStartHour: [9, 'number', 0, 23],
  slotEndHour: [20, 'number', 1, 24],
  slotDurationMinutes: [60, 'number', 15, 240],
  slotMaxDaysAhead: [7, 'number', 1, 30],
  slotMinLeadMinutes: [60, 'number', 0, 1440],

  // Scheduled bookings stay open until this many hours before the slot (never less than the
  // normal search time); the job length + travel buffer decide whether two bookings overlap.
  scheduledBookingCutoffHours: [2, 'number', 0, 72],
  scheduledJobDurationMinutes: [90, 'number', 15, 600],
  scheduledTravelBufferMinutes: [30, 'number', 0, 240],
  allowBusyWorkersForScheduled: [true, 'boolean'],
  excludeBusyWorkersForInstant: [true, 'boolean'],

  // Cancellation policy, applied once a professional has been allotted (before that, cancelling
  // is always free). Free if cancelled at least `FreeCancelHours` before the slot, or within
  // `FreeCancelGraceMinutes` of the allotment (this also covers instant bookings, which have no
  // later slot); otherwise the fee below applies. 0 hours means no free window beyond the grace.
  userFreeCancelHours: [2, 'number', 0, 168],
  userFreeCancelGraceMinutes: [5, 'number', 0, 120],
  userLateCancelFeeType: ['fixed', 'enum', ['fixed', 'percentage']],
  userLateCancelFeeValue: [49, 'number', 0, 100000],
  userLateCancelFeeMax: [0, 'number', 0, 100000], // 0 = no cap
  // Flat fee once the professional is on the way (never less than the late fee above)
  cancellationPenalty: [49, 'number', 0, 100000],

  // The worker's penalty is taken from their earnings. 0 (the default) means no penalty.
  workerFreeCancelHours: [2, 'number', 0, 168],
  workerFreeCancelGraceMinutes: [5, 'number', 0, 120],
  workerLateCancelPenaltyType: ['fixed', 'enum', ['fixed', 'percentage']],
  workerLateCancelPenaltyValue: [0, 'number', 0, 100000],
  workerLateCancelPenaltyMax: [0, 'number', 0, 100000], // 0 = no cap

  // Scrap: the customer is paid to their Help U wallet; when on, they can instead choose cash
  // from the professional at pickup (Help U then reimburses the professional).
  scrapAllowCashPayout: [false, 'boolean'],

  // Customer wallet top-up limits (₹)
  walletMinTopup: [100, 'number', 1, 100000],
  walletMaxTopup: [50000, 'number', 1, 1000000],

  // What the professional earns for completing a scrap pickup. Off by default: nothing is paid
  // until an admin switches it on. Fixed = a flat amount per pickup; percentage = a share of the
  // final amount paid for the scrap (capped by ...Max when that is above 0).
  scrapWorkerPayoutEnabled: [false, 'boolean'],
  scrapWorkerPayoutType: ['fixed', 'enum', ['fixed', 'percentage']],
  scrapWorkerPayoutValue: [0, 'number', 0, 100000],
  scrapWorkerPayoutMax: [0, 'number', 0, 100000]
};

// Existing settings the booking flow also needs; read here so callers have one
// place to look. They are edited from the Settings page, except the payout percentages,
// which belong to the Commission page.
const PASSTHROUGH_DEFAULTS = {
  // Charged on every paid booking; set by the admin (0 means no visiting charge)
  visitedCharges: 149,
  serviceGstPercentage: 18,
  partsGstPercentage: 18,
  servicePayoutPercentage: 90,
  partsPayoutPercentage: 100
};

const CACHE_TTL_MS = 10000;
let cached = null;
let cachedAt = 0;

const loadSettings = async () => {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const settings =
      (await Settings.findOne({ type: 'global' }).lean()) ||
      (await Settings.findOne().lean());
    cached = settings || {};
    cachedAt = now;
    return cached;
  } catch (error) {
    console.error('[BookingConfig] Failed to load settings:', error.message);
    return cached || {};
  }
};

const resolveValue = (stored, [fallback, kind]) => {
  if (stored === undefined || stored === null) return fallback;
  if (kind === 'boolean') return typeof stored === 'boolean' ? stored : fallback;
  if (kind === 'number') return Number.isFinite(Number(stored)) ? Number(stored) : fallback;
  if (kind === 'stringList' || kind === 'enumList') {
    return Array.isArray(stored) && stored.length > 0 ? stored : fallback;
  }
  return stored;
};

/**
 * Full configuration, including the passthrough settings. Server-side only.
 */
const getBookingConfig = async () => {
  const settings = await loadSettings();
  const config = {};

  for (const [name, spec] of Object.entries(CONFIG_SCHEMA)) {
    config[name] = resolveValue(settings[name], spec);
  }
  for (const [name, fallback] of Object.entries(PASSTHROUGH_DEFAULTS)) {
    const value = Number(settings[name]);
    config[name] = Number.isFinite(value) && settings[name] !== null && settings[name] !== undefined
      ? value
      : fallback;
  }

  return config;
};

/**
 * The subset the user and worker apps need. Assignment weights and commission
 * defaults are internal and deliberately left out.
 */
const getPublicBookingConfig = async () => {
  const c = await getBookingConfig();

  // A partner's own travel radius only matters when distance decides who gets a booking. In zone mode with
  // at least one active zone, dispatch ignores it, so the partner app must not offer a control that does
  // nothing. (Zone mode with no zone set up falls back to distance rules, so the radius still applies.)
  let workerRadiusInUse = c.isWorkerServiceRadiusEnabled;
  if (workerRadiusInUse && c.dispatchMode !== 'distance') {
    try {
      const Zone = require('../models/Zone');
      if (await Zone.exists({ status: 'active' })) workerRadiusInUse = false;
    } catch (_) {
      // keep the admin's setting if zones cannot be checked
    }
  }

  return {
    isCustomerNotesEnabled: c.isCustomerNotesEnabled,
    customerNotesMaxLength: c.customerNotesMaxLength,
    maxIssuePhotos: c.maxIssuePhotos,
    isIssueVideoEnabled: c.isIssueVideoEnabled && c.maxIssueVideos > 0,
    maxIssueVideos: c.maxIssueVideos,
    maxIssueVideoSizeMB: c.maxIssueVideoSizeMB,
    maxIssueVideoDurationSec: c.maxIssueVideoDurationSec,
    isAddOnsEnabled: c.isAddOnsEnabled,
    isEmergencyEnabled: c.isEmergencyEnabled,
    emergencySurchargeType: c.emergencySurchargeType,
    emergencySurchargeValue: c.emergencySurchargeValue,
    isChatEnabled: c.isChatEnabled,
    isChatImageEnabled: c.isChatImageEnabled,
    isDisputeEnabled: c.isDisputeEnabled,
    disputeWindowDays: c.disputeWindowDays,
    maxDisputeEvidence: c.maxDisputeEvidence,
    disputeReasons: c.disputeReasons,
    workerDisputeReasons: c.workerDisputeReasons,
    minWithdrawalAmount: c.minWithdrawalAmount,
    isRecurringEnabled: c.isRecurringEnabled,
    recurringFrequencies: c.recurringFrequencies,
    recurringMaxOccurrences: c.recurringMaxOccurrences,
    recurringDiscountPercentage: c.recurringDiscountPercentage,

    // Exposed to the user app so Checkout can build the time-slot grid.
    slotStartHour: c.slotStartHour,
    slotEndHour: c.slotEndHour,
    slotDurationMinutes: c.slotDurationMinutes,
    slotMaxDaysAhead: c.slotMaxDaysAhead,
    slotMinLeadMinutes: c.slotMinLeadMinutes,

    // Shown in the cancel dialogs and the policy page.
    userFreeCancelHours: c.userFreeCancelHours,
    userFreeCancelGraceMinutes: c.userFreeCancelGraceMinutes,
    userLateCancelFeeType: c.userLateCancelFeeType,
    userLateCancelFeeValue: c.userLateCancelFeeValue,
    userLateCancelFeeMax: c.userLateCancelFeeMax,
    cancellationPenalty: c.cancellationPenalty,
    visitedCharges: c.visitedCharges,
    workerFreeCancelHours: c.workerFreeCancelHours,
    workerFreeCancelGraceMinutes: c.workerFreeCancelGraceMinutes,
    workerLateCancelPenaltyType: c.workerLateCancelPenaltyType,
    workerLateCancelPenaltyValue: c.workerLateCancelPenaltyValue,
    workerLateCancelPenaltyMax: c.workerLateCancelPenaltyMax,
    scrapAllowCashPayout: c.scrapAllowCashPayout,
    isWorkerServiceRadiusEnabled: workerRadiusInUse,
    workerServiceRadiusMinKm: c.workerServiceRadiusMinKm,
    workerServiceRadiusMaxKm: c.workerServiceRadiusMaxKm,
    isRescheduleEnabled: c.isRescheduleEnabled,
    isWorkerRescheduleEnabled: c.isWorkerRescheduleEnabled,
    rescheduleMaxCount: c.rescheduleMaxCount,
    rescheduleCutoffHours: c.rescheduleCutoffHours,
    walletMinTopup: c.walletMinTopup,
    walletMaxTopup: c.walletMaxTopup,
    scrapWorkerPayoutEnabled: c.scrapWorkerPayoutEnabled,
    scrapWorkerPayoutType: c.scrapWorkerPayoutType,
    scrapWorkerPayoutValue: c.scrapWorkerPayoutValue,
    scrapWorkerPayoutMax: c.scrapWorkerPayoutMax
  };
};

const invalidateBookingConfigCache = () => {
  cached = null;
  cachedAt = 0;
};

/**
 * Validates an admin update against CONFIG_SCHEMA.
 * Unknown keys are ignored. Returns { updates, errors }.
 */
// Read through the booking configuration, but edited elsewhere (the Commission page), so the
// Booking Configuration endpoint ignores them.
const READ_ONLY_HERE = new Set(['defaultCommissionType', 'defaultFixedCommission']);

const sanitizeConfigUpdate = (payload = {}) => {
  const updates = {};
  const errors = [];

  for (const [name, [, kind, a, b]] of Object.entries(CONFIG_SCHEMA)) {
    if (READ_ONLY_HERE.has(name)) continue;
    if (payload[name] === undefined) continue;
    const raw = payload[name];

    if (kind === 'boolean') {
      updates[name] = raw === true || raw === 'true';
    } else if (kind === 'number') {
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        errors.push(`${name} must be a number`);
      } else if (value < a || value > b) {
        errors.push(`${name} must be between ${a} and ${b}`);
      } else {
        updates[name] = value;
      }
    } else if (kind === 'enum') {
      if (!a.includes(raw)) errors.push(`${name} must be one of: ${a.join(', ')}`);
      else updates[name] = raw;
    } else if (kind === 'enumList') {
      const list = Array.isArray(raw) ? [...new Set(raw.filter((v) => a.includes(v)))] : [];
      if (list.length === 0) errors.push(`${name} needs at least one value`);
      else updates[name] = list;
    } else if (kind === 'stringList') {
      const list = Array.isArray(raw)
        ? [...new Set(raw.map((v) => String(v || '').trim()).filter(Boolean))].slice(0, 30)
        : [];
      if (list.length === 0) errors.push(`${name} needs at least one value`);
      else updates[name] = list.map((v) => v.slice(0, 100));
    }
  }

  // Cross-field: slot window must be a valid range when both ends are being
  // updated in the same request. Validator is synchronous today so we only
  // run this pair-check when both keys are present — single-field updates
  // are protected by the per-field min/max above and by the caller (the
  // settings controller re-reads the saved document before returning).
  if (updates.slotStartHour !== undefined && updates.slotEndHour !== undefined) {
    if (updates.slotEndHour <= updates.slotStartHour) {
      errors.push('slotEndHour must be greater than slotStartHour');
      delete updates.slotStartHour;
      delete updates.slotEndHour;
    }
  }

  return { updates, errors };
};

module.exports = {
  CONFIG_SCHEMA,
  PASSTHROUGH_DEFAULTS,
  getBookingConfig,
  getPublicBookingConfig,
  invalidateBookingConfigCache,
  sanitizeConfigUpdate
};
