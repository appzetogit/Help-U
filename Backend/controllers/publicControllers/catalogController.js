const Category = require('../../models/Category');
const Brand = require('../../models/Brand');
const Service = require('../../models/UserService');
const Coupon = require('../../models/Coupon');
const { getDisplayPricing } = require('../../utils/servicePricing');
const HomeContent = require('../../models/HomeContent');
const Settings = require('../../models/Settings');
const Zone = require('../../models/Zone');
const mongoose = require('mongoose');
const { getRedis, isRedisConnected } = require('../../services/redisService');
const { getServiceRatings, combineRatings, toDisplayRating } = require('../../services/serviceRatingService');
const { resolveFieldsForCategories } = require('../../utils/detailFields');
const { expandZoneCategories } = require('../../utils/zoneCategories');
const { cityScopeQuery, categoryCityFilter } = require('../../utils/cityScope');
const { zonesInUse } = require('../../utils/dispatchMode');
const { resolveLocation, locationProblem } = require('../../services/couponService');

/**
 * Helper to resolve zone from query (zoneId, lat, lng, cityId)
 */
const resolveZone = async ({ zoneId, lat, lng, cityId }) => {
  // Distance mode: zones are not used, so nothing is scoped to one
  if (!(await zonesInUse())) return null;
  if (zoneId && mongoose.Types.ObjectId.isValid(zoneId)) {
    try {
      return await Zone.findById(zoneId).lean();
    } catch (e) {
      // ignore
    }
  }
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
    try {
      return await Zone.findZoneByCoordinates(parsedLng, parsedLat, cityId || null);
    } catch (e) {
      // ignore
    }
  }
  return null;
};

/**
 * Helper to check if an item with zoneId / zones matches the active zone
 */
const matchesZone = (item, activeZoneId) => {
  if (!activeZoneId) return true;
  const hasSpecificZone = Boolean(item.zoneId) || (Array.isArray(item.zones) && item.zones.length > 0);
  if (!hasSpecificZone) return true; // Global item
  if (item.zoneId && String(item.zoneId._id || item.zoneId) === String(activeZoneId)) return true;
  if (Array.isArray(item.zones) && item.zones.some(z => String(z._id || z) === String(activeZoneId))) return true;
  return false;
};

/**
 * Public Catalog Controllers
 * These endpoints are accessible without authentication for user app
 */

/**
 * Get all active categories for user app
 * GET /api/public/categories
 */
const getPublicCategories = async (req, res) => {
  try {
    const { cityId, parentId, zoneId, lat, lng } = req.query;

    // Build query
    const query = { status: 'active', publishStatus: { $ne: 'draft' } };
    // A sub-category follows its parent's cities (see utils/cityScope.js)
    const cityFilter = await categoryCityFilter(cityId);
    if (cityFilter) query.$and = [cityFilter];

    // Default: top-level categories only (parentId: null). Sub-categories
    // never leak into the Home grid or /public/categories listing. Clients
    // explicitly fetch children with ?parentId=<id>; pass ?parentId=all to
    // skip the filter altogether.
    if (parentId === undefined || parentId === null || parentId === '') {
      query.parentId = null;
    } else if (parentId !== 'all') {
      query.parentId = parentId;
    }

    // Zone category restriction
    const matchedZone = await resolveZone({ zoneId, lat, lng, cityId });
    const zoneCategorySet = matchedZone ? await expandZoneCategories(matchedZone.allowedCategories) : null;
    if (zoneCategorySet) {
      query._id = { $in: [...zoneCategorySet] };
    }

    const categories = await Category.find(query)
      .select('title slug homeIconUrl homeBadge hasSaleBadge homeOrder showOnHome parentId subCategoryBadge etaDefaultMinutes displayRating bookingsLabel heroBanner')
      .sort({ homeOrder: 1, createdAt: -1 })
      .lean();

    // Fetch necessary fields for initial category list. parentId, subCategoryBadge,
    // etaDefaultMinutes, displayRating, and heroBanner are included so client reflects admin values.
    const initialCategories = categories.map(cat => ({
      id: cat._id.toString(),
      _id: cat._id.toString(),
      title: cat.title,
      slug: cat.slug,
      icon: cat.homeIconUrl || '',
      homeIconUrl: cat.homeIconUrl || '',
      badge: cat.homeBadge || '',
      homeBadge: cat.homeBadge || '',
      hasSaleBadge: cat.hasSaleBadge || false,
      showOnHome: cat.showOnHome !== false,
      parentId: cat.parentId ? cat.parentId.toString() : null,
      subCategoryBadge: cat.subCategoryBadge || '',
      etaDefaultMinutes: cat.etaDefaultMinutes ?? null,
      displayRating: cat.displayRating || '',
      bookingsLabel: cat.bookingsLabel || '',
      heroBanner: cat.heroBanner || null,
      homeOrder: cat.homeOrder || 0
    }));

    res.status(200).json({
      success: true,
      categories: initialCategories
    });
  } catch (error) {
    console.error('Get public categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories. Please try again.'
    });
  }
};

/**
 * Get all active brands for user app (Formerly Services)
 * GET /api/public/brands
 */
const getPublicBrands = async (req, res) => {
  try {
    const { categoryId, categorySlug, search, cityId } = req.query;

    // Build query
    const query = { status: 'active', publishStatus: { $ne: 'draft' } };
    if (categoryId) query.categoryIds = categoryId;
    if (cityId) {
      query.$or = [
        { cityIds: cityId },
        { cityIds: { $size: 0 } },
        { cityIds: { $exists: false } }
      ];
    }

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: escapedSearch, $options: 'i' };
    }

    let brands = await Brand.find(query)
      .select('title slug iconUrl logo imageUrl badge categoryIds basePrice discountPrice sections')
      .sort({ createdAt: -1 })
      .lean();

    // If categorySlug is provided, filter by category
    if (categorySlug) {
      const catQuery = { slug: categorySlug, status: 'active', publishStatus: { $ne: 'draft' } };
      if (cityId) {
        catQuery.cityIds = cityId;
      }

      let category = await Category.findOne(catQuery).lean();

      if (!category && cityId) {
        category = await Category.findOne({ slug: categorySlug, status: 'active', publishStatus: { $ne: 'draft' } }).lean();
      }

      if (category) {
        brands = brands.filter(b =>
          Array.isArray(b.categoryIds) &&
          b.categoryIds.some(id => id.toString() === category._id.toString())
        );
      }
    }

    res.status(200).json({
      success: true,
      brands: brands.map(brand => ({
        id: brand._id.toString(),
        title: brand.title,
        slug: brand.slug,
        icon: brand.iconUrl || '',
        logo: brand.logo || brand.iconUrl || '',
        imageUrl: brand.imageUrl || brand.iconUrl || '',
        badge: brand.badge || '',
        price: brand.basePrice || 0, // Legacy support
        originalPrice: brand.discountPrice ? (brand.basePrice + brand.discountPrice) : (brand.basePrice || 0),
        categoryId: brand.categoryIds && brand.categoryIds.length > 0 ? brand.categoryIds[0].toString() : null,
        categoryIds: (brand.categoryIds || []).map(id => id.toString()),
        sections: brand.sections || []
      }))
    });
  } catch (error) {
    console.error('Get public brands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands. Please try again.'
    });
  }
};

