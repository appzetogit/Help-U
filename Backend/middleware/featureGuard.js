/**
 * Feature Guard Middleware
 *
 * Blocks a route when its customization toggle is off. Hiding a feature in the
 * UI is not enough on its own — without this the endpoint stays callable
 * directly — so every toggle that disables an action is enforced here too.
 *
 * Usage:
 *   router.post('/signup', requireFlag('isVendorRegistrationEnabled', 'Worker registration is currently closed.'), signup);
 */

const { getFlag } = require('../utils/featureFlags');

const requireFlag = (flagName, message) => async (req, res, next) => {
  try {
    const enabled = await getFlag(flagName);
    if (enabled) {
      return next();
    }

    return res.status(403).json({
      success: false,
      code: 'FEATURE_DISABLED',
      feature: flagName,
      message: message || 'This feature is currently unavailable.'
    });
  } catch (error) {
    // Fail open: a flag lookup failure should not block a legitimate request.
    console.error(`[FeatureGuard] ${flagName} check failed, allowing:`, error.message);
    return next();
  }
};

/**
 * Validates the payment method on a booking against the payment toggles.
 * Reads from req.body.paymentMethod.
 */
const validatePaymentMethod = async (req, res, next) => {
  try {
    const method = (req.body?.paymentMethod || '').toLowerCase();
    if (!method) return next();

    const checks = {
      cash: ['isCashEnabled', 'Cash payment is currently unavailable.'],
      wallet: ['isWalletPaymentEnabled', 'Wallet payment is currently unavailable.'],
      razorpay: ['isOnlinePaymentEnabled', 'Online payment is currently unavailable.'],
      online: ['isOnlinePaymentEnabled', 'Online payment is currently unavailable.']
    };

    const check = checks[method];
    if (!check) return next();

    const [flagName, message] = check;
    const enabled = await getFlag(flagName);
    if (enabled) return next();

    return res.status(403).json({
      success: false,
      code: 'PAYMENT_METHOD_DISABLED',
      feature: flagName,
      message
    });
  } catch (error) {
    console.error('[FeatureGuard] Payment method check failed, allowing:', error.message);
    return next();
  }
};

/**
 * Validates the booking type (instant / scheduled) against its toggles.
 * Reads from req.body.bookingType.
 */
const validateBookingType = async (req, res, next) => {
  try {
    const bookingType = (req.body?.bookingType || '').toLowerCase();
    if (!bookingType) return next();

    const flagName =
      bookingType === 'instant' ? 'isInstantBookingEnabled' : 'isScheduledBookingEnabled';

    const enabled = await getFlag(flagName);
    if (enabled) return next();

    return res.status(403).json({
      success: false,
      code: 'BOOKING_TYPE_DISABLED',
      feature: flagName,
      message: `${bookingType === 'instant' ? 'Instant' : 'Scheduled'} booking is currently unavailable.`
    });
  } catch (error) {
    console.error('[FeatureGuard] Booking type check failed, allowing:', error.message);
    return next();
  }
};

module.exports = {
  requireFlag,
  validatePaymentMethod,
  validateBookingType
};
