const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requirePermission } = require('../../middleware/roleMiddleware');
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
  toggleWorkerScrapOptIn,
  deleteWorker
} = require('../../controllers/adminControllers/adminWorkerController');
const { exportWorkers } = require('../../controllers/adminControllers/dataExportController');
const exportRateLimiter = require('../../middleware/exportRateLimiter');

// Validation rules
const rejectWorkerValidation = [
  body('reason').optional().trim()
];

// Routes
router.get('/workers', authenticate, isAdmin, requirePermission('workers'), getAllWorkers);
// Bulk data export: needs 'workers' AND the separate 'data-export' permission (only the super admin has it by default)
router.get('/workers/export', authenticate, isAdmin, requirePermission('workers'), requirePermission('data-export'), exportRateLimiter, exportWorkers);
router.get('/workers/bookings', authenticate, isAdmin, requirePermission('workers'), getAllWorkerBookings);
router.get('/workers/payments', authenticate, isAdmin, requirePermission('workers'), getWorkerPaymentsSummary);
router.get('/workers/:id', authenticate, isAdmin, requirePermission('workers'), getWorkerDetails);
router.post('/workers/:id/approve', authenticate, isAdmin, requirePermission('workers'), approveWorker);
router.post('/workers/:id/reject', authenticate, isAdmin, requirePermission('workers'), rejectWorkerValidation, rejectWorker);
router.post('/workers/:id/suspend', authenticate, isAdmin, requirePermission('workers'), suspendWorker);
router.patch('/workers/:id/status', authenticate, isAdmin, requirePermission('workers'), toggleWorkerStatus); // New
router.patch('/workers/:id/scrap-opt-in', authenticate, isAdmin, requirePermission('workers'), toggleWorkerScrapOptIn);
router.delete('/workers/:id', authenticate, isAdmin, requirePermission('workers'), deleteWorker); // New
router.get('/workers/:id/bookings', authenticate, isAdmin, requirePermission('workers'), getWorkerBookings);
router.get('/workers/:id/earnings', authenticate, isAdmin, requirePermission('workers'), getWorkerEarnings);

module.exports = router;

