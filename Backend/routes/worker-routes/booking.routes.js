const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const {
  getWorkerBookings,
  getBookingById,
  acceptBooking,
  rejectBooking,
  updateBookingStatus,
  addWorkerNotes,
  startSelfJob,
  workerReachedLocation,
  verifySelfVisit,
  completeSelfJob,
  collectSelfCash,
  requestAdvancePayment,
  getWorkerRatings,
  getPendingBookings
} = require('../../controllers/bookingControllers/workerBookingController');

// Validation rules
const rejectBookingValidation = [
  body('reason').optional().trim()
];

const updateStatusValidation = [
  body('status').isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'])
    .withMessage('Invalid status')
];

const addNotesValidation = [
  body('notes').trim().notEmpty().withMessage('Notes are required')
];

const requestAdvancePaymentValidation = [
  body('amount').isFloat({ min: 1 }).withMessage('Advance amount must be at least 1'),
  body('reason').optional().trim(),
  body('partsDescription').optional().trim()
];

// Routes
router.get('/pending', authenticate, isWorker, getPendingBookings); // Fetch missed alerts on reconnect
router.get('/ratings', authenticate, isWorker, getWorkerRatings);
router.get('/', authenticate, isWorker, getWorkerBookings);
router.get('/:id', authenticate, isWorker, getBookingById);
router.post('/:id/accept', authenticate, isWorker, acceptBooking);
router.post('/:id/reject', authenticate, isWorker, rejectBookingValidation, rejectBooking);
router.put('/:id/status', authenticate, isWorker, updateStatusValidation, updateBookingStatus);
router.post('/:id/notes', authenticate, isWorker, addNotesValidation, addWorkerNotes);

// Self-Job Routes
router.post('/:id/self/start', authenticate, isWorker, startSelfJob);
router.post('/:id/self/reached', authenticate, isWorker, workerReachedLocation);
router.post('/:id/self/visit/verify', authenticate, isWorker, verifySelfVisit);
router.post('/:id/self/complete', authenticate, isWorker, completeSelfJob);
router.post('/:id/self/payment/collect', authenticate, isWorker, collectSelfCash);
router.post('/:id/advance-payment-request', authenticate, isWorker, requestAdvancePaymentValidation, requestAdvancePayment);

module.exports = router;

