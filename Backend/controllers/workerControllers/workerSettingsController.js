const Worker = require('../../models/Worker');
const { validationResult } = require('express-validator');

/**
 * Get worker settings
 */
const Settings = require('../../models/Settings');

/**
 * Get worker settings
 */
const getSettings = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const worker = await Worker.findById(vendorId).select('settings businessHours');
    const globalSettings = await Settings.findOne({ type: 'global' });

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        settings: worker.settings || {},
        businessHours: worker.businessHours || {},
        global: {
          serviceGstPercentage: globalSettings?.serviceGstPercentage ?? 18,
          partsGstPercentage: globalSettings?.partsGstPercentage ?? 18,
          servicePayoutPercentage: globalSettings?.servicePayoutPercentage ?? 70,
          partsPayoutPercentage: globalSettings?.partsPayoutPercentage ?? 10
        }
      }
    });
  } catch (error) {
    console.error('Get worker settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

/**
 * Update worker settings
 */
const updateSettings = async (req, res) => {
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
    const { notifications, soundAlerts, language } = req.body;

    const worker = await Worker.findById(vendorId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Update settings
    if (!worker.settings) worker.settings = {};
    if (notifications !== undefined) worker.settings.notifications = notifications;
    if (soundAlerts !== undefined) worker.settings.soundAlerts = soundAlerts;
    if (language !== undefined) worker.settings.language = language;

    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: worker.settings
    });
  } catch (error) {
    console.error('Update worker settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};

/**
 * Update business hours
 */
const updateBusinessHours = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { businessHours } = req.body;

    const worker = await Worker.findById(vendorId);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.businessHours = businessHours;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Business hours updated successfully',
      data: worker.businessHours
    });
  } catch (error) {
    console.error('Update business hours error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update business hours'
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  updateBusinessHours
};
