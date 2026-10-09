const mongoose = require('mongoose');

/**
 * BookingRequest Model
 * Tracks individual worker alerts for bookings
 * Enables retry logic, delivery confirmation, and analytics
 */
const bookingRequestSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING',
    index: true
  },
  wave: {
    type: Number,
    default: 1
  },
  distance: {
    type: Number, // in km
    default: null
  },
  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now
  },
  viewedAt: {
    type: Date,
    default: null
  },
  respondedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  // Delivery tracking
  socketDelivered: {
    type: Boolean,
    default: false
  },
  pushDelivered: {
    type: Boolean,
    default: false
  },
  // Response reason (for rejections)
  rejectReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
bookingRequestSchema.index({ bookingId: 1, vendorId: 1 }, { unique: true });
bookingRequestSchema.index({ vendorId: 1, status: 1 });
bookingRequestSchema.index({ bookingId: 1, status: 1 });
bookingRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-expiry

module.exports = mongoose.model('BookingRequest', bookingRequestSchema);
