const Service = require('../../models/UserService');
const Brand = require('../../models/Brand');
const Category = require('../../models/Category');
const Booking = require('../../models/Booking');
const Cart = require('../../models/Cart');
const Coupon = require('../../models/Coupon');
const HomeContent = require('../../models/HomeContent');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS, WORKER_STATUS } = require('../../utils/constants');
const { buildServiceContent } = require('../../utils/serviceContent');
const { validatePricingFields } = require('../../utils/servicePricing');
const { invalidatePublicCatalogKeys } = require('../../utils/catalogCache');
const { writeAudit } = require('../../utils/auditLog');
const Worker = require('../../models/Worker');
const { buildServiceCityMatch } = require('../../utils/cityScope');
const { renameWorkerSkill } = require('../../utils/workerSkills');


/**
 * Pipeline stages that count the approved, active professionals who can take a service.
 *
 * Needs `$title` (the service) and `$category` already on the document. A professional lists
 * skills by title (Worker.service / Worker.categories, a mix of services, categories and
 * sub-categories), and booking dispatch matches them case-insensitively against the service,
 * its category and the parent category, so this does exactly the same - otherwise the admin
 * would show 0 for professionals who really do receive these bookings.
 * Adds `workersMapped`.
 */
const workersMappedStages = () => ([
  {
    $lookup: {
      from: 'categories',
      localField: 'category.parentId',
      foreignField: '_id',
      as: 'parentCategory'
    }
  },
  { $unwind: { path: '$parentCategory', preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      _skillNames: {
        $filter: {
          input: [
            { $toLower: { $trim: { input: { $toString: { $ifNull: ['$title', ''] } } } } },
            { $toLower: { $trim: { input: { $toString: { $ifNull: ['$category.title', ''] } } } } },
            { $toLower: { $trim: { input: { $toString: { $ifNull: ['$parentCategory.title', ''] } } } } }
          ],
          as: 'n',
          cond: { $ne: ['$$n', ''] }
        }
      }
    }
  },
  {
    $lookup: {
      // The Worker model is stored in the 'vendors' collection (kept from before the rename)
      from: Worker.collection.name,
      let: { names: '$_skillNames' },
      pipeline: [
        // Stored as lower-case 'approved' (WORKER_STATUS); an older upper-case value is tolerated
        { $match: { isActive: true, approvalStatus: { $in: [WORKER_STATUS.APPROVED, 'APPROVED'] } } },
        {
          $match: {
            $expr: {
              $gt: [
                {
                  $size: {
                    $setIntersection: [
                      '$$names',
                      {
                        $map: {
                          input: {
                            $concatArrays: [
                              { $cond: [{ $isArray: '$service' }, '$service', []] },
                              { $cond: [{ $isArray: '$categories' }, '$categories', []] }
                            ]
                          },
                          as: 's',
                          in: { $toLower: { $trim: { input: { $toString: '$$s' } } } }
                        }
                      }
                    ]
                  }
                },
                0
              ]
            }
          }
        },
        { $count: 'n' }
      ],
      as: 'workersStats'
    }
  }
]);

const PRICING_ENUM = ['fixed', 'hourly', 'starting_from', 'inspection_fee', 'quote_required'];

/**
 * Pricing fields helper (unchanged from the pre-Phase-2 controller).
 */
const buildPricingFields = (body) => {
  const pricingType = body.pricingType || 'fixed';
  const fields = { pricingType };

  if (pricingType === 'hourly') {
    fields.hourlyRate = body.hourlyRate !== undefined ? Number(body.hourlyRate) : Number(body.basePrice) || 0;
    fields.minHours = body.minHours !== undefined ? Number(body.minHours) : 1;
    fields.maxHours = body.maxHours !== undefined ? Number(body.maxHours) : 8;
  } else {
    fields.hourlyRate = null;
  }

  if (pricingType === 'inspection_fee') {
    fields.inspectionFee = Number(body.inspectionFee) || 0;
  } else {
    fields.inspectionFee = null;
  }

  fields.quoteContactNote = pricingType === 'quote_required' ? String(body.quoteContactNote || '').trim() : '';
  return fields;
};

/**
 * Build Phase-1 display + variants fields from the admin payload. Every key
 * is optional; only present ones are applied so partial updates work as expected.
 */
