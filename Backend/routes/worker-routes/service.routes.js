const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const {
  getWorkerServices,
  updateServiceAvailability,
  setServicePricing
} = require('../../controllers/workerControllers/workerServiceController');

// Validation rules
const updateAvailabilityValidation = [
  body('isAvailable').isBoolean().withMessage('isAvailable must be a boolean')
];

const setPricingValidation = [
  body('basePrice').optional().isFloat({ min: 0 }).withMessage('Base price must be a positive number'),
  body('discountPrice').optional().isFloat({ min: 0 }).withMessage('Discount price must be a positive number')
];

// Routes
router.get('/services', authenticate, isWorker, getWorkerServices);
router.put('/services/:serviceId/availability', authenticate, isWorker, updateAvailabilityValidation, updateServiceAvailability);
router.put('/services/:serviceId/pricing', authenticate, isWorker, setPricingValidation, setServicePricing);

module.exports = router;


