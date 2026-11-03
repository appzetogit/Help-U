/**
 * Commission Rules (admin)
 *
 *   GET    /api/admin/commission-rules
 *   POST   /api/admin/commission-rules
 *   PUT    /api/admin/commission-rules/:id
 *   DELETE /api/admin/commission-rules/:id
 *   GET    /api/admin/commission-rules/preview?workerId=&categoryId=&serviceAmount=&partsAmount=
 *
 *   PUT    /api/admin/commission-rules/default
 *
 * The global default is stored in Settings (servicePayoutPercentage, partsPayoutPercentage,
 * defaultCommissionType, defaultFixedCommission) but is edited ONLY here, on the Commission page:
 * the Settings and Booking Configuration endpoints ignore those fields.
 */

const mongoose = require('mongoose');
const CommissionRule = require('../../models/CommissionRule');
const { resolveCommission, computeWorkerEarnings } = require('../../services/commissionService');
const Settings = require('../../models/Settings');
const { logAdminAudit } = require('../../utils/adminAuditLogger');
const { getBookingConfig, invalidateBookingConfigCache } = require('../../utils/bookingConfig');

const toGlobalDefault = (config) => ({
  commissionType: config.defaultCommissionType,
  percentageCommission: Math.round((100 - config.servicePayoutPercentage) * 100) / 100,
  servicePayoutPercentage: config.servicePayoutPercentage,
  fixedCommission: config.defaultFixedCommission,
  partsPayoutPercentage: config.partsPayoutPercentage
});

const isId = (v) => v && mongoose.Types.ObjectId.isValid(String(v));

/**
 * Validates a rule payload. Returns { data, error }.
 */
const parseRule = (body) => {
  const scope = body.scope;
  if (!['category', 'worker', 'worker_category'].includes(scope)) return { error: 'Choose who the rule applies to' };

  const commissionType = body.commissionType;
  if (!['percentage', 'fixed'].includes(commissionType)) return { error: 'Choose percentage or fixed commission' };

  const commissionValue = Number(body.commissionValue);
  if (!Number.isFinite(commissionValue) || commissionValue < 0) return { error: 'Commission must be zero or more' };
  if (commissionType === 'percentage' && commissionValue > 100) return { error: 'A percentage commission cannot exceed 100' };

  const needsCategory = ['category', 'worker_category'].includes(scope);
  const needsWorker = ['worker', 'worker_category'].includes(scope);
  if (needsCategory && !isId(body.categoryId)) return { error: 'Choose a category' };
  if (needsWorker && !isId(body.workerId)) return { error: 'Choose a worker' };

  let partsPayoutPercentage = null;
  if (body.partsPayoutPercentage !== undefined && body.partsPayoutPercentage !== null && body.partsPayoutPercentage !== '') {
    partsPayoutPercentage = Number(body.partsPayoutPercentage);
    if (!Number.isFinite(partsPayoutPercentage) || partsPayoutPercentage < 0 || partsPayoutPercentage > 100) {
      return { error: 'Parts payout must be between 0 and 100' };
    }
  }

  return {
    data: {
      name: String(body.name || '').trim().slice(0, 120),
      scope,
      categoryId: needsCategory ? body.categoryId : null,
      workerId: needsWorker ? body.workerId : null,
      commissionType,
      commissionValue: Math.round(commissionValue * 100) / 100,
      partsPayoutPercentage,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      notes: String(body.notes || '').trim().slice(0, 500)
    }
  };
};

/**
 * Only one active rule may exist per target, otherwise which one applies would
 * be ambiguous.
 */
const findConflict = (data, excludeId = null) => {
  if (!data.isActive) return null;
  const query = {
    scope: data.scope,
    categoryId: data.categoryId || null,
    workerId: data.workerId || null,
    isActive: true
  };
  if (excludeId) query._id = { $ne: excludeId };
  return CommissionRule.findOne(query).lean();
};

exports.listRules = async (req, res) => {
  try {
    const query = {};
    if (['category', 'worker', 'worker_category'].includes(req.query.scope)) query.scope = req.query.scope;
    if (req.query.status === 'active') query.isActive = true;
    if (req.query.status === 'inactive') query.isActive = false;

    const [rules, config] = await Promise.all([
      CommissionRule.find(query)
        .populate('categoryId', 'title')
        .populate('workerId', 'name businessName phone')
        .sort({ updatedAt: -1 })
        .lean(),
      getBookingConfig()
    ]);

    res.status(200).json({
      success: true,
      data: rules,
      globalDefault: toGlobalDefault(config)
    });
  } catch (error) {
    console.error('List commission rules error:', error);
    res.status(500).json({ success: false, message: 'Failed to load commission rules' });
  }
};