const buildDisplayFields = (body) => {
  const out = {};
  if (body.originalPrice !== undefined) {
    const n = Number(body.originalPrice);
    out.originalPrice = Number.isFinite(n) ? n : null;
  }
  if (body.discountLabel !== undefined) out.discountLabel = String(body.discountLabel || '').trim();
  if (body.durationMinutes !== undefined) {
    const n = Number(body.durationMinutes);
    out.durationMinutes = Number.isFinite(n) ? n : null;
  }
  if (body.displayRating !== undefined) out.displayRating = String(body.displayRating || '').trim();
  if (body.reviewsLabel !== undefined) out.reviewsLabel = String(body.reviewsLabel || '').trim();
  if (body.isPackage !== undefined) out.isPackage = Boolean(body.isPackage);
  if (body.images !== undefined) {
    out.images = Array.isArray(body.images) ? body.images.filter(Boolean).map(String) : [];
  }
  if (body.publishStatus !== undefined) {
    out.publishStatus = body.publishStatus === 'draft' ? 'draft' : 'published';
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    out.sortOrder = Number.isFinite(n) ? n : 0;
  }
  return out;
};

/**
 * Validate + normalise variants[]. Rules:
 *   - price >= 0
 *   - no duplicate titles
 *   - at least one active variant if any exist
 *   - pricingType must be in PRICING_ENUM (same as parent service)
 * Returns { ok, variants, error }.
 */
const normaliseVariants = (raw) => {
  if (raw === undefined) return { ok: true, variants: undefined };          // no change
  if (raw === null)      return { ok: true, variants: [] };                 // clear all
  if (!Array.isArray(raw)) return { ok: false, error: 'variants must be an array' };
  if (raw.length === 0) return { ok: true, variants: [] };

  const seen = new Set();
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i] || {};
    const title = String(v.title || '').trim();
    const price = Number(v.price);
    if (!title) return { ok: false, error: `variant[${i}].title is required` };
    const key = title.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `Duplicate variant title: "${title}"` };
    seen.add(key);
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: `variant[${i}].price must be >= 0` };

    const pricingType = v.pricingType || 'fixed';
    if (!PRICING_ENUM.includes(pricingType)) {
      return { ok: false, error: `variant[${i}].pricingType must be one of: ${PRICING_ENUM.join(', ')}` };
    }

    out.push({
      ...(v._id ? { _id: v._id } : {}),
      title,
      price,
      originalPrice: v.originalPrice !== undefined && v.originalPrice !== null && v.originalPrice !== '' ? Number(v.originalPrice) : null,
      durationMinutes: v.durationMinutes !== undefined && v.durationMinutes !== null && v.durationMinutes !== '' ? Number(v.durationMinutes) : null,
      pricingType,
      inclusions: Array.isArray(v.inclusions) ? v.inclusions.map(s => String(s)).filter(Boolean) : [],
      imageUrl: String(v.imageUrl || '').trim(),
      isActive: v.isActive === undefined ? true : Boolean(v.isActive),
      order: Number(v.order) || 0
    });
  }

  const anyActive = out.some(v => v.isActive);
  if (!anyActive) return { ok: false, error: 'At least one variant must be active' };

  return { ok: true, variants: out };
};

const toServiceResponse = (svc) => {
  const obj = typeof svc.toObject === 'function' ? svc.toObject() : svc;
  return obj;
};

// ============================================================================
// LIST / READ
// ============================================================================

/**
 * Get all services. Supports filters: status, brandId, categoryId, cityId
 * (via brand lookup), search (title substring), pagination (page, limit).
 */
const getAllServices = async (req, res) => {
  try {
    const { status, brandId, categoryId, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const query = {};
    if (status) query.status = status;
    if (brandId) query.brandId = brandId;
    if (categoryId) query.categoryId = categoryId;
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.title = { $regex: safe, $options: 'i' };
    }

    const [services, total] = await Promise.all([
      Service.find(query)
        .populate('brandId', 'title')
        .populate('categoryId', 'title')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Service.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      count: services.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      services
    });
  } catch (error) {
    console.error('Get all services error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch services' });
  }
};

/**
 * Get single service.
 */
const getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('brandId', 'title')
      .populate('categoryId', 'title');
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.status(200).json({ success: true, service: toServiceResponse(service) });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch service' });
  }
};

