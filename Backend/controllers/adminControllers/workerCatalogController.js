const WorkerServiceCatalog = require('../../models/WorkerServiceCatalog');
const WorkerPartsCatalog = require('../../models/WorkerPartsCatalog');
const { validationResult } = require('express-validator');
const { SERVICE_STATUS } = require('../../utils/constants');

/**
 * Get all worker services
 * GET /api/admin/worker-services
 */
const getAllWorkerServices = async (req, res) => {
  try {
    const services = await WorkerServiceCatalog.find()
      .populate('categoryId', 'title')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: services.length, services });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch worker services' });
  }
};

/**
 * Create worker service
 * POST /api/admin/worker-services
 */
const createWorkerService = async (req, res) => {
  try {
    const { name, price, basePrice, status, description, categoryId } = req.body;
    // Handle either price or basePrice from frontend
    const finalPrice = price || basePrice;

    const service = await WorkerServiceCatalog.create({
      name,
      price: finalPrice,
      status,
      description,
      categoryId
    });
    res.status(201).json({ success: true, service });
  } catch (error) {
    console.error('Create worker service error:', error);
    res.status(500).json({ success: false, message: 'Failed to create worker service' });
  }
};

/**
 * Update worker service
 * PUT /api/admin/worker-services/:id
 */
const updateWorkerService = async (req, res) => {
  try {
    const { basePrice, price, ...rest } = req.body;
    const updateData = { ...rest };
    if (basePrice !== undefined || price !== undefined) {
      updateData.price = price || basePrice;
    }

    const service = await WorkerServiceCatalog.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.status(200).json({ success: true, service });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update worker service' });
  }
};

/**
 * Delete worker service
 * DELETE /api/admin/worker-services/:id
 */
const deleteWorkerService = async (req, res) => {
  try {
    await WorkerServiceCatalog.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Service deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete worker service' });
  }
};

/**
 * Get all worker parts
 * GET /api/admin/worker-parts
 */
const getAllWorkerParts = async (req, res) => {
  try {
    const parts = await WorkerPartsCatalog.find()
      .populate('categoryId', 'title')
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: parts.length, parts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch worker parts' });
  }
};

/**
 * Create worker part
 * POST /api/admin/worker-parts
 */
const createWorkerPart = async (req, res) => {
  try {
    const { name, price, basePrice, hsnCode, gstApplicable, gstPercentage, status, description, categoryId } = req.body;
    const finalPrice = price || basePrice;
    const part = await WorkerPartsCatalog.create({
      name,
      price: finalPrice,
      hsnCode,
      gstApplicable,
      gstPercentage,
      status,
      description,
      categoryId
    });
    res.status(201).json({ success: true, part });
  } catch (error) {
    console.error('Create worker part error:', error);
    res.status(500).json({ success: false, message: 'Failed to create worker part' });
  }
};

/**
 * Update worker part
 * PUT /api/admin/worker-parts/:id
 */
const updateWorkerPart = async (req, res) => {
  try {
    const { basePrice, price, categoryId, ...rest } = req.body;
    const updateData = { ...rest };
    if (basePrice !== undefined || price !== undefined) {
      updateData.price = price || basePrice;
    }
    if (categoryId) {
      updateData.categoryId = categoryId;
    }

    const part = await WorkerPartsCatalog.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!part) return res.status(404).json({ success: false, message: 'Part not found' });
    res.status(200).json({ success: true, part });
  } catch (error) {
    console.error('Update worker part error:', error);
    res.status(500).json({ success: false, message: 'Failed to update worker part' });
  }
};

/**
 * Delete worker part
 * DELETE /api/admin/worker-parts/:id
 */
const deleteWorkerPart = async (req, res) => {
  try {
    await WorkerPartsCatalog.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Part deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete worker part' });
  }
};

module.exports = {
  getAllWorkerServices,
  createWorkerService,
  updateWorkerService,
  deleteWorkerService,
  getAllWorkerParts,
  createWorkerPart,
  updateWorkerPart,
  deleteWorkerPart
};
