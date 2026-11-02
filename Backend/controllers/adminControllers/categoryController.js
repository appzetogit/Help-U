const Category = require('../../models/Category');
const { renameWorkerSkill } = require('../../utils/workerSkills');
const { categoryCityFilter } = require('../../utils/cityScope');
const Brand = require('../../models/Brand');
const UserService = require('../../models/UserService');
const Booking = require('../../models/Booking');
const Cart = require('../../models/Cart');
const Coupon = require('../../models/Coupon');
const HomeContent = require('../../models/HomeContent');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS } = require('../../utils/constants');
const { validateSubCategorySlug, subCategorySlugError, toSlugSegment } = require('../../utils/categorySlug');
const { invalidatePublicCatalogKeys } = require('../../utils/catalogCache');
const { writeAudit } = require('../../utils/auditLog');
const { sanitizeDetailFields } = require('../../utils/detailFields');

/**
 * Shared mapper so every response returns the same, documented shape.
 * Includes the Phase-1/Phase-2 additive fields (parentId, hasBrands, heroBanner, …)
 * so the admin UI can render them without a second lookup.
 */
const toCategoryResponse = (cat) => ({
  id: cat._id,
  title: cat.title,
  slug: cat.slug,
  parentId: cat.parentId ? cat.parentId.toString() : null,
  hasBrands: cat.hasBrands === true,
  homeIconUrl: cat.homeIconUrl,
  homeBadge: cat.homeBadge,
  hasSaleBadge: !!cat.hasSaleBadge,
  showOnHome: !!cat.showOnHome,
  homeOrder: cat.homeOrder || 0,
  description: cat.description,
  imageUrl: cat.imageUrl,
  status: cat.status,
  isPopular: !!cat.isPopular,
  isEmergencyAvailable: !!cat.isEmergencyAvailable,
  detailFields: cat.detailFields || [],
  cityIds: cat.cityIds || [],
  metaTitle: cat.metaTitle,
  metaDescription: cat.metaDescription,
  // Phase-1 display fields
  displayRating: cat.displayRating || '',
  bookingsLabel: cat.bookingsLabel || '',
  etaDefaultMinutes: cat.etaDefaultMinutes ?? null,
  heroBanner: cat.heroBanner || { tag: '', title: '', startingPrice: '', imageUrl: '' },
  subCategoryBadge: cat.subCategoryBadge || '',
  createdAt: cat.createdAt,
  updatedAt: cat.updatedAt
});

/**
 * Build the `parentId` filter chunk from a raw query value.
 * - undefined / '' / null  -> { parentId: null }  (default: top-level only)
 * - 'all'                  -> {}                   (no filter)
 * - '<objectId>'           -> { parentId: '<id>' }
 */
const parentIdFilter = (raw) => {
  if (raw === undefined || raw === null || raw === '' || raw === 'null' || raw === 'undefined') return { parentId: null };
  if (raw === 'all') return {};
  return { parentId: raw };
};

/**
 * Reject a parentId that would create a cycle (`parent === self`, or
 * the proposed parent is itself a descendant of this category) or that
 * would push the tree past 2 levels (parent cannot itself have a parent).
 * Returns null when valid, otherwise an error message.
 */
const validateParentId = async ({ categoryId, parentId }) => {
  if (!parentId || parentId === 'null' || parentId === 'undefined') return null;
  if (categoryId && String(parentId) === String(categoryId)) {
    return 'A category cannot be its own parent.';
  }
  const parent = await Category.findById(parentId).select('_id parentId status').lean();
  if (!parent) return 'Parent category not found.';
  if (parent.parentId) {
    return 'Nesting deeper than 2 levels is not allowed. The parent must itself be a top-level category.';
  }
  if (categoryId) {
    // The proposed parent must not already be a child of this category.
    const descendantParent = await Category.findOne({ _id: parentId, parentId: categoryId }).lean();
    if (descendantParent) return 'Cyclic parent is not allowed.';
  }
  return null;
};

/**
 * Count every reference to this category and its descendants so the admin UI
 * can show "cannot delete, 3 active bookings + 2 carts still use it".
 */
