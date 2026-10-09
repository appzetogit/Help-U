const Worker = require('../../models/Worker');
const { generateOTP, hashOTP, storeOTP, verifyOTP, checkRateLimit } = require('../../utils/redisOtp.util');
const { generateTokenPair, verifyRefreshToken, generateVerificationToken, verifyVerificationToken } = require('../../utils/tokenService');
const { sendOTP: sendSMSOTP } = require('../../services/smsService');
const cloudinaryService = require('../../services/cloudinaryService');
const { USER_ROLES, WORKER_STATUS } = require('../../utils/constants');
const { validationResult } = require('express-validator');

/**
 * Send OTP for worker registration/login
 */
const sendOTP = async (req, res) => {
  try { 
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone, email } = req.body;

    // Check existing worker status to prevent OTP if restricted
    const existingWorker = await Worker.findOne({ phone });
    if (existingWorker) {
      if (existingWorker.approvalStatus === WORKER_STATUS.PENDING) {
        return res.status(200).json({
          success: true,
          message: 'Your account is currently under review. Please wait for admin approval.',
          worker: { adminApproval: 'pending' }
        });
      }
      if (existingWorker.approvalStatus === WORKER_STATUS.REJECTED || existingWorker.approvalStatus === WORKER_STATUS.SUSPENDED) {
        return res.status(403).json({ success: false, message: 'Account restricted.' });
      }
    }

    // 1. Rate limit check
    const allowed = await checkRateLimit(phone);
    if (!allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP requests. Please try again after 10 minutes.'
      });
    }

    // 2. Generate OTP
    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    // 3. Store OTP (Redis primary, MongoDB fallback)
    await storeOTP(phone, otpHash);

    // 4. Send OTP via SMS
    const smsResult = await sendSMSOTP(phone, otp);

    // Log OTP in development mode only (NEVER in production)
    if (process.env.NODE_ENV !== 'production' &&
        (process.env.NODE_ENV === 'development' || process.env.USE_DEFAULT_OTP === 'true')) {
      console.log(`[DEV] Worker OTP for ${phone}: ${otp}`);
    }

    if (!smsResult.success) {
      console.warn(`[OTP] SMS failed for worker ${phone}, but OTP stored`);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      token: 'verification-pending'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
};

/**
 * Verify OTP and Check Worker Status (Unified Login/Signup Entry)
 */
const verifyLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // 1. Verify OTP
    const verification = await verifyOTP(phone, otp);
    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // 2. Check if worker exists
    const worker = await Worker.findOne({ phone });

    if (worker) {
      // EXISTING WORKER

      // Check status checks (Login Logic)
      if (worker.approvalStatus === WORKER_STATUS.REJECTED) {
        return res.status(403).json({ success: false, message: 'Account rejected.' });
      }
      if (worker.approvalStatus === WORKER_STATUS.SUSPENDED) {
        return res.status(403).json({ success: false, message: 'Account suspended.' });
      }
      if (!worker.isActive) {
        return res.status(403).json({ success: false, message: 'Account deactivated.' });
      }

      // BLOCK PENDING WORKERS
      if (worker.approvalStatus === WORKER_STATUS.PENDING) {
        return res.status(200).json({
          success: true,
          message: 'Your account is currently under review. Please wait for admin approval.',
          worker: { adminApproval: 'pending' }
        });
      }

      // SINGLE DEVICE LOGIN: Update Session ID & Clear OLD FCM tokens
      const loginSessionId = Date.now().toString();
      await Worker.findByIdAndUpdate(worker._id, { 
        loginSessionId,
        $set: { fcmTokens: [], fcmTokenMobile: [] } // Clear all old tokens to prevent ghost notifications
      });

      const tokens = generateTokenPair({
        userId: worker._id,
        role: USER_ROLES.WORKER,
        loginSessionId
      });

      return res.status(200).json({
        success: true,
        isNewUser: false,
        message: 'Login successful',
        worker: {
          id: worker._id,
          name: worker.name,
          email: worker.email,
          phone: worker.phone,
          businessName: worker.businessName,
          service: worker.service,
          approvalStatus: worker.approvalStatus
        },
        ...tokens
      });

    } else {
      // NEW WORKER -> RETURN VERIFICATION TOKEN
      const verificationToken = generateVerificationToken(phone);

      return res.status(200).json({
        success: true,
        isNewUser: true,
        message: 'OTP verified. Please complete registration.',
        verificationToken
      });
    }

  } catch (error) {
    console.error('Verify Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed. Please try again.'
    });
  }
};

