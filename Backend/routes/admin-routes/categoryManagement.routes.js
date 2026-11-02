const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin, requirePermission } = require('../../middleware/roleMiddleware');
const {
  getAllCategories,
  getCategoryChildren,
  getCategoryById,
  checkSlugAvailability,
  getCategoryDependencies,
  getCategoryWorkers,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategoryOrder,
  bulkReorderCategories,
  bulkCategoryStatus,
  archiveCategory,
  restoreCategory
} = require('../../controllers/adminControllers/categoryController');

// Validation rules
const createCategoryValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Category title is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Title must be between 2 and 100 characters'),
  body('slug')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),
  body('parentId')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('parentId must be a valid Mongo id'),
  body('hasBrands')
    .optional()
    .isBoolean()
    .withMessage('hasBrands must be boolean'),
  body('homeOrder')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Home order must be a non-negative integer'),
  body('etaDefaultMinutes')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('etaDefaultMinutes must be a non-negative integer'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'deleted'])
    .withMessage('Status must be active, inactive, or deleted')
];

const updateCategoryValidation = [
  body('title').optional().trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('slug').optional().trim().toLowerCase().matches(/^[a-z0-9-]+$/),
  body('parentId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  body('hasBrands').optional().isBoolean(),
  body('homeOrder').optional().isInt({ min: 0 }),
  body('etaDefaultMinutes').optional({ nullable: true }).isInt({ min: 0 }),
  body('status').optional().isIn(['active', 'inactive', 'deleted'])
];

// Reorder validation (used by bulkReorderCategories).
const reorderValidation = [
  body('items').isArray({ min: 1 }).withMessage('items[] is required'),
  body('items.*.id').isMongoId().withMessage('Each item.id must be a valid Mongo id'),
  body('items.*.homeOrder').isInt({ min: 0 }).withMessage('Each item.homeOrder must be a non-negative integer')
];

const bulkStatusValidation = [
  body('ids').isArray({ min: 1 }).withMessage('ids[] is required'),
  body('ids.*').isMongoId().withMessage('Each id must be a valid Mongo id'),
  body('status').isIn(['active', 'inactive', 'deleted']).withMessage('status must be active, inactive or deleted')
];

// Static / collection routes (register BEFORE :id routes so '/slug-available',
// '/reorder', '/bulk-status' don't collide with /categories/:id).
router.get('/categories/slug-available', authenticate, isAdmin, requirePermission('categories'), checkSlugAvailability);
router.patch('/categories/reorder', authenticate, isAdmin, requirePermission('categories'), reorderValidation, bulkReorderCategories);
router.patch('/categories/bulk-status', authenticate, isAdmin, requirePermission('categories'), bulkStatusValidation, bulkCategoryStatus);

// Standard CRUD + per-id helpers
router.get('/categories', authenticate, isAdmin, requirePermission('categories'), getAllCategories);
router.get('/categories/:id', authenticate, isAdmin, requirePermission('categories'), getCategoryById);
router.get('/categories/:id/children', authenticate, isAdmin, requirePermission('categories'), getCategoryChildren);
router.get('/categories/:id/workers', authenticate, isAdmin, requirePermission('categories'), getCategoryWorkers);
router.get('/categories/:id/dependencies', authenticate, isAdmin, requirePermission('categories'), getCategoryDependencies);
router.post('/categories', authenticate, isAdmin, requirePermission('categories'), createCategoryValidation, createCategory);
router.put('/categories/:id', authenticate, isAdmin, requirePermission('categories'), updateCategoryValidation, updateCategory);
router.delete('/categories/:id', authenticate, isAdmin, requirePermission('categories'), deleteCategory);
router.post('/categories/:id/archive', authenticate, isAdmin, requirePermission('categories'), archiveCategory);
router.post('/categories/:id/restore', authenticate, isAdmin, requirePermission('categories'), restoreCategory);
router.patch('/categories/:id/order', authenticate, isAdmin, requirePermission('categories'), updateCategoryOrder);

module.exports = router;
