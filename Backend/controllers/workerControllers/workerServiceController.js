const Service = require('../../models/UserService');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS } = require('../../utils/constants');

/**
 * Get worker's services
 */
const getWorkerServices = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query - services are linked to workers through bookings
    // For now, we'll get all services and filter by worker bookings
    // TODO: Add vendorId field to Service model if workers can own services

    const query = {};
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get services (for now, return all active services)
    // In production, services should be linked to workers
    const services = await Service.find({
      ...query,
      status: SERVICE_STATUS.ACTIVE
    })
      .populate('categoryId', 'title slug')
      .populate('categoryIds', 'title slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Service.countDocuments({
      ...query,
      status: SERVICE_STATUS.ACTIVE
    });

    res.status(200).json({
      success: true,
      data: services,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services. Please try again.'
    });
  }
};

/**
 * Update service availability (enable/disable)
 */
const updateServiceAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { serviceId } = req.params;
    const { isAvailable } = req.body;

    // TODO: Verify worker owns this service
    // For now, just update the service

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Update availability (using status field)
    if (isAvailable) {
      service.status = SERVICE_STATUS.ACTIVE;
    } else {
      service.status = SERVICE_STATUS.INACTIVE;
    }

    await service.save();

    res.status(200).json({
      success: true,
      message: 'Service availability updated successfully',
      data: service
    });
  } catch (error) {
    console.error('Update service availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service availability. Please try again.'
    });
  }
};

/**
 * Set service pricing (worker-specific pricing)
 */
const setServicePricing = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const { serviceId } = req.params;
    const { basePrice, discountPrice } = req.body;

    // TODO: Create WorkerService model for worker-specific pricing
    // For now, update the service directly (not ideal for multi-worker scenario)

    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Update pricing
    if (basePrice !== undefined) {
      service.basePrice = basePrice;
    }
    if (discountPrice !== undefined) {
      service.discountPrice = discountPrice;
    }

    await service.save();

    res.status(200).json({
      success: true,
      message: 'Service pricing updated successfully',
      data: service
    });
  } catch (error) {
    console.error('Set service pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service pricing. Please try again.'
    });
  }
};

module.exports = {
  getWorkerServices,
  updateServiceAvailability,
  setServicePricing
};