/**
 * Get brand by slug for user app
 * GET /api/public/brands/slug/:slug
 */
const getPublicBrandBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const brand = await Brand.findOne({ slug, status: 'active', publishStatus: { $ne: 'draft' } })
      .populate('categoryIds', 'title slug')
      .lean();

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Remove _id from nested objects
    const cleanBrand = JSON.parse(JSON.stringify(brand));
    const removeIds = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => {
          if (item && typeof item === 'object') {
            const { _id, ...rest } = item;
            return removeIds(rest);
          }
          return item;
        });
      } else if (obj && typeof obj === 'object') {
        const { _id, ...rest } = obj;
        return Object.keys(rest).reduce((acc, key) => {
          acc[key] = removeIds(rest[key]);
          return acc;
        }, {});
      }
      return obj;
    };

    // Fetch services associated with this brand
    const brandServices = await Service.find({ brandId: brand._id, status: 'active', publishStatus: { $ne: 'draft' } }).lean();

    // Map services to a default section structure for the frontend
    const servicesSection = {
      title: brand.title,
      subtitle: 'Available Services',
      cards: brandServices.map(svc => ({
        id: svc._id.toString(),
        title: svc.title,
        subtitle: svc.description || '',
        price: svc.basePrice,
        // Only what the admin entered; nothing is invented when it is empty
        rating: svc.displayRating || '',
        reviews: svc.reviewsLabel || '',
        imageUrl: svc.iconUrl || brand.iconUrl || '',
        features: svc.description ? [svc.description] : [],
        duration: "60 min", // Default duration
        ...getDisplayPricing(svc)
      }))
    };

    const formattedBrand = {
      id: brand._id.toString(),
      title: brand.title,
      slug: brand.slug,
      icon: brand.iconUrl || '',
      logo: brand.logo || '',
      badge: brand.badge || '',
      basePrice: brand.basePrice, // Legacy
      category: brand.categoryIds && brand.categoryIds[0] ? {
        id: brand.categoryIds[0]._id.toString(),
        title: brand.categoryIds[0].title,
        slug: brand.categoryIds[0].slug
      } : null,
      categories: (brand.categoryIds || []).map(cat => ({
        id: cat._id.toString(),
        title: cat.title,
        slug: cat.slug
      })),
      page: brand.page ? removeIds(brand.page) : {
        banners: brand.iconUrl ? [{ imageUrl: brand.iconUrl, text: brand.title }] : [],
        paymentOffers: [],
        paymentOffersEnabled: false
      },
      sections: brandServices.length > 0 ? [servicesSection] : []
    };

    res.status(200).json({
      success: true,
      brand: formattedBrand
    });
  } catch (error) {
    console.error('Get public brand by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand. Please try again.'
    });
  }
};

/**
 * Get services based on brand
 * GET /api/public/services
 */
