import api, { apiCache } from './api';
import { uploadToCloudinary } from '../utils/cloudinaryUpload';

/**
 * Catalog Service
 * Handles all API calls for Categories, Brands (formerly Services), Services (Sub-services), and Home Content
 */

// Stale copy of home data per city, used only for instant display on revisit.
const LAST_HOME_TTL = 5 * 60 * 1000;
// How long the home page reuses a response before asking the server again. Kept short so admin
// changes (prices, sections, banners) reach customers within about half a minute.
const HOME_DATA_TTL_SECONDS = 30;
const lastHomeData = new Map();
const lastHomeTimestamps = new Map();

// Cache invalidation helper: sweeps out public catalog cache so admin writes reflect immediately
export const invalidatePublicCatalog = () => {
  apiCache.invalidatePrefix('public:');
  lastHomeData.clear();
  lastHomeTimestamps.clear();
};

/**
 * Category API calls
 */
export const categoryService = {
  // Get all categories
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.showOnHome !== undefined) queryParams.append('showOnHome', params.showOnHome);
    if (params.isPopular !== undefined) queryParams.append('isPopular', params.isPopular);
    if (params.cityId) queryParams.append('cityId', params.cityId);
    if (params.parentId !== undefined && params.parentId !== null) queryParams.append('parentId', params.parentId);
    if (params.withCounts) queryParams.append('withCounts', 'true');
    if (params.includeDeleted) queryParams.append('includeDeleted', 'true');
    if (params.search) queryParams.append('search', params.search);

    const response = await api.get(`/admin/categories${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get single category by ID
  getById: async (id) => {
    const response = await api.get(`/admin/categories/${id}`);
    return response.data;
  },

  // Get category children (sub-categories)
  // The professionals behind a category's "workers" count
  getWorkers: async (id, cityId) => {
    const response = await api.get(`/admin/categories/${id}/workers`, { params: cityId ? { cityId } : {} });
    return response.data;
  },

  getChildren: async (id) => {
    const response = await api.get(`/admin/categories/${id}/children`);
    return response.data;
  },

  // Get category dependencies
  getDependencies: async (id) => {
    const response = await api.get(`/admin/categories/${id}/dependencies`);
    return response.data;
  },

  // Check category slug availability
  checkSlugAvailable: async ({ slug, parentId, excludeId } = {}) => {
    const params = new URLSearchParams();
    if (slug) params.append('slug', slug);
    if (parentId) params.append('parentId', parentId);
    if (excludeId) params.append('excludeId', excludeId);
    const response = await api.get(`/admin/categories/slug-available?${params.toString()}`);
    return response.data;
  },

  // Create new category
  create: async (data) => {
    const response = await api.post('/admin/categories', data);
    invalidatePublicCatalog();
    return response.data;
  },

  // Update category
  update: async (id, data) => {
    const response = await api.put(`/admin/categories/${id}`, data);
    invalidatePublicCatalog();
    return response.data;
  },

  // Delete category (soft delete, checks dependencies unless force=true)
  delete: async (id, force = false) => {
    const response = await api.delete(`/admin/categories/${id}${force ? '?force=true' : ''}`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Archive category
  archive: async (id, force = false) => {
    const response = await api.post(`/admin/categories/${id}/archive${force ? '?force=true' : ''}`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Restore category
  restore: async (id) => {
    const response = await api.post(`/admin/categories/${id}/restore`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Update category order
  updateOrder: async (id, homeOrder) => {
    const response = await api.patch(`/admin/categories/${id}/order`, { homeOrder });
    invalidatePublicCatalog();
    return response.data;
  },

  // Bulk reorder categories: [{ id, homeOrder }]
  bulkReorder: async (items) => {
    const response = await api.patch('/admin/categories/reorder', { items });
    invalidatePublicCatalog();
    return response.data;
  },

  // Bulk status change for categories
  bulkStatus: async (ids, status) => {
    const response = await api.patch('/admin/categories/bulk-status', { ids, status });
    invalidatePublicCatalog();
    return response.data;
  },

  // Upload category image/icon directly to Cloudinary
  uploadImage: async (file, folder = 'categories', onProgress) => {
    try {
      const url = await uploadToCloudinary(file, folder, onProgress);
      return {
        success: true,
        imageUrl: url,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload file',
        error: error.message
      };
    }
  }
};

/**
 * Brand API calls (Formerly Service)
 */
export const brandService = {
  // Get all brands
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.cityId) queryParams.append('cityId', params.cityId);
    if (params.search) queryParams.append('search', params.search);

    const response = await api.get(`/admin/brands${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get single brand by ID
  getById: async (id) => {
    const response = await api.get(`/admin/brands/${id}`);
    return response.data;
  },

  // Get brand dependencies
  getDependencies: async (id) => {
    const response = await api.get(`/admin/brands/${id}/dependencies`);
    return response.data;
  },

  // Create new brand
  create: async (data) => {
    const response = await api.post('/admin/brands', data);
    invalidatePublicCatalog();
    return response.data;
  },

  // Update brand
  update: async (id, data) => {
    const response = await api.put(`/admin/brands/${id}`, data);
    invalidatePublicCatalog();
    return response.data;
  },

  // Delete brand
  delete: async (id, force = false) => {
    const response = await api.delete(`/admin/brands/${id}${force ? '?force=true' : ''}`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Archive brand
  archive: async (id, force = false) => {
    const response = await api.post(`/admin/brands/${id}/archive${force ? '?force=true' : ''}`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Restore brand
  restore: async (id) => {
    const response = await api.post(`/admin/brands/${id}/restore`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Update brand page content
  updatePage: async (id, page) => {
    const response = await api.patch(`/admin/brands/${id}/page`, { page });
    invalidatePublicCatalog();
    return response.data;
  },

  // Bulk reorder brands: [{ id, displayOrder }]
  bulkReorder: async (items) => {
    const response = await api.patch('/admin/brands/reorder', { items });
    invalidatePublicCatalog();
    return response.data;
  },

  // Bulk status change for brands
  bulkStatus: async (ids, status) => {
    const response = await api.patch('/admin/brands/bulk-status', { ids, status });
    invalidatePublicCatalog();
    return response.data;
  },

  // Upload brand image/video directly to Cloudinary
  uploadImage: async (file, folder = 'brands', onProgress) => {
    try {
      const url = await uploadToCloudinary(file, folder, onProgress);
      return {
        success: true,
        imageUrl: url,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload file',
        error: error.message
      };
    }
  }
};

/**
 * Service API calls (UserService Model - Child of Brand / Category)
 */
export const serviceService = {
  // Get all services
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.brandId) queryParams.append('brandId', params.brandId);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.search) queryParams.append('search', params.search);
    if (params.publishStatus) queryParams.append('publishStatus', params.publishStatus);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/admin/services${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get services enriched with stats (workersMapped + bookingsLast30Days)
  getWithStats: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.brandId) queryParams.append('brandId', params.brandId);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.search) queryParams.append('search', params.search);
    if (params.publishStatus) queryParams.append('publishStatus', params.publishStatus);
    if (params.cityId) queryParams.append('cityId', params.cityId);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/admin/services/with-stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Get single service by ID
  getById: async (id) => {
    const response = await api.get(`/admin/services/${id}`);
    return response.data;
  },

  // Get service dependencies
  getDependencies: async (id) => {
    const response = await api.get(`/admin/services/${id}/dependencies`);
    return response.data;
  },

  // Duplicate service
  duplicate: async (id) => {
    const response = await api.post(`/admin/services/${id}/duplicate`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Create new service
  create: async (data) => {
    const response = await api.post('/admin/services', data);
    invalidatePublicCatalog();
    return response.data;
  },

  // Update service
  update: async (id, data) => {
    const response = await api.put(`/admin/services/${id}`, data);
    invalidatePublicCatalog();
    return response.data;
  },

  // Delete service (force=true hard deletes if no dependencies)
  delete: async (id, force = false) => {
    const response = await api.delete(`/admin/services/${id}${force ? '?force=true' : ''}`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Archive service
  archive: async (id, force = false) => {
    const response = await api.post(`/admin/services/${id}/archive${force ? '?force=true' : ''}`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Restore service
  restore: async (id) => {
    const response = await api.post(`/admin/services/${id}/restore`);
    invalidatePublicCatalog();
    return response.data;
  },

  // Bulk status change for services
  bulkStatus: async (ids, status) => {
    const response = await api.patch('/admin/services/bulk-status', { ids, status });
    invalidatePublicCatalog();
    return response.data;
  },

  // Bulk move services: { ids: [...], brandId, categoryId? }
  bulkMove: async ({ ids, brandId, categoryId }) => {
    const response = await api.patch('/admin/services/bulk-move', { ids, brandId, categoryId });
    invalidatePublicCatalog();
    return response.data;
  },

  // Upload service image directly to Cloudinary
  uploadImage: async (file, folder = 'services', onProgress) => {
    try {
      const url = await uploadToCloudinary(file, folder, onProgress);
      return {
        success: true,
        imageUrl: url,
        message: 'File uploaded successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to upload file',
        error: error.message
      };
    }
  }
};

/**
 * Catalog Health API
 */
export const catalogHealthService = {
  // cityId scopes the cards to one city so they match the list underneath
  getHealth: async (params = {}) => {
    const response = await api.get('/admin/catalog/health', { params: params.cityId ? { cityId: params.cityId } : {} });
    return response.data;
  }
};

/**
 * Audit Log API
 */
export const auditLogService = {
  getLogs: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.entityType) queryParams.append('entityType', params.entityType);
    if (params.entityId) queryParams.append('entityId', params.entityId);
    if (params.adminId) queryParams.append('adminId', params.adminId);
    if (params.from) queryParams.append('from', params.from);
    if (params.to) queryParams.append('to', params.to);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/admin/audit-log${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  }
};

/**
 * Worker Catalog API calls
 */
export const workerCatalogService = {
  // Services
  getAllServices: async () => {
    const response = await api.get('/admin/worker-services');
    return response.data;
  },
  createService: async (data) => {
    const response = await api.post('/admin/worker-services', data);
    return response.data;
  },
  updateService: async (id, data) => {
    const response = await api.put(`/admin/worker-services/${id}`, data);
    return response.data;
  },
  deleteService: async (id) => {
    const response = await api.delete(`/admin/worker-services/${id}`);
    return response.data;
  },

  // Parts
  getAllParts: async () => {
    const response = await api.get('/admin/worker-parts');
    return response.data;
  },
  createPart: async (data) => {
    const response = await api.post('/admin/worker-parts', data);
    return response.data;
  },
  updatePart: async (id, data) => {
    const response = await api.put(`/admin/worker-parts/${id}`, data);
    return response.data;
  },
  deletePart: async (id) => {
    const response = await api.delete(`/admin/worker-parts/${id}`);
    return response.data;
  }
};

/**
 * Home Content API calls
 */
export const homeContentService = {
  // Get home content
  get: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cityId) queryParams.append('cityId', params.cityId);

    const response = await api.get(`/admin/home-content${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Update home content
  update: async (data, params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cityId) queryParams.append('cityId', params.cityId);

    const response = await api.put(`/admin/home-content${queryParams.toString() ? `?${queryParams.toString()}` : ''}`, data);
    return response.data;
  }
};

/**
 * Public Catalog Service (for user app - no authentication required)
 * Now with caching for faster data retrieval
 */
export const publicCatalogService = {
  // Get all active categories (cached for 5 minutes, can bypass or specify parentId)
  getCategories: async (cityIdOrOptions, zoneId) => {
    let cityId = typeof cityIdOrOptions === 'string' ? cityIdOrOptions : cityIdOrOptions?.cityId;
    let zId = typeof cityIdOrOptions === 'object' ? cityIdOrOptions?.zoneId : zoneId;
    let parentId = typeof cityIdOrOptions === 'object' ? cityIdOrOptions?.parentId : undefined;
    let bypassCache = typeof cityIdOrOptions === 'object' ? Boolean(cityIdOrOptions?.bypassCache) : false;

    const cacheKey = `public:categories:${cityId || 'default'}:${zId || 'all'}:${parentId !== undefined ? parentId : 'default'}`;
    if (!bypassCache) {
      const cached = apiCache.get(cacheKey);
      if (cached) return cached;
    }

    const params = new URLSearchParams();
    if (cityId) params.append('cityId', cityId);
    if (zId) params.append('zoneId', zId);
    if (parentId !== undefined) params.append('parentId', parentId);
    const query = params.toString() ? `?${params.toString()}` : '';

    const response = await api.get(`/public/categories${query}`);
    if (response.data.success && !bypassCache) {
      apiCache.set(cacheKey, response.data, 300); // 5 minutes
    }
    return response.data;
  },

  // Get all active brands (formerly services)
  getBrands: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.categorySlug) queryParams.append('categorySlug', params.categorySlug);
    if (params.search) queryParams.append('search', params.search);
    if (params.cityId) queryParams.append('cityId', params.cityId);
    if (params.zoneId) queryParams.append('zoneId', params.zoneId);

    const cacheKey = `public:brands:${queryParams.toString()}`;
    if (!params.bypassCache) {
      const cached = apiCache.get(cacheKey);
      if (cached) return cached;
    }

    const response = await api.get(`/public/brands${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    if (response.data.success && !params.bypassCache) {
      apiCache.set(cacheKey, response.data, 120); // 2 minutes
    }
    return response.data;
  },

  // Alias for backward compatibility if needed, but preferable to use getBrands
  getServices: async (params = {}) => {
    // New Service model endpoint
    const queryParams = new URLSearchParams();
    if (params.brandId) queryParams.append('brandId', params.brandId);
    if (params.brandSlug) queryParams.append('brandSlug', params.brandSlug);
    if (params.categoryId) queryParams.append('categoryId', params.categoryId);
    if (params.zoneId) queryParams.append('zoneId', params.zoneId);

    const cacheKey = `public:services:${queryParams.toString()}`;
    if (!params.bypassCache) {
      const cached = apiCache.get(cacheKey);
      if (cached) return cached;
    }

    const response = await api.get(`/public/services${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    if (response.data.success && !params.bypassCache) {
      apiCache.set(cacheKey, response.data, 120);
    }
    return response.data;
  },

  getCatalog: async (idOrSlug, cityId, zoneId) => {
    const cacheKey = `public:catalog:${idOrSlug}:${cityId || 'all'}:${zoneId || 'all'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (cityId) params.append('cityId', cityId);
    if (zoneId) params.append('zoneId', zoneId);
    const query = params.toString() ? `?${params.toString()}` : '';

    const response = await api.get(`/public/categories/${idOrSlug}/catalog${query}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 120);
    }
    return response.data;
  },

  // Get brand by slug (cached for 1 minute)
  getBrandBySlug: async (slug, cityId) => {
    const cacheKey = `public:brand:${slug}:${cityId || 'default'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const query = cityId ? `?cityId=${cityId}` : '';
    const response = await api.get(`/public/brands/slug/${slug}${query}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 60); // 1 minute
    }
    return response.data;
  },

  // Get home content (cached for 2 minutes)
  getHomeContent: async (cityId, zoneId) => {
    const cacheKey = `public:homeContent:${cityId || 'default'}:${zoneId || 'all'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (cityId) params.append('cityId', cityId);
    if (zoneId) params.append('zoneId', zoneId);
    const query = params.toString() ? `?${params.toString()}` : '';

    const response = await api.get(`/public/home-content${query}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, 120); // 2 minutes
    }
    return response.data;
  },

  // Get consolidated home data (cached for 2 minutes)
  getHomeData: async (cityId, zoneId) => {
    const cacheKey = `public:homeData:${cityId || 'default'}:${zoneId || 'all'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (cityId) params.append('cityId', cityId);
    if (zoneId) params.append('zoneId', zoneId);
    const query = params.toString() ? `?${params.toString()}` : '';

    const response = await api.get(`/public/home-data${query}`);
    if (response.data.success) {
      apiCache.set(cacheKey, response.data, HOME_DATA_TTL_SECONDS);
      lastHomeData.set(cacheKey, response.data);
      lastHomeTimestamps.set(cacheKey, Date.now());
    }
    return response.data;
  },

  // Last successful home data for this city/zone, even if the short cache expired.
  // Lets Home render instantly on revisit while fresh data loads in the background.
  // Expires after 5 minutes so admin-created content appears without a hard refresh.
  peekHomeData: (cityId, zoneId) => {
    const cacheKey = `public:homeData:${cityId || 'default'}:${zoneId || 'all'}`;
    const fromApi = apiCache.get(cacheKey);
    if (fromApi) return fromApi;
    const ts = lastHomeTimestamps.get(cacheKey);
    if (ts && Date.now() - ts > LAST_HOME_TTL) {
      lastHomeData.delete(cacheKey);
      lastHomeTimestamps.delete(cacheKey);
      return null;
    }
    return lastHomeData.get(cacheKey) || null;
  },

  // Per-category arrival-time estimates for a lat/lng, keyed by category id.
  // Short cache so the badge stays fresh while users scroll.
  getCategoriesEta: async ({ lat, lng, cityId } = {}) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { success: true, eta: {} };
    }
    const roundedLat = lat.toFixed(2);
    const roundedLng = lng.toFixed(2);
    const cacheKey = `public:categoriesEta:${roundedLat}:${roundedLng}:${cityId || 'default'}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    if (cityId) params.append('cityId', cityId);
    try {
      const response = await api.get(`/public/categories/eta?${params.toString()}`);
      if (response.data?.success) {
        apiCache.set(cacheKey, response.data, 60);
      }
      return response.data;
    } catch {
      return { success: true, eta: {} };
    }
  },

  // Invalidate all public caches (useful after admin updates)
  invalidateCache: () => {
    apiCache.invalidatePrefix('public:');
  }
};
