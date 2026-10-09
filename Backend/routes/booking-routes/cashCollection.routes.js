const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const {
  initiateCashCollection,
  initiateOnlineCollection,
  verifyOnlinePayment,
  confirmManualOnlinePayment,
  confirmCashCollection,
  customerConfirmPayment,
  getCashCollectionStatus
} = require('../../controllers/bookingControllers/cashCollectionController');

// All routes require authentication
router.use(authenticate);

// Worker routes
router.post('/:id/initiate', initiateCashCollection);
router.post('/:id/initiate-online', initiateOnlineCollection);
router.post('/:id/confirm', confirmCashCollection);

// Explicit verification route
router.post('/:id/verify-online', verifyOnlinePayment);
router.post('/:id/confirm-manual-online', confirmManualOnlinePayment);

// Customer route
router.post('/:id/customer-confirm', customerConfirmPayment);

// Status route (read-only check)
router.get('/:id/status', getCashCollectionStatus);

module.exports = router;
