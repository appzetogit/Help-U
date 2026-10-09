/**
 * Maintenance Mode Middleware
 *
 * When the isUnderMaintenance flag is on, user- and worker-facing API routes
 * return 503 so the apps can show their maintenance screen. Admin routes, auth
 * and the health check stay open, otherwise an admin could not sign in to turn
 * maintenance back off.
 */

const { getFlag } = require('../utils/featureFlags');

// Paths that must keep working while maintenance is on.
const ALWAYS_ALLOWED = [
  '/api/admin',        // the panel that turns this flag off again
  '/api/public/config' // the apps read the flag itself from here
];

const maintenanceMode = async (req, res, next) => {
  try {
    const path = req.originalUrl || req.path;

    if (ALWAYS_ALLOWED.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    const isUnderMaintenance = await getFlag('isUnderMaintenance');
    if (!isUnderMaintenance) {
      return next();
    }

    return res.status(503).json({
      success: false,
      code: 'UNDER_MAINTENANCE',
      message: 'The service is temporarily unavailable for maintenance.'
    });
  } catch (error) {
    // Never let a flag lookup failure take the API down.
    console.error('[Maintenance] Check failed, allowing request:', error.message);
    return next();
  }
};

module.exports = maintenanceMode;
