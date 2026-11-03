const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'global',
    unique: true
  },
  visitedCharges: {
    type: Number,
    default: 149,
    min: 0
  },
  serviceGstPercentage: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  partsGstPercentage: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  servicePayoutPercentage: {
    type: Number,
    default: 90, // Worker gets 90% of service base price
    min: 0,
    max: 100
  },
  partsPayoutPercentage: {
    type: Number,
    default: 100, // Worker gets 100% of parts base price
    min: 0,
    max: 100
  },
  tdsPercentage: {
    type: Number,
    default: 1, // 1% default TDS u/s 194-O
    min: 0,
    max: 100
  },
  platformFeePercentage: {
    type: Number,
    default: 1, // 1% default platform fee
    min: 0,
    max: 100
  },
  vendorCashLimit: {
    type: Number,
    default: 10000,
    min: 0
  },
  cancellationPenalty: {
    type: Number,
    default: 49,
    min: 0
  },
  maxSearchTime: {
    type: Number,
    default: 5, // 5 minutes default
    min: 1
  },
  waveDuration: {
    type: Number,
    default: 60, // 60 seconds per wave default
    min: 10
  },
  searchRadius: {
    type: Number,
    default: 10, // 10 km default search radius
    min: 1
  },
  // Razorpay Settings
  razorpayKeyId: {
    type: String,
    default: null
  },
  razorpayKeySecret: {
    type: String,
    default: null
  },
  razorpayWebhookSecret: {
    type: String,
    default: null
  },
  // Cloudinary Settings
  cloudinaryCloudName: {
    type: String,
    default: null
  },
  cloudinaryApiKey: {
    type: String,
    default: null
  },
  cloudinaryApiSecret: {
    type: String,
    default: null
  },
  // Google Maps API & App Language Configuration
  googleMapsApiKey: {
    type: String,
    default: null
  },
  googleMapsLanguage: {
    type: String,
    default: 'auto' // 'auto' (sync with app language) or specific code: 'en', 'hi', etc.
  },
  mapRegion: {
    type: String,
    default: 'IN'
  },
  defaultAppLanguage: {
    type: String,
    default: 'en'
  },
  supportedLanguages: {
    type: [String],
    default: ['en', 'hi']
  },
  autoDetectLanguageFromMap: {
    type: Boolean,
    default: false
  },
  // Future extensible fields
  currency: {
    type: String,
    default: 'INR'
  },

  // Billing & Invoice Configuration
  companyName: {
    type: String,
    default: 'TodayMyDream'
  },
  companyGSTIN: {
    type: String,
    default: ''
  },
  companyPAN: {
    type: String,
    default: ''
  },
  companyAddress: {
    type: String,
    default: ''
  },
  companyCity: {
    type: String,
    default: ''
  },
  companyState: {
    type: String,
    default: ''
  },
  companyPincode: {
    type: String,
    default: ''
  },
  companyPhone: {
    type: String,
    default: ''
  },
  companyEmail: {
    type: String,
    default: ''
  },

  // Invoice Settings
  invoicePrefix: {
    type: String,
    default: 'INV'
  },
  sacCode: {
    type: String,
    default: '998599'  // Event services SAC code
  },
  currentInvoiceNumber: {
    type: Number,
    default: 0
  },

  // Support Settings
  supportEmail: {
    type: String,
    default: ''
  },
  supportPhone: {
    type: String,
    default: ''
  },
  supportWhatsapp: {
    type: String,
    default: ''
  },
  isOnlinePaymentEnabled: {
    type: Boolean,
    default: true
  },
  isScrapEnabled: {
    type: Boolean,
    default: true
  },

  // Worker Referral Program Settings
  vendorReferralEnabled: {
    type: Boolean,
    default: true
  },
  vendorReferralReward: {
    type: Number,
    default: 100, // Reward amount in INR credited to referrer worker wallet
    min: 0
  },
  vendorReferralCriteria: {
    type: String,
    enum: ['MANUAL_ADMIN_APPROVAL', 'ON_APPROVAL'],
    default: 'MANUAL_ADMIN_APPROVAL'
  },

  // ==========================================
  // CUSTOMER REFERRAL PROGRAMME
  // Mirrors the worker referral settings above so both are tuned from the
  // same admin screen.
  // ==========================================
  userReferralEnabled: {
    type: Boolean,
    default: true
  },
  // Credited to the referrer once the criteria below is met.
  userReferralReward: {
    type: Number,
    default: 100,
    min: 0
  },
  // Joining bonus for the new customer. 0 disables it.
  userRefereeReward: {
    type: Number,
    default: 0,
    min: 0
  },
  // ON_SIGNUP pays as soon as the account is created, which is open to abuse;
  // FIRST_BOOKING waits until the referred customer completes a booking.
  userReferralCriteria: {
    type: String,
    enum: ['ON_SIGNUP', 'FIRST_BOOKING', 'MANUAL_ADMIN_APPROVAL'],
    default: 'FIRST_BOOKING'
  },
  // Caps how many rewards one customer can earn. 0 means unlimited.
  userReferralMaxPerUser: {
    type: Number,
    default: 0,
    min: 0
  },

  // ==========================================
  // CUSTOMIZATION TOGGLES
  // Every toggle defaults to the platform's existing behaviour, so adding
  // one of these fields never changes how a running deployment works.
  // ==========================================

  // When ON, the user and worker apps show a maintenance screen.
  // The admin panel stays reachable so the toggle can be turned back off.
  isUnderMaintenance: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'We are performing scheduled maintenance. Please check back shortly.'
  },

  // Master switch for cash payment across the platform.
  isCashEnabled: {
    type: Boolean,
    default: true
  },

  // Controls whether wallet balance can be used at checkout.
  isWalletPaymentEnabled: {
    type: Boolean,
    default: true
  },

  // When OFF, new worker sign-ups are refused. Existing workers are unaffected.
  isVendorRegistrationEnabled: {
    type: Boolean,
    default: true
  },

  // Booking types offered to customers. At least one must stay enabled —
  // the settings controller rejects an update that would disable both.
  isInstantBookingEnabled: {
    type: Boolean,
    default: true
  },
  isScheduledBookingEnabled: {
    type: Boolean,
    default: true
  },

  // When ON, the apps skip the device location prompt and use defaultCityId.
  useDefaultLocation: {
    type: Boolean,
    default: false
  },
  defaultCityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    default: null
  },

  // Master switches for floating login banners on mobile apps
  isUserLoginBannersEnabled: {
    type: Boolean,
    default: true
  },
  isPartnerLoginBannersEnabled: {
    type: Boolean,
    default: true
  },

  // ==========================================
  // BOOKING EXPERIENCE
  // Read through utils/bookingConfig.js, which applies these same defaults
  // when a field is missing from an older settings document.
  // ==========================================

  // Free-text instructions the customer adds at checkout.
  isCustomerNotesEnabled: { type: Boolean, default: true },
  customerNotesMaxLength: { type: Number, default: 500, min: 50, max: 2000 },

  // Problem media attached at checkout.
  maxIssuePhotos: { type: Number, default: 5, min: 0, max: 10 },
  isIssueVideoEnabled: { type: Boolean, default: true },
  maxIssueVideos: { type: Number, default: 1, min: 0, max: 3 },
  maxIssueVideoSizeMB: { type: Number, default: 25, min: 1, max: 100 },
  maxIssueVideoDurationSec: { type: Number, default: 60, min: 5, max: 300 },

  // Optional extras the customer can add to a service. The add-ons
  // themselves are managed on the Add-ons page.
  isAddOnsEnabled: { type: Boolean, default: true },

  // Emergency bookings. Off by default: an admin must choose the surcharge
  // and the categories that offer it before customers see the option.
  isEmergencyEnabled: { type: Boolean, default: false },
  emergencySurchargeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  emergencySurchargeValue: { type: Number, default: 199, min: 0 },
  emergencySearchRadius: { type: Number, default: 15, min: 1 },
  // Emergency alerts go to this many workers at once instead of the usual
  // first-wave size, so someone accepts faster.
  emergencyFirstWaveSize: { type: Number, default: 10, min: 1, max: 50 },
  emergencyMaxSearchTime: { type: Number, default: 3, min: 1 },

  // Cancellation policy (see utils/bookingConfig.js)
  userFreeCancelHours: { type: Number, default: 2, min: 0, max: 168 },
  userFreeCancelGraceMinutes: { type: Number, default: 5, min: 0, max: 120 },
  userLateCancelFeeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  userLateCancelFeeValue: { type: Number, default: 49, min: 0 },
  userLateCancelFeeMax: { type: Number, default: 0, min: 0 },
  workerFreeCancelHours: { type: Number, default: 2, min: 0, max: 168 },
  workerFreeCancelGraceMinutes: { type: Number, default: 5, min: 0, max: 120 },
  workerLateCancelPenaltyType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  workerLateCancelPenaltyValue: { type: Number, default: 0, min: 0 },
  workerLateCancelPenaltyMax: { type: Number, default: 0, min: 0 },

  // Scrap payout (see utils/bookingConfig.js)
  scrapAllowCashPayout: { type: Boolean, default: false },
  walletMinTopup: { type: Number, default: 100, min: 1 },
  walletMaxTopup: { type: Number, default: 50000, min: 1 },
  scrapWorkerPayoutEnabled: { type: Boolean, default: false },
  scrapWorkerPayoutType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
  scrapWorkerPayoutValue: { type: Number, default: 0, min: 0 },
  scrapWorkerPayoutMax: { type: Number, default: 0, min: 0 },

  // ==========================================
  // CUSTOMER <-> WORKER CHAT
  // ==========================================
  isChatEnabled: { type: Boolean, default: true },
  isChatImageEnabled: { type: Boolean, default: true },
  // Chat turns read-only this many hours after the booking ends.
  chatCloseAfterHours: { type: Number, default: 24, min: 0, max: 720 },
  // Hides phone numbers typed into messages so contact stays on-platform.
  chatMaskPhoneNumbers: { type: Boolean, default: true },

  // ==========================================
  // DISPUTES
  // ==========================================
  isDisputeEnabled: { type: Boolean, default: true },
  // How long after a booking ends a dispute can still be raised.
  disputeWindowDays: { type: Number, default: 7, min: 1, max: 90 },
  maxDisputeEvidence: { type: Number, default: 5, min: 0, max: 10 },
  disputeReasons: {
    type: [String],
    default: [
      'Service not completed',
      'Poor quality of work',
      'Overcharged / billing issue',
      'Professional misbehaved',
      'Damage to property',
      'Professional did not arrive',
      'Payment issue',
      'Other'
    ]
  },

  // ==========================================
  // WORKER ASSIGNMENT
  // ==========================================
  // 'distance' alerts the closest workers first (the original behaviour).
  // 'smart' ranks them by a weighted score of the factors below.
  assignmentStrategy: { type: String, enum: ['distance', 'smart'], default: 'smart' },
  assignmentDistanceWeight: { type: Number, default: 40, min: 0, max: 100 },
  assignmentRatingWeight: { type: Number, default: 25, min: 0, max: 100 },
  assignmentAcceptanceWeight: { type: Number, default: 20, min: 0, max: 100 },
  assignmentCompletionWeight: { type: Number, default: 15, min: 0, max: 100 },
  assignmentResponseTimeWeight: { type: Number, default: 0, min: 0, max: 100 },
  // Partner service area (utils/serviceArea.js): a partner may limit himself to a radius around his home address
  isWorkerServiceRadiusEnabled: { type: Boolean, default: false },
  workerServiceRadiusMinKm: { type: Number, default: 2, min: 1, max: 200 },
  workerServiceRadiusMaxKm: { type: Number, default: 25, min: 1, max: 200 },
  // Rescheduling a booking. Customers move their own booking; a partner can only ask the customer to move it.
  isRescheduleEnabled: { type: Boolean, default: true },
  isWorkerRescheduleEnabled: { type: Boolean, default: true },
  // How many times one booking can be moved (0 = no limit) and how close to the visit it is still allowed (0 = any time)
  rescheduleMaxCount: { type: Number, default: 0, min: 0, max: 20 },
  rescheduleCutoffHours: { type: Number, default: 0, min: 0, max: 72 },
  // Workers rated below this (with enough reviews to trust it) are not alerted.
  assignmentMinRating: { type: Number, default: 0, min: 0, max: 5 },
  // Acceptance and completion rates look back this many days.
  assignmentStatsWindowDays: { type: Number, default: 90, min: 7, max: 365 },
  // Workers alerted in each of the first three waves; later waves alert everyone left.
  wave1Size: { type: Number, default: 3, min: 1, max: 50 },
  wave2Size: { type: Number, default: 3, min: 1, max: 50 },
  wave3Size: { type: Number, default: 4, min: 1, max: 50 },
  // When every alerted worker rejects, move to the next wave immediately
  // instead of waiting for the wave timer.
  autoReassignOnReject: { type: Boolean, default: true },
  // When an assigned worker cancels before starting, search for another one
  // instead of cancelling the customer's booking.
  autoReassignOnWorkerCancel: { type: Boolean, default: true },
  maxReassignments: { type: Number, default: 3, min: 0, max: 10 },

  // How bookings find professionals: by the customer's zone, or by distance (see utils/bookingConfig.js)
  dispatchMode: { type: String, enum: ['zone', 'distance'], default: 'zone' },

  // ==========================================
  // ADMIN ASSIGNMENT QUEUE
  // A booking nobody in the zone can take (no professional with the skill, or nobody accepted)
  // waits for an admin to pick a professional by hand instead of being cancelled.
  // ==========================================
  isAdminAssignmentEnabled: { type: Boolean, default: true },
  // Also hand a booking to the admin when the automatic search ends with no acceptance.
  escalateToAdminOnTimeout: { type: Boolean, default: true },
  // How long an unassigned booking waits for the admin before it is cancelled and refunded.
  adminAssignmentWindowMins: { type: Number, default: 60, min: 5, max: 1440 },
  // How long the professional picked by the admin has to accept before it returns to the admin.
  adminAssignedResponseMins: { type: Number, default: 15, min: 1, max: 240 },

  // ==========================================
  // OUT-OF-ZONE PAGE
  // What a customer sees when their location is outside every active zone (edited from Zones).
  // ==========================================
  outOfZonePage: {
    title: { type: String, default: "We're not in your area yet" },
    message: {
      type: String,
      default: "Our services are currently not available at this location. We're expanding quickly - check back soon or choose a different address."
    },
    imageUrl: { type: String, default: '' },
    primaryButtonText: { type: String, default: 'Change Location / Address' },
    showRetryButton: { type: Boolean, default: true },
    retryButtonText: { type: String, default: 'Retry Location Detection' },
    footerText: { type: String, default: 'Make sure location services are enabled on your device.' },
    showSupportContact: { type: Boolean, default: true },
    accentColor: { type: String, default: '#2563eb' },
    backgroundColor: { type: String, default: '#f9fafb' }
  },

  // ==========================================
  // TIME-SLOT WINDOW (Phase 1)
  // Powers the dynamic time-slot API that replaces the hard-coded 09:00..20:00
  // grid in Checkout. Defaults match today's frontend behaviour exactly
  // (slots 09:00..20:00, 60-minute buckets, 7-day lookahead, 1-hour lead),
  // so no admin edit = no behaviour change. Phase 2 (real worker-availability)
  // will override these when it ships.
  // ==========================================
  slotStartHour: { type: Number, default: 9, min: 0, max: 23 },
  slotEndHour: { type: Number, default: 20, min: 1, max: 24 },
  slotDurationMinutes: { type: Number, default: 60, min: 15, max: 240 },
  slotMaxDaysAhead: { type: Number, default: 7, min: 1, max: 30 },
  slotMinLeadMinutes: { type: Number, default: 60, min: 0, max: 1440 },

  // ==========================================
  // SCHEDULED BOOKINGS & WORKER AVAILABILITY
  // A scheduled (future) booking is offered to every eligible worker at once, including
  // workers who are on a job right now, and stays open until `scheduledBookingCutoffHours`
  // before its slot. Overlap checks use the job length + travel buffer below.
  // ==========================================
  scheduledBookingCutoffHours: { type: Number, default: 2, min: 0, max: 72 },
  scheduledJobDurationMinutes: { type: Number, default: 90, min: 15, max: 600 },
  scheduledTravelBufferMinutes: { type: Number, default: 30, min: 0, max: 240 },
  allowBusyWorkersForScheduled: { type: Boolean, default: true },
  excludeBusyWorkersForInstant: { type: Boolean, default: true },

  // ==========================================
  // COMMISSION (global default)
  // Category, worker and worker+category overrides live in CommissionRule.
  // 'percentage' uses servicePayoutPercentage above; 'fixed' keeps
  // defaultFixedCommission rupees per booking from the service amount.
  // servicePayoutPercentage, partsPayoutPercentage and these two fields are edited only on the
  // Commission page (PUT /api/admin/commission-rules/default).
  // ==========================================
  defaultCommissionType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  defaultFixedCommission: { type: Number, default: 0, min: 0 },

  // ==========================================
  // PAYOUTS
  // ==========================================
  minWithdrawalAmount: { type: Number, default: 100, min: 0 },

  // ==========================================
  // RECURRING BOOKINGS
  // ==========================================
  isRecurringEnabled: { type: Boolean, default: true },
  recurringFrequencies: {
    type: [String],
    enum: ['weekly', 'biweekly', 'monthly'],
    default: ['weekly', 'biweekly', 'monthly']
  },
  recurringMaxOccurrences: { type: Number, default: 12, min: 2, max: 52 },
  // Discount on the service amount of every booking in a recurring plan.
  recurringDiscountPercentage: { type: Number, default: 0, min: 0, max: 50 },
  // Each occurrence is created (and its worker search started) this many
  // hours before the visit.
  recurringLeadHours: { type: Number, default: 24, min: 1, max: 168 }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
