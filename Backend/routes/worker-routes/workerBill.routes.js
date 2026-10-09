const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const {
  createOrUpdateBill,
  getBillByBookingId
} = require('../../controllers/workerControllers/workerBillController');

// Bill Routes
router.post('/bookings/:bookingId/bill', authenticate, isWorker, createOrUpdateBill);
router.get('/bookings/:bookingId/bill', authenticate, isWorker, getBillByBookingId);

module.exports = router;