const getPublicServices = async (req, res) => {
  try {
    const { brandId, brandSlug, categoryId, search, q, sortBy, minPrice, maxPrice, cityId } = req.query;

    const query = { status: 'active', publishStatus: { $ne: 'draft' } };

    if (brandId) {
      query.brandId = brandId;
    } else if (brandSlug) {
      const brand = await Brand.findOne({ slug: brandSlug, status: 'active', publishStatus: { $ne: 'draft' } });
      if (brand) {
        query.brandId = brand._id;
      } else {
        return res.status(200).json({ success: true, services: [] });
      }
    }

    if (categoryId) {
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        const catObjId = new mongoose.Types.ObjectId(categoryId);
        const childCategories = await Category.find({ parentId: catObjId, status: 'active' }).select('_id').lean();
        const catIds = [catObjId, ...childCategories.map(c => c._id)];
        query.categoryId = { $in: catIds };
      } else {
        query.categoryId = categoryId;
      }
    }

    if (minPrice || maxPrice) {
      query.basePrice = {};
      if (minPrice) query.basePrice.$gte = Number(minPrice);
      if (maxPrice) query.basePrice.$lte = Number(maxPrice);
    }

    const searchQuery = (search || q || '').trim();
    if (searchQuery) {
      const escapedSearch = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const terms = escapedSearch.split(/\s+/).filter(Boolean);
      query.$or = [
        { title: { $regex: escapedSearch, $options: 'i' } },
        { description: { $regex: escapedSearch, $options: 'i' } },
        ...terms.map(t => ({ title: { $regex: t, $options: 'i' } }))
      ];
    }

    let services = await Service.find(query)
      .populate('brandId', 'title iconUrl cityIds')
      .populate('categoryId', 'title slug cityIds parentId')
      .lean();

    // City filtering if cityId provided
    if (cityId) {
      services = services.filter(svc => {
        const catCities = svc.categoryId?.cityIds || [];
        const brandCities = svc.brandId?.cityIds || [];
        if (catCities.length === 0 && brandCities.length === 0) return true;
        return catCities.some(c => String(c) === String(cityId)) ||
               brandCities.some(c => String(c) === String(cityId));
      });
    }

    // Multi-factor relevance calculation
    const queryLower = searchQuery.toLowerCase();
    // Real review averages for these services (empty for services nobody has reviewed yet)
    const ratingMap = await getServiceRatings(services.map((s) => s._id));

    const rankedServices = services.map(svc => {
      const titleLower = (svc.title || '').toLowerCase();
      const descLower = (svc.description || '').toLowerCase();
      let relevance = 0;

      if (queryLower) {
        if (titleLower === queryLower) relevance += 100;
        else if (titleLower.startsWith(queryLower)) relevance += 60;
        else if (titleLower.includes(queryLower)) relevance += 35;
        else {
          const words = queryLower.split(' ');
          words.forEach(w => {
            if (titleLower.includes(w)) relevance += 15;
            if (descLower.includes(w)) relevance += 5;
          });
        }
      }

      // Real reviews when there are any; a neutral prior only for ranking, never shown
      const real = ratingMap.get(String(svc._id));
      const shown = toDisplayRating(real, svc.displayRating, svc.reviewsLabel);
      const rating = real ? real.avg : 4.5;
      const reviewsCount = real ? real.count : 0;

      // Blended multi-factor score (relevance, rating, popularity)
      const multiFactorScore = Math.round(
        (relevance * 0.5) +
        (rating * 10 * 0.3) +
        (Math.min(reviewsCount, 200) / 200 * 20 * 0.2)
      );

      return {
        ...svc,
        _relevance: relevance,
        _score: multiFactorScore,
        rating,
        reviewsCount,
        displayRating: shown.rating,
        reviewsLabel: shown.reviewsLabel
      };
    });

    // Dynamic sorting
    if (sortBy === 'price_asc') {
      rankedServices.sort((a, b) => (a.basePrice || 0) - (b.basePrice || 0));
    } else if (sortBy === 'price_desc') {
      rankedServices.sort((a, b) => (b.basePrice || 0) - (a.basePrice || 0));
    } else if (sortBy === 'rating_desc') {
      rankedServices.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'popular') {
      rankedServices.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
    } else if (searchQuery) {
      rankedServices.sort((a, b) => b._score - a._score);
    } else {
      rankedServices.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    res.status(200).json({
      success: true,
      services: rankedServices.map(svc => ({
        id: svc._id.toString(),
        title: svc.title,
        slug: svc.slug,
        icon: svc.iconUrl,
        basePrice: svc.basePrice,
        gstPercentage: svc.gstPercentage,
        description: svc.description,
        brandId: svc.brandId?._id,
        brandName: svc.brandId?.title,
        brandIcon: svc.brandId?.iconUrl,
        categoryId: svc.categoryId?._id,
        categoryName: svc.categoryId?.title,
        parentCategoryId: svc.categoryId?.parentId ? svc.categoryId.parentId.toString() : null,
        durationMinutes: svc.durationMinutes,
        variants: svc.variants || [],
        inclusions: Array.isArray(svc.inclusions) ? svc.inclusions : [],
        exclusions: Array.isArray(svc.exclusions) ? svc.exclusions : [],
        faqs: Array.isArray(svc.faqs) ? svc.faqs : [],
        warranty: svc.warranty || '',
        cancellationPolicy: svc.cancellationPolicy || '',
        images: Array.isArray(svc.images) ? svc.images : [],
        isPackage: Boolean(svc.isPackage),
        originalPrice: svc.originalPrice !== undefined ? svc.originalPrice : null,
        discountLabel: svc.discountLabel || '',
        // Real average from reviews, or null when nobody has reviewed it (the internal ranking prior is not shown)
        rating: svc.reviewsCount > 0 ? Number(Number(svc.rating).toFixed(1)) : null,
        reviewsCount: svc.reviewsCount,
        // The display values: real from reviews when there are any, otherwise the admin-entered ones (Service Wizard); apps show these, and nothing if empty
        displayRating: svc.displayRating || '',
        reviewsLabel: svc.reviewsLabel || '',
        score: svc._score,
        ...getDisplayPricing(svc)
      }))
    });
  } catch (error) {
    console.error('Get public services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services'
    });
  }
};

/**
 * Advanced Multi-Factor Marketplace Search (Categories & Services)
 * GET /api/public/search/advanced
 */
const advancedCatalogSearch = async (req, res) => {
  try {
    const { q, search, cityId, categoryId, sortBy } = req.query;
    const queryTerm = (q || search || '').trim().toLowerCase();

    if (!queryTerm) {
      return res.status(200).json({
        success: true,
        categories: [],
        services: []
      });
    }

    // 1. Matched Categories (top-level only — sub-categories are discovery
    // surfaces inside a parent catalog, not standalone search results).
    const catQuery = { status: 'active', parentId: null, publishStatus: { $ne: 'draft' } };
    // Categories open to every city (empty cityIds) are in every city's search too
    const searchCityFilter = await categoryCityFilter(cityId);
    if (searchCityFilter) catQuery.$and = [searchCityFilter];
    catQuery.$or = [
      { title: { $regex: queryTerm, $options: 'i' } },
      { slug: { $regex: queryTerm, $options: 'i' } }
    ];

    const categories = await Category.find(catQuery)
      .select('title slug homeIconUrl homeBadge')
      .limit(6)
      .lean();

    // 2. Delegate to getPublicServices logic for ranked services
    req.query.search = queryTerm;
    // Query services with multi-factor
    const serviceQuery = {
      status: 'active',
      publishStatus: { $ne: 'draft' },
      $or: [
        { title: { $regex: queryTerm, $options: 'i' } },
        { description: { $regex: queryTerm, $options: 'i' } }
      ]
    };
    if (categoryId) serviceQuery.categoryId = categoryId;

    let services = await Service.find(serviceQuery)
      .populate('brandId', 'title iconUrl cityIds')
      .populate('categoryId', 'title slug cityIds')
      .lean();

    if (cityId) {
      services = services.filter(svc => {
        const catCities = svc.categoryId?.cityIds || [];
        const brandCities = svc.brandId?.cityIds || [];
        if (catCities.length === 0 && brandCities.length === 0) return true;
        return catCities.some(c => String(c) === String(cityId)) ||
               brandCities.some(c => String(c) === String(cityId));
      });
    }

    const ratingMap = await getServiceRatings(services.map((s) => s._id));

    const ranked = services.map(svc => {
      const titleLower = (svc.title || '').toLowerCase();
      let rel = 0;
      if (titleLower === queryTerm) rel += 100;
      else if (titleLower.startsWith(queryTerm)) rel += 60;
      else if (titleLower.includes(queryTerm)) rel += 30;
      else rel += 10;

      const real = ratingMap.get(String(svc._id));
      const rating = real ? real.avg : 4.5; // ranking prior only; the shown value is below
      const shown = toDisplayRating(real, svc.displayRating, svc.reviewsLabel);
      const score = Math.round(rel * 0.6 + rating * 8);

      return {
        id: svc._id.toString(),
        title: svc.title,
        slug: svc.slug,
        icon: svc.iconUrl,
        basePrice: svc.basePrice,
        rating: real ? shown.rating : (shown.rating || null),
        reviewsCount: real ? real.count : 0,
        reviewsLabel: shown.reviewsLabel,
        brandId: svc.brandId?._id,
        brandName: svc.brandId?.title,
        categoryId: svc.categoryId?._id,
        categoryName: svc.categoryId?.title,
        score,
        ...getDisplayPricing(svc)
      };
    }).sort((a, b) => b.score - a.score);

    res.status(200).json({
      success: true,
      categories: categories.map(c => ({
        id: c._id.toString(),
        title: c.title,
        slug: c.slug,
        icon: c.homeIconUrl || '',
        badge: c.homeBadge || '',
        isCategory: true
      })),
      services: ranked.slice(0, 15)
    });
  } catch (error) {
    console.error('Advanced catalog search error:', error);
    res.status(500).json({ success: false, message: 'Advanced search failed' });
  }
};


