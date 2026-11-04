const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');
const { MAX_ISSUE_PHOTOS, MAX_ISSUE_VIDEOS } = require('../utils/issuePhotos');

/**
 * Booking Model
 * Represents service bookings made by users
 * Organized by logical sections for better maintainability
 */
const bookingSchema = new mongoose.Schema({
  // ==========================================
  // 1. IDENTIFIERS
  // ==========================================
  bookingNumber: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: false,
    index: true
  },
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    default: null,
    index: true
  },
  surgePricing: {
    enabled: { type: Boolean, default: false },
    multiplier: { type: Number, default: 1 }
  },
  notifiedVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],

  // ==========================================
  // WAVE-BASED ALERTING
  // ==========================================
  potentialVendors: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
    distance: { type: Number }, // in km
    // Ranking score (0-100) when the 'smart' assignment strategy is used.
    score: { type: Number, default: null }
  }],
  // Admin assignment queue: no professional could be found automatically, so an admin picks one.
  awaitingAdmin: { type: Boolean, default: false, index: true },
  adminQueuedAt: { type: Date, default: null },
  // no_worker_in_zone | no_worker_nearby | no_worker_accepted | worker_declined
  adminQueueReason: { type: String, default: null },
  adminAssignedAt: { type: Date, default: null },
  adminAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  // Workers who must not be alerted again for this booking: they rejected it,
  // were offline when their wave came round, or cancelled after accepting.
  excludedVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],
  // How many times the booking went back to searching after an assigned
  // worker cancelled. Capped by Settings.maxReassignments.
  reassignmentCount: {
    type: Number,
    default: 0
  },
  currentWave: {
    type: Number,
    default: 1
  },
  waveStartedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },

  // ==========================================
  // 2. SERVICE INFORMATION
  // ==========================================
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserService',
    required: [true, 'Service is required'],
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: false,
    index: true
  },
  serviceName: {
    type: String,
    required: true
  },
  serviceCategory: {
    type: String,
    required: [true, 'Service category is required']
  },
  // Visual Identity (For easier UI access)
  categoryIcon: { type: String, default: null }, // URL to category icon
  brandName: { type: String, default: null },    // e.g. "LG", "Samsung"
  brandIcon: { type: String, default: null },    // URL to brand logo
  description: {
    type: String,
    trim: true
  },
  serviceImages: [{
    type: String
  }],
  // Booked Items (Brand > Card snapshot)
  bookedItems: [{
    brandName: { type: String, default: '' },
    brandIcon: { type: String, default: null },
    serviceName: { type: String, default: '' },
    card: {
      title: { type: String },
      subtitle: { type: String },
      price: { type: Number, default: 0 },
      originalPrice: { type: Number },
      duration: { type: String },
      description: { type: String },
      imageUrl: { type: String },
      features: [{ type: String }]
    },
    quantity: { type: Number, default: 1 },
    // The customer's answers to the category's questions (e.g. Appliance brand: LG),
    // copied from the cart at booking time.
    details: {
      type: [new mongoose.Schema({
        key: { type: String, required: true },
        label: { type: String, default: '' },
        value: { type: String, default: '' }
      }, { _id: false })],
      default: []
    }
  }],
  // Extras picked at checkout. Prices are copied from the AddOn at booking
  // time so later price changes do not alter an existing booking.
  addOns: [{
    addOnId: { type: mongoose.Schema.Types.ObjectId, ref: 'AddOn' },
    title: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    total: { type: Number, required: true, min: 0 }
  }],
  // Sum of addOns[].total; already included in basePrice.
  addOnsTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  // Repair services the customer picked after the professional inspected on
  // site (e.g. after a "Visit"). Prices are copied server-side from the catalog;
  // they are added to the worker bill automatically when it is generated.
  // isOther = free-text problem the worker prices on the bill.
  customerAddedServices: [{
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserService', default: null },
    title: { type: String, required: true, trim: true },
    unitPrice: { type: Number, default: 0, min: 0 },   // base, excl GST
    quantity: { type: Number, default: 1, min: 1, max: 10 },
    isOther: { type: Boolean, default: false },
    note: { type: String, default: '', trim: true, maxlength: 300 },
    addedAt: { type: Date, default: Date.now }
  }],
  // ==========================================
  // PRICING MODEL (snapshot from the service at booking time)
  // ==========================================
  pricingType: {
    type: String,
    enum: ['fixed', 'hourly', 'starting_from', 'inspection_fee', 'quote_required'],
    default: 'fixed'
  },
  // hourly only: hours booked and the rate applied, so the bill and any
  // dispute can be checked against what the customer actually chose.
  hoursBooked: {
    type: Number,
    default: null
  },
  hourlyRateApplied: {
    type: Number,
    default: null
  },
  // inspection_fee only: the customer paid only to get the professional on
  // site; the real job cost is added later through advancePayment/worker bill.
  isInspectionOnly: {
    type: Boolean,
    default: false
  },

  // Emergency booking: alerted to more workers over a wider radius, with a
  // surcharge (already included in basePrice).
  isEmergency: {
    type: Boolean,
    default: false,
    index: true
  },
  emergencyCharge: {
    type: Number,
    default: 0,
    min: 0
  },
  // Instructions from the customer for the worker, entered at checkout.
  customerNotes: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: null
  },
  // Set when the booking was generated from a recurring plan.
  recurringBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecurringBooking',
    default: null,
    index: true
  },

  // ==========================================
  // 3. PRICING & BILLING
  // ==========================================
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Set only when a coupon was applied. The code is stored alongside the id so
  // the booking still shows what was used if the coupon is later deleted.
  couponId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
  couponCode: {
    type: String,
    default: null,
    uppercase: true,
    trim: true
  },
  couponDiscount: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  visitingCharges: {
    type: Number,
    default: 0,
    min: 0
  },
  penalty: {
    type: Number,
    default: 0,
    min: 0
  },
  extraCharges: [{
    name: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    price: { type: Number, required: true },
    total: { type: Number, required: true }
  }],
  extraChargesTotal: {
    type: Number,
    default: 0
  },
  // Total Value of the Booking (set after bill generation)
  finalAmount: {
    type: Number,
    required: [true, 'Final amount is required'],
    min: 0
  },
  // Amount specifically payable by the user (might differ from finalAmount in plan cases)
  userPayableAmount: {
    type: Number,
    default: 0
  },
  // What the customer had already paid online, up front, when the final bill was first made. The bill can grow
  // (repair services, parts), and only the difference is still due.
  prepaidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Reference to WorkerBill (single source of truth for earnings/commission)
  vendorBillId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WorkerBill',
    default: null
  },

  // ==========================================
  // 4. PAYMENT INFORMATION
  // ==========================================
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING,
    index: true
  },
  paymentMethod: {
    type: String, // 'wallet', 'razorpay', 'online', 'cash', 'card', 'plan_benefit'
    default: null
  },
  paymentId: {
    type: String,
    default: null
  },
  razorpayOrderId: {
    type: String,
    default: null,
    index: true
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpayQrId: {
    type: String,
    default: null,
    index: true
  },
  advancePayment: {
    status: {
      type: String,
      enum: ['none', 'requested', 'paid', 'cancelled'],
      default: 'none'
    },
    requestedAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    reason: {
      type: String,
      default: null
    },
    partsDescription: {
      type: String,
      default: null
    },
    requestedAt: {
      type: Date,
      default: null
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Worker',
      default: null
    },
    paidAt: {
      type: Date,
      default: null
    },
    paymentMethod: {
      type: String,
      default: null
    },
    paymentId: {
      type: String,
      default: null
    },
    razorpayOrderId: {
      type: String,
      default: null
    },
    razorpayPaymentId: {
      type: String,
      default: null
    }
  },
  // Cash Collection Details
  cashCollected: {
    type: Boolean,
    default: false
  },
  cashCollectedAt: {
    type: Date,
    default: null
  },
  cashCollectedBy: {
    type: String,
    enum: ['vendor'],
    default: null
  },
  cashCollectorId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'cashCollectedBy',
    default: null
  },

  // ==========================================
  // 5. ADDRESS INFORMATION
  // ==========================================
  address: {
    type: { type: String, default: 'home' },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    landmark: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },

  // ==========================================
  // 6. SCHEDULING
  // ==========================================
  scheduledDate: {
    type: Date,
    required: [true, 'Scheduled date is required'],
    index: true
  },
  scheduledTime: {
    type: String,
    required: [true, 'Scheduled time is required']
  },
  timeSlot: {
    start: { type: String, required: true },
    end: { type: String, required: true },
    date: { type: String }, // redundant but kept for frontend convenience format
    time: { type: String }  // redundant but kept for frontend convenience format
  },

  // How many times the date/time has been moved, and the partner's pending request to move it (the customer decides)
  rescheduleCount: { type: Number, default: 0 },
  rescheduleRequest: {
    status: { type: String, enum: ['pending', 'accepted', 'declined', null], default: null },
    scheduledDate: { type: Date },
    scheduledTime: { type: String },
    timeSlot: { start: { type: String }, end: { type: String } },
    reason: { type: String, default: null },
    requestedAt: { type: Date },
    respondedAt: { type: Date }
  },

  // ==========================================
  // 7. STATUS & TRACKING
  // ==========================================
  bookingType: {
    type: String,
    enum: ['instant', 'scheduled'],
    default: 'scheduled',
    index: true
  },
  status: {
    type: String,
    enum: Object.values(BOOKING_STATUS),
    default: BOOKING_STATUS.PENDING,
    index: true
  },
  // Timestamps
  acceptedAt: { type: Date, default: null },
  assignedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  journeyStartedAt: { type: Date, default: null },
  visitedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },

  // ==========================================
  // 8. SECURITY & OTPs
  // ==========================================
  visitOtp: {
    type: String,
    select: false
  },
  // Old name of customerConfirmationOTP. Nothing writes it any more; kept so bookings made before the
  // change still read correctly (utils/paymentCode.js) and so scripts/mergePaymentCodeFields.js can move them.
  paymentOtp: {
    type: String,
    select: false
  },
  customerConfirmationOTP: {
    type: String,
    default: null
  },
  // Wrong-code counters for the arrival and payment codes (see utils/otpGuard.js)
  otpGuard: {
    visit: { attempts: { type: Number, default: 0 }, lockedUntil: { type: Date, default: null } },
    payment: { attempts: { type: Number, default: 0 }, lockedUntil: { type: Date, default: null } }
  },
  // Set when the worker sends the finished bill to the customer (Collect Cash / Online QR) and
  // cleared when they go back to edit it. The customer only sees the amount, the pay buttons and the
  // verification code while this is set.
  billFinalizedAt: {
    type: Date,
    default: null
  },
  // When the customer last opened an online checkout for the final bill (see utils/billLock.js)
  paymentOrderCreatedAt: {
    type: Date,
    default: null
  },
  customerConfirmed: {
    type: Boolean,
    default: false
  },

  // Optional photos the customer attaches at checkout so the worker can see the
  // problem before accepting. Cleaned by sanitizeIssuePhotos() in
  // utils/issuePhotos.js before it is written.
  issuePhotos: {
    type: [String],
    default: [],
    validate: {
      validator: (v) => !v || v.length <= MAX_ISSUE_PHOTOS,
      message: `A booking can have at most ${MAX_ISSUE_PHOTOS} photos`
    }
  },
  // Short videos of the problem, cleaned by sanitizeIssueVideos().
  issueVideos: {
    type: [String],
    default: [],
    validate: {
      validator: (v) => !v || v.length <= MAX_ISSUE_VIDEOS,
      message: `A booking can have at most ${MAX_ISSUE_VIDEOS} videos`
    }
  },

  // ==========================================
  // 9. WORK COMPLETION
  // ==========================================
  // Job photos. Stored as objects so before and after shots can be told apart
  // on the booking detail page. Entries written before this change were plain
  // URL strings; normalizeWorkPhotos() in utils/workPhotos.js converts those to
  // { url, type: 'after' } on read, so old bookings still render.
  workPhotos: [{
    url: { type: String, required: true },
    type: {
      type: String,
      enum: ['before', 'after'],
      default: 'after'
    },
    uploadedAt: { type: Date, default: Date.now }
  }],
  visitLocation: {
    lat: Number,
    lng: Number,
    address: String,
    verifiedAt: Date
  },
  workDoneDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Note: Detailed billing (items/parts) is now handled by WorkerBill model
  // workDoneDetails and extraCharges are deprecated in favor of WorkerBill

  // ==========================================
  // 10. CANCELLATION
  // ==========================================
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: null },
  cancelledBy: { type: String, default: null },
  // What the customer was charged for cancelling (0 when it was free)
  cancellationFee: { type: Number, default: 0, min: 0 },
  feeCovered: { type: Boolean, default: false },

  // ==========================================
  // 11. REVIEW & RATING
  // ==========================================
  rating: { type: Number, default: null, min: 1, max: 5 },
  review: { type: String, default: null },
  reviewImages: [{ type: String }],
  reviewedAt: { type: Date, default: null },

  // ==========================================
  // 12. SETTLEMENT (User)
  // ==========================================
  finalSettlementStatus: {
    type: String,
    enum: ['PENDING', 'DONE'],
    default: 'PENDING'
  },

  // ==========================================
  // 13. NOTES
  // ==========================================
  vendorNotes: { type: String, default: null },

  // ==========================================
  // 14. LIFECYCLE TIMELINE
  // Appended automatically by the hooks below whenever status, payment
  // status, rating or dispute status changes, so every code path that moves a
  // booking along is recorded without each one having to remember to.
  // ==========================================
  statusHistory: [{
    // Booking status at the time of the entry.
    status: { type: String },
    // What happened: created, status, payment, reviewed, disputed,
    // dispute_resolved, refunded, reassigned.
    event: { type: String, default: 'status' },
    note: { type: String, default: null },
    by: { type: String, enum: ['user', 'worker', 'admin', 'system'], default: 'system' },
    at: { type: Date, default: Date.now }
  }],

  // ==========================================
  // 15. DISPUTES & REFUNDS
  // ==========================================
  disputeStatus: {
    type: String,
    enum: ['none', 'open', 'resolved', 'rejected'],
    default: 'none',
    index: true
  },
  disputeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dispute',
    default: null
  },
  // Total refunded to the customer for this booking across all disputes,
  // used to stop a second refund exceeding what was paid.
  refundedAmount: {
    type: Number,
    default: 0,
    min: 0
  }

}, {
  timestamps: true
});

