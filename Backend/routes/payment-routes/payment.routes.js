const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { requireFlag } = require('../../middleware/featureGuard');
const { isUser } = require('../../middleware/roleMiddleware');
const {
  createPaymentOrder,
  verifyPaymentWebhook,
  processWalletPayment,
  processRefund,
  getPaymentHistory,
  confirmPayAtHome,
  handleRazorpayWebhook
} = require('../../controllers/paymentControllers/paymentController');

// Validation rules
const createOrderValidation = [
  body('bookingId').isMongoId().withMessage('Valid booking ID is required'),
  body('paymentType').optional().isIn(['advance', 'final']).withMessage('Payment type must be advance or final')
];

const verifyPaymentValidation = [
  body('razorpay_order_id').trim().notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').trim().notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').trim().notEmpty().withMessage('Signature is required')
];

const walletPaymentValidation = [
  body('bookingId').isMongoId().withMessage('Valid booking ID is required'),
  body('paymentType').optional().isIn(['advance', 'final']).withMessage('Payment type must be advance or final')
];

const refundValidation = [
  body('bookingId').isMongoId().withMessage('Valid booking ID is required'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number')
];

// Routes
// Starting a new online or wallet payment honours the admin switches. /verify is deliberately
// not guarded: it confirms a payment the customer has already made.
router.post('/create-order', authenticate, isUser, requireFlag('isOnlinePaymentEnabled', 'Online payment is currently unavailable.'), createOrderValidation, createPaymentOrder);
router.post('/verify', authenticate, isUser, verifyPaymentValidation, verifyPaymentWebhook);
router.post('/webhook', handleRazorpayWebhook); // Server-to-server webhook from Razorpay (no user auth)
router.post('/wallet', authenticate, isUser, requireFlag('isWalletPaymentEnabled', 'Wallet payment is currently unavailable.'), walletPaymentValidation, processWalletPayment);
router.post('/refund', authenticate, refundValidation, processRefund);
router.post('/pay-at-home', authenticate, isUser, walletPaymentValidation, confirmPayAtHome);
router.get('/history', authenticate, isUser, getPaymentHistory);

module.exports = router;