/**
 * Home cards that link to a real service show that service's CURRENT price, discount and picture,
 * so a price change in the catalog shows on the home page without editing the card. The card's own
 * title, subtitle and badge stay as the admin wrote them. A card with no link is matched to the service
 * with exactly the same title (in its own category when several share it); if none matches it is left alone.
 */
const applyLiveServiceData = async (contentObj) => {
  const lists = [contentObj.noteworthy, contentObj.booked, ...(contentObj.categorySections || []).map((sec) => sec.cards)];
  const allItems = lists.flatMap((list) => list || []).filter((it) => it && it.title !== undefined);
  if (!allItems.length) return;

  const liveFields = 'title basePrice originalPrice images iconUrl categoryId displayRating reviewsLabel variants';
  const activeOnly = { status: 'active', publishStatus: { $ne: 'draft' } };
  const normalize = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // 1. Cards the admin linked to a service
  const linked = allItems.filter((it) => it.targetServiceId);
  const ids = [...new Set(linked.map((it) => String(it.targetServiceId)))].filter((id) => mongoose.isValidObjectId(id));
  const byId = new Map();
  if (ids.length) {
    const services = await Service.find({ _id: { $in: ids }, ...activeOnly }).select(liveFields).lean();
    services.forEach((svc) => byId.set(String(svc._id), svc));
  }

  // 2. Cards typed in by hand: when the title is exactly one service's title, that service is the card,
  // so its price and rating stay current without the admin linking each card.
  const unlinked = allItems.filter((it) => !it.targetServiceId && normalize(it.title));
  const byTitle = new Map();
  if (unlinked.length) {
    const titles = [...new Set(unlinked.map((it) => String(it.title).trim()))];
    const services = await Service.find({ title: { $in: titles }, ...activeOnly })
      .collation({ locale: 'en', strength: 2 })
      .select(liveFields)
      .lean();
    services.forEach((svc) => {
      const key = normalize(svc.title);
      byTitle.set(key, [...(byTitle.get(key) || []), svc]);
    });
  }
  const matchByTitle = (it) => {
    const candidates = byTitle.get(normalize(it.title)) || [];
    if (candidates.length === 1) return candidates[0];
    // Same title in several categories: only the one in the card's own category is certain
    const inCategory = candidates.filter((svc) => it.targetCategoryId && String(svc.categoryId) === String(it.targetCategoryId));
    return inCategory.length === 1 ? inCategory[0] : null;
  };

  allItems.forEach((it) => {
    const svc = it.targetServiceId ? byId.get(String(it.targetServiceId)) : matchByTitle(it);
    if (!svc) return;
    const price = Number(svc.basePrice) || 0;
    const original = Number(svc.originalPrice) || 0;
    it.price = String(price);
    it.originalPrice = original > price ? String(original) : '';
    it.discount = original > price ? `${Math.round(((original - price) / original) * 100)}% OFF` : '';
    if (!it.imageUrl) it.imageUrl = (svc.images && svc.images[0]) || svc.iconUrl || '';
    if (!it.targetCategoryId && svc.categoryId) it.targetCategoryId = svc.categoryId;
    // A card tied to a service shows that service's own rating, reviews and options, so nothing is typed twice
    if (svc.displayRating) it.rating = String(svc.displayRating);
    // The card shows "(890K)", so the word "reviews" the catalog label carries is left off
    if (svc.reviewsLabel) it.reviews = String(svc.reviewsLabel).replace(/\s*(reviews?|ratings?)\s*$/i, '').trim();
    const options = Array.isArray(svc.variants) ? svc.variants.length : 0;
    if (options > 1) it.optionsCount = String(options);
  });
};

/**
 * Home content as the user app receives it: every field the admin set, ids as strings, and
 * banners / promos / spotlight limited to the customer's zone.
 */
const formatHomeContent = (contentObj, activeZoneId, isGlobalScrapEnabled) => {
  return {
    banners: (contentObj.banners || [])
      .filter(item => matchesZone(item, activeZoneId))
      .map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
        zoneId: item.zoneId?.toString() || null,
      })),
    promos: (contentObj.promos || [])
      .filter(item => matchesZone(item, activeZoneId))
      .map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
        zoneId: item.zoneId?.toString() || null,
      })),
    curated: (contentObj.curated || []).map(item => ({
      ...item,
      id: item._id ? item._id.toString() : item.id,
      targetCategoryId: item.targetCategoryId?.toString() || null,
      targetServiceId: item.targetServiceId?.toString() || null,
    })),
    noteworthy: (contentObj.noteworthy || []).map(item => ({
      ...item,
      id: item._id ? item._id.toString() : item.id,
      targetCategoryId: item.targetCategoryId?.toString() || null,
      targetServiceId: item.targetServiceId?.toString() || null,
    })),
    booked: (contentObj.booked || []).map(item => ({
      ...item,
      id: item._id ? item._id.toString() : item.id,
      targetCategoryId: item.targetCategoryId?.toString() || null,
      targetServiceId: item.targetServiceId?.toString() || null,
    })),
    spotlight: (contentObj.spotlight || [])
      .filter(item => matchesZone(item, activeZoneId))
      .map(item => ({
        ...item,
        id: item._id ? item._id.toString() : item.id,
        targetCategoryId: item.targetCategoryId?.toString() || null,
        targetServiceId: item.targetServiceId?.toString() || null,
        zoneId: item.zoneId?.toString() || null,
      })),
    categorySections: (contentObj.categorySections || []).map(section => ({
      ...section,
      id: section._id ? section._id.toString() : section.id,
      seeAllTargetCategoryId: section.seeAllTargetCategoryId?.toString() || null,
      seeAllTargetServiceId: section.seeAllTargetServiceId?.toString() || null,
      cards: (section.cards || []).map(card => ({
        ...card,
        id: card._id ? card._id.toString() : card.id,
        targetCategoryId: card.targetCategoryId?.toString() || null,
        targetServiceId: card.targetServiceId?.toString() || null,
      }))
    })),
    isBannersVisible: contentObj.isBannersVisible ?? true,
    isPromosVisible: contentObj.isPromosVisible ?? true,
    isCuratedVisible: contentObj.isCuratedVisible ?? true,
    isNoteworthyVisible: contentObj.isNoteworthyVisible ?? true,
    isBookedVisible: contentObj.isBookedVisible ?? true,
    isCategorySectionsVisible: contentObj.isCategorySectionsVisible ?? true,
    isCategoriesVisible: contentObj.isCategoriesVisible ?? true,
    homeCategoryLimit: contentObj.homeCategoryLimit ?? 8,
    showAllServicesTile: contentObj.showAllServicesTile ?? true,
    allServicesLabel: contentObj.allServicesLabel || 'All services',
    isSpotlightVisible: contentObj.isSpotlightVisible ?? true,
    isScrapVisible: isGlobalScrapEnabled
  };
};

