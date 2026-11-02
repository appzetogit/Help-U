/**
 * Coupon Service
 *
 * Validation and redemption for checkout coupons.
 *
 * validateCoupon() is read-only and safe to call as the customer types.
 * redeemCoupon() is the only function that records a use, and it is written to
 * be safe under retries and concurrency:
 *   - the usage counter is incremented with a conditional $inc, so a coupon
 *     with a limit cannot be over-redeemed by simultaneous checkouts
 *   - the redemption row is unique per (coupon, booking), so replaying the
 *     same booking request does not double-count
 */

const Coupon = require('../models/Coupon');
const { zonesInUse } = require('../utils/dispatchMode');
const CouponRedemption = require('../models/CouponRedemption');
const Booking = require('../models/Booking');

/**
 * Checks whether a code can be used by this customer for this order.
 *
 * Returns { valid, reason?, coupon?, discount? } rather than throwing, since
 * an invalid code is an expected outcome, not an error.
 */
const validateCoupon = async (code, { userId, orderAmount, categoryId, serviceId, cityId, zoneId } = {}) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    return { valid: false, reason: 'Enter a coupon code' };
  }

  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) {
    return { valid: false, reason: 'This coupon code is not valid' };
  }

  const state = coupon.isCurrentlyValid();
  if (!state.valid) {
    return { valid: false, reason: state.reason };
  }

  const amount = Number(orderAmount) || 0;
  if (coupon.minOrderAmount > 0 && amount < coupon.minOrderAmount) {
    return {
      valid: false,
      reason: `Add ₹${coupon.minOrderAmount - amount} more to use this coupon`
    };
  }

  // Scope checks. An empty list means the coupon is not restricted on that
  // dimension, so only a non-empty list can exclude the order.
  if (coupon.categories.length > 0 && categoryId) {
    const allowed = coupon.categories.some((c) => String(c) === String(categoryId));
    if (!allowed) {
      return { valid: false, reason: 'This coupon is not valid for this category' };
    }
  }

  if (coupon.services.length > 0 && serviceId) {
    const allowed = coupon.services.some((s) => String(s) === String(serviceId));
    if (!allowed) {
      return { valid: false, reason: 'This coupon is not valid for this service' };
    }
  }

  if (coupon.cities.length > 0 && cityId) {
    const allowed = coupon.cities.some((c) => String(c) === String(cityId));
    if (!allowed) {
      return { valid: false, reason: 'This coupon is not valid in your city' };
    }
  }

  // Zone-limited coupons only mean something in zone mode; in distance mode there are no zones
  const zoneRuleApplies = await zonesInUse();
  if (zoneRuleApplies && coupon.zones && coupon.zones.length > 0) {
    if (!zoneId) {
      return { valid: false, reason: 'This coupon is valid only in specific service zones' };
    }
    const allowed = coupon.zones.some((z) => String(z._id || z) === String(zoneId));
    if (!allowed) {
      return { valid: false, reason: 'This coupon is not valid in your zone' };
    }
  }

  if (userId) {
    if (coupon.usageLimitPerUser > 0) {
      const used = await CouponRedemption.countDocuments({
        couponId: coupon._id,
        userId
      });
      if (used >= coupon.usageLimitPerUser) {
        return { valid: false, reason: 'You have already used this coupon' };
      }
    }

    if (coupon.firstBookingOnly) {
      const previous = await Booking.countDocuments({
        userId,
        status: 'completed'
      });
      if (previous > 0) {
        return { valid: false, reason: 'This coupon is only for your first booking' };
      }
    }
  }

  return {
    valid: true,
    coupon,
    discount: coupon.calculateDiscount(amount)
  };
};

/**
 * Records a redemption. Call only after the booking exists.
 *
 * Returns { success, discountAmount } or { success: false, reason }.
 */
const redeemCoupon = async (couponId, { userId, bookingId, discountAmount, orderAmount }) => {
  // Explicit replay check. The unique index on (couponId, bookingId) is the
  // real guarantee, but it only exists once Mongo has built it — on a fresh
  // deployment the collection may have no index yet — so the common retry case
  // is caught here before the counter is touched.
  const existing = await CouponRedemption.findOne({ couponId, bookingId }).lean();
  if (existing) {
    return { success: true, discountAmount: existing.discountAmount, alreadyRedeemed: true };
  }

  // Conditional increment: the filter re-checks the limit, so if the coupon ran
  // out between validation and here, no update happens and nothing is recorded.
  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      isActive: true,
      $or: [
        { usageLimit: 0 },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
      ]
    },
    { $inc: { usedCount: 1 } },
    { new: true }
  );

  if (!coupon) {
    return { success: false, reason: 'This coupon is no longer available' };
  }

  try {
    await CouponRedemption.create({
      couponId: coupon._id,
      userId,
      bookingId,
      code: coupon.code,
      discountAmount,
      orderAmount
    });
  } catch (error) {
    // Duplicate key: this booking already redeemed this coupon, so the retry
    // is a no-op. Give back the increment we just made.
    if (error.code === 11000) {
      await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: -1 } });
      return { success: true, discountAmount, alreadyRedeemed: true };
    }

    // Any other failure: undo the increment so the count stays truthful.
    await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: -1 } });
    throw error;
  }

  return { success: true, discountAmount };
};

/**
 * Coupons worth showing on the checkout screen for this customer and order.
 * Scope and per-customer rules are applied, so every coupon returned is one
 * the customer can actually use right now.
 */
const getAvailableCoupons = async ({ userId, orderAmount = 0, categoryId, serviceId, cityId, zoneId } = {}) => {
  const now = new Date();

  const candidates = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now }
  })
    .sort({ discountValue: -1 })
    .limit(50)
    .lean();

  const usable = [];
  for (const raw of candidates) {
    const check = await validateCoupon(raw.code, {
      userId,
      orderAmount,
      categoryId,
      serviceId,
      cityId,
      zoneId
    });

    usable.push({
      code: raw.code,
      title: raw.title,
      description: raw.description,
      discountType: raw.discountType,
      discountValue: raw.discountValue,
      maxDiscountAmount: raw.maxDiscountAmount,
      minOrderAmount: raw.minOrderAmount,
      validUntil: raw.validUntil,
      // Unusable coupons are still listed, with the reason, so the customer can
      // see what they would need to do to qualify.
      applicable: check.valid,
      reason: check.valid ? null : check.reason,
      discount: check.valid ? check.discount : 0
    });
  }

  return usable;
};

module.exports = { validateCoupon, redeemCoupon, getAvailableCoupons };
