/**
 * Out-of-zone page
 *
 * What a customer sees when their location is outside every active zone. The admin edits it from
 * Zones; the apps read it through GET /api/public/zones/out-of-zone-page (and the zone lookup
 * response carries it, so the page needs no second request).
 *
 * Stored on the global Settings document as `outOfZonePage`. Anything missing resolves to the
 * defaults below, so an older settings document behaves the same everywhere.
 */

const Settings = require('../models/Settings');

const DEFAULTS = {
  title: "We're not in your area yet",
  message: "Our services are currently not available at this location. We're expanding quickly - check back soon or choose a different address.",
  imageUrl: '',
  primaryButtonText: 'Change Location / Address',
  showRetryButton: true,
  retryButtonText: 'Retry Location Detection',
  footerText: 'Make sure location services are enabled on your device.',
  showSupportContact: true,
  accentColor: '#2563eb',
  backgroundColor: '#f9fafb'
};

const TEXT_LIMITS = {
  title: 120,
  message: 600,
  primaryButtonText: 40,
  retryButtonText: 40,
  footerText: 200
};

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const isHttpUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (_) {
    return false;
  }
};

/** Stored values merged over the defaults. */
const resolveOutOfZonePage = (stored) => {
  const out = { ...DEFAULTS };
  if (!stored || typeof stored !== 'object') return out;
  for (const key of Object.keys(DEFAULTS)) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    if (typeof DEFAULTS[key] === 'boolean') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (typeof value === 'string') {
      // Blank text falls back to the default; only the image may be left empty on purpose.
      out[key] = key === 'imageUrl' || value.trim() ? value : DEFAULTS[key];
    }
  }
  return out;
};

const getOutOfZonePage = async () => {
  try {
    const settings =
      (await Settings.findOne({ type: 'global' }).select('outOfZonePage').lean()) ||
      (await Settings.findOne().select('outOfZonePage').lean());
    return resolveOutOfZonePage(settings && settings.outOfZonePage);
  } catch (error) {
    console.error('[OutOfZonePage] Failed to load:', error.message);
    return { ...DEFAULTS };
  }
};

/**
 * Validates an admin update. Unknown keys are ignored. Returns { updates, errors }.
 */
const sanitizeOutOfZonePage = (payload = {}) => {
  const updates = {};
  const errors = [];

  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (payload[key] === undefined) continue;
    const value = String(payload[key] ?? '').trim();
    if (!value) errors.push(`${key} cannot be empty`);
    else if (value.length > max) errors.push(`${key} must be at most ${max} characters`);
    else updates[key] = value;
  }

  if (payload.imageUrl !== undefined) {
    const value = String(payload.imageUrl ?? '').trim();
    if (value && !isHttpUrl(value)) errors.push('imageUrl must be a valid http(s) link');
    else updates.imageUrl = value;
  }

  for (const key of ['accentColor', 'backgroundColor']) {
    if (payload[key] === undefined) continue;
    const value = String(payload[key] ?? '').trim();
    if (!HEX_COLOR.test(value)) errors.push(`${key} must be a hex colour like #2563eb`);
    else updates[key] = value;
  }

  for (const key of ['showRetryButton', 'showSupportContact']) {
    if (payload[key] === undefined) continue;
    updates[key] = payload[key] === true || payload[key] === 'true';
  }

  return { updates, errors };
};

module.exports = { DEFAULTS, getOutOfZonePage, resolveOutOfZonePage, sanitizeOutOfZonePage };
