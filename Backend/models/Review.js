const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    index: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true
  },
  images: [{
    type: String // Cloudinary URLs
  }],
  isVerified: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'hidden', 'deleted'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for faster aggregation
reviewSchema.index({ vendorId: 1, rating: -1 });
reviewSchema.index({ serviceId: 1, rating: -1 });

module.exports = mongoose.model('Review', reviewSchema);
