/**
 * Booking Creation Service
 *
 * Creates a booking and starts the worker search. Used by the checkout
 * endpoint (userBookingController.createBooking) and by the recurring booking
 * runner, so a recurring visit is priced, validated and dispatched exactly
 * like one booked by hand.
 *
 * placeBooking() never touches req/res. It returns:
 *   { statusCode, body, afterResponse }
 * where afterResponse (optional) is the slow follow-up work — alerting
 * workers, notifications, emails — that the caller runs once the response has
 * been sent.
 */

const Booking = require('../models/Booking');
const Service = require('../models/UserService');
const Category = require('../models/Category');
const Cart = require('../models/Cart');
const User = require('../models/User');
const AddOn = require('../models/AddOn');
const BookingRequest = require('../models/BookingRequest');
const RecurringBooking = require('../models/RecurringBooking');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');
const { getBookingConfig } = require('../utils/bookingConfig');
const { sanitizeIssuePhotos, sanitizeIssueVideos } = require('../utils/issuePhotos');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const { validateCoupon, redeemCoupon } = require('./couponService');
const { rankWorkers } = require('./workerScoringService');
const { findNearbyWorkers, geocodeAddress } = require('./locationService');
const { getBusyWorkerIds, getConflictingWorkerIds, slotStartMs, isOfferedSlot } = require('./workerAvailabilityService');
const { nextOccurrenceDate } = require('../utils/recurrence');
const { resolveCheckoutAmount } = require('../utils/servicePricing');
const { resolveBookedItemDetails } = require('./bookingDetailsService');
const { summariseBookedDetails } = require('../utils/detailFields');
const { expandZoneCategories } = require('../utils/zoneCategories');
const { ZONE_WIDE_RADIUS_KM } = require('../utils/dispatchMode');

const fail = (statusCode, message, extra = {}) => ({
  statusCode,
  body: { success: false, message, ...extra }
});

const roundMoney = (n) => Math.round(Number(n) || 0);

/**
 * Prices the requested add-ons against the database. Client prices are never
 * trusted. Returns { items, total } or { error }.
 */