/**
 * Get home content
 */
const getPublicHomeContent = async (req, res) => {
  try {
    const { cityId, zoneId, lat, lng } = req.query;
    const homeContent = await HomeContent.getHomeContent(cityId);

    if (!homeContent) {
      return res.status(200).json({
        success: true,
        homeContent: {
          banners: [],
          promos: [],
          curated: [],
          noteworthy: [],
          booked: [],
          categorySections: []
        }
      });
    }

    const [contentObjDoc, settings, matchedZone] = await Promise.all([
      homeContent,
      Settings.findOne({ type: 'global' }).lean().catch(() => null),
      resolveZone({ zoneId, lat, lng, cityId })
    ]);

    const activeZoneId = matchedZone ? String(matchedZone._id) : ((await zonesInUse()) ? (zoneId || null) : null);
    const contentObj = contentObjDoc.toObject();
    await applyLiveServiceData(contentObj);
    const isGlobalScrapEnabled = settings ? settings.isScrapEnabled !== false : true;

    const formattedContent = formatHomeContent(contentObj, activeZoneId, isGlobalScrapEnabled);

    res.status(200).json({
      success: true,
      homeContent: formattedContent,
      isScrapEnabled: isGlobalScrapEnabled,
      zone: matchedZone ? {
        id: matchedZone._id,
        name: matchedZone.name,
        surgePricing: matchedZone.surgePricing || { enabled: false, multiplier: 1 }
      } : null
    });

  } catch (error) {
    console.error('Get public home content error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch home content. Please try again.'
    });
  }
};

/**
 * Get consolidated home data (Categories + Content)
 */
const getPublicHomeData = async (req, res) => {
  try {
    const { cityId, zoneId, lat, lng } = req.query;

    const matchedZone = await resolveZone({ zoneId, lat, lng, cityId });
    const activeZoneId = matchedZone ? String(matchedZone._id) : ((await zonesInUse()) ? (zoneId || null) : null);

    const homeCityFilter = await categoryCityFilter(cityId);
    const catQuery = { status: 'active', parentId: null, publishStatus: { $ne: 'draft' }, showOnHome: { $ne: false } };
    if (homeCityFilter) catQuery.$and = [homeCityFilter];
    const homeZoneSet = matchedZone ? await expandZoneCategories(matchedZone.allowedCategories) : null;
    if (homeZoneSet) {
      catQuery._id = { $in: [...homeZoneSet] };
    }

    const allCatQuery = { status: 'active', publishStatus: { $ne: 'draft' } };
    if (homeCityFilter) allCatQuery.$and = [homeCityFilter];

    const [categoriesRes, allCategoriesRes, homeContent, settings] = await Promise.all([
      Category.find(catQuery)
        .select('title slug homeIconUrl homeBadge hasSaleBadge etaDefaultMinutes displayRating bookingsLabel heroBanner showOnHome homeOrder')
        .sort({ homeOrder: 1 })
        .lean(),
      Category.find(allCatQuery)
        .select('title slug parentId homeIconUrl homeBadge hasSaleBadge etaDefaultMinutes displayRating bookingsLabel heroBanner showOnHome homeOrder')
        .sort({ homeOrder: 1 })
        .lean(),
      HomeContent.getHomeContent(cityId),
      Settings.findOne({ type: 'global' }).lean().catch(() => null)
    ]);

    const isGlobalScrapEnabled = settings ? settings.isScrapEnabled !== false : true;

    const formattedCategories = categoriesRes.map(cat => ({
      id: cat._id.toString(),
      _id: cat._id.toString(),
      title: cat.title,
      slug: cat.slug,
      icon: cat.homeIconUrl || '',
      homeIconUrl: cat.homeIconUrl || '',
      badge: cat.homeBadge || '',
      homeBadge: cat.homeBadge || '',
      hasSaleBadge: cat.hasSaleBadge || false,
      etaDefaultMinutes: cat.etaDefaultMinutes ?? null,
      displayRating: cat.displayRating || '',
      bookingsLabel: cat.bookingsLabel || '',
      heroBanner: cat.heroBanner || null,
      showOnHome: cat.showOnHome !== false,
      homeOrder: cat.homeOrder || 0
    }));

    const formattedAllCategories = allCategoriesRes.map(cat => ({
      id: cat._id.toString(),
      _id: cat._id.toString(),
      parentId: cat.parentId ? cat.parentId.toString() : null,
      title: cat.title,
      slug: cat.slug,
      icon: cat.homeIconUrl || '',
      homeIconUrl: cat.homeIconUrl || '',
      badge: cat.homeBadge || '',
      homeBadge: cat.homeBadge || '',
      hasSaleBadge: cat.hasSaleBadge || false,
      etaDefaultMinutes: cat.etaDefaultMinutes ?? null,
      displayRating: cat.displayRating || '',
      bookingsLabel: cat.bookingsLabel || '',
      heroBanner: cat.heroBanner || null,
      showOnHome: cat.showOnHome !== false,
      homeOrder: cat.homeOrder || 0
    }));

    let formattedContent = null;
    if (homeContent) {
      const contentObj = homeContent.toObject();
      await applyLiveServiceData(contentObj);
      formattedContent = formatHomeContent(contentObj, activeZoneId, isGlobalScrapEnabled);
    }

    res.status(200).json({
      success: true,
      categories: formattedCategories,
      allCategories: formattedAllCategories,
      homeContent: formattedContent,
      isScrapEnabled: isGlobalScrapEnabled,
      zone: matchedZone ? {
        id: matchedZone._id,
        name: matchedZone.name,
        surgePricing: matchedZone.surgePricing || { enabled: false, multiplier: 1 }
      } : null
    });
  } catch (error) {
    console.error('Get public home data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch home data'
    });
  }
};

