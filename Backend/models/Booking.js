const mongoose = require('mongoose');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');

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
  notifiedVendors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker'
  }],

  // ==========================================
  // WAVE-BASED ALERTING
  // ==========================================
  potentialVendors: [{
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker' },
    distance: { type: Number } // in km
  }],
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
    quantity: { type: Number, default: 1 }
  }],

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
  paymentOtp: {
    type: String,
    select: false
  },
  customerConfirmationOTP: {
    type: String,
    default: null
  },
  customerConfirmed: {
    type: Boolean,
    default: false
  },

  // ==========================================
  // 9. WORK COMPLETION
  // ==========================================
  // ==========================================
  // 9. WORK COMPLETION
  // ==========================================
  workPhotos: [{
    type: String
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
  vendorNotes: { type: String, default: null }

}, {
  timestamps: true
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

// ── PERFORMANCE INDEXES (added for wave-scheduler & dashboard queries) ──
// Scheduler: Booking.find({ status: 'searching', waveStartedAt: { $ne: null } })
bookingSchema.index({ status: 1, waveStartedAt: 1 });
// Reject/Accept: Booking.findOne({ notifiedVendors: vendorId, status: ... })
bookingSchema.index({ notifiedVendors: 1, status: 1 });
// Wave filter: potentialVendors.vendorId lookup
bookingSchema.index({ 'potentialVendors.vendorId': 1 });
// Dashboard: $or on { vendorId: null, serviceCategory: ..., status: ... }
bookingSchema.index({ vendorId: 1, serviceCategory: 1, status: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