/**
 * Dependency report for a service — used by soft-delete + the admin UI
 * before showing a delete confirmation.
 * GET /api/admin/services/:id/dependencies
 */
const getServiceDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const svc = await Service.findById(id).select('_id title').lean();
    if (!svc) return res.status(404).json({ success: false, message: 'Service not found' });

    const [activeBookings, activeCarts, couponRefs, homeContentRefs] = await Promise.all([
      Booking.countDocuments({ serviceId: id, status: { $nin: ['completed', 'cancelled', 'rejected'] } }).catch(() => 0),
      Cart.countDocuments({ 'items.serviceId': id }).catch(() => 0),
      Coupon.countDocuments({ services: id, isActive: true }).catch(() => 0),
      HomeContent.countDocuments({
        $or: [
          { 'banners.targetServiceId': id },
          { 'promos.targetServiceId': id },
          { 'noteworthy.targetServiceId': id },
          { 'booked.targetServiceId': id },
          { 'spotlight.targetServiceId': id },
          { 'categorySections.seeAllTargetServiceId': id },
          { 'categorySections.cards.targetServiceId': id }
        ]
      }).catch(() => 0)
    ]);

    const hasDependencies = (activeBookings + activeCarts + couponRefs + homeContentRefs) > 0;
    res.status(200).json({
      success: true, serviceId: id, title: svc.title,
      hasDependencies, activeBookings, activeCarts, coupons: couponRefs, homeContentReferences: homeContentRefs
    });
  } catch (error) {
    console.error('Service dependencies error:', error);
    res.status(500).json({ success: false, message: 'Failed to build dependency report.' });
  }
};

// ============================================================================
// WRITE
// ============================================================================

/**
 * Create new service.
 * POST /api/admin/services
 */
const createService = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const {
      brandId, categoryId, title, basePrice, gstPercentage,
      description, status, iconUrl
    } = req.body;

    const pricingCheck = validatePricingFields(req.body);
    if (pricingCheck.error) return res.status(400).json({ success: false, message: pricingCheck.error });

    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });

    const variantCheck = normaliseVariants(req.body.variants);
    if (!variantCheck.ok) return res.status(400).json({ success: false, message: variantCheck.error });

    // Warn (don't block) when originalPrice < price. The UI should surface this.
    const warnings = [];
    const op = Number(req.body.originalPrice);
    if (Number.isFinite(op) && op > 0 && op < Number(basePrice)) {
      warnings.push('originalPrice is less than basePrice — nothing will be struck through.');
    }

    // Inherit cityIds from category if blank
    let effectiveCityIds = Array.isArray(req.body.cityIds) && req.body.cityIds.length > 0 ? req.body.cityIds : undefined;
    if (!effectiveCityIds && categoryId) {
      const catDoc = await Category.findById(categoryId).select('cityIds').lean();
      if (catDoc && Array.isArray(catDoc.cityIds) && catDoc.cityIds.length > 0) {
        effectiveCityIds = catDoc.cityIds;
      }
    }

    const service = await Service.create({
      brandId,
      categoryId,
      title,
      basePrice,
      gstPercentage: gstPercentage || 18,
      description,
      status: status || SERVICE_STATUS.ACTIVE,
      iconUrl,
      ...(effectiveCityIds ? { cityIds: effectiveCityIds } : {}),
      ...buildPricingFields(req.body),
      ...buildServiceContent(req.body),
      ...buildDisplayFields(req.body),
      ...(variantCheck.variants !== undefined ? { variants: variantCheck.variants } : {})
    });

    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'create', entityType: 'service', entityId: service._id, after: service });
    res.status(201).json({ success: true, message: 'Service created successfully', service, warnings });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.slug) {
      return res.status(409).json({ success: false, message: 'A service with this name already exists for this brand.' });
    }
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Failed to create service' });
  }
};

