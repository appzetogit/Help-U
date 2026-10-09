const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'global',
    unique: true
  },
  visitedCharges: {
    type: Number,
    default: 0,
    min: 0
  },
  serviceGstPercentage: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  partsGstPercentage: {
    type: Number,
    default: 18,
    min: 0,
    max: 100
  },
  servicePayoutPercentage: {
    type: Number,
    default: 90, // Worker gets 90% of service base price
    min: 0,
    max: 100
  },
  partsPayoutPercentage: {
    type: Number,
    default: 100, // Worker gets 100% of parts base price
    min: 0,
    max: 100
  },
  tdsPercentage: {
    type: Number,
    default: 1, // 1% default TDS u/s 194-O
    min: 0,
    max: 100
  },
  platformFeePercentage: {
    type: Number,
    default: 1, // 1% default platform fee
    min: 0,
    max: 100
  },
  vendorCashLimit: {
    type: Number,
    default: 10000,
    min: 0
  },
  cancellationPenalty: {
    type: Number,
    default: 49,
    min: 0
  },
  maxSearchTime: {
    type: Number,
    default: 5, // 5 minutes default
    min: 1
  },
  waveDuration: {
    type: Number,
    default: 60, // 60 seconds per wave default
    min: 10
  },
  searchRadius: {
    type: Number,
    default: 10, // 10 km default search radius
    min: 1
  },
  // Razorpay Settings
  razorpayKeyId: {
    type: String,
    default: null
  },
  razorpayKeySecret: {
    type: String,
    default: null
  },
  razorpayWebhookSecret: {
    type: String,
    default: null
  },
  // Cloudinary Settings
  cloudinaryCloudName: {
    type: String,
    default: null
  },
  cloudinaryApiKey: {
    type: String,
    default: null
  },
  cloudinaryApiSecret: {
    type: String,
    default: null
  },
  // Future extensible fields
  currency: {
    type: String,
    default: 'INR'
  },

  // Billing & Invoice Configuration
  companyName: {
    type: String,
    default: 'TodayMyDream'
  },
  companyGSTIN: {
    type: String,
    default: ''
  },
  companyPAN: {
    type: String,
    default: ''
  },
  companyAddress: {
    type: String,
    default: ''
  },
  companyCity: {
    type: String,
    default: ''
  },
  companyState: {
    type: String,
    default: ''
  },
  companyPincode: {
    type: String,
    default: ''
  },
  companyPhone: {
    type: String,
    default: ''
  },
  companyEmail: {
    type: String,
    default: ''
  },

  // Invoice Settings
  invoicePrefix: {
    type: String,
    default: 'INV'
  },
  sacCode: {
    type: String,
    default: '998599'  // Event services SAC code
  },
  currentInvoiceNumber: {
    type: Number,
    default: 0
  },

  // Support Settings
  supportEmail: {
    type: String,
    default: ''
  },
  supportPhone: {
    type: String,
    default: ''
  },
  supportWhatsapp: {
    type: String,
    default: ''
  },
  isOnlinePaymentEnabled: {
    type: Boolean,
    default: true
  },
  isScrapEnabled: {
    type: Boolean,
    default: true
  },

  // Worker Referral Program Settings
  vendorReferralEnabled: {
    type: Boolean,
    default: true
  },
  vendorReferralReward: {
    type: Number,
    default: 100, // Reward amount in INR credited to referrer worker wallet
    min: 0
  },
  vendorReferralCriteria: {
    type: String,
    enum: ['MANUAL_ADMIN_APPROVAL', 'ON_APPROVAL'],
    default: 'MANUAL_ADMIN_APPROVAL'
  },

  // ==========================================
  // CUSTOMIZATION TOGGLES
  // Every toggle defaults to the platform's existing behaviour, so adding
  // one of these fields never changes how a running deployment works.
  // ==========================================

  // When ON, the user and worker apps show a maintenance screen.
  // The admin panel stays reachable so the toggle can be turned back off.
  isUnderMaintenance: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'We are performing scheduled maintenance. Please check back shortly.'
  },

  // Master switch for cash payment across the platform.
  isCashEnabled: {
    type: Boolean,
    default: true
  },

  // Controls whether wallet balance can be used at checkout.
  isWalletPaymentEnabled: {
    type: Boolean,
    default: true
  },

  // When OFF, new worker sign-ups are refused. Existing workers are unaffected.
  isVendorRegistrationEnabled: {
    type: Boolean,
    default: true
  },

  // Booking types offered to customers. At least one must stay enabled —
  // the settings controller rejects an update that would disable both.
  isInstantBookingEnabled: {
    type: Boolean,
    default: true
  },
  isScheduledBookingEnabled: {
    type: Boolean,
    default: true
  },

  // When ON, the apps skip the device location prompt and use defaultCityId.
  useDefaultLocation: {
    type: Boolean,
    default: false
  },
  defaultCityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'City',
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
