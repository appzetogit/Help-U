const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requirePermission } = require('../../middleware/roleMiddleware');
const {
  getAllZones,
  getZoneById,
  createZone,
  updateZone,
  deleteZone,
  findZoneByPoint,
  toggleZoneStatus,
  getAdminOutOfZonePage,
  updateOutOfZonePage
} = require('../../controllers/adminControllers/zoneController');

const createZoneValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Zone name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be between 2 and 200 characters'),
  body('cityId')
    .notEmpty()
    .isMongoId()
    .withMessage('Valid cityId is required'),
  body('coordinates')
    .isArray({ min: 1 })
    .withMessage('Coordinates array is required with at least one ring'),
  body('coordinates.0')
    .isArray({ min: 4 })
    .withMessage('Polygon ring must have at least 4 points (3 vertices + closing point)'),
  body('allowedCategories')
    .optional()
    .isArray()
    .withMessage('allowedCategories must be an array'),
  body('allowedCategories.*')
    .optional()
    .isMongoId()
    .withMessage('Each allowedCategory must be a valid Mongo id'),
  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive')
];

const updateZoneValidation = [
  body('name').optional().trim().notEmpty().isLength({ min: 2, max: 200 }),
  body('cityId').optional().isMongoId(),
  body('coordinates').optional().isArray({ min: 1 }),
  body('allowedCategories').optional().isArray(),
  body('allowedCategories.*').optional().isMongoId(),
  body('status').optional().isIn(['active', 'inactive'])
];

// Point-in-polygon lookup helper (register before :id routes)
router.get('/zones/lookup', findZoneByPoint);

// Out-of-zone page content (before the :id routes)
router.get('/zones/out-of-zone-page', authenticate, isAdmin, getAdminOutOfZonePage);
router.put('/zones/out-of-zone-page', authenticate, isAdmin, updateOutOfZonePage);

// CRUD
router.get('/zones', authenticate, isAdmin, getAllZones);
router.get('/zones/:id', authenticate, isAdmin, getZoneById);
router.post('/zones', authenticate, isAdmin, createZoneValidation, createZone);
router.put('/zones/:id', authenticate, isAdmin, updateZoneValidation, updateZone);
router.delete('/zones/:id', authenticate, isAdmin, deleteZone);
router.patch('/zones/:id/toggle-status', authenticate, isAdmin, toggleZoneStatus);

module.exports = router;
