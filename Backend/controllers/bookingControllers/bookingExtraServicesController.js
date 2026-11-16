const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const UserService = require('../../models/UserService');
const { BOOKING_STATUS } = require('../../utils/constants');
const { getBookingConfig } = require('../../utils/bookingConfig');
const { getDisplayPricing } = require('../../utils/servicePricing');
const { computeBookingTotals } = require('../../utils/bookingTotals');
const { createNotification } = require('../notificationControllers/notificationController');

/**
 * Customer-added repair services
 * ──────────────────────────────
 * After the professional inspects on site (typically a "Visit" booking), the
 * customer can pick the repair services needed from the same brand + category
 * catalog, or describe another problem. Prices are resolved here from the
 * catalog (never from the client) and the selection is folded into the worker
 * bill automatically when it is generated (see workerBillController).
 */

// The professional has arrived and the job is open, so the problem is known
const EDITABLE_STATUSES = [BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.WORK_DONE];
const MAX_ITEMS = 10;
const MAX_QUANTITY = 10;
const MAX_NOTE = 300;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Fixed-price style services can be added after inspection; hourly needs a duration,
// quote_required has no price and inspection_fee is another visit.
const isAddable = (service) => !['hourly', 'quote_required', 'inspection_fee'].includes(service.pricingType || 'fixed');

const editability = (booking) => {
  if (booking.vendorBillId) {
    return { canEdit: false, reason: 'The bill has already been generated. Ask your professional to update it.' };
  }
  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return { canEdit: false, reason: 'You can add repair services once the professional has inspected the issue.' };
  }
  return { canEdit: true, reason: null };
};

const loadOwnedBooking = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid booking ID' });
    return null;
  }
  const booking = await Booking.findById(id);
  if (!booking || String(booking.userId) !== String(req.user.id)) {
    res.status(404).json({ success: false, message: 'Booking not found' });
    return null;
  }
  return booking;
};

// Active services of the booked service's brand + category, excluding the booked one
const getCatalogOptions = async (booking) => {
  const booked = await UserService.findById(booking.serviceId).select('brandId categoryId').lean();
  if (!booked?.brandId) return [];

  const query = { brandId: booked.brandId, status: 'active', _id: { $ne: booking.serviceId } };
  const categoryId = booked.categoryId || booking.categoryId;
  if (categoryId) query.categoryId = categoryId;

  const services = await UserService.find(query).sort({ basePrice: 1 }).lean();
  return services.filter(isAddable);
};

const summarize = (items, gstPct) => {
  const base = round2(items.filter(i => !i.isOther).reduce((sum, i) => sum + i.unitPrice * i.quantity, 0));
  const gst = round2((base * gstPct) / 100);
  return { base, gst, total: round2(base + gst), gstPercentage: gstPct };
};

/**
 * GET /api/users/bookings/:id/extra-services
 */
const getExtraServices = async (req, res) => {
  try {
    const booking = await loadOwnedBooking(req, res);
    if (!booking) return;

    const [options, config] = await Promise.all([getCatalogOptions(booking), getBookingConfig()]);
    const gstPct = config.serviceGstPercentage ?? 18;
    const selected = booking.customerAddedServices || [];

    res.status(200).json({
      success: true,
      ...editability(booking),
      options: options.map(svc => {
        const display = getDisplayPricing(svc);
        return {
          id: svc._id,
          title: svc.title,
          description: svc.description || '',
          pricingType: display.pricingType,
          price: display.amount,
          label: display.label
        };
      }),
      selected,
      estimate: summarize(selected, gstPct)
    });
  } catch (error) {
    console.error('Get extra services error:', error);
    res.status(500).json({ success: false, message: 'Failed to load repair options' });
  }
};

/**
 * PUT /api/users/bookings/:id/extra-services
 * Body: { items: [{ serviceId, quantity }], otherNote }
 * Replaces the customer's selection (send an empty list to clear it).
 */
