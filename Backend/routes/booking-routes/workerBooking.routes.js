const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isWorker } = require('../../middleware/roleMiddleware');

// Placeholder routes - to be implemented
router.get('/', authenticate, isWorker, (req, res) => {
  res.json({ success: true, message: 'Worker booking route' });
});

module.exports = router;