/**
 * Register worker with Verification Token (Service/Category Removed)
 */
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    // Ignore service validation error if present (since removed)
    const validErrors = errors.array().filter(e => e.path !== 'service');

    if (validErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validErrors
      });
    }

    // verificationToken handling
    const { name, email, verificationToken, aadhar, pan, gstin, referralCode } = req.body;
    let phone = req.body.phone;

    if (verificationToken) {
      const verifiedPhone = verifyVerificationToken(verificationToken);
      if (!verifiedPhone) return res.status(400).json({ success: false, message: 'Invalid verification session.' });
      phone = verifiedPhone;
    } else {
      // Fallback OTP
      if (!req.body.otp) return res.status(400).json({ success: false, message: 'Verification required.' });
      const ver = await verifyOTP(phone, req.body.otp);
      if (!ver.success) return res.status(400).json({ success: false, message: ver.message });
    }

    // Check existing
    const existing = await Worker.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Worker already exists. Login.' });
    }

    // Check referral code if provided
    let referrer = null;
    if (referralCode && referralCode.trim()) {
      referrer = await Worker.findOne({ 
        referralCode: referralCode.trim().toUpperCase(),
        phone: { $ne: phone } // Cannot refer oneself
      });
    }

    // Upload documents
    let aadharUrl = req.body.aadharDocument || null;
    let aadharBackUrl = req.body.aadharBackDocument || null;
    let panUrl = req.body.panDocument || null;
    let otherUrls = req.body.otherDocuments || [];

    if (aadharUrl && aadharUrl.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(aadharUrl, { folder: 'vendors/documents' });
      if (uploadRes.success) aadharUrl = uploadRes.url;
    }
    if (aadharBackUrl && aadharBackUrl.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(aadharBackUrl, { folder: 'vendors/documents' });
      if (uploadRes.success) aadharBackUrl = uploadRes.url;
    }
    if (panUrl && panUrl.startsWith('data:')) {
      const uploadRes = await cloudinaryService.uploadFile(panUrl, { folder: 'vendors/documents' });
      if (uploadRes.success) panUrl = uploadRes.url;
    }
    if (otherUrls && otherUrls.length > 0) {
      const uploadedOthers = [];
      for (const doc of otherUrls) {
        if (doc && doc.startsWith('data:')) {
          const up = await cloudinaryService.uploadFile(doc, { folder: 'vendors/documents/others' });
          if (up.success) uploadedOthers.push(up.url);
        } else uploadedOthers.push(doc);
      }
      otherUrls = uploadedOthers;
    }

    const worker = await Worker.create({
      name, email, phone,
      service: [], // Default empty as requested
      aadhar: {
        number: aadhar,
        document: aadharUrl,
        backDocument: aadharBackUrl
      },
      pan: { number: pan, document: panUrl },
      gstin: gstin ? gstin.trim().toUpperCase() : '',
      otherDocuments: otherUrls,
      approvalStatus: WORKER_STATUS.PENDING,
      isPhoneVerified: true,
      referredBy: referrer ? referrer._id : null
    });

    // Create Worker Referral tracking record if referred
    if (referrer) {
      try {
        const WorkerReferral = require('../../models/WorkerReferral');
        const Settings = require('../../models/Settings');
        const settings = await Settings.findOne({ type: 'global' }).lean();
        const rewardAmount = settings?.vendorReferralReward ?? 100;

        await WorkerReferral.create({
          referrerId: referrer._id,
          referredVendorId: worker._id,
          referralCode: referralCode.trim().toUpperCase(),
          status: 'pending',
          rewardAmount
        });

        // Notify Referrer Worker
        const { createNotification } = require('../notificationControllers/notificationController');
        await createNotification({
          vendorId: referrer._id,
          type: 'vendor_referral_success',
          title: '🎉 New Referral Signup!',
          message: `${worker.name} has registered using your referral code (${referralCode.trim().toUpperCase()}). Once approved, your reward of ₹${rewardAmount} will be credited to your wallet.`,
          relatedId: worker._id,
          relatedType: 'vendor'
        });
      } catch (refErr) {
        console.error('Referral creation error:', refErr);
      }
    }

    // Notify Admins
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      const Admin = require('../../models/Admin');
      const admins = await Admin.find({ isActive: true }).select('_id');
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'vendor_approval_request',
          title: '👤 New Worker Registration',
          message: `${worker.name} (${worker.phone}) has registered${referrer ? ` (Referred by ${referrer.name})` : ''}`,
          relatedId: worker._id,
          relatedType: 'vendor',
          data: { vendorId: worker._id, workerName: worker.name, phone: worker.phone },
          pushData: { type: 'admin_alert', link: '/admin/workers/all' }
        });
      }
    } catch (e) { console.error('Notify error', e); }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Pending approval.',
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        approvalStatus: worker.approvalStatus,
        referralCode: worker.referralCode
      }
    });

  } catch (error) {
    console.error('Worker registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed.'
    });
  }
};