const updateExtraServices = async (req, res) => {
  try {
    const booking = await loadOwnedBooking(req, res);
    if (!booking) return;

    const { canEdit, reason } = editability(booking);
    if (!canEdit) {
      return res.status(409).json({ success: false, message: reason });
    }

    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const otherNote = typeof req.body.otherNote === 'string' ? req.body.otherNote.replace(/\s+/g, ' ').trim() : '';

    if (rawItems.length > MAX_ITEMS) {
      return res.status(400).json({ success: false, message: `You can add up to ${MAX_ITEMS} services` });
    }
    if (otherNote.length > MAX_NOTE) {
      return res.status(400).json({ success: false, message: `Please keep the problem description under ${MAX_NOTE} characters` });
    }

    // Merge duplicates and validate quantities
    const requested = new Map();
    for (const item of rawItems) {
      const id = String(item?.serviceId || '');
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid service selected' });
      }
      const quantity = Math.floor(Number(item.quantity) || 1);
      if (quantity < 1 || quantity > MAX_QUANTITY) {
        return res.status(400).json({ success: false, message: `Quantity must be between 1 and ${MAX_QUANTITY}` });
      }
      requested.set(id, Math.min(MAX_QUANTITY, (requested.get(id) || 0) + quantity));
    }

    // Only services offered for this booking, priced from the catalog
    const options = await getCatalogOptions(booking);
    const optionById = new Map(options.map(svc => [String(svc._id), svc]));
    const items = [];
    for (const [id, quantity] of requested) {
      const svc = optionById.get(id);
      if (!svc) {
        return res.status(400).json({ success: false, message: 'One of the selected services is not available for this booking' });
      }
      items.push({
        serviceId: svc._id,
        title: svc.title,
        unitPrice: round2(getDisplayPricing(svc).amount),
        quantity,
        isOther: false,
        note: ''
      });
    }
    if (otherNote) {
      items.push({ serviceId: null, title: 'Other problem', unitPrice: 0, quantity: 1, isOther: true, note: otherNote });
    }

    booking.customerAddedServices = items;
    await booking.save();

    const config = await getBookingConfig();
    const estimate = summarize(items, config.serviceGstPercentage ?? 18);
    const totals = computeBookingTotals(booking, { gstPct: config.serviceGstPercentage ?? 18 });

    // Real-time update for both vendor and customer screens
    const io = req.app.get('io');
    if (io) {
      const updatePayload = {
        bookingId: booking._id.toString(),
        customerAddedServices: booking.customerAddedServices,
        totals
      };
      if (booking.vendorId) {
        io.to(`vendor_${booking.vendorId}`).emit('booking_updated', updatePayload);
      }
      io.to(`user_${booking.userId}`).emit('booking_updated', updatePayload);
    }

    // Let the professional know so they include it in the bill
    if (booking.vendorId && items.length > 0) {
      const names = items.map(i => (i.isOther ? `Other: ${i.note}` : `${i.title}${i.quantity > 1 ? ` x${i.quantity}` : ''}`));
      createNotification({
        vendorId: booking.vendorId,
        type: 'customer_added_services',
        title: 'Customer added repair services',
        message: `${names.join(', ').slice(0, 180)} — included in the bill for booking ${booking.bookingNumber}.`,
        relatedId: booking._id,
        relatedType: 'booking',
        pushData: {
          type: 'customer_added_services',
          bookingId: booking._id.toString(),
          link: `/worker/booking/${booking._id}/billing`
        }
      }).catch(err => console.error('Notify worker (extra services) failed:', err.message));
    }

    res.status(200).json({
      success: true,
      message: items.length ? 'Repair services added' : 'Repair services cleared',
      selected: booking.customerAddedServices,
      estimate
    });
  } catch (error) {
    console.error('Update extra services error:', error);
    res.status(500).json({ success: false, message: 'Failed to update repair services' });
  }
};

module.exports = { getExtraServices, updateExtraServices };
