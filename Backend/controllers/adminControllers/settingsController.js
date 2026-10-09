const Settings = require('../../models/Settings');
const Worker = require('../../models/Worker');
const { getAllFlags, invalidateFlagCache, FLAG_DEFAULTS } = require('../../utils/featureFlags');

// Get Global Settings
exports.getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) {
      settings = await Settings.findOne();
    }

    // If no settings exist yet, create default
    if (!settings) {
      settings = await Settings.create({ type: 'global' });
    } else if (!settings.type) {
      settings.type = 'global';
      await settings.save();
    }

    res.status(200).json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

// Update Global Settings
exports.updateSettings = async (req, res, next) => {
  try {
    const {
      visitedCharges,
      serviceGstPercentage,
      partsGstPercentage,
      servicePayoutPercentage,
      partsPayoutPercentage,
      tdsPercentage,
      platformFeePercentage,
      vendorCashLimit, // Add this
      cancellationPenalty,
      razorpayKeyId,
      razorpayKeySecret,
      razorpayWebhookSecret,
      cloudinaryCloudName,
      cloudinaryApiKey,
      cloudinaryApiSecret,
      // Billing Settings
      companyName, companyGSTIN, companyPAN, companyAddress, companyCity, companyState, companyPincode, companyPhone, companyEmail, invoicePrefix, sacCode,
      // Support Settings
      supportEmail, supportPhone, supportWhatsapp,
      // Booking Timing
      maxSearchTime, waveDuration, searchRadius,
      // Payment Control
      isOnlinePaymentEnabled,
      // Scrap Control
      isScrapEnabled
    } = req.body;

    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) {
      settings = await Settings.findOne();
    }

    if (!settings) {
      settings = await Settings.create({
        type: 'global',
        visitedCharges,
        serviceGstPercentage,
        partsGstPercentage,
        servicePayoutPercentage,
        partsPayoutPercentage,
        tdsPercentage,
        platformFeePercentage,
        vendorCashLimit, // Add this
        cancellationPenalty,
        razorpayKeyId,
        razorpayKeySecret,
        razorpayWebhookSecret,
        cloudinaryCloudName,
        cloudinaryApiKey,
        cloudinaryApiSecret,
        isOnlinePaymentEnabled: isOnlinePaymentEnabled !== undefined ? isOnlinePaymentEnabled : true,
        isScrapEnabled: isScrapEnabled !== undefined ? isScrapEnabled : true
      });
    } else {
      if (!settings.type) settings.type = 'global';
      // Update fields if provided
      if (visitedCharges !== undefined) settings.visitedCharges = visitedCharges;
      if (serviceGstPercentage !== undefined) settings.serviceGstPercentage = serviceGstPercentage;
      if (partsGstPercentage !== undefined) settings.partsGstPercentage = partsGstPercentage;
      if (servicePayoutPercentage !== undefined) settings.servicePayoutPercentage = servicePayoutPercentage;
      if (partsPayoutPercentage !== undefined) settings.partsPayoutPercentage = partsPayoutPercentage;
      if (tdsPercentage !== undefined) settings.tdsPercentage = tdsPercentage;
      if (platformFeePercentage !== undefined) settings.platformFeePercentage = platformFeePercentage;
      if (vendorCashLimit !== undefined) settings.vendorCashLimit = vendorCashLimit; // Add this
      if (cancellationPenalty !== undefined) settings.cancellationPenalty = cancellationPenalty;
      if (razorpayKeyId !== undefined) settings.razorpayKeyId = razorpayKeyId;
      if (razorpayKeySecret !== undefined) settings.razorpayKeySecret = razorpayKeySecret;
      if (razorpayWebhookSecret !== undefined) settings.razorpayWebhookSecret = razorpayWebhookSecret;
      if (cloudinaryCloudName !== undefined) settings.cloudinaryCloudName = cloudinaryCloudName;
      if (cloudinaryApiKey !== undefined) settings.cloudinaryApiKey = cloudinaryApiKey;
      if (cloudinaryApiSecret !== undefined) settings.cloudinaryApiSecret = cloudinaryApiSecret;

      // Billing update
      if (companyName !== undefined) settings.companyName = companyName;
      if (companyGSTIN !== undefined) settings.companyGSTIN = companyGSTIN;
      if (companyPAN !== undefined) settings.companyPAN = companyPAN;
      if (companyAddress !== undefined) settings.companyAddress = companyAddress;
      if (companyCity !== undefined) settings.companyCity = companyCity;
      if (companyState !== undefined) settings.companyState = companyState;
      if (companyPincode !== undefined) settings.companyPincode = companyPincode;
      if (companyPhone !== undefined) settings.companyPhone = companyPhone;
      if (companyEmail !== undefined) settings.companyEmail = companyEmail;
      if (invoicePrefix !== undefined) settings.invoicePrefix = invoicePrefix;
      if (sacCode !== undefined) settings.sacCode = sacCode;

      // Support update
      if (supportEmail !== undefined) settings.supportEmail = supportEmail;
      if (supportPhone !== undefined) settings.supportPhone = supportPhone;
      if (supportWhatsapp !== undefined) settings.supportWhatsapp = supportWhatsapp;

      // Booking Timing update
      if (maxSearchTime !== undefined) settings.maxSearchTime = maxSearchTime;
      if (waveDuration !== undefined) settings.waveDuration = waveDuration;
      if (searchRadius !== undefined) settings.searchRadius = searchRadius;
      if (isOnlinePaymentEnabled !== undefined) settings.isOnlinePaymentEnabled = Boolean(isOnlinePaymentEnabled);
      if (isScrapEnabled !== undefined) settings.isScrapEnabled = Boolean(isScrapEnabled);

      await settings.save();
    }

    // Broadcast updated configuration to all connected clients via Socket.io
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        io.emit('system_config_updated', {
          isOnlinePaymentEnabled: settings.isOnlinePaymentEnabled !== false,
          isScrapEnabled: settings.isScrapEnabled !== false
        });
      }
    } catch (socketErr) {
      // Non-blocking socket broadcast error
    }

    // Propagate vendorCashLimit to all existing workers if it was changed
    if (vendorCashLimit !== undefined) {
      console.log(`Updating all workers with new cash limit: ${vendorCashLimit}`);
      await Worker.updateMany(
        {}, // Filter: all workers
        { $set: { 'wallet.cashLimit': vendorCashLimit } }
      );
    }

    // Propagate searchRadius to all existing workers if it was changed
    if (searchRadius !== undefined) {
      console.log(`Updating all workers with new service range: ${searchRadius}`);
      await Worker.updateMany(
        {},
        { $set: { 'settings.serviceRange': searchRadius } }
      );
    }

    res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};