/**
 * Per-category arrival-time estimate for the user's current location
 * GET /api/public/categories/eta?lat=&lng=&cityId=
 *
 * Returns { categoryId: minutes } for every category where at least one
 * APPROVED + online + available worker who offers that category exists
 * within the service radius. Minutes = ceil(distance_km / avg_speed * 60)
 * clamped to a sensible display range. Categories with no match are omitted
 * so the UI hides the badge.
 */
const getCategoriesEta = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const { cityId } = req.query;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(200).json({ success: true, eta: {} });
    }

    const Worker = require('../../models/Worker');
    const { WORKER_STATUS } = require('../../utils/constants');

    const categoryQuery = { status: 'active', publishStatus: { $ne: 'draft' } };
    const etaCityFilter = await categoryCityFilter(cityId);
    if (etaCityFilter) categoryQuery.$and = [etaCityFilter];
    // Top-level only — sub-categories inherit their parent's ETA badge
    // through the catalog modal; they don't own their own badge on the grid.
    categoryQuery.parentId = null;
    const categories = await Category.find(categoryQuery)
      .select('title slug')
      .lean();

    if (categories.length === 0) {
      return res.status(200).json({ success: true, eta: {} });
    }

    // The badge must promise exactly what dispatch would do (utils/dispatchMode.js):
    //   zone mode, address inside a zone  -> online professionals in that zone, any distance
    //   otherwise                         -> online professionals within the search radius
    const eligibleConfig = await require('../../utils/bookingConfig').getBookingConfig().catch(() => null);
    const etaZone = await resolveZone({ lat, lng, cityId });
    const zoneDecides = !!etaZone;
    const radiusKm = (eligibleConfig && eligibleConfig.searchRadius) || 10;

    const baseWorkerQuery = {
      approvalStatus: WORKER_STATUS.APPROVED,
      isActive: true,
      isOnline: true,
      availability: 'AVAILABLE',
      'geoLocation.coordinates': { $ne: [0, 0] }
    };

    // Nearby online + available workers with real coordinates. Keep select tiny.
    const nearby = await Worker.find(zoneDecides
      ? {
        ...baseWorkerQuery,
        $or: [
          { zoneId: etaZone._id },
          { zoneIds: etaZone._id },
          { geoLocation: { $geoWithin: { $geometry: etaZone.coordinates } } }
        ]
      }
      : {
        ...baseWorkerQuery,
        geoLocation: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radiusKm * 1000
          }
        }
      })
      .select('service categories geoLocation settings address')
      .limit(200)
      .lean();

    // Partner service area (admin switch): same rule as the real dispatch, so a badge never promises a partner
    // who would not actually be alerted. Partners are judged by their own radius from their home address.
    // Not used when a zone decides: dispatch ignores a partner's own radius there too.
    let nearbyList = nearby;
    if (!zoneDecides && eligibleConfig && eligibleConfig.isWorkerServiceRadiusEnabled) {
      const serviceArea = require('../../utils/serviceArea');
      nearbyList = nearby.filter((w) => serviceArea.insideOwnArea(w, { lat, lng }, eligibleConfig) !== false);
      try {
        const extras = await require('../../services/locationService').findServiceAreaWorkers(
          { lat, lng }, eligibleConfig, {}, nearby.map((w) => w._id), { availability: 'AVAILABLE' }
        );
        nearbyList = [...nearbyList, ...extras];
      } catch (err) { /* badges are best effort */ }
    }

    if (nearbyList.length === 0) {
      return res.status(200).json({ success: true, eta: {} });
    }

    // Precompute each worker's distance from the user (km). $near already
    // ordered them by distance, so the first match for a category is the closest.
    // (the list is sorted by distance below, because partners found by their service area are added at the end)
    const workerDistanceKm = nearbyList.map(w => {
      if (w.viaServiceArea && Number.isFinite(w.distance)) return w.distance;
      const [wLng, wLat] = w.geoLocation?.coordinates || [0, 0];
      const dLat = (wLat - lat) * Math.PI / 180;
      const dLng = (wLng - lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat * Math.PI / 180) * Math.cos(wLat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    });

    // Average urban travel speed used to convert distance -> minutes. Includes
    // the few minutes a worker needs to acknowledge the job and set off.
    const AVG_SPEED_KMPH = 25;
    const BASE_MINUTES = 10;
    const MIN_DISPLAY = 20;
    const MAX_DISPLAY = 120;

    // Closest first, so the first match for a category is the nearest partner
    const order = nearbyList.map((_, i) => i).sort((a, b) => workerDistanceKm[a] - workerDistanceKm[b]);
    const sortedWorkers = order.map((i) => nearbyList[i]);
    const sortedKm = order.map((i) => workerDistanceKm[i]);

    const eta = {};
    for (const cat of categories) {
      const haystack = [cat.title, cat.slug].filter(Boolean).map(s => s.toLowerCase());

      // Find the closest nearby worker whose declared services/categories match
      // this category by title or slug (case-insensitive, substring match either way).
      for (let i = 0; i < sortedWorkers.length; i++) {
        const w = sortedWorkers[i];
        const workerTags = [...(w.service || []), ...(w.categories || [])]
          .map(s => (s || '').toLowerCase())
          .filter(Boolean);

        const matches = workerTags.some(tag =>
          haystack.some(h => tag === h || tag.includes(h) || h.includes(tag))
        );

        if (matches) {
          const km = sortedKm[i];
          const minutes = Math.ceil(BASE_MINUTES + (km / AVG_SPEED_KMPH) * 60);
          const clamped = Math.min(MAX_DISPLAY, Math.max(MIN_DISPLAY, minutes));
          eta[cat._id.toString()] = clamped;
          break;
        }
      }
    }

    return res.status(200).json({ success: true, eta });
  } catch (error) {
    console.error('Get categories ETA error:', error);
    // Soft-fail so the home grid still renders without badges
    return res.status(200).json({ success: true, eta: {} });
  }
};

/**
 * GET /api/public/categories/:idOrSlug/catalog
 * Consolidated category catalog payload:
 * - Category hero ({ tag, title, startingPrice, imageUrl })
 * - Best coupon (category-specific first, then app-wide; filtered by isActive, in-date, isAutoApply prioritised, highest discountValue)
 * - SubCategories[] (active children of this category)
 * - Sections[] (ordered by Brand.displayOrder) with nested services[] (active + publishStatus=published only, filtered to this brand+category, ordered by UserService.sortOrder) and each service's variants[] (active only, ordered by variant.order)
 * Short Redis cache (public:catalog:<idOrSlug>:<cityId|'all'>, TTL 120s).
 */
