const mongoose = require('mongoose');

const scrapSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    trim: true,
    default: 'General'
  },
  quantity: {
    type: String,
    trim: true,
    default: '1'
  },
  expectedPrice: {
    type: Number,
    default: 0
  },
  images: [{
    type: String
  }],
  address: {
    addressLine1: String,
    city: String,
    state: String,
    pincode: String,
    lat: Number,
    lng: Number
  },
  status: {
    type: String,
    enum: ['pending', 'offered', 'accepted', 'completed', 'cancelled', 'rejected'],
    default: 'pending',
    index: true
  },
  offeredPrice: {
    type: Number,
    default: null
  },
  adminNote: {
    type: String,
    default: ''
  },
  offeredAt: {
    type: Date,
    default: null
  },
  userResponseDate: {
    type: Date,
    default: null
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null
  },
  pickupDate: {
    type: Date
  },
  finalPrice: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Scrap', scrapSchema);
