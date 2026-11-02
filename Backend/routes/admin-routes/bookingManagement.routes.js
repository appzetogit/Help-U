const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requirePermission } = require('../../middleware/roleMiddleware');
const {
  getUnassignedBookings,
  getAssignableWorkers,
  assignBooking,
  getAllBookings,
  getBookingById,
  cancelBooking,
  getBookingAnalytics
} = require('../../controllers/bookingControllers/adminBookingController');

// Validation rules
const cancelBookingValidation = [
  body('cancellationReason').optional().trim()
];

// Scoped to '/bookings' — see cityManagement.routes.js for why a bare
// router.use(middleware) is unsafe when this router shares the '/api/admin'
// mount point with many other route files.
router.use('/bookings', authenticate, isAdmin, requirePermission('bookings'));

// Routes
router.get('/bookings', getAllBookings);
router.get('/bookings/analytics', getBookingAnalytics);
router.get('/bookings/unassigned', getUnassignedBookings);
router.get('/bookings/:id', getBookingById);
router.get('/bookings/:id/assignable-workers', getAssignableWorkers);
router.post('/bookings/:id/assign', assignBooking);
router.post('/bookings/:id/cancel', cancelBookingValidation, cancelBooking);

module.exports = router;

