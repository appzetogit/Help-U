const Brand = require('../../models/Brand');
const { cityScopeQuery } = require('../../utils/cityScope');
const Category = require('../../models/Category');
const UserService = require('../../models/UserService');
const Booking = require('../../models/Booking');
const Cart = require('../../models/Cart');
const Coupon = require('../../models/Coupon');
const HomeContent = require('../../models/HomeContent');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS } = require('../../utils/constants');
const { invalidatePublicCatalogKeys } = require('../../utils/catalogCache');
const { writeAudit } = require('../../utils/auditLog');

/**
 * Get all brands
 * GET /api/admin/brands
 */
const getAllBrands = async (req, res) => {
  try {
    const { status, categoryId, cityId } = req.query;

    // Build query
    const query = {};
    if (status) query.status = status;
    if (categoryId) query.categoryIds = categoryId;
    // Brands open to every city (empty cityIds) belong to each city, as in the customer app
    if (cityId) Object.assign(query, cityScopeQuery(cityId));

    const brands = await Brand.find(query)
      // .populate('categoryIds', 'title slug')
      .select('-__v')
      .sort({ createdAt: -1 })
      .lean();

    // Helper function to clean MongoDB _id fields from nested objects
    const cleanMongoIds = (obj) => {
      if (!obj) return obj;
      if (Array.isArray(obj)) {
        return obj.map(item => cleanMongoIds(item));
      }
      if (typeof obj === 'object' && obj !== null) {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === '_id') continue; // Skip _id fields
          cleaned[key] = cleanMongoIds(value);
        }
        return cleaned;
      }
      return obj;
    };

    res.status(200).json({
      success: true,
      count: brands.length,
      brands: brands.map(brand => {
        // Ensure categoryIds is an array of populated objects (or at least handle if populated correctly)
        // If populate worked, cat will be an object. If not, it might be an ID string/OID.

        const validCats = (Array.isArray(brand.categoryIds) ? brand.categoryIds : []).filter(c => c);

        const catIds = validCats.map(cat => {
          if (cat._id) return cat._id.toString();
          if (typeof cat === 'string') return cat;
          if (cat.toString) return cat.toString();
          return null;
        }).filter(Boolean);

        const catTitles = validCats.map(cat => {
          if (cat.title) return cat.title;
          return null;
        }).filter(Boolean);

        return {
          id: brand._id.toString(),
          title: brand.title,
          slug: brand.slug,
          cityIds: brand.cityIds || [],
          categoryIds: catIds,
          categoryTitles: catTitles,
          categoryId: catIds[0] || null, // fallback to first ID
          categoryTitle: catTitles[0] || null,
          iconUrl: brand.iconUrl,
          badge: brand.badge,
          routePath: brand.routePath,
          status: brand.status,
          isPopular: brand.isPopular,
          isFeatured: brand.isFeatured,
          rating: brand.rating,
          totalBookings: brand.totalBookings,
          displayOrder: brand.displayOrder || 0,
          bannerPromo: brand.bannerPromo || { title: '', subtitle: '', originalPrice: null, imageUrl: '' },
          page: cleanMongoIds(brand.page) || {},
          sections: cleanMongoIds(brand.sections) || [],
          createdAt: brand.createdAt,
          updatedAt: brand.updatedAt
        };
      })
    });
  } catch (error) {
    console.error('Get all brands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands. Please try again.'
    });
  }
};

/**
 * Get single brand by ID
 * GET /api/admin/brands/:id
 */
