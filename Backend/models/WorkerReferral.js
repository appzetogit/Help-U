const mongoose = require('mongoose');

/**
 * WorkerReferral Model
 * Tracks referrals between workers, approval status, and credited rewards.
 */
const workerReferralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  referredVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    unique: true,
    index: true
  },
  referralCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rewarded', 'rejected'],
    default: 'pending',
    index: true
  },
  rewardAmount: {
    type: Number,
    default: 0
  },
  rewardedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

workerReferralSchema.index({ referrerId: 1, status: 1 });
workerReferralSchema.index({ createdAt: -1 });

// Collection keeps its original name so existing data is untouched
module.exports = mongoose.model('WorkerReferral', workerReferralSchema, 'vendorreferrals');