const buildDependencyReport = async (categoryId) => {
  const children = await Category.find({ parentId: categoryId }).select('_id').lean();
  const brandCount = await Brand.countDocuments({ categoryIds: categoryId, status: { $ne: 'deleted' } });
  const brandIds = (await Brand.find({ categoryIds: categoryId }).select('_id').lean()).map(b => b._id);
  const serviceCount = await UserService.countDocuments({ $or: [{ categoryId }, { brandId: { $in: brandIds } }], status: { $ne: 'deleted' } });

  const categoryDoc = await Category.findById(categoryId).select('title slug').lean();
  const categoryTitles = categoryDoc ? [categoryDoc.title, categoryDoc.slug].filter(Boolean) : [];

  const [activeBookings, activeCarts, couponRefs, homeContentRefs] = await Promise.all([
    Booking.countDocuments({
      $or: [
        { categoryId },
        ...(categoryTitles.length > 0 ? [{ serviceCategory: { $in: categoryTitles } }] : [])
      ],
      status: { $nin: ['completed', 'cancelled', 'rejected'] }
    }).catch(() => 0),
    Cart.countDocuments({ 'items.categoryId': categoryId }).catch(() => 0),
    Coupon.countDocuments({ categories: categoryId, isActive: true }).catch(() => 0),
    HomeContent.countDocuments({
      $or: [
        { 'banners.targetCategoryId': categoryId },
        { 'promos.targetCategoryId': categoryId },
        { 'noteworthy.targetCategoryId': categoryId },
        { 'booked.targetCategoryId': categoryId },
        { 'spotlight.targetCategoryId': categoryId },
        { 'categorySections.seeAllTargetCategoryId': categoryId },
        { 'categorySections.cards.targetCategoryId': categoryId }
      ]
    }).catch(() => 0)
  ]);

  const total = children.length + brandCount + serviceCount + activeBookings + activeCarts + couponRefs + homeContentRefs;
  return {
    hasDependencies: total > 0,
    childCategories: children.length,
    brands: brandCount,
    services: serviceCount,
    activeBookings,
    activeCarts,
    coupons: couponRefs,
    homeContentReferences: homeContentRefs
  };
};

/**
 * What is inside each category, for the admin list (no per-row queries: everything is loaded once).
 *
 *   subCategories  children, { total, active }                       (top-level categories only)
 *   brands         sections / brands attached to it                   (a top-level one includes its sub-categories')
 *   services       non-archived services, { total, active }           (same: includes the sub-categories')
 *   workers        approved, active professionals who can take work in it: they list the category, a
 *                  sub-category or a service in it - or, for a sub-category, its parent (listing a category
 *                  covers everything under it). Same title matching dispatch uses.
 *
 * With a city, brands and services are limited to that city (so the numbers match the Services tab).
 */
