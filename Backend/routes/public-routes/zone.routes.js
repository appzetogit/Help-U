const express = require('express');
const router = express.Router();
const { findZoneByPoint, getPublicOutOfZonePage } = require('../../controllers/adminControllers/zoneController');

/**
 * @route   GET /api/public/zones/lookup
 * @desc    Public point-in-polygon lookup for customer location
 * @access  Public
 */
router.get('/lookup', findZoneByPoint);

/**
 * @route   GET /api/public/zones/out-of-zone-page
 * @desc    Admin-edited content of the "outside our service area" page
 * @access  Public
 */
router.get('/out-of-zone-page', getPublicOutOfZonePage);

module.exports = router;
