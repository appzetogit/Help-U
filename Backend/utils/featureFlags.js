/**
 * Feature Flags
 *
 * Single source of truth for the customization toggles stored on the global
 * Settings document. Routes and controllers read flags through here instead of
 * querying Settings directly, so the fail-open behaviour below is applied
 * consistently: if the settings document is missing or the database is briefly
 * unreachable, every flag falls back to its default and the platform keeps
 * serving traffic rather than locking customers out.
 */

const Settings = require('../models/Settings');

// Defaults mirror the schema. A flag that is absent from the stored document
// (an older deployment, or one written before the field existed) resolves here.
const FLAG_DEFAULTS = {
  isUnderMaintenance: false,
  isCashEnabled: true,
  isWalletPaymentEnabled: true,
  isVendorRegistrationEnabled: true,
  isInstantBookingEnabled: true,
  isScheduledBookingEnabled: true,
  useDefaultLocation: false,
  isOnlinePaymentEnabled: true,
  isScrapEnabled: true
};

// Settings change rarely but are read on nearly every request, so the document
// is cached briefly. The TTL is short enough that an admin toggling a flag sees
// it take effect within seconds without needing a restart.
const CACHE_TTL_MS = 10000;
let cached = null;
let cachedAt = 0;

const loadSettings = async () => {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const settings =
      (await Settings.findOne({ type: 'global' }).lean()) ||
      (await Settings.findOne().lean());
    cached = settings || {};
    cachedAt = now;
    return cached;
  } catch (error) {
    console.error('[FeatureFlags] Failed to load settings:', error.message);
    // Serve the last known good value if we have one; otherwise fall back to
    // defaults. Either way the request proceeds.
    return cached || {};
  }
};

/**
 * Drop the cache so the next read hits the database.
 * Called after an admin writes settings.
 */
const invalidateFlagCache = () => {
  cached = null;
  cachedAt = 0;
};

/**
 * Read one flag. Returns the schema default when the field is unset.
 */
const getFlag = async (name) => {
  const settings = await loadSettings();
  const value = settings[name];
  return typeof value === 'boolean' ? value : FLAG_DEFAULTS[name];
};

/**
 * Read every flag at once, plus the fields the apps need alongside them.
 */
const getAllFlags = async () => {
  const settings = await loadSettings();
  const flags = {};
  for (const [name, fallback] of Object.entries(FLAG_DEFAULTS)) {
    flags[name] = typeof settings[name] === 'boolean' ? settings[name] : fallback;
  }
  flags.maintenanceMessage =
    settings.maintenanceMessage ||
    'We are performing scheduled maintenance. Please check back shortly.';
  flags.defaultCityId = settings.defaultCityId || null;
  return flags;
};

module.exports = {
  FLAG_DEFAULTS,
  getFlag,
  getAllFlags,
  invalidateFlagCache
};
