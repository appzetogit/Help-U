const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAllReferrals,
  approveAndRewardReferral,
  rejectReferral,
  updateReferralSettings
} = require('../../controllers/adminControllers/adminReferralController');

// All Admin referral routes require admin auth
router.use(authenticate, isAdmin);

// GET /api/admin/referrals - Get all worker referrals & stats
router.get('/referrals', getAllReferrals);

// PUT /api/admin/referrals/:id/approve - Approve and credit reward to referrer wallet
router.put('/referrals/:id/approve', approveAndRewardReferral);

// PUT /api/admin/referrals/:id/reject - Reject referral
router.put('/referrals/:id/reject', rejectReferral);

// PUT /api/admin/referrals/settings - Update referral program configuration
router.put('/referrals/settings', updateReferralSettings);

module.exports = router;
