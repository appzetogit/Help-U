const express = require('express');
const router = express.Router();
const {
  getWorkerSkillTree,
  getPublicCategories,
  getPublicBrands,
  getPublicBrandBySlug,
  getPublicServices,
  advancedCatalogSearch,
  getPublicHomeContent,
  getPublicHomeData,
  getCategoriesEta,
  getPublicCategoryCatalog
} = require('../../controllers/publicControllers/catalogController');

// Public routes - no authentication required
router.get('/categories', getPublicCategories);
router.get('/worker-skill-tree', getWorkerSkillTree);
router.get('/categories/eta', getCategoriesEta);
router.get('/categories/:idOrSlug/catalog', getPublicCategoryCatalog);
router.get('/brands', getPublicBrands); // Formerly services
router.get('/brands/slug/:slug', getPublicBrandBySlug);
router.get('/services', getPublicServices); // New services
router.get('/search/advanced', advancedCatalogSearch);
router.get('/home-content', getPublicHomeContent);
router.get('/home-data', getPublicHomeData);

module.exports = router;
