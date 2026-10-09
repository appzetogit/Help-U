const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAllWorkers,
  getWorkerDetails,
  approveWorker,
  rejectWorker,
  suspendWorker,
  getWorkerBookings,
  getWorkerEarnings,
  getAllWorkerBookings,
  getWorkerPaymentsSummary,
  toggleWorkerStatus,
  deleteWorker
} = require('../../controllers/adminControllers/adminWorkerController');

// Validation rules
const rejectWorkerValidation = [
  body('reason').optional().trim()
];

// Routes
router.get('/workers', authenticate, isAdmin, getAllWorkers);
router.get('/workers/bookings', authenticate, isAdmin, getAllWorkerBookings);
router.get('/workers/payments', authenticate, isAdmin, getWorkerPaymentsSummary);
router.get('/workers/:id', authenticate, isAdmin, getWorkerDetails);
router.post('/workers/:id/approve', authenticate, isAdmin, approveWorker);
router.post('/workers/:id/reject', authenticate, isAdmin, rejectWorkerValidation, rejectWorker);
router.post('/workers/:id/suspend', authenticate, isAdmin, suspendWorker);
router.patch('/workers/:id/status', authenticate, isAdmin, toggleWorkerStatus); // New
router.delete('/workers/:id', authenticate, isAdmin, deleteWorker); // New
router.get('/workers/:id/bookings', authenticate, isAdmin, getWorkerBookings);
router.get('/workers/:id/earnings', authenticate, isAdmin, getWorkerEarnings);

module.exports = router;

