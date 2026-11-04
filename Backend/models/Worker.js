const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { WORKER_STATUS } = require('../utils/constants');

const workerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    trim: true
  },
  alternatePhone: {
    type: String,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['vendor'],
    default: 'vendor'
  },
  password: {
    type: String,
    select: false
  },
  businessName: {
    type: String,
    trim: true
  },
  service: {
    type: [String], // Changed to array for multiple categories
    default: [],
    // required: [true, 'Please provide at least one service category'] 
  },
  categories: {
    type: [String],
    default: []
  },
  skills: {
    type: [String],
    default: []
  },
  aadhar: {
    number: {
      type: String,
      trim: true,
      default: ''
    },
    document: {
      type: String, // Cloudinary URL (Front Side)
      default: null
    },
    backDocument: {
      type: String, // Cloudinary URL (Back Side)
      default: null
    }
  },
  pan: {
    number: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },
    document: {
      type: String, // Cloudinary URL
      default: null
    }
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  // Scrap pickup opt-in: only workers who opt in can be assigned scrap collections
  isScrapOpted: {
    type: Boolean,
    default: false,
    index: true
  },
  otherDocuments: [{
    type: String // Cloudinary URLs
  }],
  // Dynamic registration text fields & custom inputs
  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Dynamic verification document uploads
  customDocuments: [{
    fieldKey: {
      type: String,
      trim: true
    },
    label: {
      type: String,
      trim: true
    },
    url: {
      type: String,
      trim: true
    },
    fileName: {
      type: String,
      default: ''
    },
    fileType: {
      type: String,
      default: ''
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  approvalStatus: {
    type: String,
    enum: Object.values(WORKER_STATUS),
    default: WORKER_STATUS.PENDING
  },
  approvalDate: {
    type: Date
  },
  rejectedReason: {
    type: String
  },
  profilePhoto: {
    type: String,
    default: null
  },
  address: {
    fullAddress: String,
    addressLine1: String,
    addressLine2: String,
    city: String,
    state: String,
    pincode: String,
    landmark: String,
    lat: {
      type: Number,
      default: null
    },
    lng: {
      type: Number,
      default: null
    }
  },
  // Places the partner works from. Exactly one is the base location (isActive); it is copied into
  // `address` / `location` / `geoLocation`, which job dispatch and service area use.
  savedAddresses: [{
    addressType: { type: String, enum: ['home', 'office', 'custom'], default: 'office' },
    customName: { type: String, trim: true, default: '' },
    fullAddress: { type: String, trim: true, required: true },
    addressLine1: { type: String, trim: true, default: '' },
    addressLine2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    pincode: { type: String, trim: true, default: '' },
    landmark: { type: String, trim: true, default: '' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    isActive: { type: Boolean, default: false }
  }],
  bankDetails: {
    accountHolderName: {
      type: String,
      trim: true,
      default: ''
    },
    bankName: {
      type: String,
      trim: true,
      default: ''
    },
    accountNumber: {
      type: String,
      trim: true,
      default: ''
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: ''
    },
    branchName: {
      type: String,
      trim: true,
      default: ''
    },
    upiId: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },
    qrCodeImage: {
      type: String,
      default: ''
    }
  },
  wallet: {
    dues: {
      type: Number,
      default: 0 // Amount owed TO admin (from cash collection)
    },
    earnings: {
      type: Number,
      default: 0 // Amount owed BY admin (net income from jobs)
    },
    totalCashCollected: {
      type: Number,
      default: 0
    },
    totalWithdrawn: {
      type: Number,
      default: 0
    },
    totalSettled: {
      type: Number,
      default: 0
    },
    cashLimit: {
      type: Number,
      default: 10000
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    blockedAt: {
      type: Date,
      default: null
    },
    blockReason: {
      type: String,
      default: null
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  // Settings
  settings: {
    notifications: {
      type: Boolean,
      default: true
    },
    soundAlerts: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      default: 'en'
    },
    // How far (km) from his saved home address this partner will travel. Optional: empty means the platform
    // search radius applies. Only used while the admin has switched the feature on (utils/serviceArea.js).
    serviceRange: {
      type: Number,
      default: null,
      min: 1
    },
    // Whether the worker wants emergency job alerts. On by default so the
    // feature works as soon as an admin enables it; workers can opt out.
    acceptsEmergency: {
      type: Boolean,
      default: true
    }
  },
  // Real-time Location
  location: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  // GeoJSON Location for 2dsphere indexing (fast geo queries)
  geoLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  // Operational Zone assignment
  zoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    default: null,
    index: true
  },
  zoneIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Zone',
    index: true
  }],
  // Real-time Online Status
  isOnline: {
    type: Boolean,
    default: false,
    index: true
  },
  lastSeenAt: {
    type: Date,
    default: null
  },
  currentSocketId: {
    type: String,
    default: null
  },
  // Availability Status
  availability: {
    type: String,
    enum: ['AVAILABLE', 'BUSY', 'ON_JOB', 'OFFLINE'],
    default: 'OFFLINE',
    index: true
  },
  // Rating & Stats
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalJobs: {
    type: Number,
    default: 0
  },
  completedJobs: {
    type: Number,
    default: 0
  },
  cancelledJobs: {
    type: Number,
    default: 0
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  // Business Hours
  businessHours: {
    monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    saturday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    sunday: { open: String, close: String, isOpen: { type: Boolean, default: false } }
  },

  // FCM Push Notification Tokens
  fcmTokens: {
    type: [String],
    default: []
  },
  fcmTokenMobile: {
    type: [String],
    default: []
  },
  loginSessionId: {
    type: String,
    default: null
  },

  // Referral System
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    default: null
  },
  referralEarnings: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for faster queries
workerSchema.index({ approvalStatus: 1 });
workerSchema.index({ 'wallet.earnings': -1 });
workerSchema.index({ referredBy: 1 });
workerSchema.index({ geoLocation: '2dsphere' }); // Fast geo queries
workerSchema.index({ 'address.lat': 1, 'address.lng': 1 }); // Partner service area: partners whose home address is near a customer
workerSchema.index({ isOnline: 1, availability: 1, approvalStatus: 1 }); // Compound index for worker search

// Helper to generate random referral code
const generateReferralCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'HOMV';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Pre-save hook: Hash password and ensure unique referral code
workerSchema.pre('save', async function (next) {
  // Generate referral code if missing
  if (!this.referralCode) {
    this.referralCode = generateReferralCode();
  }

  if (!this.isModified('password') || !this.password) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
workerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Collection keeps its original name so existing data is untouched
module.exports = mongoose.model('Worker', workerSchema, 'vendors');