/**
 * Update service.
 */
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    const before = service.toObject();

    if (updates.brandId) {
      const brand = await Brand.findById(updates.brandId);
      if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    if (updates.title) service.title = updates.title;
    if (updates.categoryId) service.categoryId = updates.categoryId;
    if (updates.basePrice !== undefined) service.basePrice = updates.basePrice;
    if (updates.gstPercentage !== undefined) service.gstPercentage = updates.gstPercentage;
    if (updates.description !== undefined) service.description = updates.description;
    if (updates.status) service.status = updates.status;
    if (updates.iconUrl !== undefined) service.iconUrl = updates.iconUrl;
    if (updates.brandId) service.brandId = updates.brandId;
    if (updates.cityIds !== undefined) service.cityIds = updates.cityIds;

    if (updates.pricingType !== undefined) {
      const pricingCheck = validatePricingFields({ ...service.toObject(), ...updates });
      if (pricingCheck.error) return res.status(400).json({ success: false, message: pricingCheck.error });
      Object.assign(service, buildPricingFields({ ...service.toObject(), ...updates }));
    } else if (['hourlyRate', 'minHours', 'maxHours', 'inspectionFee', 'quoteContactNote'].some((k) => updates[k] !== undefined)) {
      const pricingCheck = validatePricingFields({ pricingType: service.pricingType, ...updates });
      if (pricingCheck.error) return res.status(400).json({ success: false, message: pricingCheck.error });
      if (updates.hourlyRate !== undefined) service.hourlyRate = Number(updates.hourlyRate);
      if (updates.minHours !== undefined) service.minHours = Number(updates.minHours);
      if (updates.maxHours !== undefined) service.maxHours = Number(updates.maxHours);
      if (updates.inspectionFee !== undefined) service.inspectionFee = Number(updates.inspectionFee);
      if (updates.quoteContactNote !== undefined) service.quoteContactNote = String(updates.quoteContactNote).trim();
    }

    // Service detail content (inclusions/exclusions/faqs/warranty/cancellation).
    Object.assign(service, buildServiceContent(updates));

    // Display fields.
    const display = buildDisplayFields(updates);
    Object.assign(service, display);

    // Variants (full replacement, with validation).
    if (updates.variants !== undefined) {
      const variantCheck = normaliseVariants(updates.variants);
      if (!variantCheck.ok) return res.status(400).json({ success: false, message: variantCheck.error });
      service.variants = variantCheck.variants;
      service.markModified('variants');
    }

    const warnings = [];
    const effectivePrice = updates.basePrice !== undefined ? Number(updates.basePrice) : service.basePrice;
    const effectiveOriginal = display.originalPrice !== undefined ? display.originalPrice : service.originalPrice;
    if (Number.isFinite(effectiveOriginal) && effectiveOriginal > 0 && effectiveOriginal < effectivePrice) {
      warnings.push('originalPrice is less than basePrice — nothing will be struck through.');
    }

    await service.save();
    // Professionals pick services by title: keep them attached when the title changes
    if (before.title !== service.title) {
      await renameWorkerSkill(before.title, service.title)
        .catch((err) => console.error('[Service] Could not carry the new title to professionals:', err.message));
    }
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'update', entityType: 'service', entityId: service._id, before, after: service });
    res.status(200).json({ success: true, message: 'Service updated successfully', service, warnings });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.slug) {
      return res.status(409).json({ success: false, message: 'A service with this name already exists for this brand.' });
    }
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Failed to update service' });
  }
};