// Get Public Settings (Visited Charges, GST, Features)
exports.getPublicSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) {
      settings = await Settings.findOne();
    }

    // Default if not found (fallback values)
    if (!settings) {
      settings = { visitedCharges: 29, serviceGstPercentage: 18, partsGstPercentage: 18, isScrapEnabled: true, isOnlinePaymentEnabled: true };
    }

    res.status(200).json({
      success: true,
      settings: {
        visitedCharges: settings.visitedCharges || 0,
        serviceGstPercentage: settings.serviceGstPercentage ?? 18,
        partsGstPercentage: settings.partsGstPercentage ?? 18,
        supportEmail: settings.supportEmail || '',
        supportPhone: settings.supportPhone || '',
        supportWhatsapp: settings.supportWhatsapp || '',
        cancellationPenalty: settings.cancellationPenalty ?? 49,
        companyName: settings.companyName || 'TodayMyDream',
        companyAddress: settings.companyAddress || '',
        companyCity: settings.companyCity || '',
        companyState: settings.companyState || '',
        companyPincode: settings.companyPincode || '',
        companyPhone: settings.companyPhone || '',
        companyEmail: settings.companyEmail || '',
        isOnlinePaymentEnabled: settings.isOnlinePaymentEnabled !== false,
        isScrapEnabled: settings.isScrapEnabled !== false,

        // Customization toggles. Read through getAllFlags so a field missing
        // from the stored document resolves to the same default the guards use.
        ...(await getAllFlags())
      }
    });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

