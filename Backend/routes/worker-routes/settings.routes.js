const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const { getSettings, updateSettings, updateBusinessHours } = require('../../controllers/workerControllers/workerSettingsController');

// Routes
router.get('/settings', authenticate, isWorker, getSettings);
router.put('/settings', authenticate, isWorker, updateSettings);
router.put('/business-hours', authenticate, isWorker, updateBusinessHours);

module.exports = router;