const getBrandById = async (req, res) => {
  try {
    const { id } = req.params;

    const brand = await Brand.findById(id)
      .populate('categoryIds', 'title slug')
      .select('-__v')
      .lean();

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Helper function to clean MongoDB _id fields from nested objects
    const cleanMongoIds = (obj) => {
      if (!obj) return obj;
      if (Array.isArray(obj)) {
        return obj.map(item => cleanMongoIds(item));
      }
      if (typeof obj === 'object' && obj !== null) {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === '_id') continue; // Skip _id fields
          cleaned[key] = cleanMongoIds(value);
        }
        return cleaned;
      }
      return obj;
    };

    res.status(200).json({
      success: true,
      brand: {
        id: brand._id.toString(),
        title: brand.title,
        slug: brand.slug,
        cityIds: brand.cityIds || [],
        categoryIds: (brand.categoryIds || []).map(cat => cat._id?.toString() || cat.toString()),
        categoryTitles: (brand.categoryIds || []).map(cat => cat.title).filter(Boolean),
        categoryId: brand.categoryIds?.[0]?._id?.toString() || brand.categoryIds?.[0]?.toString(),
        categoryTitle: brand.categoryIds?.[0]?.title || null,
        iconUrl: brand.iconUrl,
        badge: brand.badge,
        routePath: brand.routePath,
        status: brand.status,
        isPopular: brand.isPopular,
        isFeatured: brand.isFeatured,
        rating: brand.rating,
        totalBookings: brand.totalBookings,
        displayOrder: brand.displayOrder || 0,
        bannerPromo: brand.bannerPromo || { title: '', subtitle: '', originalPrice: null, imageUrl: '' },
        page: cleanMongoIds(brand.page) || {},
        sections: cleanMongoIds(brand.sections) || [],
        createdAt: brand.createdAt,
        updatedAt: brand.updatedAt
      }
    });
  } catch (error) {
    console.error('Get brand by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brand. Please try again.'
    });
  }
};

/**
 * Create new brand
 * POST /api/admin/brands
 */
const createBrand = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      title,
      slug,
      categoryId, // backward compatibility
      categoryIds: providedCategoryIds, // array
      iconUrl,
      logo,
      badge,
      basePrice,
      discountPrice,
      page,
      sections,
      cityIds,
      bannerPromo,
      displayOrder
    } = req.body;

    // Validate cities if provided
    if (cityIds && cityIds.length > 0) {
      // Logic to validate cities could be added here
      // For now we trust the ID list or rely on frontend
    }

    // Determine final category IDs
    const categoryIds = providedCategoryIds || (categoryId ? [categoryId] : []);

    if (categoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one category'
      });
    }

    // Validate categories exist
    const categoriesCount = await Category.countDocuments({ _id: { $in: categoryIds } });
    if (categoriesCount !== categoryIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more categories not found'
      });
    }

    // Check if brand with same title or slug exists
    const existingBrand = await Brand.findOne({
      $or: [
        { title: title.trim() },
        { slug: slug?.trim().toLowerCase() }
      ]
    });

    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: 'Brand with this title or slug already exists'
      });
    }

    // Helper to sanitize targetCategoryId
    const sanitizeId = (id) => id === '' ? null : id;

    const sanitizedPage = page ? { ...page } : {
      banners: [],
      ratingTitle: title.trim(),
      ratingValue: '',
      bookingsText: '',
      paymentOffersEnabled: true,
      paymentOffers: [],
      serviceCategoriesGrid: []
    };

    if (sanitizedPage.serviceCategoriesGrid) {
      sanitizedPage.serviceCategoriesGrid = sanitizedPage.serviceCategoriesGrid.map(item => ({
        ...item,
        targetCategoryId: sanitizeId(item.targetCategoryId)
      }));
    }

    const sanitizedSections = (sections || []).map(section => {
      const newSection = { ...section };
      if (Array.isArray(newSection.cards)) {
        newSection.cards = newSection.cards.map(card => ({
          ...card,
          targetCategoryId: sanitizeId(card.targetCategoryId)
        }));
      }
      return newSection;
    });

    const brand = await Brand.create({
      title: title.trim(),
      slug: slug?.trim().toLowerCase() || undefined,
      categoryIds: categoryIds,
      iconUrl: iconUrl || null,
      badge: badge?.trim() || null,
      routePath: `/user/brand/${slug?.trim().toLowerCase() || title.trim().toLowerCase().replace(/\s+/g, '-')}`,
      page: sanitizedPage,
      sections: sanitizedSections,
      cityIds: cityIds || [],
      displayOrder: Number(displayOrder) || 0,
      bannerPromo: bannerPromo ? {
        title: String(bannerPromo.title || '').trim(),
        subtitle: String(bannerPromo.subtitle || '').trim(),
        originalPrice: bannerPromo.originalPrice !== undefined && bannerPromo.originalPrice !== null && bannerPromo.originalPrice !== '' ? Number(bannerPromo.originalPrice) : null,
        imageUrl: String(bannerPromo.imageUrl || '').trim()
      } : undefined,
      status: SERVICE_STATUS.ACTIVE,
      createdBy: req.user.id
    });

    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'create', entityType: 'brand', entityId: brand._id, after: brand });
    res.status(201).json({
      success: true,
      message: 'Brand created successfully',
      brand: {
        id: brand._id,
        title: brand.title,
        slug: brand.slug,
        categoryIds: brand.categoryIds.map(c => c.toString()),
        iconUrl: brand.iconUrl,
        logo: brand.logo,
        badge: brand.badge,
        routePath: brand.routePath,
        displayOrder: brand.displayOrder || 0,
        bannerPromo: brand.bannerPromo || { title: '', subtitle: '', originalPrice: null, imageUrl: '' },
        page: brand.page,
        sections: brand.sections,
        createdAt: brand.createdAt,
        updatedAt: brand.updatedAt
      }
    });
  } catch (error) {
    console.error('Create brand error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Brand with this title or slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create brand. Please try again.'
    });
  }
};