const buildCategoryCounts = async (categories, cityId, { withWorkerIds = false } = {}) => {
  const { buildServiceCityMatch, cityScopeQuery } = require('../../utils/cityScope');
  const Worker = require('../../models/Worker');
  const { WORKER_STATUS } = require('../../utils/constants');
  const norm = (t) => String(t || '').trim().toLowerCase();

  const all = await Category.find({}).select('title parentId status').lean();
  const byId = new Map(all.map((c) => [String(c._id), c]));
  const childrenOf = new Map();
  all.forEach((c) => {
    if (!c.parentId) return;
    const key = String(c.parentId);
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(c);
  });

  const cityMatch = await buildServiceCityMatch(cityId);
  const serviceQuery = { status: { $ne: 'deleted' }, ...(cityMatch ? { $and: [cityMatch] } : {}) };
  const brandQuery = { status: { $ne: 'deleted' }, ...(cityId && cityScopeQuery ? cityScopeQuery(cityId) : {}) };

  const [services, brands, workers] = await Promise.all([
    UserService.find(serviceQuery).select('title categoryId brandId status').lean(),
    Brand.find(brandQuery).select('categoryIds categoryId').lean(),
    Worker.find({ isActive: true, approvalStatus: { $in: [WORKER_STATUS.APPROVED, 'APPROVED'] } }).select('service categories').lean()
  ]);

  const servicesByCat = new Map();
  services.forEach((svc) => {
    const key = String(svc.categoryId);
    if (!servicesByCat.has(key)) servicesByCat.set(key, []);
    servicesByCat.get(key).push(svc);
  });
  const brandsByCat = new Map();
  brands.forEach((b) => {
    const ids = new Set([...(b.categoryIds || []), b.categoryId].filter(Boolean).map(String));
    ids.forEach((id) => {
      if (!brandsByCat.has(id)) brandsByCat.set(id, new Set());
      brandsByCat.get(id).add(String(b._id));
    });
  });
  const workersByTitle = new Map();
  workers.forEach((w) => {
    const skills = [...(Array.isArray(w.service) ? w.service : []), ...(Array.isArray(w.categories) ? w.categories : [])];
    skills.forEach((skill) => {
      const t = norm(skill);
      if (!t) return;
      if (!workersByTitle.has(t)) workersByTitle.set(t, new Set());
      workersByTitle.get(t).add(String(w._id));
    });
  });

  return categories.map((cat) => {
    const id = String(cat._id || cat.id);
    const doc = byId.get(id);
    const kids = childrenOf.get(id) || [];
    const scope = [id, ...kids.map((k) => String(k._id))]; // a top-level category counts its sub-categories' items too

    const svcs = scope.flatMap((cid) => servicesByCat.get(cid) || []);
    const brandSet = new Set(scope.flatMap((cid) => [...(brandsByCat.get(cid) || [])]));

    const titles = new Set([norm(doc?.title), ...kids.map((k) => norm(k.title)), ...svcs.map((x) => norm(x.title))]);
    if (doc?.parentId) titles.add(norm(byId.get(String(doc.parentId))?.title)); // listing the parent covers this one
    titles.delete('');
    const workerSet = new Set();
    titles.forEach((t) => (workersByTitle.get(t) || []).forEach((wid) => workerSet.add(wid)));

    return {
      id,
      counts: {
        subCategories: { total: kids.length, active: kids.filter((k) => k.status === 'active').length },
        brands: brandSet.size,
        services: { total: svcs.length, active: svcs.filter((x) => x.status === 'active').length },
        workers: workerSet.size
      },
      ...(withWorkerIds ? { workerIds: [...workerSet] } : {})
    };
  });
};

/**
 * The professionals behind a category's "workers" count (same matching, same city scope).
 * GET /api/admin/categories/:id/workers?cityId=
 */
const getCategoryWorkers = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).select('_id title parentId').lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const [entry] = await buildCategoryCounts([category], req.query.cityId, { withWorkerIds: true });
    const Worker = require('../../models/Worker');
    const workers = await Worker.find({ _id: { $in: entry.workerIds } })
      .select('name businessName phone address.city isOnline service categories')
      .sort({ name: 1 })
      .limit(500)
      .lean();

    res.status(200).json({
      success: true,
      category: { id: String(category._id), title: category.title },
      total: entry.workerIds.length,
      workers: workers.map((w) => ({
        id: String(w._id),
        name: w.name,
        businessName: w.businessName || '',
        phone: w.phone || '',
        city: w.address?.city || '',
        isOnline: !!w.isOnline
      }))
    });
  } catch (error) {
    console.error('Get category workers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load the workers.' });
  }
};

// ============================================================================
// LIST / READ
// ============================================================================

/**
 * Get all categories.
 * GET /api/admin/categories
 * Query: status, showOnHome, isPopular, cityId, parentId
 *   parentId: default = null (top-level only); 'all' = no filter;
 *             '<id>' = children of that id.
 */
