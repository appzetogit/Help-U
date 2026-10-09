const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const { getWallet, getTransactions, getWalletSummary } = require('../../controllers/workerControllers/workerWalletController');

// Legacy Routes (keeping backward compatibility)
router.get('/wallet', authenticate, isWorker, getWallet);
router.get('/transactions', authenticate, isWorker, getTransactions);
router.get('/summary', authenticate, isWorker, getWalletSummary);

module.exports = router;
