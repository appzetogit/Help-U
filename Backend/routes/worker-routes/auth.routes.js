const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  sendOTP,
  register,
  login,
  logout,
  verifyLogin
} = require('../../controllers/workerControllers/workerAuthController');
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const { requireFlag } = require('../../middleware/featureGuard');

// Validation rules
const sendOTPValidation = [
  body('phone').customSanitizer(val => String(val || '').trim().replace(/\D/g, '').slice(-10)).notEmpty().withMessage('Phone number is required').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Please provide a valid email')
];

const verifyLoginValidation = [
  body('phone').customSanitizer(val => String(val || '').trim().replace(/\D/g, '').slice(-10)).notEmpty().withMessage('Phone number is required').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('otp').customSanitizer(val => String(val || '').trim()).isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
];

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('phone').customSanitizer(val => String(val || '').trim().replace(/\D/g, '').slice(-10)).notEmpty().withMessage('Phone number is required').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('aadhar').trim().notEmpty().withMessage('Aadhar number is required').isLength({ min: 12, max: 12 }).withMessage('Aadhar number must be 12 digits'),
  body('pan').trim().notEmpty().withMessage('PAN number is required').isLength({ min: 10, max: 10 }).withMessage('PAN number must be 10 characters')
  // service and otp/token relaxed
];

const loginValidation = [
  body('phone').customSanitizer(val => String(val || '').trim().replace(/\D/g, '').slice(-10)).notEmpty().withMessage('Phone number is required').isLength({ min: 10, max: 10 }).withMessage('Phone number must be 10 digits'),
  body('otp').customSanitizer(val => String(val || '').trim()).isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('token').trim().notEmpty().withMessage('Verification token is required')
];

// Routes
router.post('/send-otp', sendOTPValidation, sendOTP);
router.post('/verify-login', verifyLoginValidation, verifyLogin); // New Unified Entry
router.post(
  '/register',
  requireFlag('isVendorRegistrationEnabled', 'New partner registrations are currently closed. Please try again later.'),
  registerValidation,
  register
);
router.post('/login', loginValidation, login);
router.post('/refresh-token', require('../../controllers/workerControllers/workerAuthController').refreshToken);
router.post('/logout', authenticate, isWorker, logout);

module.exports = router;