const getAllCategories = async (req, res) => {
  try {
    const { status, showOnHome, isPopular, cityId, parentId } = req.query;

    const query = { ...parentIdFilter(parentId) };
    if (status) query.status = status;
    if (showOnHome !== undefined) query.showOnHome = showOnHome === 'true';
    // A sub-category follows its parent's cities (see utils/cityScope.js)
    const cityFilter = await categoryCityFilter(cityId);
    if (cityFilter) query.$and = [cityFilter];

    const categories = await Category.find(query)
      .select('-__v')
      .sort({ homeOrder: 1, createdAt: -1 })
      .lean();

    let responseCategories = categories.map(toCategoryResponse);
    if (req.query.withCounts === 'true') {
      const counts = await buildCategoryCounts(categories, cityId);
      const byId = new Map(counts.map((c) => [c.id, c.counts]));
      responseCategories = responseCategories.map((c) => ({ ...c, counts: byId.get(String(c.id || c._id)) || null }));
    }

    res.status(200).json({
      success: true,
      count: categories.length,
      categories: responseCategories
    });
  } catch (error) {
    console.error('Get all categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories. Please try again.'
    });
  }
};

/**
 * Get children of a category.
 * GET /api/admin/categories/:id/children
 */
const getCategoryChildren = async (req, res) => {
  try {
    const { id } = req.params;
    const children = await Category.find({ parentId: id })
      .select('-__v')
      .sort({ homeOrder: 1, createdAt: -1 })
      .lean();
    res.status(200).json({
      success: true,
      count: children.length,
      categories: children.map(toCategoryResponse)
    });
  } catch (error) {
    console.error('Get category children error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sub-categories.' });
  }
};

/**
 * Get single category by ID.
 * GET /api/admin/categories/:id
 */
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id).select('-__v').lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.status(200).json({ success: true, category: toCategoryResponse(category) });
  } catch (error) {
    console.error('Get category by ID error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch category. Please try again.' });
  }
};

/**
 * Slug availability check.
 * GET /api/admin/categories/slug-available?slug=&parentId=&excludeId=
 *
 * Returns { available, reason, suggestion } so the admin UI can show inline
 * feedback as the admin types. For sub-categories the slug must be
 * namespaced with the parent's slug (validateSubCategorySlug).
 */
const checkSlugAvailability = async (req, res) => {
  try {
    const { slug, parentId, excludeId } = req.query;
    if (!slug) return res.status(400).json({ success: false, message: 'slug is required' });

    const normalised = String(slug).toLowerCase();

    // Namespacing rule for sub-categories.
    if (parentId) {
      const parent = await Category.findById(parentId).select('slug parentId').lean();
      if (!parent) return res.status(404).json({ success: false, message: 'Parent not found' });
      if (parent.parentId) {
        return res.status(400).json({ success: false, message: 'Parent is itself a sub-category; nesting beyond 2 levels is not allowed.' });
      }
      const check = validateSubCategorySlug(parent.slug, normalised);
      if (!check.ok) {
        return res.status(200).json({
          success: true,
          available: false,
          reason: check.reason,
          message: subCategorySlugError(check.reason, { parentSlug: parent.slug }),
          suggestion: `${parent.slug}-${toSlugSegment(normalised)}`
        });
      }
    }

    // Global unique index on slug — one lookup settles the question.
    const query = { slug: normalised };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Category.findOne(query).select('_id').lean();
    return res.status(200).json({
      success: true,
      available: !existing,
      reason: existing ? 'in-use' : null,
      message: existing ? 'Slug is already in use by another category.' : 'Slug is available.'
    });
  } catch (error) {
    console.error('Slug availability error:', error);
    res.status(500).json({ success: false, message: 'Failed to check slug.' });
  }
};

/**
 * Dependency report (what still points at this category).
 * GET /api/admin/categories/:id/dependencies
 */
const getCategoryDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id).select('_id title').lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    const report = await buildDependencyReport(id);
    res.status(200).json({ success: true, categoryId: id, title: category.title, ...report });
  } catch (error) {
    console.error('Category dependencies error:', error);
    res.status(500).json({ success: false, message: 'Failed to build dependency report.' });
  }
};

// ============================================================================
// WRITE
// ============================================================================