/**
 * Update brand
 * PUT /api/admin/brands/:id
 */
const updateBrand = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const {
      title,
      slug,
      categoryId, // backward compatibility
      categoryIds: providedCategoryIds, // array
      iconUrl,
      logo,
      badge,
      basePrice,
      discountPrice,
      page,
      sections,
      status,
      cityIds: updateCityIds
    } = req.body;

    const categoryIds = providedCategoryIds || (categoryId ? [categoryId] : undefined);

    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Validate categories if provided
    if (categoryIds) {
      const categoriesCount = await Category.countDocuments({ _id: { $in: categoryIds } });
      if (categoriesCount !== categoryIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more categories not found'
        });
      }
    }

    // Check if title or slug conflicts with another brand
    if (title || slug) {
      const existingBrand = await Brand.findOne({
        _id: { $ne: id },
        $or: [
          title ? { title: title.trim() } : {},
          slug ? { slug: slug.trim().toLowerCase() } : {}
        ]
      });

      if (existingBrand) {
        return res.status(400).json({
          success: false,
          message: 'Brand with this title or slug already exists'
        });
      }
    }

    // Update fields
    if (title !== undefined) brand.title = title.trim();
    if (slug !== undefined) {
      brand.slug = slug.trim().toLowerCase();
      brand.routePath = `/user/brand/${slug.trim().toLowerCase()}`;
    }
    if (updateCityIds !== undefined) brand.cityIds = updateCityIds;
    if (categoryIds !== undefined) brand.categoryIds = categoryIds;
    if (iconUrl !== undefined) brand.iconUrl = iconUrl || null;
    if (badge !== undefined) brand.badge = badge?.trim() || null;
    if (page !== undefined) brand.page = page;
    if (sections !== undefined) {
      // Helper to sanitize targetCategoryId
      const sanitizeId = (id) => id === '' ? null : id;

      if (Array.isArray(sections)) {
        brand.sections = sections.map(section => {
          const newSection = { ...section };

          // Sanitize card IDs in sections
          if (Array.isArray(newSection.cards)) {
            newSection.cards = newSection.cards.map(card => ({
              ...card,
              targetCategoryId: sanitizeId(card.targetCategoryId)
            }));
          }

          return newSection;
        });
      } else {
        brand.sections = sections;
      }
    }
    if (status !== undefined) brand.status = status;
    if (req.body.displayOrder !== undefined) brand.displayOrder = Number(req.body.displayOrder) || 0;
    if (req.body.bannerPromo !== undefined) {
      brand.bannerPromo = {
        title: String(req.body.bannerPromo?.title || '').trim(),
        subtitle: String(req.body.bannerPromo?.subtitle || '').trim(),
        originalPrice: req.body.bannerPromo?.originalPrice !== undefined && req.body.bannerPromo?.originalPrice !== null && req.body.bannerPromo?.originalPrice !== '' ? Number(req.body.bannerPromo.originalPrice) : null,
        imageUrl: String(req.body.bannerPromo?.imageUrl || '').trim()
      };
    }

    await brand.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'update', entityType: 'brand', entityId: brand._id, after: brand });

    res.status(200).json({
      success: true,
      message: 'Brand updated successfully',
      brand: {
        id: brand._id,
        title: brand.title,
        slug: brand.slug,
        categoryIds: brand.categoryIds.map(c => c.toString()),
        iconUrl: brand.iconUrl,
        logo: brand.logo,
        badge: brand.badge,
        routePath: brand.routePath,
        displayOrder: brand.displayOrder || 0,
        bannerPromo: brand.bannerPromo || { title: '', subtitle: '', originalPrice: null, imageUrl: '' },
        page: brand.page,
        sections: brand.sections,
        createdAt: brand.createdAt,
        updatedAt: brand.updatedAt
      }
    });
  } catch (error) {
    console.error('Update brand error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Brand with this title or slug already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update brand. Please try again.'
    });
  }
};

