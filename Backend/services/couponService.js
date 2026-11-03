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

const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const Zone = require('../models/Zone');
const { zonesInUse } = require('../utils/dispatchMode');
const CouponRedemption = require('../models/CouponRedemption');
const Booking = require('../models/Booking');

const idOf = (v) => String(v?._id || v);

/**
 * Where the customer is, as far as coupons care.
 *
 * In zone mode the zone is the source of truth and it also fixes the city, so a
 * client cannot claim a different city than the zone it is standing in. In
 * distance mode zones are not used at all and only the city (if sent) counts.
 */
const resolveLocation = async ({ zoneId, cityId } = {}) => {
  const zoneMode = await zonesInUse();
  let zone = null;
  let city = cityId || null;

  if (zoneMode && zoneId && mongoose.Types.ObjectId.isValid(String(zoneId))) {
    const found = await Zone.findById(zoneId).select('cityId').lean();
    if (found) {
      zone = found._id;
      city = found.cityId || city;
    }
  }

  return { zoneMode, zoneId: zone, cityId: city };
};

/**
 * Why a coupon does not apply at this location, or null when it does.
 *
 * An empty list means "not restricted", but a restricted coupon needs to know
 * where the customer is: if the city or zone is unknown the coupon is treated
 * as not applicable rather than being offered everywhere.
 */
const locationProblem = (coupon, location = {}) => {
  if (coupon.cities?.length > 0) {
    if (!location.cityId) return 'This coupon is valid only in specific cities';
    if (!coupon.cities.some((c) => idOf(c) === idOf(location.cityId))) {
      return 'This coupon is not valid in your city';
    }
  }

  // Zone-limited coupons only mean something in zone mode; in distance mode there are no zones
  if (location.zoneMode && coupon.zones?.length > 0) {
    if (!location.zoneId) return 'This coupon is valid only in specific service zones';
    if (!coupon.zones.some((z) => idOf(z) === idOf(location.zoneId))) {
      return 'This coupon is not valid in your zone';
    }
  }

  return null;
};

/**
 * Category / service / location scope. Category and service are only checked
 * when the caller knows them.
 */
const scopeProblem = (coupon, { categoryId, serviceId, location } = {}) => {
  if (coupon.categories?.length > 0 && categoryId) {
    if (!coupon.categories.some((c) => idOf(c) === idOf(categoryId))) {
      return 'This coupon is not valid for this category';
    }
  }

  if (coupon.services?.length > 0 && serviceId) {
    if (!coupon.services.some((s) => idOf(s) === idOf(serviceId))) {
      return 'This coupon is not valid for this service';
    }
  }

  return locationProblem(coupon, location);
};

/**
 * Runs every rule against a coupon document.
 *
 * Returns { valid, reason?, hidden?, coupon?, discount? }. `hidden` marks a
 * coupon the customer can never use here (wrong place, already used, expired),
 * as opposed to one they could use after changing the order (a minimum amount
 * not yet reached) — only the latter is worth listing with its reason.
 */
const checkCoupon = async (coupon, ctx = {}) => {
  const { userId, orderAmount, categoryId, serviceId } = ctx;
  const location = ctx.location || await resolveLocation(ctx);

  const state = coupon.isCurrentlyValid();
  if (!state.valid) return { valid: false, hidden: true, reason: state.reason };

  const scope = scopeProblem(coupon, { categoryId, serviceId, location });
  if (scope) return { valid: false, hidden: true, reason: scope };

  if (userId) {
    if (coupon.usageLimitPerUser > 0) {
      const used = await CouponRedemption.countDocuments({ couponId: coupon._id, userId });
      if (used >= coupon.usageLimitPerUser) {
        return { valid: false, hidden: true, reason: 'You have already used this coupon' };
      }
    }

    if (coupon.firstBookingOnly) {
      const previous = await Booking.countDocuments({ userId, status: 'completed' });
      if (previous > 0) {
        return { valid: false, hidden: true, reason: 'This coupon is only for your first booking' };
      }
    }
  }

  // Last, so a coupon that does not apply here is hidden rather than shown
  // with an "add more" hint that could never make it work.
  const amount = Number(orderAmount) || 0;
  if (coupon.minOrderAmount > 0 && amount < coupon.minOrderAmount) {
    return {
      valid: false,
      hidden: false,
      reason: `Add ₹${coupon.minOrderAmount - amount} more to use this coupon`
    };
  }

  return { valid: true, coupon, discount: coupon.calculateDiscount(amount) };
};

/**
 * Checks whether a code can be used by this customer for this order.
 *
 * Returns { valid, reason?, coupon?, discount? } rather than throwing, since
 * an invalid code is an expected outcome, not an error.
 */
const validateCoupon = async (code, ctx = {}) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    return { valid: false, reason: 'Enter a coupon code' };
  }

  const coupon = await Coupon.findOne({ code: normalized });
  if (!coupon) {
    return { valid: false, reason: 'This coupon code is not valid' };
  }

  return checkCoupon(coupon, ctx);
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
 *
 * A coupon that cannot work here (another city or zone, already used, not for
 * this category, first-booking-only for a returning customer) is left out
 * entirely. The only unusable coupons still listed are those that need a bigger
 * order, with the reason, so the customer can see what it takes to qualify.
 */
const getAvailableCoupons = async ({ userId, orderAmount = 0, categoryId, serviceId, cityId, zoneId } = {}) => {
  const now = new Date();

  const candidates = await Coupon.find({
    isActive: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now }
  })
    .sort({ discountValue: -1 })
    .limit(50);

  const location = await resolveLocation({ zoneId, cityId });
  const usable = [];

  for (const coupon of candidates) {
    const check = await checkCoupon(coupon, { userId, orderAmount, categoryId, serviceId, location });
    if (!check.valid && check.hidden) continue;

    usable.push({
      code: coupon.code,
      title: coupon.title,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscountAmount: coupon.maxDiscountAmount,
      minOrderAmount: coupon.minOrderAmount,
      validUntil: coupon.validUntil,
      applicable: check.valid,
      reason: check.valid ? null : check.reason,
      discount: check.valid ? check.discount : 0
    });
  }

  // Coupons the customer can use right now come first, best saving first.
  usable.sort((a, b) => (b.applicable - a.applicable) || (b.discount - a.discount));

  return usable;
};

module.exports = { validateCoupon, redeemCoupon, getAvailableCoupons, resolveLocation, locationProblem };
