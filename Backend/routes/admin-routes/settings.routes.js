const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getSettings,
  updateSettings,
  getCustomizationToggles,
  updateCustomizationToggles
} = require('../../controllers/adminControllers/settingsController');

// All routes are protected and for admin only
router.use(authenticate, isAdmin);

router.route('/settings')
  .get(getSettings)
  .put(updateSettings);

router.route('/customization')
  .get(getCustomizationToggles)
  .put(updateCustomizationToggles);

module.exports = router;