/**
 * Delete brand (soft delete - set status to deleted)
 * DELETE /api/admin/brands/:id
 */
const deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;

    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    // Soft delete - set status to deleted
    const before = brand.toObject();
    brand.previousStatus = brand.status || 'active';
    brand.status = SERVICE_STATUS.DELETED;
    await brand.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'delete', entityType: 'brand', entityId: brand._id, before, after: brand });

    res.status(200).json({
      success: true,
      message: 'Brand deleted successfully'
    });
  } catch (error) {
    console.error('Delete brand error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete brand. Please try again.'
    });
  }
};

/**
 * Update brand page content
 * PATCH /api/admin/brands/:id/page
 */
const updateBrandPage = async (req, res) => {
  try {
    const { id } = req.params;
    const { page } = req.body;

    const brand = await Brand.findById(id);

    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Brand not found'
      });
    }

    if (page !== undefined) {
      // Helper to sanitize targetCategoryId
      const sanitizeId = (id) => id === '' ? null : id;

      const sanitizedPage = { ...page };

      if (sanitizedPage.serviceCategoriesGrid) {
        sanitizedPage.serviceCategoriesGrid = sanitizedPage.serviceCategoriesGrid.map(item => ({
          ...item,
          targetCategoryId: sanitizeId(item.targetCategoryId)
        }));
      }

      if (sanitizedPage.paymentOffers) {
        sanitizedPage.paymentOffers = sanitizedPage.paymentOffers.map(item => ({
          ...item,
          targetCategoryId: sanitizeId(item.targetCategoryId)
        }));
      }

      if (sanitizedPage.banners) {
        sanitizedPage.banners = sanitizedPage.banners.map(item => ({
          ...item,
          targetCategoryId: sanitizeId(item.targetCategoryId)
        }));
      }

      // Explicitly update fields to ensure Mongoose detects changes
      if (sanitizedPage.ratingTitle !== undefined) brand.page.ratingTitle = sanitizedPage.ratingTitle;
      if (sanitizedPage.ratingValue !== undefined) brand.page.ratingValue = sanitizedPage.ratingValue;
      if (sanitizedPage.bookingsText !== undefined) brand.page.bookingsText = sanitizedPage.bookingsText;
      if (sanitizedPage.paymentOffersEnabled !== undefined) brand.page.paymentOffersEnabled = sanitizedPage.paymentOffersEnabled;

      if (sanitizedPage.banners) {
        brand.page.banners = sanitizedPage.banners;
      }

      if (sanitizedPage.paymentOffers) {
        brand.page.paymentOffers = sanitizedPage.paymentOffers;
      }

      if (sanitizedPage.serviceCategoriesGrid) {
        brand.page.serviceCategoriesGrid = sanitizedPage.serviceCategoriesGrid;
      }

      // Mark as modified to ensure saving
      brand.markModified('page');
    }

    await brand.save();
    await invalidatePublicCatalogKeys();

    res.status(200).json({
      success: true,
      message: 'Brand page content updated successfully',
      brand: {
        id: brand._id,
        page: brand.page
      }
    });
  } catch (error) {
    console.error('Update brand page error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update brand page. Please try again.'
    });
  }
};

/**
 * Upload brand image
 * POST /api/admin/brands/upload-image
 */
const uploadBrandImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // req.file.path contains the full Cloudinary URL when using multer-storage-cloudinary
    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imageUrl: req.file.path
    });
  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload image'
    });
  }
};

/**
 * Dependency report for a brand — what still points at it.
 * GET /api/admin/brands/:id/dependencies
 */
const getBrandDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    const brand = await Brand.findById(id).select('_id title').lean();
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });

    const [activeServices, activeBookings, activeCarts, couponRefs, homeContentRefs] = await Promise.all([
      UserService.countDocuments({ brandId: id, status: { $ne: 'deleted' } }).catch(() => 0),
      // Bookings link to serviceId; count every active booking whose service belongs to this brand.
      UserService.find({ brandId: id }).select('_id').lean().then(services => {
        const ids = services.map(s => s._id);
        if (ids.length === 0) return 0;
        return Booking.countDocuments({ serviceId: { $in: ids }, status: { $nin: ['completed', 'cancelled', 'rejected'] } });
      }).catch(() => 0),
      UserService.find({ brandId: id }).select('_id').lean().then(services => {
        const ids = services.map(s => s._id);
        if (ids.length === 0) return 0;
        return Cart.countDocuments({ 'items.serviceId': { $in: ids } });
      }).catch(() => 0),
      Coupon.countDocuments({ isActive: true, services: { $in: await UserService.find({ brandId: id }).distinct('_id').catch(() => []) } }).catch(() => 0),
      HomeContent.countDocuments({
        // Brand doesn't have a direct target field on HomeContent today, but
        // its sections may reference services under it. Count conservatively
        // by checking service-targeted refs for any service of this brand.
        'categorySections.cards.targetServiceId': { $in: await UserService.find({ brandId: id }).distinct('_id').catch(() => []) }
      }).catch(() => 0)
    ]);

    const hasDependencies = (activeServices + activeBookings + activeCarts + couponRefs + homeContentRefs) > 0;
    res.status(200).json({
      success: true, brandId: id, title: brand.title,
      hasDependencies, activeServices, activeBookings, activeCarts, coupons: couponRefs, homeContentReferences: homeContentRefs
    });
  } catch (error) {
    console.error('Brand dependencies error:', error);
    res.status(500).json({ success: false, message: 'Failed to build dependency report.' });
  }
};

/**
 * Bulk reorder brands.
 * PATCH /api/admin/brands/reorder
 * body: { items: [{ id, displayOrder }] }
 */
const bulkReorderBrands = async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ success: false, message: 'items[] is required' });
    const ops = items
      .filter(i => i && i.id)
      .map(i => ({ updateOne: { filter: { _id: i.id }, update: { $set: { displayOrder: Number(i.displayOrder) || 0 } } } }));
    if (ops.length === 0) return res.status(400).json({ success: false, message: 'No valid items supplied' });
    const result = await Brand.bulkWrite(ops);
    await invalidatePublicCatalogKeys();
    res.status(200).json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk reorder brands error:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder brands.' });
  }
};

/**
 * Bulk status change.
 * PATCH /api/admin/brands/bulk-status
 * body: { ids: [], status: 'active'|'inactive'|'deleted' }
 */
const bulkBrandStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ success: false, message: 'ids[] is required' });
    const allowed = ['active', 'inactive', 'deleted'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
    const result = await Brand.updateMany({ _id: { $in: ids } }, { $set: { status } });
    await invalidatePublicCatalogKeys();
    res.status(200).json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (error) {
    console.error('Bulk brand status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update brands.' });
  }
};

/**
 * Archive a brand (soft delete). Snapshots the current status. Idempotent.
 * POST /api/admin/brands/:id/archive
 */
const archiveBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    if (brand.status === SERVICE_STATUS.DELETED) {
      return res.status(200).json({ success: true, message: 'Brand already archived', brand });
    }
    const before = brand.toObject();
    brand.previousStatus = brand.status || 'active';
    brand.status = SERVICE_STATUS.DELETED;
    await brand.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'archive', entityType: 'brand', entityId: brand._id, before, after: brand });
    res.status(200).json({ success: true, message: 'Brand archived', brand });
  } catch (error) {
    console.error('Archive brand error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive brand.' });
  }
};

/**
 * Restore an archived brand.
 * POST /api/admin/brands/:id/restore
 */
const restoreBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found' });
    if (brand.status !== SERVICE_STATUS.DELETED) {
      return res.status(200).json({ success: true, message: 'Brand not archived', brand });
    }
    const before = brand.toObject();
    brand.status = brand.previousStatus || 'active';
    brand.previousStatus = null;
    await brand.save();
    await invalidatePublicCatalogKeys();
    writeAudit({ adminId: req.user.id, action: 'restore', entityType: 'brand', entityId: brand._id, before, after: brand });
    res.status(200).json({ success: true, message: 'Brand restored', brand });
  } catch (error) {
    console.error('Restore brand error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore brand.' });
  }
};

module.exports = {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  updateBrandPage,
  uploadBrandImage,
  getBrandDependencies,
  bulkReorderBrands,
  bulkBrandStatus,
  archiveBrand,
  restoreBrand
};