// ==========================================
// CUSTOMIZATION TOGGLES
// ==========================================

/**
 * Get all customization toggles for the admin panel.
 */
exports.getCustomizationToggles = async (req, res) => {
  try {
    const flags = await getAllFlags();
    res.status(200).json({ success: true, toggles: flags });
  } catch (error) {
    console.error('Error fetching customization toggles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customization toggles'
    });
  }
};

/**
 * Update customization toggles.
 *
 * Accepts a partial payload: only the keys present are written, so the admin UI
 * can send a single toggle without resending the rest. Unknown keys are ignored
 * rather than written through to the document.
 */
exports.updateCustomizationToggles = async (req, res) => {
  try {
    const payload = req.body || {};
    const updates = {};

    // Only accept keys that are real flags.
    for (const name of Object.keys(FLAG_DEFAULTS)) {
      if (payload[name] !== undefined) {
        updates[name] = Boolean(payload[name]);
      }
    }

    // Non-boolean companions to the flags.
    if (payload.maintenanceMessage !== undefined) {
      updates.maintenanceMessage = String(payload.maintenanceMessage).trim();
    }
    if (payload.defaultCityId !== undefined) {
      updates.defaultCityId = payload.defaultCityId || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid toggle values were provided'
      });
    }

    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) {
      settings = new Settings({ type: 'global' });
    }

    // Guard: at least one booking type must stay available, otherwise customers
    // would be unable to book at all.
    const nextInstant =
      updates.isInstantBookingEnabled ?? settings.isInstantBookingEnabled !== false;
    const nextScheduled =
      updates.isScheduledBookingEnabled ?? settings.isScheduledBookingEnabled !== false;

    if (!nextInstant && !nextScheduled) {
      return res.status(400).json({
        success: false,
        message: 'At least one booking type (instant or scheduled) must stay enabled'
      });
    }

    // Guard: turning off every payment method would leave checkout unusable.
    const nextCash = updates.isCashEnabled ?? settings.isCashEnabled !== false;
    const nextWallet =
      updates.isWalletPaymentEnabled ?? settings.isWalletPaymentEnabled !== false;
    const nextOnline =
      updates.isOnlinePaymentEnabled ?? settings.isOnlinePaymentEnabled !== false;

    if (!nextCash && !nextWallet && !nextOnline) {
      return res.status(400).json({
        success: false,
        message: 'At least one payment method must stay enabled'
      });
    }

    // Guard: default location mode needs a city to fall back to.
    const nextUseDefault = updates.useDefaultLocation ?? settings.useDefaultLocation === true;
    const nextCityId =
      updates.defaultCityId !== undefined ? updates.defaultCityId : settings.defaultCityId;

    if (nextUseDefault && !nextCityId) {
      return res.status(400).json({
        success: false,
        message: 'Select a default city before enabling default location mode'
      });
    }

    Object.assign(settings, updates);
    await settings.save();

    // The guards read through a short-lived cache; drop it so the change is
    // enforced on the very next request instead of up to 10s later.
    invalidateFlagCache();

    const flags = await getAllFlags();

    // Push to connected clients so open apps react without a reload.
    try {
      const { getIO } = require('../../sockets');
      const io = getIO();
      if (io) {
        io.emit('customization_toggles_updated', flags);
      }
    } catch (socketErr) {
      // Broadcast is best-effort; the HTTP response is the source of truth.
    }

    const changed = Object.keys(updates).join(', ');
    console.log(`[Toggles] Updated by admin ${req.user?.id || 'unknown'}: ${changed}`);

    res.status(200).json({
      success: true,
      message: 'Customization settings updated',
      toggles: flags
    });
  } catch (error) {
    console.error('Error updating customization toggles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customization settings'
    });
  }
};
