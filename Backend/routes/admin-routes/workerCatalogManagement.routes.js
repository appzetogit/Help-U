const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { isAdmin } = require('../../middleware/roleMiddleware');
const {
  getAllWorkerServices,
  createWorkerService,
  updateWorkerService,
  deleteWorkerService,
  getAllWorkerParts,
  createWorkerPart,
  updateWorkerPart,
  deleteWorkerPart
} = require('../../controllers/adminControllers/workerCatalogController');

// Worker Service Routes
router.get('/worker-services', authenticate, isAdmin, getAllWorkerServices);
router.post('/worker-services', authenticate, isAdmin, createWorkerService);
router.put('/worker-services/:id', authenticate, isAdmin, updateWorkerService);
router.delete('/worker-services/:id', authenticate, isAdmin, deleteWorkerService);

// Worker Part Routes
router.get('/worker-parts', authenticate, isAdmin, getAllWorkerParts);
router.post('/worker-parts', authenticate, isAdmin, createWorkerPart);
router.put('/worker-parts/:id', authenticate, isAdmin, updateWorkerPart);
router.delete('/worker-parts/:id', authenticate, isAdmin, deleteWorkerPart);

module.exports = router;
