const mongoose = require('mongoose');

const workerServiceSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
    index: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
    index: true
  },
  customPrice: {
    type: Number,
    default: null
  },
  customDescription: {
    type: String,
    default: null
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  customImages: [{
    type: String
  }],
  customDuration: {
    type: Number, // In minutes
    default: null
  }
}, {
  timestamps: true
});

// Ensure a worker can only have one entry per service
workerServiceSchema.index({ vendorId: 1, serviceId: 1 }, { unique: true });

// Collection keeps its original name so existing data is untouched
module.exports = mongoose.model('WorkerService', workerServiceSchema, 'vendorservices');