// Payment statuses that mean the customer has paid.
const PAID_STATUSES = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_WORKER];

/**
 * Timeline entries for a document save. Who made the change is not known to
 * the model, so callers that care set `booking.$locals.actor` before saving.
 */
bookingSchema.pre('save', function (next) {
  const by = this.$locals?.actor || 'system';
  const note = this.$locals?.timelineNote || null;
  const at = new Date();
  const entries = [];

  if (this.isNew) {
    entries.push({ status: this.status, event: 'created', by: this.$locals?.actor || 'user', at });
  } else {
    // Callers that record a richer entry themselves (e.g. 'reassigned') set
    // skipStatusEntry so the change is not logged twice.
    if (this.isModified('status') && !this.$locals?.skipStatusEntry) {
      entries.push({ status: this.status, event: 'status', note, by, at });
    }
    if (this.isModified('paymentStatus')) {
      if (PAID_STATUSES.includes(this.paymentStatus)) {
        entries.push({ status: this.status, event: 'payment', by, at });
      } else if (this.paymentStatus === PAYMENT_STATUS.REFUNDED) {
        entries.push({ status: this.status, event: 'refunded', by, at });
      }
    }
    if (this.isModified('rating') && this.rating) {
      entries.push({ status: this.status, event: 'reviewed', note: `${this.rating}★`, by: 'user', at });
    }
    if (this.isModified('disputeStatus')) {
      if (this.disputeStatus === 'open') {
        entries.push({ status: this.status, event: 'disputed', by, at });
      } else if (['resolved', 'rejected'].includes(this.disputeStatus)) {
        entries.push({ status: this.status, event: 'dispute_resolved', note: this.disputeStatus, by: 'admin', at });
      }
    }
  }

  if (entries.length) {
    this.statusHistory = [...(this.statusHistory || []), ...entries];
  }
  next();
});

