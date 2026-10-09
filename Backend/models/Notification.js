const mongoose = require('mongoose');

/**
 * Notification Model
 * Stores notifications for users, workers, and admins
 */
const notificationSchema = new mongoose.Schema({
  // Recipient Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null,
    index: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
    index: true
  },
  // Notification Type
  type: {
    type: String,
    required: true,
    enum: [
      'booking_created',
      'booking_request',      // New booking request to worker
      'booking_requested',    // New booking created confirmation to user
      'booking_accepted',     // Worker accepted booking
      'booking_confirmed',
      'booking_cancelled',
      'booking_completed',
      'booking_rejected',
      'booking_rescheduled',
      'job_accepted',
      'job_rejected',
      'job_cancelled',
      'work_done',
      'work_completed',       // Added for worker self completion
      'vendor_reached',
      'journey_started',
      'visit_verified',
      'payment_received',
      'payment_success',
      'payment_failed',
      'payment_refunded',
      'review_submitted',
      'vendor_approved',
      'vendor_rejected',
      'wallet_topup',
      'payout_requested',
      'payout_processed',
      'scrap_listed',
      'new_scrap_added',
      'scrap_price_offered',
      'scrap_accepted',
      'scrap_rejected',
      'scrap_completed',
      'vendor_withdrawal_request',
      'vendor_referral_success',
      'vendor_referral_rewarded',
      'general'
    ],
    index: true
  },
  // Notification Content
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  // Related Entity (optional)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  relatedType: {
    type: String,
    enum: ['booking', 'payment', 'user', 'vendor', 'service', 'scrap', 'withdrawal'],
    default: null
  },
  // Notification Status
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  // Additional Data
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for faster queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ vendorId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ adminId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

