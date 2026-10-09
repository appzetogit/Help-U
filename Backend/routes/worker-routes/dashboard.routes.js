const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const {
  getDashboardStats,
  getRevenueAnalytics,
  getServicePerformance
} = require('../../controllers/workerControllers/workerDashboardController');

// Routes
router.get('/dashboard/stats', authenticate, isWorker, getDashboardStats);
router.get('/dashboard/revenue', authenticate, isWorker, getRevenueAnalytics);
router.get('/dashboard/services', authenticate, isWorker, getServicePerformance);

module.exports = router;