/**
 * Same timeline for findOneAndUpdate / findByIdAndUpdate, which bypass the
 * save hook. Only plain $set (or top-level) status/payment changes are
 * tracked; that covers every atomic update in the codebase.
 */
bookingSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  const read = (key) => (set[key] !== undefined ? set[key] : update[key]);

  const status = read('status');
  const paymentStatus = read('paymentStatus');
  const by = this.getOptions()?.actor || 'system';
  const at = new Date();
  const entries = [];

  if (status !== undefined) {
    entries.push({ status, event: 'status', by, at });
  }
  if (paymentStatus !== undefined) {
    if (PAID_STATUSES.includes(paymentStatus)) {
      entries.push({ status: status || null, event: 'payment', by, at });
    } else if (paymentStatus === PAYMENT_STATUS.REFUNDED) {
      entries.push({ status: status || null, event: 'refunded', by, at });
    }
  }

  if (entries.length) {
    // Merge with any $push the caller already set rather than overwrite it.
    const push = update.$push || {};
    if (push.statusHistory) {
      const existing = push.statusHistory.$each || [push.statusHistory];
      push.statusHistory = { $each: [...existing, ...entries] };
    } else {
      push.statusHistory = { $each: entries };
    }
    update.$push = push;
    this.setUpdate(update);
  }
  next();
});