/**
 * Delete service.
 * DELETE /api/admin/services/:id
 * Query: force=true to hard-delete (bypasses dependency check).
 * Default: soft-delete (status=inactive) if deps exist AND there are active
 * bookings/carts, else hard delete.
 */
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';

    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    const before = service.toObject();

    if (force) {
      await service.deleteOne();
      await invalidatePublicCatalogKeys();
      writeAudit({ adminId: req.user.id, action: 'delete', entityType: 'service', entityId: id, before, note: 'force=true hard delete' });
      return res.status(200).json({ success: true, message: 'Service deleted permanently' });
    }

    // Build dep report inline (same shape as getServiceDependencies).
    const [activeBookings, activeCarts, couponRefs, homeContentRefs] = await Promise.all([
      Booking.countDocuments({ serviceId: id, status: { $nin: ['completed', 'cancelled', 'rejected'] } }).catch(() => 0),
      Cart.countDocuments({ 'items.serviceId': id }).catch(() => 0),
      Coupon.countDocuments({ services: id, isActive: true }).catch(() => 0),
      HomeContent.countDocuments({
        $or: [
          { 'banners.targetServiceId': id }, { 'promos.targetServiceId': id },
          { 'noteworthy.targetServiceId': id }, { 'booked.targetServiceId': id },
          { 'spotlight.targetServiceId': id }, { 'categorySections.seeAllTargetServiceId': id },
          { 'categorySections.cards.targetServiceId': id }
        ]
      }).catch(() => 0)
    ]);
    const hasDeps = (activeBookings + activeCarts + couponRefs + homeContentRefs) > 0;

    if (hasDeps) {
      // Soft delete only — flip to inactive so the record stays for history.
      service.status = SERVICE_STATUS.INACTIVE || 'inactive';
      await service.save();
      await invalidatePublicCatalogKeys();
      writeAudit({ adminId: req.user.id, action: 'delete', entityType: 'service', entityId: id, before, after: service, note: 'soft (deps present)' });
      return res.status(200).json({
        success: true,
        message: 'Service deactivated because dependencies exist. Use force=true to hard-delete (not recommended).',
        softDeleted: true,
        dependencies: { activeBookings, activeCarts, coupons: couponRefs, homeContentReferences: homeContentRefs }
      });
    }

    await service.deleteOne();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'delete', entityType: 'service', entityId: id, before });
    res.status(200).json({ success: true, message: 'Service deleted permanently' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete service' });
  }
};

/**
 * Duplicate a service.
 * POST /api/admin/services/:id/duplicate
 * Creates a new UserService in the SAME brand with " (Copy)" appended to the
 * title. Variants, inclusions, FAQs, images and all display fields are copied;
 * status defaults to inactive so the admin reviews before publishing.
 */
const duplicateService = async (req, res) => {
  try {
    const { id } = req.params;
    const source = await Service.findById(id).lean();
    if (!source) return res.status(404).json({ success: false, message: 'Service not found' });

    const copy = { ...source };
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.__v;
    copy.title = `${source.title} (Copy)`;
    copy.status = 'inactive';
    // Re-create ids for variant sub-docs so Mongoose assigns fresh ones.
    if (Array.isArray(copy.variants)) {
      copy.variants = copy.variants.map(v => {
        const nv = { ...v };
        delete nv._id;
        return nv;
      });
    }

    const created = await Service.create(copy);
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'duplicate', entityType: 'service', entityId: created._id, after: created, note: `source=${id}` });
    res.status(201).json({ success: true, message: 'Service duplicated', service: created });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate failed because of a unique field clash. Try renaming.' });
    }
    console.error('Duplicate service error:', error);
    res.status(500).json({ success: false, message: 'Failed to duplicate service' });
  }
};

/**
 * Bulk status change.
 * PATCH /api/admin/services/bulk-status
 * body: { ids: [], status: 'active'|'inactive'|'deleted' }
 */
const bulkServiceStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'ids[] is required' });
    const allowed = ['active', 'inactive', 'deleted'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
    const result = await Service.updateMany({ _id: { $in: ids } }, { $set: { status } });
    await invalidatePublicCatalogKeys();
    writeAudit({
      adminId: req.user.id, action: 'bulk-status', entityType: 'service',
      entityId: ids[0], after: { status, ids },
      note: `bulk-status->${status}, ${ids.length} ids`
    });
    res.status(200).json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk service status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update services.' });
  }
};

/**
 * Archive a service (soft delete). Snapshots the current status in
 * `previousStatus` so restore returns to the original state. Idempotent:
 * calling archive on an already-archived row updates nothing.
 * POST /api/admin/services/:id/archive
 */
const archiveService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    if (service.status === SERVICE_STATUS.DELETED) {
      return res.status(200).json({ success: true, message: 'Service is already archived', service });
    }
    const before = service.toObject();
    service.previousStatus = service.status || 'active';
    service.status = SERVICE_STATUS.DELETED;
    await service.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'archive', entityType: 'service', entityId: id, before, after: service });
    res.status(200).json({ success: true, message: 'Service archived', service });
  } catch (error) {
    console.error('Archive service error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive service' });
  }
};

/**
 * Restore an archived service to its previous status (fallback: 'active').
 * POST /api/admin/services/:id/restore
 */