/**
 * Accept the full admin payload and build a Category-shaped object. Only
 * known fields are copied — unknown keys from the admin UI are silently
 * dropped so forward-compat changes do not corrupt the document.
 */
const buildCategoryFields = (body) => {
  const fields = {};
  if (body.title !== undefined) fields.title = body.title.trim();
  if (body.slug !== undefined) fields.slug = body.slug?.trim().toLowerCase() || undefined;
  if (body.parentId !== undefined) fields.parentId = body.parentId || null;
  if (body.hasBrands !== undefined) fields.hasBrands = Boolean(body.hasBrands);
  if (body.homeIconUrl !== undefined) fields.homeIconUrl = body.homeIconUrl || null;
  if (body.homeBadge !== undefined) fields.homeBadge = body.homeBadge?.trim() || null;
  if (body.hasSaleBadge !== undefined) fields.hasSaleBadge = Boolean(body.hasSaleBadge);
  if (body.showOnHome !== undefined) fields.showOnHome = body.showOnHome !== false;
  if (body.homeOrder !== undefined) fields.homeOrder = Number(body.homeOrder) || 0;
  if (body.description !== undefined) fields.description = body.description?.trim() || null;
  if (body.imageUrl !== undefined) fields.imageUrl = body.imageUrl || null;
  if (body.status !== undefined) fields.status = body.status;
  if (body.isPopular !== undefined) fields.isPopular = Boolean(body.isPopular);
  if (body.isEmergencyAvailable !== undefined) fields.isEmergencyAvailable = Boolean(body.isEmergencyAvailable);
  if (body.metaTitle !== undefined) fields.metaTitle = body.metaTitle?.trim() || null;
  if (body.metaDescription !== undefined) fields.metaDescription = body.metaDescription?.trim() || null;
  if (body.cityIds !== undefined) fields.cityIds = body.cityIds || [];
  if (body.detailFields !== undefined) fields.detailFields = sanitizeDetailFields(body.detailFields).fields || [];
  // Display fields
  if (body.displayRating !== undefined) fields.displayRating = String(body.displayRating || '').trim();
  if (body.bookingsLabel !== undefined) fields.bookingsLabel = String(body.bookingsLabel || '').trim();
  if (body.etaDefaultMinutes !== undefined) {
    const n = Number(body.etaDefaultMinutes);
    fields.etaDefaultMinutes = Number.isFinite(n) ? n : null;
  }
  if (body.subCategoryBadge !== undefined) fields.subCategoryBadge = String(body.subCategoryBadge || '').trim();
  if (body.heroBanner !== undefined && body.heroBanner && typeof body.heroBanner === 'object') {
    fields.heroBanner = {
      tag: String(body.heroBanner.tag || '').trim(),
      title: String(body.heroBanner.title || '').trim(),
      startingPrice: String(body.heroBanner.startingPrice || '').trim(),
      imageUrl: String(body.heroBanner.imageUrl || '').trim()
    };
  }
  if (body.publishStatus !== undefined) {
    fields.publishStatus = body.publishStatus === 'draft' ? 'draft' : 'published';
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    fields.sortOrder = Number.isFinite(n) ? n : 0;
  }
  return fields;
};

/**
 * Create new category (top-level or sub-category).
 * POST /api/admin/categories
 */
const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const detailCheck = sanitizeDetailFields(req.body.detailFields);
    if (detailCheck.error) return res.status(400).json({ success: false, message: detailCheck.error });

    const fields = buildCategoryFields(req.body);
    fields.createdBy = req.user.id;

    // Parent / depth / cycle check.
    const parentErr = await validateParentId({ parentId: fields.parentId });
    if (parentErr) return res.status(400).json({ success: false, message: parentErr });

    // Sub-category slug namespacing.
    if (fields.parentId) {
      const parent = await Category.findById(fields.parentId).select('slug').lean();
      const slugToCheck = fields.slug || toSlugSegment(fields.title || '');
      const check = validateSubCategorySlug(parent.slug, slugToCheck);
      if (!check.ok) {
        return res.status(400).json({
          success: false,
          message: subCategorySlugError(check.reason, { parentSlug: parent.slug }),
          reason: check.reason,
          suggestion: `${parent.slug}-${toSlugSegment(slugToCheck)}`
        });
      }
      fields.slug = slugToCheck;
    }

    // Duplicate slug check (global, matches the unique index).
    const slugToCheck = fields.slug || toSlugSegment(fields.title || '');
    const duplicate = await Category.findOne({ slug: slugToCheck }).select('_id').lean();
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'Category with this slug already exists' });
    }

    const category = await Category.create(fields);
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'create', entityType: 'category', entityId: category._id, after: category });
    res.status(201).json({ success: true, message: 'Category created successfully', category: toCategoryResponse(category) });
  } catch (error) {
    console.error('Create category error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category with this title or slug already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create category. Please try again.' });
  }
};

