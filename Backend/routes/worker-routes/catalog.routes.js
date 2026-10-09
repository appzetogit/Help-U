const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');
const WorkerServiceCatalog = require('../../models/WorkerServiceCatalog');
const WorkerPartsCatalog = require('../../models/WorkerPartsCatalog');

/**
 * Get all worker services for catalog
 * GET /api/workers/catalog/services
 */
router.get('/services', authenticate, isWorker, async (req, res) => {
  try {
    const services = await WorkerServiceCatalog.find({ status: 'active' }).populate('categoryId', 'title').sort({ name: 1 });
    res.status(200).json({ success: true, services });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch services catalog' });
  }
});

/**
 * Get all worker parts for catalog
 * GET /api/workers/catalog/parts
 */
router.get('/parts', authenticate, isWorker, async (req, res) => {
  try {
    const parts = await WorkerPartsCatalog.find({ status: 'active' })
      .populate('categoryId', 'title')
      .sort({ name: 1 });
    res.status(200).json({ success: true, parts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch parts catalog' });
  }
});

module.exports = router;