const restoreService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    if (service.status !== SERVICE_STATUS.DELETED) {
      return res.status(200).json({ success: true, message: 'Service is not archived', service });
    }
    const before = service.toObject();
    service.status = service.previousStatus || 'active';
    service.previousStatus = null;
    await service.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'restore', entityType: 'service', entityId: id, before, after: service });
    res.status(200).json({ success: true, message: 'Service restored', service });
  } catch (error) {
    console.error('Restore service error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore service' });
  }
};

/**
 * Bulk move services between a (brand, category) pair.
 * PATCH /api/admin/services/bulk-move
 * body: { ids: [...], brandId, categoryId? }
 */
const bulkMoveServices = async (req, res) => {
  try {
    const { ids, brandId, categoryId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'ids[] is required' });
    if (!brandId) return res.status(400).json({ success: false, message: 'brandId is required' });

    const brand = await Brand.findById(brandId);
    if (!brand) return res.status(404).json({ success: false, message: 'Target brand not found' });

    const update = { brandId };
    if (categoryId) {
      const cat = await Category.findById(categoryId).select('_id').lean();
      if (!cat) return res.status(404).json({ success: false, message: 'Target category not found' });
      update.categoryId = categoryId;
    }

    const result = await Service.updateMany({ _id: { $in: ids } }, { $set: update });
    await invalidatePublicCatalogKeys();
    writeAudit({
      adminId: req.user.id, action: 'move', entityType: 'service',
      entityId: ids[0], after: update,
      note: `bulk-move brandId=${brandId}${categoryId ? ' categoryId=' + categoryId : ''}, ${ids.length} ids`
    });
    res.status(200).json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk move services error:', error);
    res.status(500).json({ success: false, message: 'Failed to move services.' });
  }
};

/**
 * Enriched admin list: adds workersMapped and bookingsLast30Days per service
 * via a single aggregation (no N+1). The caller can still filter + paginate
 * the same way as GET /services; this endpoint exists so the admin table can
 * render those two columns without a per-row fetch.
 *
 * NOTE on workersMapped: workers store their offered categories as `Worker.service: [String]`
 * and `Worker.categories: [String]` (titles, not ids). We join on category title.
 * See the Phase-2b report ("How workers pick up new categories") for details.
 *
 * GET /api/admin/services/with-stats
 */
const listServicesWithStats = async (req, res) => {
  try {
    const { status, brandId, categoryId, search, publishStatus, cityId } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const match = {};
    // Archived ("deleted") services only show when asked for; the health cards leave them out too, so
    // the list and the cards count the same thing. They live under Draft and archive.
    match.status = status || { $ne: SERVICE_STATUS.DELETED };
    if (brandId) match.brandId = new (require('mongoose').Types.ObjectId)(brandId);
    if (categoryId) match.categoryId = new (require('mongoose').Types.ObjectId)(categoryId);
    if (publishStatus) match.publishStatus = publishStatus;
    if (search) {
      const safe = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      match.title = { $regex: safe, $options: 'i' };
    }

    // City filter: same rule the customer app uses (a service is in a city when its category or
    // brand lists it, or both are open to every city)
    const cityMatch = await buildServiceCityMatch(cityId);
    const finalMatch = cityMatch ? { $and: [match, cityMatch] } : match;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: finalMatch },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
      ...workersMappedStages(),
      {
        $lookup: {
          from: 'bookings',
          let: { sid: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$serviceId', '$$sid'] }, createdAt: { $gte: since } } },
            { $count: 'n' }
          ],
          as: 'bookingStats'
        }
      },
      {
        $addFields: {
          workersMapped: { $ifNull: [{ $arrayElemAt: ['$workersStats.n', 0] }, 0] },
          bookingsLast30Days: { $ifNull: [{ $arrayElemAt: ['$bookingStats.n', 0] }, 0] }
        }
      },
      { $project: { workersStats: 0, bookingStats: 0, parentCategory: 0, _skillNames: 0 } }
    ];

    const [services, total] = await Promise.all([
      Service.aggregate(pipeline),
      Service.countDocuments(finalMatch)
    ]);

    res.status(200).json({
      success: true, count: services.length, total,
      page, pages: Math.ceil(total / limit),
      services
    });
  } catch (error) {
    console.error('List services with stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch services.' });
  }
};