// Generate unique booking number
bookingSchema.pre('save', async function (next) {
  if (this.isNew && !this.bookingNumber) {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.bookingNumber = `BK${timestamp}${random}`;
  }
  next();
});

// Core compound indexes
bookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ vendorId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ scheduledDate: 1, status: 1 });
bookingSchema.index({ paymentStatus: 1, status: 1 });
// Admin booking notifications: recent events across all bookings
bookingSchema.index({ 'statusHistory.at': -1 });

// ── PERFORMANCE INDEXES (added for wave-scheduler & dashboard queries) ──
// Scheduler: Booking.find({ status: 'searching', waveStartedAt: { $ne: null } })
bookingSchema.index({ status: 1, waveStartedAt: 1 });
// Reject/Accept: Booking.findOne({ notifiedVendors: vendorId, status: ... })
bookingSchema.index({ notifiedVendors: 1, status: 1 });
// Wave filter: potentialVendors.vendorId lookup
bookingSchema.index({ 'potentialVendors.vendorId': 1 });
// Dashboard: $or on { vendorId: null, serviceCategory: ..., status: ... }
bookingSchema.index({ vendorId: 1, serviceCategory: 1, status: 1 });

// Referral payout on completion.
//
// Bookings are completed from several controllers (worker, cash collection,
// admin), so the trigger lives on the model rather than being repeated at each
// call site and risking one being missed.
//
// The pre-save hook records whether this save is the transition into
// 'completed'; the post-save hook acts on it. Errors are swallowed: a referral
// payout must never fail the booking write that triggered it.
bookingSchema.pre('save', function (next) {
  this._completedNow =
    this.isModified('status') && this.status === 'completed';
  next();
});

bookingSchema.post('save', function (doc) {
  if (!this._completedNow) return;
  this._completedNow = false;

  // Required lazily: the service imports Booking indirectly, and requiring it
  // at module scope would create a circular import.
  const { handleBookingCompleted } = require('../services/userReferralService');

  handleBookingCompleted(doc.userId, doc._id).catch((err) =>
    console.error('[Referral] Booking completion hook failed:', err.message)
  );
});

module.exports = mongoose.model('Booking', bookingSchema);
