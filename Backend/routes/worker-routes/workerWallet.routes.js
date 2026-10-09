const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const {
  getWallet,
  getTransactions,
  recordCashCollection,
  requestSettlement,
  createSettlementOrder,
  verifySettlementPayment,
  getSettlements,
  getWalletSummary,
  requestWithdrawal,
  getWithdrawals
} = require('../../controllers/workerControllers/workerWalletController');

// Validation rules
const cashCollectionValidation = [
  body('bookingId').notEmpty().withMessage('Booking ID is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount is required')
];

const settlementValidation = [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount is required'),
  body('paymentMethod').optional().isIn(['upi', 'bank_transfer', 'cash', 'other'])
];

// Routes
// Get wallet with ledger balance
router.get('/wallet', authenticate, isWorker, getWallet);

// Get wallet summary for dashboard
router.get('/wallet/summary', authenticate, isWorker, getWalletSummary);

// Get transaction history/ledger
router.get('/wallet/transactions', authenticate, isWorker, getTransactions);

// Record cash collection (creates negative entry - worker owes admin)
router.post('/wallet/cash-collection', authenticate, isWorker, cashCollectionValidation, recordCashCollection);

// Request settlement (worker pays admin)
router.post('/wallet/settlement', authenticate, isWorker, settlementValidation, requestSettlement);
router.post('/wallet/settlement/create-order', authenticate, isWorker, settlementValidation, createSettlementOrder);
router.post('/wallet/settlement/verify', authenticate, isWorker, [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount is required'),
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order id is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment id is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('notes').optional().trim()
], verifySettlementPayment);

// Get settlement history
router.get('/wallet/settlements', authenticate, isWorker, getSettlements);

// Request withdrawal (worker withdraws earnings)
router.post('/withdraw', authenticate, isWorker, [
  body('amount').isFloat({ min: 1 }).withMessage('Valid amount is required'),
  body('bankDetails').optional().isObject()
], requestWithdrawal);

// Get withdrawal history
router.get('/wallet/withdrawals', authenticate, isWorker, getWithdrawals);

module.exports = router;
