const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const { getProfile, updateProfile, updateAddress, updateLocation, updateStatus } = require('../../controllers/workerControllers/workerProfileController');

// Validation rules
const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  body('businessName').optional().trim().isLength({ max: 100 }).withMessage('Business name must be less than 100 characters')
];

const updateAddressValidation = [
  body('fullAddress').notEmpty().trim().withMessage('Full address is required'),
  body('lat').notEmpty().isFloat().withMessage('Valid latitude is required'),
  body('lng').notEmpty().isFloat().withMessage('Valid longitude is required')
];

// Routes
router.get('/profile', authenticate, isWorker, getProfile);
router.put('/profile', authenticate, isWorker, updateProfileValidation, updateProfile);
router.put('/address', authenticate, isWorker, updateAddressValidation, updateAddress);
router.put('/profile/location', authenticate, isWorker, updateLocation);
router.put('/status', authenticate, isWorker, updateStatus);

module.exports = router;


