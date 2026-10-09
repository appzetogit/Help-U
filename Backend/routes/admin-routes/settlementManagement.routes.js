const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getWorkerBalances,
  getWorkerLedger,
  getPendingSettlements,
  approveSettlement,
  rejectSettlement,
  getSettlementHistory,
  getSettlementDashboard,
  blockWorker,
  unblockWorker,
  updateCashLimit,
  // Withdrawals
  getWithdrawalRequests,
  approveWithdrawal,
  rejectWithdrawal
} = require('../../controllers/adminControllers/settlementController');

// Dashboard summary
router.get('/dashboard', authenticate, isAdmin, getSettlementDashboard);

// Get all workers with balances
router.get('/workers', authenticate, isAdmin, getWorkerBalances);

// Get specific worker's ledger
router.get('/workers/:vendorId/ledger', authenticate, isAdmin, getWorkerLedger);

// Worker management (blocking and limits)
router.post('/workers/:vendorId/block', authenticate, isAdmin, blockWorker);
router.post('/workers/:vendorId/unblock', authenticate, isAdmin, unblockWorker);
router.post('/workers/:vendorId/cash-limit', authenticate, isAdmin, updateCashLimit);

// Get all pending settlements
router.get('/pending', authenticate, isAdmin, getPendingSettlements);

// Get settlement history
router.get('/history', authenticate, isAdmin, getSettlementHistory);

// Approve settlement
router.post(
  '/:settlementId/approve',
  authenticate,
  isAdmin,
  [body('adminNotes').optional().isString()],
  approveSettlement
);

// Reject settlement
router.post(
  '/:settlementId/reject',
  authenticate,
  isAdmin,
  [body('rejectionReason').notEmpty().withMessage('Rejection reason is required')],
  rejectSettlement
);

// Withdrawals
router.get('/withdrawals', authenticate, isAdmin, getWithdrawalRequests);
router.post('/withdrawals/:withdrawalId/approve', authenticate, isAdmin, approveWithdrawal);
router.post('/withdrawals/:withdrawalId/reject', authenticate, isAdmin, rejectWithdrawal);

module.exports = router;
