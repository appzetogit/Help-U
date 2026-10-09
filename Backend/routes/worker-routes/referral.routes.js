const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const { getWorkerReferralDetails } = require('../../controllers/workerControllers/workerReferralController');

// GET /api/workers/referrals - Get logged in worker's referral dashboard details
router.get('/referrals', authenticate, isWorker, getWorkerReferralDetails);

module.exports = router;