/**
 * Login worker with OTP (only if approved)
 */
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { phone, otp } = req.body;

    // Verify OTP (checks Redis first, falls back to MongoDB)
    const verification = await verifyOTP(phone, otp);
    if (!verification.success) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // Find worker
    const worker = await Worker.findOne({ phone });
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found. Please sign up first.'
      });
    }

    // Check approval status
    if (worker.approvalStatus === WORKER_STATUS.PENDING) {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval. Please wait for approval.'
      });
    }

    if (worker.approvalStatus === WORKER_STATUS.REJECTED) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been rejected. Please contact support.'
      });
    }

    if (worker.approvalStatus === WORKER_STATUS.SUSPENDED) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    if (!worker.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // SINGLE DEVICE LOGIN: Update Session ID & Clear OLD FCM tokens
    const loginSessionId = Date.now().toString();
    await Worker.findByIdAndUpdate(worker._id, { 
      loginSessionId,
      $set: { fcmTokens: [], fcmTokenMobile: [] } // Clear all old tokens to prevent ghost notifications
    });

    // Generate JWT tokens
    const tokens = generateTokenPair({
      userId: worker._id,
      role: USER_ROLES.WORKER,
      loginSessionId
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        businessName: worker.businessName,
        service: worker.service
      },
      ...tokens
    });
  } catch (error) {
    console.error('Worker login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

/**
 * Logout worker
 */
const logout = async (req, res) => {
  try {
    const { platform = 'web' } = req.body;

    // Clear FCM tokens based on platform and reset Session ID
    if (req.user && req.user.id) {
      const updateQuery = platform === 'mobile'
        ? { $set: { fcmTokenMobile: [], loginSessionId: null } }
        : { $set: { fcmTokens: [], loginSessionId: null } };

      await Worker.findByIdAndUpdate(req.user.id, updateQuery);
      console.log(`[AUTH] ✅ ${platform} session & tokens cleared for worker: ${req.user.id}`);
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

/**
 * Refresh Access Token
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    // Check if worker exists
    const worker = await Worker.findById(decoded.userId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Check status
    if (worker.approvalStatus !== WORKER_STATUS.APPROVED || !worker.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is not approved or is inactive'
      });
    }

    // Verify Session ID for Worker
    if (decoded.loginSessionId !== worker.loginSessionId) {
      return res.status(401).json({
        success: false,
        message: 'Account logged in on a new device. Please login again.'
      });
    }

    // Generate new token pair with same session ID
    const tokens = generateTokenPair({
      userId: worker._id,
      role: USER_ROLES.WORKER,
      loginSessionId: worker.loginSessionId
    });

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      ...tokens
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
};

module.exports = {
  sendOTP,
  verifyLogin,
  register,
  login,
  logout,
  refreshToken
};
