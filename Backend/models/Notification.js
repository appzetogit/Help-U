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
      'scrap_pickup_assigned',
      'scrap_weighed',
      'scrap_weight_disputed',
      'support_message',
      'vendor_withdrawal_request',
      'vendor_referral_success',
      'vendor_referral_rewarded',
      'advance_payment_requested',
      'customer_added_services', // customer added repair services after inspection
      'booking_reassigned',
      'booking_needs_assignment', // Admin: a booking has no professional and needs a manual assignment
      'booking_awaiting_admin',   // User: our team is arranging a professional
      'chat_message',
      'dispute_raised',
      'dispute_updated',
      'dispute_resolved',
      'recurring_booking_created',
      'recurring_booking_failed',
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
    enum: ['booking', 'payment', 'user', 'vendor', 'service', 'scrap', 'withdrawal', 'dispute', 'recurring', 'support'],
    default: null
  },
  // Zone scoping (optional - for zone-specific broadcasts/notifications)
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    default: null,
    index: true
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