const getPublicCategoryCatalog = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const { cityId, zoneId, lat, lng } = req.query;

    if (!idOrSlug) {
      return res.status(400).json({ success: false, message: 'Category ID or slug is required.' });
    }

    const matchedZone = await resolveZone({ zoneId, lat, lng, cityId });
    const activeZoneId = matchedZone ? String(matchedZone._id) : ((await zonesInUse()) ? (zoneId || null) : null);

    const cacheKey = `public:catalog:${idOrSlug}:${cityId || 'all'}:${activeZoneId || 'all'}`;
    const redis = getRedis();

    // 1. Short Redis cache check
    if (isRedisConnected() && redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.status(200).json(JSON.parse(cached));
        }
      } catch (cacheErr) {
        // Non-blocking cache read error
      }
    }

    // 2. Resolve Category (by ObjectId or slug)
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrSlug) && /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const categoryQuery = {
      status: 'active',
      publishStatus: { $ne: 'draft' },
      ...(isObjectId ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug })
    };

    const category = await Category.findOne(categoryQuery).lean();
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.'
      });
    }

    // Check if category is allowed in the matched zone
    const pageZoneSet = matchedZone ? await expandZoneCategories(matchedZone.allowedCategories) : null;
    if (pageZoneSet) {
      const isAllowed = pageZoneSet.has(String(category._id));
      if (!isAllowed) {
        return res.status(200).json({
          success: true,
          isCategoryServiceable: false,
          isOutOfZoneForCategory: true,
          message: `This category is currently not available in ${matchedZone.name}.`,
          category: {
            _id: category._id,
            id: category._id.toString(),
            title: category.title,
            slug: category.slug,
            isServiceable: false
          },
          hero: { tag: '', title: category.title, startingPrice: '', imageUrl: category.heroBanner?.imageUrl || '' },
          bestCoupon: null,
          subCategories: [],
          sections: []
        });
      }
    }

    // 3. Category hero. A sub-category with no banner of its own shows its parent's, so every
    // page under a category keeps the banner (the admin can still set a specific one on any of them).
    let heroSource = category.heroBanner;
    if (!heroSource?.title && category.parentId) {
      const parent = await Category.findById(category.parentId).select('heroBanner').lean();
      if (parent?.heroBanner?.title) heroSource = parent.heroBanner;
    }
    const hero = {
      tag: heroSource?.tag || '',
      title: heroSource?.title || '',
      startingPrice: heroSource?.startingPrice || '',
      imageUrl: heroSource?.imageUrl || ''
    };

    // 4. SubCategories (active children of this category)
    const subCategoriesQuery = {
      parentId: category._id,
      status: 'active',
      publishStatus: { $ne: 'draft' }
    };
    const subCityFilter = await categoryCityFilter(cityId);
    if (subCityFilter) subCategoriesQuery.$and = [subCityFilter];

    const subCategoriesDocs = await Category.find(subCategoriesQuery)
      .select('title slug homeIconUrl homeBadge subCategoryBadge sortOrder homeOrder heroBanner')
      .sort({ sortOrder: 1, homeOrder: 1, createdAt: 1 })
      .lean();

    const subCategories = subCategoriesDocs.map(sc => ({
      _id: sc._id,
      id: sc._id.toString(),
      title: sc.title,
      slug: sc.slug,
      icon: sc.homeIconUrl || '',
      homeIconUrl: sc.homeIconUrl || '',
      badge: sc.subCategoryBadge || sc.homeBadge || '',
      subCategoryBadge: sc.subCategoryBadge || '',
      sortOrder: sc.sortOrder || 0,
      parentId: category._id.toString()
    }));

    // 5. Best Coupon: category-specific first, then app-wide; filter by isActive, in-date, isAutoApply prioritised, pick highest discountValue
    const now = new Date();
    const couponQuery = {
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
      $or: [
        { categories: category._id },
        { categories: { $size: 0 } },
        { categories: { $exists: false } }
      ]
    };
    const rawCoupons = await Coupon.find(couponQuery).lean();
    // City and zone limits are checked here with the same rule checkout uses, so the strip never
    // advertises a coupon the customer could not apply (including when their zone is not known yet).
    const location = await resolveLocation({ zoneId: activeZoneId, cityId });
    const validCoupons = rawCoupons.filter(c => {
      if (c.usageLimit && c.usageLimit > 0 && (c.usedCount || 0) >= c.usageLimit) {
        return false;
      }
      return !locationProblem(c, location);
    });

    validCoupons.sort((a, b) => {
      const aCatSpecific = Array.isArray(a.categories) && a.categories.some(id => id.toString() === category._id.toString()) ? 1 : 0;
      const bCatSpecific = Array.isArray(b.categories) && b.categories.some(id => id.toString() === category._id.toString()) ? 1 : 0;
      if (aCatSpecific !== bCatSpecific) {
        return bCatSpecific - aCatSpecific; // Category-specific first
      }

      const aAuto = a.isAutoApply ? 1 : 0;
      const bAuto = b.isAutoApply ? 1 : 0;
      if (aAuto !== bAuto) {
        return bAuto - aAuto; // isAutoApply prioritised
      }

      const aVal = a.discountValue || 0;
      const bVal = b.discountValue || 0;
      return bVal - aVal; // Highest discountValue
    });

    const topCoupon = validCoupons[0] || null;
    const bestCoupon = topCoupon ? {
      _id: topCoupon._id,
      code: topCoupon.code,
      title: topCoupon.title,
      description: topCoupon.description || '',
      discountType: topCoupon.discountType,
      discountValue: topCoupon.discountValue,
      maxDiscountAmount: topCoupon.maxDiscountAmount || 0,
      minOrderAmount: topCoupon.minOrderAmount || 0,
      isAutoApply: !!topCoupon.isAutoApply,
      validUntil: topCoupon.validUntil
    } : null;

    // 6. Sections with nested services and variants via aggregation ($lookup, no N+1)
    const brandMatch = {
      status: 'active',
      publishStatus: { $ne: 'draft' },
      $or: [
        { categoryIds: category._id },
        { categoryId: category._id }
      ]
    };
    if (cityId) {
      brandMatch.$and = [
        {
          $or: [
            { cityIds: new mongoose.Types.ObjectId(cityId) },
            { cityIds: { $size: 0 } },
            { cityIds: { $exists: false } }
          ]
        }
      ];
    }

    // A category with two or more tiles is a choice between them: its page lists only services filed
    // directly on it, and each tile opens its own services. With one tile (or none) the page is the list.
    const isTilesPage = subCategoriesDocs.length >= 2;
    const allowedCategoryIds = isTilesPage
      ? [category._id]
      : [category._id, ...subCategoriesDocs.map(sc => sc._id)];

    const sectionsPipeline = [
      { $match: brandMatch },
      { $sort: { displayOrder: 1, createdAt: 1 } },
      {
        $lookup: {
          from: 'userservices',
          let: { brandId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$brandId', '$$brandId'] },
                    { $eq: ['$status', 'active'] },
                    { $ne: ['$publishStatus', 'draft'] },
                    {
                      $or: [
                        { $in: ['$categoryId', allowedCategoryIds] },
                        { $eq: [{ $ifNull: ['$categoryId', null] }, null] }
                      ]
                    }
                  ]
                }
              }
            },
            ...(cityId ? [{
              $match: {
                $or: [
                  { cityIds: new mongoose.Types.ObjectId(cityId) },
                  { cityIds: { $size: 0 } },
                  { cityIds: { $exists: false } }
                ]
              }
            }] : []),
            { $sort: { sortOrder: 1, createdAt: 1 } },
            {
              $addFields: {
                variants: {
                  $sortArray: {
                    input: {
                      $filter: {
                        input: { $ifNull: ['$variants', []] },
                        as: 'v',
                        cond: { $eq: ['$$v.isActive', true] }
                      }
                    },
                    sortBy: { order: 1 }
                  }
                }
              }
            }
          ],
          as: 'services'
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          slug: 1,
          iconUrl: 1,
          badge: 1,
          displayOrder: 1,
          bannerPromo: 1,
          services: 1
        }
      }
    ];

    let sections = await Brand.aggregate(sectionsPipeline);
    if (isTilesPage) sections = sections.filter((sec) => (sec.services || []).length > 0);

    // Ratings come from real customer reviews. A service with reviews shows its true average and
    // count; one without keeps whatever the admin entered (possibly nothing). The category header
    // is the weighted average over every service in this catalog.
    const catalogServices = sections.flatMap((sec) => sec.services || []);
    const ratingMap = await getServiceRatings(catalogServices.map((svc) => svc._id));
    catalogServices.forEach((svc) => {
      const real = ratingMap.get(String(svc._id));
      const shown = toDisplayRating(real, svc.displayRating, svc.reviewsLabel);
      svc.displayRating = shown.rating;
      svc.reviewsLabel = shown.reviewsLabel;
      if (real) {
        svc.rating = Number(shown.rating);
        svc.reviewsCount = real.count;
      }
    });
    // The questions the customer answers when adding each service (brand, vehicle type...), set by
    // the admin on its category and inherited from the parent when the sub-category has none
    const fieldsByCategory = await resolveFieldsForCategories(catalogServices.map((svc) => svc.categoryId));
    catalogServices.forEach((svc) => {
      svc.detailFields = fieldsByCategory.get(String(svc.categoryId)) || [];
    });
    const categoryReal = combineRatings([...ratingMap.values()]);
    const categoryShown = toDisplayRating(categoryReal, category.displayRating, '');

    const payload = {
      success: true,
      category: {
        _id: category._id,
        id: category._id.toString(),
        title: category.title,
        slug: category.slug,
        displayRating: categoryShown.rating,
        reviewsLabel: categoryShown.reviewsLabel,
        bookingsLabel: category.bookingsLabel || '',
        etaDefaultMinutes: category.etaDefaultMinutes || null,
        hasBrands: !!category.hasBrands,
        hero
      },
      hero,
      bestCoupon,
      subCategories,
      sections
    };

    // Cache in Redis for 120s
    if (isRedisConnected() && redis) {
      try {
        await redis.setex(cacheKey, 120, JSON.stringify(payload));
      } catch (err) {
        // Non-blocking cache write error
      }
    }

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Get public category catalog error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch catalog. Please try again.'
    });
  }
};