const priceAddOns = async (requested, { serviceId, categoryId }) => {
  if (!Array.isArray(requested) || requested.length === 0) return { items: [], total: 0 };

  const available = await AddOn.findApplicable({ serviceId, categoryId });
  const byId = new Map(available.map((a) => [String(a._id), a]));

  const items = [];
  const seen = new Set();
  for (const entry of requested) {
    const id = String(entry?.addOnId || entry?._id || entry?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const addOn = byId.get(id);
    if (!addOn) {
      return { error: 'Some add-ons you selected are no longer available. Please review your selection.' };
    }
    const quantity = Math.min(Math.max(1, parseInt(entry.quantity, 10) || 1), addOn.maxQuantity || 1);
    items.push({
      addOnId: addOn._id,
      title: addOn.title,
      price: addOn.price,
      quantity,
      total: addOn.price * quantity
    });
  }

  return { items, total: items.reduce((s, i) => s + i.total, 0) };
};

/**
 * Validates the recurring request at checkout. Returns { plan } or { error }.
 */
const validateRecurringRequest = (recurring, config, bookingType) => {
  if (!recurring || !recurring.frequency) return { plan: null };

  if (!config.isRecurringEnabled) return { error: 'Recurring bookings are currently unavailable.' };
  if (bookingType !== 'scheduled') return { error: 'Only scheduled bookings can repeat. Please pick a time slot.' };
  if (!config.recurringFrequencies.includes(recurring.frequency)) {
    return { error: 'This repeat frequency is not available.' };
  }

  const occurrences = parseInt(recurring.occurrences, 10);
  if (!Number.isInteger(occurrences) || occurrences < 2 || occurrences > config.recurringMaxOccurrences) {
    return { error: `Number of visits must be between 2 and ${config.recurringMaxOccurrences}.` };
  }

  return { plan: { frequency: recurring.frequency, occurrences } };
};

/**
 * The cheapest amount a customer can legitimately pay for this service: its price (or discounted
 * price), the minimum-hours amount for hourly services, or any active variant's price. Used to
 * reject a booking whose cart total was tampered with to something lower.
 */
const lowestServicePrice = (service) => {
  const candidates = [];

  const resolved = resolveCheckoutAmount(service, { hours: Number(service.minHours) || 1 });
  if (!resolved.error && Number(resolved.amount) > 0) candidates.push(Number(resolved.amount));
  if (Number(service.discountPrice) > 0) candidates.push(Number(service.discountPrice));

  (service.variants || [])
    .filter((v) => v && v.isActive !== false && Number(v.price) > 0)
    .forEach((v) => candidates.push(Number(v.price)));

  return candidates.length > 0 ? Math.min(...candidates) : 0;
};

/**
 * Creates a booking for `userId` from a checkout payload.
 *
 * options:
 *   recurringContext  set by the recurring runner:
 *                     { recurringBookingId, discountPercentage, preferredWorkerId }
 */
const placeBooking = async (userId, payload, options = {}) => {
  const { recurringContext = null } = options;

  let {
    serviceId,
    vendorId,
    address,
    scheduledDate,
    scheduledTime,
    timeSlot,
    userNotes,
    customerNotes: reqCustomerNotes,
    paymentMethod,
    amount,
    isPlusAdded,
    bookedItems,
    visitingCharges: reqVisitingCharges,
    visitationFee: reqVisitationFee, // Backward compatibility
    basePrice: reqBasePrice,
    discount: reqDiscount,
    couponCode,
    issuePhotos,
    issueVideos,
    addOns: reqAddOns,
    isEmergency: reqIsEmergency,
    recurring: reqRecurring,
    tax: reqTax,
    serviceCategory: reqServiceCategory,
    categoryIcon: reqCategoryIcon,
    brandName: reqBrandName,
    brandIcon: reqBrandIcon,
    bookingType,
    cityId,
    hours: reqHours
  } = payload;

  if (!address || !timeSlot) return fail(400, 'Address and time slot are required');

  // Answers to the category's questions come from the customer's cart items, and the required
  // ones must be filled in before a booking can be placed.
  const detailsResult = await resolveBookedItemDetails(userId, bookedItems, { trustPayload: !!recurringContext });
  if (detailsResult.error) {
    return fail(400, detailsResult.error, { code: 'DETAILS_REQUIRED', problems: detailsResult.problems });
  }
  bookedItems = detailsResult.bookedItems;

  const config = await getBookingConfig();
  const gstPct = config.serviceGstPercentage;

  // The visiting charge is set by the admin and applied here; a value sent by the app is ignored.
  const adminVisitingCharge = Math.max(0, Number(config.visitedCharges) || 0);
  let visitingCharges = adminVisitingCharge;

  // Total value of the booked cards; falls back to the service price below.
  let totalServiceValue = 0;
  if (bookedItems && bookedItems.length > 0) {
    totalServiceValue = bookedItems.reduce((sum, item) => {
      const itemPrice = item.card?.price || item.price || 0;
      return sum + (itemPrice * (item.quantity || 1));
    }, 0);
  }

  // Handle serviceId if it's an object (from populated cart data)
  if (serviceId && typeof serviceId === 'object' && serviceId._id) {
    serviceId = serviceId._id;
  }

  const [service, user] = await Promise.all([
    Service.findById(serviceId).select('title basePrice discountPrice description images iconUrl categoryId category categoryIds pricingType hourlyRate minHours maxHours inspectionFee variants status publishStatus').lean(),
    User.findById(userId).select('name phone wallet plans')
  ]);

  if (!service) return fail(404, 'Service not found');
  if (service.status !== 'active' || service.publishStatus === 'draft') {
    return fail(400, 'Service is currently unavailable', { code: 'SERVICE_UNAVAILABLE' });
  }
  if (!user) return fail(404, 'User not found');

  const categoryId = service.categoryId || service.categoryIds?.[0];
  let category = categoryId
    ? await Category.findOne({ _id: categoryId, status: 'active', publishStatus: { $ne: 'draft' } }).select('title icon image slug isEmergencyAvailable parentId').lean()
    : null;
  if (!category && service.category) {
    // Title-fallback is scoped to top-level active, non-draft categories so a sub-category
    // sharing the same display title can never shadow the real parent used
    // for emergency / city / display routing on a new booking.
    category = await Category.findOne({ title: service.category, parentId: null, status: 'active', publishStatus: { $ne: 'draft' } }).select('title icon image slug isEmergencyAvailable parentId').lean();
  }

  // Pricing model: hourly/inspection-fee services resolve their own amount;
  // quote_required cannot be booked online at all. Only applies when the
  // checkout did not already send a priced breakdown of cart items — those
  // (bookedItems) carry their own snapshot price regardless of pricing type.
  let resolvedHours = null;
  if (totalServiceValue === 0) {
    const resolved = resolveCheckoutAmount(service, { hours: reqHours });
    if (resolved.error) return fail(400, resolved.error, { code: 'PRICING_UNAVAILABLE' });
    totalServiceValue = resolved.amount;
    resolvedHours = resolved.hours || null;
  } else if (service.pricingType === 'quote_required') {
    return fail(400, 'This service requires a custom quote and cannot be booked online. Please contact support.', { code: 'PRICING_UNAVAILABLE' });
  }

  // ── Feature validation (all admin-configurable) ──
  const isEmergency = reqIsEmergency === true || reqIsEmergency === 'true';
  if (isEmergency) {
    if (!config.isEmergencyEnabled) return fail(400, 'Emergency booking is currently unavailable.');
    if (!category?.isEmergencyAvailable) return fail(400, 'Emergency booking is not available for this service.');
    bookingType = 'instant';
  }

  const recurringCheck = recurringContext
    ? { plan: null }
    : validateRecurringRequest(reqRecurring, config, bookingType || 'scheduled');
  if (recurringCheck.error) return fail(400, recurringCheck.error);
  const recurringPlan = recurringCheck.plan;

  let addOnItems = [];
  let addOnsTotal = 0;
  if (config.isAddOnsEnabled && Array.isArray(reqAddOns) && reqAddOns.length > 0) {
    const priced = await priceAddOns(reqAddOns, { serviceId, categoryId: category?._id || categoryId });
    if (priced.error) return fail(400, priced.error, { code: 'ADDON_UNAVAILABLE' });
    addOnItems = priced.items;
    addOnsTotal = priced.total;
  }

  const notesInput = reqCustomerNotes !== undefined ? reqCustomerNotes : userNotes;
  const customerNotes = config.isCustomerNotesEnabled && typeof notesInput === 'string'
    ? notesInput.trim().slice(0, config.customerNotesMaxLength) || null
    : null;

  // Search limits; emergency bookings search wider and expire sooner.
  const searchRadiusKm = isEmergency ? config.emergencySearchRadius : config.searchRadius;
  const maxSearchTimeMins = isEmergency ? config.emergencyMaxSearchTime : config.maxSearchTime;
  // Scheduled (future) bookings are offered to every eligible worker at once: there is no
  // rush, and they stay open until a cut-off before the slot instead of a few minutes.
  const isScheduledBooking = (bookingType || 'scheduled') === 'scheduled' && !isEmergency;
  const scheduledSlotStart = isScheduledBooking
    ? slotStartMs({ scheduledDate, timeSlot })
    : null;
  const firstWaveSize = isEmergency ? config.emergencyFirstWaveSize : config.wave1Size;

  // Enforce the admin's time-slot window (a recurring runner replays slots chosen earlier, so it
  // is exempt). The grace keeps a slot picked a moment before the cut-off from failing.
  if (isScheduledBooking && !recurringContext && Number.isFinite(scheduledSlotStart)) {
    const graceMs = 2 * 60 * 1000;
    const earliest = Date.now() + (config.slotMinLeadMinutes || 0) * 60 * 1000 - graceMs;
    const latest = Date.now() + (config.slotMaxDaysAhead + 1) * 24 * 60 * 60 * 1000;
    if (!isOfferedSlot({ timeSlot }, config)) {
      return fail(400, 'That time is not one of the available slots. Please pick a slot from the list.', { code: 'SLOT_NOT_OFFERED' });
    }
    if (scheduledSlotStart < earliest) {
      return fail(400, 'That time slot is too soon. Please choose a later slot.', { code: 'SLOT_TOO_SOON' });
    }
    if (scheduledSlotStart > latest) {
      return fail(400, `Bookings can be made up to ${config.slotMaxDaysAhead} days ahead.`, { code: 'SLOT_TOO_FAR' });
    }
  }

  const pendingPenalty = user.wallet?.penalty || 0;

  // ── Worker search ──
  let bookingLocation;
  if (address.lat && address.lng) {
    bookingLocation = { lat: address.lat, lng: address.lng };
  } else {
    bookingLocation = await geocodeAddress(
      `${address.addressLine1}, ${address.city}, ${address.state} ${address.pincode}`
    );
  }

  // ── Zone Matching ──
  // The customer's coordinates decide the zone. A zoneId sent by the app is only a hint for when
  // the address has no usable coordinates; it must never override where the address really is.
  const Zone = require('../models/Zone');
  // One rule at a time (Booking Config -> dispatch mode): in 'distance' mode zones are not used at all
  const zoneMode = config.dispatchMode !== 'distance';
  let matchedZone = null;
  const hasCoordinates = !!bookingLocation
    && Number.isFinite(bookingLocation.lat) && Number.isFinite(bookingLocation.lng);

  if (!zoneMode) {
    // no zone matching, no out-of-zone block, no zone surge or category limits
  } else if (hasCoordinates) {
    try {
      matchedZone = await Zone.findZoneByCoordinates(bookingLocation.lng, bookingLocation.lat);
      if (matchedZone) {
        console.log(`[CreateBooking] Matched Zone: "${matchedZone.name}" for coords [${bookingLocation.lng}, ${bookingLocation.lat}]`);
      }
    } catch (zoneErr) {
      console.warn('[CreateBooking] Zone resolution error (non-fatal):', zoneErr.message);
    }
  } else if (payload.zoneId) {
    try {
      matchedZone = await Zone.findById(payload.zoneId);
      if (matchedZone && matchedZone.status !== 'active') matchedZone = null;
      if (matchedZone) {
        console.log(`[CreateBooking] Matched Zone by provided zoneId: "${matchedZone.name}"`);
      }
    } catch (zoneErr) {
      console.warn('[CreateBooking] Zone ID lookup error:', zoneErr.message);
    }
  }

  // Once the admin has set up zones, only addresses inside one can be booked. With no active zone
  // there is nothing to enforce. Recurring visits are created by the system for a plan the customer
  // already placed, so they are not re-checked here.
  if (zoneMode && !matchedZone && hasCoordinates && !recurringContext) {
    let zonesConfigured = false;
    try {
      zonesConfigured = Boolean(await Zone.exists({ status: 'active' }));
    } catch (zoneErr) {
      console.warn('[CreateBooking] Zone check failed (not enforced):', zoneErr.message);
    }
    if (zonesConfigured) {
      const { getOutOfZonePage } = require('../utils/outOfZonePage');
      return fail(400, 'This location is outside our service area.', {
        code: 'OUT_OF_ZONE',
        outOfZonePage: await getOutOfZonePage()
      });
    }
  }

  if (matchedZone) {
    // Check if category is allowed in this zone
    const zoneCategorySet = await expandZoneCategories(matchedZone.allowedCategories);
    if (zoneCategorySet) {
      const bookedCatId = String(category?._id || categoryId || service?.categoryId || '');
      const isCategoryAllowed = zoneCategorySet.has(bookedCatId);
      if (!isCategoryAllowed) {
        return fail(400, `The requested service category is not available in ${matchedZone.name}. Please select an operational zone.`);
      }
    }
  }

  let parentCategoryTitle = null;
  if (category?.parentId) {
    try {
      const pCat = await Category.findById(category.parentId).select('title').lean();
      if (pCat?.title) parentCategoryTitle = pCat.title;
    } catch (_) {}
  }

  const matchServiceNames = [
    service?.title,
    category?.title,
    parentCategoryTitle
  ].filter(Boolean);

  const workerFilters = {
    service: matchServiceNames.length > 0 ? matchServiceNames : undefined,
    // Customers book as 'pay_at_home' (pay the professional in cash), so that is the cash case; workers
    // already over their cash limit must not be offered these bookings.
    checkCashLimit: ['cash', 'pay_at_home'].includes(paymentMethod),
    city: address.city,
    includeOffline: isScheduledBooking,
    ...(matchedZone ? { zoneId: matchedZone._id, zoneCoordinates: matchedZone.coordinates } : {})
  };

  // Zone mode: any professional in the customer's zone qualifies, however far, so the search radius
  // and a professional's own service radius are left out. Without a zone (distance mode, or zone mode
  // with no zone set up) the usual radius rules apply.
  const zoneDecides = zoneMode && !!matchedZone;
  let nearbyWorkers = await findNearbyWorkers(
    bookingLocation,
    zoneDecides ? ZONE_WIDE_RADIUS_KM : searchRadiusKm,
    workerFilters,
    { ignoreServiceArea: zoneDecides }
  );

  // Deduplicate by _id to prevent duplicate notifications
  const uniqueWorkerIds = new Set();
  nearbyWorkers = nearbyWorkers.filter((worker) => {
    const idStr = worker._id.toString();
    if (uniqueWorkerIds.has(idStr)) return false;
    uniqueWorkerIds.add(idStr);
    return true;
  });

  // Availability rules:
  //  - instant: only workers who are not at work right now
  //  - scheduled: workers on a job right now still qualify (the job is later), but anyone whose
  //    jobs overlap the slot (job length + travel buffer) is skipped
  if (isScheduledBooking) {
    if (Number.isFinite(scheduledSlotStart)) {
      const conflicts = await getConflictingWorkerIds(nearbyWorkers, { slotStart: scheduledSlotStart, config });
      nearbyWorkers = nearbyWorkers.filter((w) => !conflicts.has(String(w._id)));
    }
    if (!config.allowBusyWorkersForScheduled) {
      const busy = await getBusyWorkerIds(nearbyWorkers);
      nearbyWorkers = nearbyWorkers.filter((w) => !busy.has(String(w._id)));
    }
  } else if (config.excludeBusyWorkersForInstant) {
    const busy = await getBusyWorkerIds(nearbyWorkers);
    nearbyWorkers = nearbyWorkers.filter((w) => !busy.has(String(w._id)));
  }

  const rankedWorkers = await rankWorkers(nearbyWorkers, config, {
    radiusKm: searchRadiusKm,
    isEmergency,
    preferredWorkerId: recurringContext?.preferredWorkerId || null
  });

  console.log(`[CreateBooking] ${rankedWorkers.length} eligible workers (strategy: ${config.assignmentStrategy}, emergency: ${isEmergency})`);

  // ── Pricing ──
  let basePrice, discount, tax, finalAmount;
  const bookingStatus = BOOKING_STATUS.SEARCHING;
  let bookingPaymentStatus = PAYMENT_STATUS.PENDING;

  // 1. Plan benefits
  let usePlanBenefits = false;
  if (paymentMethod === 'plan_benefit') {
    if (user.plans && user.plans.isActive) {
      if (user.plans.expiry && new Date() > new Date(user.plans.expiry)) {
        user.plans.isActive = false;
        await user.save();
        paymentMethod = 'pay_at_home';
      } else {
        usePlanBenefits = true;
      }
    } else {
      paymentMethod = 'pay_at_home';
    }
  }

  if (usePlanBenefits) {
    const Plan = require('../models/Plan');
    const userPlan = (user.plans.planId ? await Plan.findById(user.plans.planId) : null)
      || await Plan.findOne({ name: user.plans.name });

    if (!userPlan) {
      usePlanBenefits = false;
      paymentMethod = 'pay_at_home';
    } else {
      const isCategoryCovered = categoryId && userPlan.freeCategories &&
        userPlan.freeCategories.some((cat) => String(cat?._id || cat) === String(categoryId));
      const isServiceCovered = serviceId && userPlan.freeServices &&
        userPlan.freeServices.some((svc) => String(svc?._id || svc) === String(serviceId));
      const isBonusCovered = serviceId && userPlan.bonusServices &&
        userPlan.bonusServices.some((bs) => String(bs.serviceId?._id || bs.serviceId) === String(serviceId));

      if (isCategoryCovered || isServiceCovered || isBonusCovered) {
        basePrice = totalServiceValue > 0 ? totalServiceValue : (service.basePrice || 500);
        discount = basePrice; // Full discount
        tax = 0;
        visitingCharges = 0;
        finalAmount = pendingPenalty; // User only pays penalty
      } else {
        usePlanBenefits = false;
        paymentMethod = 'pay_at_home';
      }
    }
  }

  // 2. Standard pricing
  //
  // Policy values are decided here, never by the app: the visiting charge comes from the admin
  // setting and GST is calculated on the net service amount at the admin GST rate. The app only
  // contributes the cart's service amounts (basePrice / discount), which are sanity-checked and
  // must not fall below the cheapest legitimate price of the service.
  if (!usePlanBenefits) {
    const hasBreakdown = amount && amount > 0 && reqBasePrice !== undefined && reqBasePrice !== null;

    if (hasBreakdown) {
      const clientBase = Number(reqBasePrice);
      const clientDiscount = Number(reqDiscount) || 0;
      if (!Number.isFinite(clientBase) || clientBase < 0 || clientDiscount < 0 || clientDiscount > clientBase) {
        return fail(400, 'Invalid price details. Please review your cart and try again.', { code: 'PRICE_INVALID' });
      }

      basePrice = clientBase;
      discount = clientDiscount;
    } else {
      // No usable breakdown (older app, or a recurring visit): price from the service itself.
      // totalServiceValue already resolved through the service's pricing type (hourly rate x
      // hours, inspection fee, etc.) above.
      basePrice = totalServiceValue || service.basePrice || 500;
      discount = service.discountPrice ? Math.max(0, basePrice - service.discountPrice) : 0;
    }

    let netService = Math.max(0, basePrice - discount);

    // Only an active plan can make a booking free. A request that claims a zero amount without one
    // (a plan that expired, or a tampered request) is priced from the service instead.
    if (netService === 0) {
      basePrice = totalServiceValue || service.basePrice || 500;
      discount = service.discountPrice ? Math.max(0, basePrice - service.discountPrice) : 0;
      netService = Math.max(0, basePrice - discount);
    }

    if (hasBreakdown && paymentMethod !== 'plan_benefit' && netService > 0) {
      const floor = lowestServicePrice(service);
      if (floor > 0 && netService + 0.5 < floor) {
        return fail(400, 'The price for this service has changed. Please review your cart and try again.', { code: 'PRICE_MISMATCH' });
      }
    }

    tax = Math.round(netService * gstPct / 100);
    visitingCharges = netService > 0 ? adminVisitingCharge : 0;
    finalAmount = (netService + tax + visitingCharges) + pendingPenalty;
  }

  // Service value before any extras: the base for percentage surcharges and
  // the recurring discount.
  const serviceValue = usePlanBenefits ? basePrice : Math.max(0, basePrice - discount);

  // 3. Coupon — re-validated here rather than trusting a client discount.
  let appliedCoupon = null;
  let couponDiscount = 0;
  if (couponCode && !recurringContext) {
    const result = await validateCoupon(couponCode, {
      userId,
      orderAmount: basePrice,
      categoryId: service.categoryId || category,
      serviceId,
      // The zone found from the address, not the one the app claims; it also fixes the city
      zoneId: matchedZone?._id,
      cityId
    });

    if (!result.valid) {
      return fail(400, result.reason, { code: 'COUPON_INVALID' });
    }
    appliedCoupon = result.coupon;
    couponDiscount = result.discount;
    discount += couponDiscount;
    finalAmount = Math.max(0, finalAmount - couponDiscount);
  }

  // 4. Extras: add-ons and emergency surcharge. Added to basePrice so the bill,
  //    GST and worker earnings all include them without special handling.
  let emergencyCharge = 0;
  if (isEmergency) {
    emergencyCharge = config.emergencySurchargeType === 'percentage'
      ? roundMoney(serviceValue * config.emergencySurchargeValue / 100)
      : roundMoney(config.emergencySurchargeValue);
  }

  const extrasBase = addOnsTotal + emergencyCharge;
  if (extrasBase > 0) {
    const extrasTax = roundMoney(extrasBase * gstPct / 100);
    basePrice += extrasBase;
    tax += extrasTax;
    finalAmount += extrasBase + extrasTax;
  }

  // Zone Surge Pricing
  if (matchedZone?.surgePricing?.enabled && matchedZone.surgePricing.multiplier > 1) {
    const surgeMultiplier = matchedZone.surgePricing.multiplier;
    const preSurge = basePrice;
    basePrice = roundMoney(basePrice * surgeMultiplier);
    const surgeDiff = basePrice - preSurge;
    const surgeTax = roundMoney(surgeDiff * gstPct / 100);
    tax += surgeTax;
    finalAmount += (surgeDiff + surgeTax);
    console.log(`[CreateBooking] Zone surge pricing applied: ${surgeMultiplier}x (+₹${surgeDiff}) in ${matchedZone.name}`);
  }

  // 5. Recurring discount on the service value (not on extras or plan visits).
  const recurringDiscountPct = recurringContext
    ? (recurringContext.discountPercentage || 0)
    : (recurringPlan ? config.recurringDiscountPercentage : 0);
  if (recurringDiscountPct > 0 && !usePlanBenefits) {
    const recurringDiscount = roundMoney(serviceValue * recurringDiscountPct / 100);
    const recurringTaxCut = Math.min(tax, roundMoney(recurringDiscount * gstPct / 100));
    discount += recurringDiscount;
    tax -= recurringTaxCut;
    finalAmount = Math.max(0, finalAmount - recurringDiscount - recurringTaxCut);
  }

  if (usePlanBenefits) {
    bookingPaymentStatus = finalAmount > 0 ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.PLAN_COVERED;
  }

  // Note: pendingPenalty is recorded in booking.penalty and included in finalAmount.
  // It is cleared from user.wallet.penalty only once payment is verified or cash is collected.

  // Ensure minimum amount for Razorpay (₹1) for paid bookings
  if (finalAmount < 1 && paymentMethod !== 'plan_benefit') {
    finalAmount = 1;
  }

  const bookingNumber = `BK${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  const formattedBookedItems = (Array.isArray(bookedItems) && bookedItems.length > 0) ? bookedItems.map((item) => ({
    brandName: item.brandName || item.sectionTitle || item.brand || '',
    brandIcon: item.brandIcon || item.sectionIcon || item.icon || null,
    card: item.card || item,
    quantity: item.quantity || 1,
    details: item.details || []
  })) : [];

  const categoryIcon = category?.icon || category?.image || service.iconUrl || 'https://cdn-icons-png.flaticon.com/512/3500/3500833.png';
  let brandName = null;
  let brandIcon = null;
  if (formattedBookedItems.length > 0) {
    const distinctBrands = [...new Set(formattedBookedItems.map((item) => item.brandName).filter(Boolean))];
    if (distinctBrands.length > 0) brandName = distinctBrands.join(', ');
    brandIcon = formattedBookedItems[0].brandIcon || null;
  }

  // Search deadline; the scheduler cancels the booking if no one accepts by then. Instant bookings
  // use the normal search time. Scheduled ones stay open until `scheduledBookingCutoffHours`
  // before the slot, but never for less than the normal search time.
  const normalDeadline = Date.now() + maxSearchTimeMins * 60 * 1000;
  const searchDeadline = new Date(
    isScheduledBooking && Number.isFinite(scheduledSlotStart)
      ? Math.max(normalDeadline, scheduledSlotStart - (config.scheduledBookingCutoffHours || 0) * 60 * 60 * 1000)
      : normalDeadline
  );

  const booking = new Booking({
    bookingNumber,
    userId,
    vendorId: null, // Assigned when a worker accepts
    serviceId,
    zoneId: matchedZone ? matchedZone._id : null,
    surgePricing: matchedZone?.surgePricing?.enabled ? {
      enabled: true,
      multiplier: matchedZone.surgePricing.multiplier || 1
    } : { enabled: false, multiplier: 1 },
    categoryId: category?._id || categoryId,
    serviceName: service.title,
    serviceCategory: reqServiceCategory || category?.title || service.category || 'General',
    categoryIcon: reqCategoryIcon || categoryIcon,
    brandName: reqBrandName || brandName,
    brandIcon: reqBrandIcon || brandIcon,
    bookingType: bookingType || 'scheduled',
    pricingType: service.pricingType || 'fixed',
    // Cart-priced hourly items already carry the hours the customer picked
    // (sent as `hours` alongside the priced bookedItems); direct bookings
    // resolve it server-side above into resolvedHours.
    hoursBooked: resolvedHours || (service.pricingType === 'hourly' ? (Number(reqHours) || null) : null),
    hourlyRateApplied: service.pricingType === 'hourly' ? (Number(service.hourlyRate) || Number(service.basePrice) || null) : null,
    isInspectionOnly: service.pricingType === 'inspection_fee',

    description: service.description,
    serviceImages: service.images || [],
    bookedItems: formattedBookedItems,
    addOns: addOnItems,
    addOnsTotal,
    isEmergency,
    emergencyCharge,
    customerNotes,
    issuePhotos: sanitizeIssuePhotos(issuePhotos, config.maxIssuePhotos),
    issueVideos: config.isIssueVideoEnabled ? sanitizeIssueVideos(issueVideos, config.maxIssueVideos) : [],
    recurringBookingId: recurringContext?.recurringBookingId || null,
    basePrice,
    discount,
    couponId: appliedCoupon?._id || null,
    couponCode: appliedCoupon?.code || null,
    couponDiscount,
    tax,
    visitingCharges,
    // A cancellation fee carried over from an earlier booking. It is part of finalAmount now and
    // is recorded here so the final bill can charge it too (the bill replaces finalAmount).
    penalty: pendingPenalty,
    finalAmount,
    userPayableAmount: finalAmount,
    address: {
      type: address.type || 'home',
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark || '',
      lat: address.lat || null,
      lng: address.lng || null
    },
    scheduledDate: new Date(scheduledDate),
    scheduledTime,
    timeSlot: {
      start: timeSlot.start,
      end: timeSlot.end
    },
    paymentMethod: paymentMethod || null,
    status: bookingStatus,
    paymentStatus: bookingPaymentStatus,
    // Search deadline; the scheduler cancels the booking if no one accepts by then
    expiresAt: searchDeadline
  });
  booking.$locals.actor = recurringContext ? 'system' : 'user';
  await booking.save();

  // Record the coupon use now that the booking exists (idempotent per booking).
  if (appliedCoupon) {
    try {
      await redeemCoupon(appliedCoupon._id, {
        userId,
        bookingId: booking._id,
        discountAmount: couponDiscount,
        orderAmount: basePrice
      });
    } catch (couponErr) {
      console.error('[Coupon] Redemption failed:', couponErr.message);
    }
  }

  // Start a recurring plan from this first visit.
  let recurringBooking = null;
  if (recurringPlan) {
    try {
      // Replayed for every later visit; scheduling, coupons and the photos of
      // this visit's problem are deliberately left out.
      const bookingTemplate = {
        serviceId: String(serviceId),
        address,
        bookedItems,
        addOns: addOnItems.map((a) => ({ addOnId: String(a.addOnId), quantity: a.quantity })),
        customerNotes,
        paymentMethod: paymentMethod === 'plan_benefit' ? 'plan_benefit' : 'pay_at_home',
        amount,
        basePrice: reqBasePrice,
        discount: reqDiscount,
        tax: reqTax,
        visitationFee: reqVisitationFee,
        visitingCharges: reqVisitingCharges,
        serviceCategory: reqServiceCategory,
        categoryIcon: reqCategoryIcon,
        brandName: reqBrandName,
        brandIcon: reqBrandIcon,
        cityId
      };

      recurringBooking = await RecurringBooking.create({
        userId,
        serviceId,
        serviceName: service.title,
        serviceCategory: booking.serviceCategory,
        categoryIcon: booking.categoryIcon,
        frequency: recurringPlan.frequency,
        occurrencesPlanned: recurringPlan.occurrences,
        occurrencesCreated: 1,
        nextOccurrenceAt: nextOccurrenceDate(booking.scheduledDate, recurringPlan.frequency),
        scheduledTime,
        timeSlot: { start: timeSlot.start, end: timeSlot.end },
        bookingTemplate,
        discountPercentage: recurringDiscountPct,
        bookingIds: [booking._id]
      });

      booking.recurringBookingId = recurringBooking._id;
      await Booking.updateOne({ _id: booking._id }, { $set: { recurringBookingId: recurringBooking._id } });
    } catch (recErr) {
      // The visit itself is booked; losing the plan must not fail it.
      console.error('[CreateBooking] Failed to create recurring plan:', recErr.message);
    }
  }

  const wave1Workers = rankedWorkers.slice(0, isScheduledBooking ? rankedWorkers.length : firstWaveSize);
  const sendToAdmin = rankedWorkers.length === 0 && config.isAdminAssignmentEnabled !== false;

  const body = {
    success: true,
    message: 'Booking created successfully. We are finding workers for you.',
    noWorkersFound: rankedWorkers.length === 0,
    // Nobody could be alerted automatically, so the booking waits for an admin to pick a
    // professional instead of being cancelled.
    sentToAdmin: sendToAdmin,
    // Live search details for the checkout "searching" popup; later waves
    // arrive as 'booking_search_progress' socket events.
    search: {
      // No radius when the zone decides
      radiusKm: zoneDecides ? null : searchRadiusKm,
      nearbyCount: rankedWorkers.length,
      notifiedCount: wave1Workers.length,
      wave: 1,
      maxSearchTimeMins,
      expiresAt: booking.expiresAt,
      isEmergency
    },
    recurring: recurringBooking ? {
      _id: recurringBooking._id,
      frequency: recurringBooking.frequency,
      occurrencesPlanned: recurringBooking.occurrencesPlanned,
      nextOccurrenceAt: recurringBooking.nextOccurrenceAt
    } : null,
    data: {
      _id: booking._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      finalAmount: booking.finalAmount,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      address: booking.address,
      serviceName: booking.serviceName,
      categoryIcon: booking.categoryIcon,
      brandName: booking.brandName,
      brandIcon: booking.brandIcon,
      isEmergency: booking.isEmergency,
      addOns: booking.addOns,
      recurringBookingId: booking.recurringBookingId
    }
  };

  const afterResponse = () => dispatchNewBooking({
    bookingId: booking._id,
    userId,
    serviceId,
    vendorId,
    isPlusAdded,
    rankedWorkers,
    wave1Workers,
    fromRecurring: !!recurringContext,
    sendToAdmin,
    noWorkerReason: matchedZone ? 'no_worker_in_zone' : 'no_worker_nearby'
  });

  return { statusCode: 201, body, afterResponse, booking };
};

/**
 * Alerts the first wave of workers and sends the booking notifications.
 * Runs after the HTTP response; failures are logged, never thrown.
 */
const dispatchNewBooking = async ({
  bookingId, userId, serviceId, vendorId, isPlusAdded, rankedWorkers, wave1Workers, fromRecurring,
  sendToAdmin = false, noWorkerReason = 'no_worker_nearby'
}) => {
  try {
    const userForBackground = await User.findById(userId);
    const bookingForBackground = await Booking.findById(bookingId)
      .populate('userId', 'name phone email')
      .populate('serviceId', 'title iconUrl')
      .populate('categoryId', 'title slug');
    const serviceForBackground = await Service.findById(serviceId);

    if (!userForBackground || !bookingForBackground || !serviceForBackground) {
      console.error('[CreateBooking] Background task failed: User, Booking or Service not found after creation.');
      return;
    }

    if (isPlusAdded) {
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      userForBackground.plans = {
        isActive: true,
        name: 'Plus Membership',
        expiry: expiryDate,
        price: 999
      };
      await userForBackground.save();
    }

    // Store the full ranked list for the scheduler's later waves.
    bookingForBackground.potentialVendors = rankedWorkers.map((v) => ({
      vendorId: v._id,
      distance: v.distance || 0,
      score: v.score ?? null
    }));
    bookingForBackground.currentWave = 1;
    bookingForBackground.waveStartedAt = new Date();
    bookingForBackground.notifiedVendors = wave1Workers.map((v) => v._id);

    if (wave1Workers.length === 0 && !sendToAdmin) {
      console.warn('[CreateBooking] NO WORKERS FOUND nearby! Push notifications will not be sent.');
      bookingForBackground.status = BOOKING_STATUS.NO_WORKERS;
      bookingForBackground.$locals.timelineNote = 'No professionals available nearby';
    }
    await bookingForBackground.save();

    // Nobody to alert: hand the booking to the admin to assign by hand (see adminAssignmentService)
    if (wave1Workers.length === 0 && sendToAdmin) {
      console.warn(`[CreateBooking] No eligible professional (${noWorkerReason}); sending to the admin queue.`);
      await require('./adminAssignmentService').queueForAdmin(bookingForBackground._id, { reason: noWorkerReason });
    }

    if (wave1Workers.length > 0) {
      const bookingRequests = wave1Workers.map((worker) => ({
        bookingId: bookingForBackground._id,
        vendorId: worker._id,
        status: 'PENDING',
        wave: 1,
        distance: worker.distance || null,
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }));

      try {
        await BookingRequest.insertMany(bookingRequests, { ordered: false });
      } catch (err) {
        if (err.code !== 11000) console.error('[CreateBooking] BookingRequest insert error:', err);
      }
    }

    const alertPayload = buildWorkerAlertPayload(bookingForBackground, userForBackground, serviceForBackground);

    const { getIO } = require('../sockets');
    let io = null;
    try { io = getIO(); } catch (_) { io = null; }

    if (io) {
      wave1Workers.forEach((worker) => {
        io.to(`vendor_${worker._id.toString()}`).emit('new_booking_request', {
          ...alertPayload,
          distance: worker.distance,
          message: bookingForBackground.isEmergency
            ? `🚨 EMERGENCY request within ${worker.distance?.toFixed(1) || '?'}km!`
            : `New booking request within ${worker.distance?.toFixed(1) || '?'}km!`
        });
      });

      if (wave1Workers.length > 0) {
        io.to(`user_${userId}`).emit('booking_search_progress', {
          bookingId: bookingForBackground._id,
          wave: 1,
          notifiedCount: wave1Workers.length,
          nearbyCount: rankedWorkers.length
        });
      }
    }

    try {
      await Promise.all(wave1Workers.map((worker) =>
        createNotification({
          vendorId: worker._id,
          type: 'booking_request',
          title: bookingForBackground.isEmergency ? '🚨 Emergency Booking Request' : 'New Booking Request',
          message: `New service request for ${serviceForBackground.title} from ${userForBackground.name}`,
          relatedId: bookingForBackground._id,
          relatedType: 'booking',
          priority: bookingForBackground.isEmergency ? 'high' : null,
          data: {
            bookingId: bookingForBackground._id,
            serviceName: serviceForBackground.title,
            customerName: userForBackground.name,
            customerPhone: userForBackground.phone,
            scheduledDate: bookingForBackground.scheduledDate,
            scheduledTime: bookingForBackground.scheduledTime,
            location: bookingForBackground.address,
            price: bookingForBackground.finalAmount,
            distance: worker.distance,
            isEmergency: bookingForBackground.isEmergency
          },
          pushData: {
            type: 'new_booking',
            dataOnly: false,
            link: `/worker/bookings/${bookingForBackground._id}`
          }
        })
      ));
    } catch (notifError) {
      console.error('[CreateBooking] Notification error (non-blocking):', notifError.message);
    }

    await createNotification({
      userId,
      type: fromRecurring ? 'recurring_booking_created' : 'booking_requested',
      title: fromRecurring ? 'Recurring visit booked' : 'Booking Created',
      message: fromRecurring
        ? `Your next ${serviceForBackground.title} visit (${bookingForBackground.bookingNumber}) is booked for ${new Date(bookingForBackground.scheduledDate).toLocaleDateString('en-IN')}. We are finding a professional.`
        : `Your booking ${bookingForBackground.bookingNumber} has been created successfully.`,
      relatedId: bookingForBackground._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_requested',
        bookingId: bookingForBackground._id.toString(),
        link: `/user/booking/${bookingForBackground._id}`
      }
    });

    // A recurring visit never came from the cart. Only clear booked cart items if workers were found.
    if (!fromRecurring && wave1Workers.length > 0) {
      const cart = await Cart.findOne({ userId });
      if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
        const remainingItems = cart.items.filter((item) => {
          const itemServiceId = item.serviceId ? String(item.serviceId._id || item.serviceId) : '';
          const matchService = itemServiceId && itemServiceId === String(serviceId);
          const itemCatId = item.categoryId ? String(item.categoryId._id || item.categoryId) : '';
          const svcCatId = serviceForBackground?.categoryId ? String(serviceForBackground.categoryId._id || serviceForBackground.categoryId) : '';
          const matchCategory = itemCatId && svcCatId && itemCatId === svcCatId;
          return !matchService && !matchCategory;
        });
        cart.items = remainingItems;
        await cart.save();
      }
    }

    if (vendorId) {
      await createNotification({
        vendorId,
        type: 'booking_created',
        title: 'New Booking Received',
        message: `You have received a new booking ${bookingForBackground.bookingNumber} for ${serviceForBackground.title}.`,
        relatedId: bookingForBackground._id,
        relatedType: 'booking'
      });
    }

    const workerObj = vendorId ? await require('../models/Worker').findById(vendorId).lean() : null;
    const { sendBookingEmails } = require('./emailService');
    sendBookingEmails(bookingForBackground, userForBackground, workerObj, serviceForBackground)
      .catch((err) => console.error('[CreateBooking][bg] Email error:', err));
  } catch (bgErr) {
    console.error('[CreateBooking][bg] Background task failed:', bgErr);
  }
};

/**
 * Socket payload for a 'new_booking_request' alert. Shared with the wave
 * scheduler so every wave shows workers the same details.
 */
const buildWorkerAlertPayload = (booking, user, service) => ({
  bookingId: booking._id,
  bookingType: booking.bookingType,
  expiresAt: booking.expiresAt,
  bookingNumber: booking.bookingNumber,
  serviceName: service?.title || booking.serviceName,
  customerName: user?.name || 'Customer',
  customerPhone: user?.phone,
  scheduledDate: booking.scheduledDate,
  scheduledTime: booking.scheduledTime,
  price: booking.finalAmount,
  address: booking.address,
  serviceCategory: booking.serviceCategory,
  brandName: booking.brandName,
  brandIcon: booking.brandIcon,
  categoryIcon: booking.categoryIcon,
  issuePhotos: booking.issuePhotos || [],
  issueVideos: booking.issueVideos || [],
  customerNotes: booking.customerNotes || null,
  bookedDetails: summariseBookedDetails(booking),
  addOns: (booking.addOns || []).map((a) => ({ title: a.title, quantity: a.quantity })),
  isEmergency: !!booking.isEmergency,
  bookingType: booking.bookingType,
  createdAt: booking.createdAt || new Date(),
  // Workers can accept until the search ends.
  expiresAt: new Date(booking.expiresAt || Date.now() + 60 * 1000).toISOString(),
  playSound: true
});

module.exports = { placeBooking, buildWorkerAlertPayload };