/**
 * Dashboard health endpoint.
 * GET /api/admin/catalog/health
 * Aggregation-based computation of catalog metrics and services needing attention (no N+1).
 */
const getCatalogHealth = async (req, res) => {
  try {
    // Scoped to one city when asked, so the cards agree with the list under them
    const cityMatch = await buildServiceCityMatch(req.query.cityId);
    const baseMatch = { status: { $ne: SERVICE_STATUS.DELETED } };

    const pipeline = [
      // Only evaluate non-deleted services
      { $match: cityMatch ? { $and: [baseMatch, cityMatch] } : baseMatch },
      {
        $lookup: {
          from: 'brands',
          localField: 'brandId',
          foreignField: '_id',
          as: 'brand'
        }
      },
      { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categories',
          let: { catId: { $ifNull: ['$categoryId', '$brand.categoryId'] } },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$catId'] } } }
          ],
          as: 'category'
        }
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      ...workersMappedStages(),
      {
        $addFields: {
          workersMapped: { $ifNull: [{ $arrayElemAt: ['$workersStats.n', 0] }, 0] },
          hasImage: {
            $or: [
              {
                $and: [
                  { $ne: [{ $ifNull: ['$iconUrl', ''] }, ''] },
                  { $ne: ['$iconUrl', null] }
                ]
              },
              {
                $gt: [{ $size: { $ifNull: ['$images', []] } }, 0]
              }
            ]
          },
          hasValidPrice: {
            $or: [
              { $eq: ['$pricingType', 'quote_required'] },
              {
                $and: [
                  { $ne: ['$basePrice', null] },
                  { $gt: ['$basePrice', 0] }
                ]
              }
            ]
          },
          hasValidGst: {
            $and: [
              { $ne: ['$gstPercentage', null] },
              { $gt: ['$gstPercentage', 0] }
            ]
          },
          isParentCategoryActive: {
            $and: [
              { $ne: [{ $ifNull: ['$category', null] }, null] },
              { $eq: ['$category.status', 'active'] }
            ]
          }
        }
      },
      {
        $addFields: {
          reasons: {
            $concatArrays: [
              { $cond: [{ $eq: ['$workersMapped', 0] }, ['no-workers-mapped'], []] },
              { $cond: [{ $eq: ['$hasImage', false] }, ['missing-image'], []] },
              { $cond: [{ $eq: ['$hasValidPrice', false] }, ['missing-price'], []] },
              { $cond: [{ $eq: ['$hasValidGst', false] }, ['missing-gst'], []] },
              { $cond: [{ $eq: ['$isParentCategoryActive', false] }, ['inactive-parent-category'], []] }
            ]
          }
        }
      },
      {
        $facet: {
          totalServices: [{ $count: 'count' }],
          activeServices: [
            { $match: { status: 'active' } },
            { $count: 'count' }
          ],
          draftServices: [
            { $match: { publishStatus: 'draft' } },
            { $count: 'count' }
          ],
          needsAttention: [
            { $match: { $expr: { $gt: [{ $size: '$reasons' }, 0] } } },
            {
              $project: {
                _id: 0,
                serviceId: '$_id',
                title: '$title',
                reasons: '$reasons'
              }
            }
          ]
        }
      }
    ];

    const [result] = await Service.aggregate(pipeline);
    const totalServices = result?.totalServices?.[0]?.count || 0;
    const activeServices = result?.activeServices?.[0]?.count || 0;
    const draftServices = result?.draftServices?.[0]?.count || 0;
    const needsAttention = result?.needsAttention || [];
    const needsAttentionServices = needsAttention.length;

    res.status(200).json({
      success: true,
      totals: {
        totalServices,
        activeServices,
        draftServices,
        needsAttentionServices
      },
      totalServices,
      activeServices,
      draftServices,
      needsAttentionServices,
      needsAttention
    });
  } catch (error) {
    console.error('Get catalog health error:', error);
    res.status(500).json({ success: false, message: 'Failed to compute catalog health.' });
  }
};

module.exports = {
  getAllServices,
  getServiceById,
  getServiceDependencies,
  createService,
  updateService,
  deleteService,
  duplicateService,
  bulkServiceStatus,
  archiveService,
  restoreService,
  bulkMoveServices,
  listServicesWithStats,
  getCatalogHealth,
  normaliseVariants
};