/**
 * What a professional can offer, as a tree: category -> sub-category -> service.
 * GET /api/public/worker-skill-tree?cityId=
 *
 * Used by partner signup and profile edit (and the admin worker edit) so everyone picks from the same
 * hierarchy. `cityId` is optional: a new partner may not have a city yet, in which case every
 * category is offered. Only active, published items are listed. Services sit under their
 * sub-category, or straight under the category when they have none.
 */
const getWorkerSkillTree = async (req, res) => {
  try {
    const { cityId } = req.query;
    const live = { status: 'active', publishStatus: { $ne: 'draft' } };

    const cityFilter = await categoryCityFilter(cityId);
    const catQuery = { ...live, ...(cityFilter ? { $and: [cityFilter] } : {}) };

    const categories = await Category.find(catQuery)
      .select('title slug homeIconUrl parentId homeOrder')
      .sort({ homeOrder: 1, title: 1 })
      .lean();

    const catIds = categories.map((c) => c._id);
    const services = await Service.find({ ...live, categoryId: { $in: catIds } })
      .select('title categoryId brandId basePrice')
      .populate('brandId', 'title')
      .sort({ title: 1 })
      .lean();

    const servicesByCat = new Map();
    services.forEach((svc) => {
      const key = String(svc.categoryId);
      if (!servicesByCat.has(key)) servicesByCat.set(key, []);
      servicesByCat.get(key).push({
        id: String(svc._id),
        title: svc.title,
        brandTitle: svc.brandId?.title || null
      });
    });

    const subsByParent = new Map();
    categories.filter((c) => c.parentId).forEach((c) => {
      const key = String(c.parentId);
      if (!subsByParent.has(key)) subsByParent.set(key, []);
      subsByParent.get(key).push({
        id: String(c._id),
        title: c.title,
        services: servicesByCat.get(String(c._id)) || []
      });
    });

    const tree = categories.filter((c) => !c.parentId).map((c) => ({
      id: String(c._id),
      title: c.title,
      icon: c.homeIconUrl || '',
      subCategories: subsByParent.get(String(c._id)) || [],
      // Services that sit directly under the category
      services: servicesByCat.get(String(c._id)) || []
    }));

    res.status(200).json({ success: true, categories: tree });
  } catch (error) {
    console.error('Get worker skill tree error:', error);
    res.status(500).json({ success: false, message: 'Failed to load the service list' });
  }
};

module.exports = {
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
};

