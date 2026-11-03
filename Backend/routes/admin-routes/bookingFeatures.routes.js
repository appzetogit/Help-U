/**
 * Admin routes for the booking feature set: booking configuration, add-ons,
 * commission rules, recurring plans and booking chat.
 * Mounted at /api/admin.
 */
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requirePermission } = require('../../middleware/roleMiddleware');
const { getConfig, updateConfig } = require('../../controllers/adminControllers/bookingConfigController');
const { listAddOns, createAddOn, updateAddOn, deleteAddOn } = require('../../controllers/addOnController');
const {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  previewCommission,
  updateDefault
} = require('../../controllers/adminControllers/commissionController');
const { adminListPlans, adminUpdatePlan } = require('../../controllers/recurringBookingController');
const { getChatForAdmin } = require('../../controllers/chatController');

router.use(authenticate, isAdmin);

router.get('/booking-config', requirePermission('booking_config'), getConfig);
router.put('/booking-config', requirePermission('booking_config'), updateConfig);

router.get('/addons', requirePermission('services'), listAddOns);
router.post('/addons', requirePermission('services'), createAddOn);
router.put('/addons/:id', requirePermission('services'), updateAddOn);
router.delete('/addons/:id', requirePermission('services'), deleteAddOn);

router.get('/commission-rules/preview', requirePermission('commission'), previewCommission);
router.get('/commission-rules', requirePermission('commission'), listRules);
router.put('/commission-rules/default', requirePermission('commission'), updateDefault);
router.post('/commission-rules', requirePermission('commission'), createRule);
router.put('/commission-rules/:id', requirePermission('commission'), updateRule);
router.delete('/commission-rules/:id', requirePermission('commission'), deleteRule);

router.get('/recurring-bookings', requirePermission('bookings'), adminListPlans);
router.post('/recurring-bookings/:id/pause', requirePermission('bookings'), adminUpdatePlan('pause'));
router.post('/recurring-bookings/:id/resume', requirePermission('bookings'), adminUpdatePlan('resume'));
router.post('/recurring-bookings/:id/cancel', requirePermission('bookings'), adminUpdatePlan('cancel'));

router.get('/bookings/:id/chat', requirePermission('bookings'), getChatForAdmin);

module.exports = router;