exports.createRule = async (req, res) => {
  try {
    const { data, error } = parseRule(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    if (await findConflict(data)) {
      return res.status(409).json({ success: false, message: 'An active rule already exists for this target. Edit or deactivate it first.' });
    }

    const rule = await CommissionRule.create({ ...data, createdBy: req.user.id });
    res.status(201).json({ success: true, message: 'Commission rule created', data: rule });
  } catch (error) {
    console.error('Create commission rule error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to create commission rule' });
  }
};

exports.updateRule = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Rule not found' });

    const existing = await CommissionRule.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Rule not found' });

    const merged = { ...existing.toObject(), ...req.body };
    const { data, error } = parseRule(merged);
    if (error) return res.status(400).json({ success: false, message: error });

    if (await findConflict(data, existing._id)) {
      return res.status(409).json({ success: false, message: 'Another active rule already exists for this target.' });
    }

    Object.assign(existing, data);
    await existing.save();
    res.status(200).json({ success: true, message: 'Commission rule updated', data: existing });
  } catch (error) {
    console.error('Update commission rule error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update commission rule' });
  }
};

/**
 * Past bills keep their commission snapshot, so deleting a rule never changes
 * historic earnings.
 */
exports.deleteRule = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ success: false, message: 'Rule not found' });
    const deleted = await CommissionRule.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Rule not found' });
    res.status(200).json({ success: true, message: 'Commission rule deleted' });
  } catch (error) {
    console.error('Delete commission rule error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete commission rule' });
  }
};

/**
 * Shows which rule would apply and the resulting split, so an admin can check
 * a rule before a real bill uses it.
 */
exports.previewCommission = async (req, res) => {
  try {
    const workerId = isId(req.query.workerId) ? req.query.workerId : null;
    const categoryId = isId(req.query.categoryId) ? req.query.categoryId : null;
    const serviceAmount = Math.max(0, Number(req.query.serviceAmount) || 1000);
    const partsAmount = Math.max(0, Number(req.query.partsAmount) || 0);

    const commission = await resolveCommission({ workerId, categoryId });
    const earnings = computeWorkerEarnings(commission, { serviceBase: serviceAmount, partsBase: partsAmount });

    res.status(200).json({
      success: true,
      data: {
        commission,
        serviceAmount,
        partsAmount,
        ...earnings,
        platformShare: Math.round((serviceAmount + partsAmount - earnings.vendorTotalEarning) * 100) / 100
      }
    });
  } catch (error) {
    console.error('Preview commission error:', error);
    res.status(500).json({ success: false, message: 'Failed to preview commission' });
  }
};

/**
 * Sets the global default commission. Partial updates are allowed; anything not sent is left as is.
 *
 *   commissionType        'percentage' | 'fixed'
 *   percentageCommission  % of the service amount the platform keeps (0-100)
 *   fixedCommission       ₹ per booking the platform keeps from the service amount
 *   partsPayoutPercentage % of parts the worker keeps (0-100)
 *
 * This is the only writer of these values.
 */
exports.updateDefault = async (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};

    if (body.commissionType !== undefined) {
      if (!['percentage', 'fixed'].includes(body.commissionType)) {
        return res.status(400).json({ success: false, message: 'Choose percentage or fixed commission' });
      }
      updates.defaultCommissionType = body.commissionType;
    }

    const num = (value, label, max) => {
      const n = Number(value);
      if (value === '' || value === null || !Number.isFinite(n) || n < 0 || n > max) {
        return { error: `${label} must be a number between 0 and ${max}` };
      }
      return { value: n };
    };

    if (body.percentageCommission !== undefined) {
      const r = num(body.percentageCommission, 'Commission percentage', 100);
      if (r.error) return res.status(400).json({ success: false, message: r.error });
      updates.servicePayoutPercentage = Math.round((100 - r.value) * 100) / 100;
    }
    if (body.fixedCommission !== undefined) {
      const r = num(body.fixedCommission, 'Fixed commission', 100000);
      if (r.error) return res.status(400).json({ success: false, message: r.error });
      updates.defaultFixedCommission = r.value;
    }
    if (body.partsPayoutPercentage !== undefined) {
      const r = num(body.partsPayoutPercentage, 'Parts payout percentage', 100);
      if (r.error) return res.status(400).json({ success: false, message: r.error });
      updates.partsPayoutPercentage = r.value;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No commission settings were provided' });
    }

    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) settings = new Settings({ type: 'global' });
    Object.assign(settings, updates);
    await settings.save();

    invalidateBookingConfigCache();

    logAdminAudit({
      req,
      module: 'financial',
      action: 'update',
      entityType: 'Settings',
      entityId: settings._id,
      description: `Updated default commission (${Object.keys(updates).join(', ')})`
    });

    console.log(`[Commission] Default updated by admin ${req.user?.id}: ${Object.keys(updates).join(', ')}`);
    res.status(200).json({
      success: true,
      message: 'Default commission saved',
      globalDefault: toGlobalDefault(await getBookingConfig())
    });
  } catch (error) {
    console.error('Update default commission error:', error);
    res.status(500).json({ success: false, message: 'Failed to save the default commission' });
  }
};