/**
 * Update category.
 * PUT /api/admin/categories/:id
 */
const updateCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    const before = category.toObject();

    const detailCheck = sanitizeDetailFields(req.body.detailFields);
    if (detailCheck.error) return res.status(400).json({ success: false, message: detailCheck.error });

    const fields = buildCategoryFields(req.body);

    // Parent change needs the cycle/depth check against the *new* parent.
    if (fields.parentId !== undefined) {
      const parentErr = await validateParentId({ categoryId: id, parentId: fields.parentId });
      if (parentErr) return res.status(400).json({ success: false, message: parentErr });

      // A category that currently has children cannot become a sub-category
      // itself (would make the children 3-level nested).
      if (fields.parentId) {
        const childCount = await Category.countDocuments({ parentId: id });
        if (childCount > 0) {
          return res.status(400).json({
            success: false,
            message: 'This category has sub-categories, so it cannot become a sub-category itself.'
          });
        }
      }
    }

    // Slug change requires global uniqueness; sub-cat slug requires namespacing.
    if (fields.slug !== undefined && fields.slug !== category.slug) {
      const effectiveParentId = fields.parentId !== undefined ? fields.parentId : category.parentId;
      if (effectiveParentId) {
        const parent = await Category.findById(effectiveParentId).select('slug').lean();
        const check = validateSubCategorySlug(parent.slug, fields.slug);
        if (!check.ok) {
          return res.status(400).json({
            success: false,
            message: subCategorySlugError(check.reason, { parentSlug: parent.slug }),
            reason: check.reason
          });
        }
      }
      const duplicate = await Category.findOne({ slug: fields.slug, _id: { $ne: id } }).select('_id').lean();
      if (duplicate) return res.status(400).json({ success: false, message: 'Slug is already in use.' });
    }

    Object.assign(category, fields);
    if (fields.cityIds !== undefined) category.markModified('cityIds');
    if (fields.heroBanner !== undefined) category.markModified('heroBanner');
    if (fields.detailFields !== undefined) category.markModified('detailFields');
    await category.save();
    // Professionals pick categories by title: keep them attached when the title changes
    if (before.title !== category.title) {
      await renameWorkerSkill(before.title, category.title)
        .catch((err) => console.error('[Category] Could not carry the new title to professionals:', err.message));
    }
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'update', entityType: 'category', entityId: category._id, before, after: category });

    res.status(200).json({ success: true, message: 'Category updated successfully', category: toCategoryResponse(category) });
  } catch (error) {
    console.error('Update category error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category with this title or slug already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to update category. Please try again.' });
  }
};

/**
 * Soft delete category.
 * DELETE /api/admin/categories/:id
 * Query: force=true to bypass the dependency check (admin override).
 * Returns 409 with the full dependency report when the category is still in use.
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    const report = await buildDependencyReport(id);
    if (report.hasDependencies && !force) {
      return res.status(409).json({
        success: false,
        message: 'Category is still in use and cannot be deleted. Review dependencies or deactivate instead.',
        dependencies: report
      });
    }

    const before = category.toObject();
    category.previousStatus = category.status || 'active';
    category.status = SERVICE_STATUS.DELETED;
    await category.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'delete', entityType: 'category', entityId: id, before, after: category, note: force ? 'force=true' : 'soft' });

    res.status(200).json({ success: true, message: 'Category soft-deleted successfully', dependencies: report });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category. Please try again.' });
  }
};

/**
 * Update single category order (legacy).
 * PATCH /api/admin/categories/:id/order
 */
const updateCategoryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { homeOrder } = req.body;
    if (homeOrder === undefined || isNaN(homeOrder)) {
      return res.status(400).json({ success: false, message: 'homeOrder is required and must be a number' });
    }
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    category.homeOrder = Number(homeOrder);
    await category.save();
    await invalidatePublicCatalogKeys();
    res.status(200).json({ success: true, message: 'Category order updated successfully', category: { id: category._id, title: category.title, homeOrder: category.homeOrder } });
  } catch (error) {
    console.error('Update category order error:', error);
    res.status(500).json({ success: false, message: 'Failed to update category order. Please try again.' });
  }
};

/**
 * Bulk reorder.
 * PATCH /api/admin/categories/reorder
 * body: { items: [{ id, homeOrder }] }
 */
const bulkReorderCategories = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ success: false, message: 'items[] is required' });
    const ops = items
      .filter(i => i && i.id)
      .map(i => ({ updateOne: { filter: { _id: i.id }, update: { $set: { homeOrder: Number(i.homeOrder) || 0 } } } }));
    if (ops.length === 0) return res.status(400).json({ success: false, message: 'No valid items supplied' });
    const result = await Category.bulkWrite(ops);
    await invalidatePublicCatalogKeys();
    res.status(200).json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk reorder categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder categories.' });
  }
};

/**
 * Bulk status change.
 * PATCH /api/admin/categories/bulk-status
 * body: { ids: [], status: 'active'|'inactive'|'deleted' }
 */
const bulkCategoryStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'ids[] is required' });
    const allowed = ['active', 'inactive', 'deleted'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
    const result = await Category.updateMany({ _id: { $in: ids } }, { $set: { status } });
    await invalidatePublicCatalogKeys();
    writeAudit({
      adminId: req.user.id, action: 'bulk-status', entityType: 'category',
      entityId: ids[0], after: { status, ids },
      note: `bulk-status->${status}, ${ids.length} ids`
    });
    res.status(200).json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk category status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update categories.' });
  }
};

/**
 * Archive a category (soft delete). Honours the dependency check unless
 * ?force=true. Snapshots the current status in `previousStatus`. Idempotent.
 * POST /api/admin/categories/:id/archive
 */
const archiveCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    if (category.status === SERVICE_STATUS.DELETED) {
      return res.status(200).json({ success: true, message: 'Category is already archived', category: toCategoryResponse(category) });
    }

    const report = await buildDependencyReport(id);
    if (report.hasDependencies && !force) {
      return res.status(409).json({ success: false, message: 'Category is still in use. Review dependencies or pass ?force=true.', dependencies: report });
    }

    const before = category.toObject();
    category.previousStatus = category.status || 'active';
    category.status = SERVICE_STATUS.DELETED;
    await category.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'archive', entityType: 'category', entityId: id, before, after: category, note: force ? 'force=true' : 'soft' });
    res.status(200).json({ success: true, message: 'Category archived', category: toCategoryResponse(category), dependencies: report });
  } catch (error) {
    console.error('Archive category error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive category.' });
  }
};

/**
 * Restore an archived category to its previous status.
 * POST /api/admin/categories/:id/restore
 */
const restoreCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    if (category.status !== SERVICE_STATUS.DELETED) {
      return res.status(200).json({ success: true, message: 'Category is not archived', category: toCategoryResponse(category) });
    }
    const before = category.toObject();
    category.status = category.previousStatus || 'active';
    category.previousStatus = null;
    await category.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'restore', entityType: 'category', entityId: id, before, after: category });
    res.status(200).json({ success: true, message: 'Category restored', category: toCategoryResponse(category) });
  } catch (error) {
    console.error('Restore category error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore category.' });
  }
};

module.exports = {
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
  restoreCategory,
  validateParentId,
  buildDependencyReport
};
