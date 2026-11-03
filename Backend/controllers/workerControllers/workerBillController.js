const WorkerBill = require('../../models/WorkerBill');
const Booking = require('../../models/Booking');
const WorkerServiceCatalog = require('../../models/WorkerServiceCatalog');
const WorkerPartsCatalog = require('../../models/WorkerPartsCatalog');
const Settings = require('../../models/Settings');
const { BILL_STATUS, BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { PAID: PAID_STATUSES } = require('../../utils/bookingTotals');
const { billLockReason } = require('../../utils/billLock');
const { issuePaymentCode } = require('../../utils/paymentCode');
const { resolveCommission, computeWorkerEarnings, toPayoutConfig } = require('../../services/commissionService');

/**
 * Create or Update Worker Bill
 * ────────────────────────────
 * Revenue Model:
 *   Worker → 70% of total service BASE (excl GST)
 *   Worker → 10% of total parts BASE  (excl GST)
 *   GST   → 100% retained by company
 *
 * WorkerBill is the SINGLE source of truth for earnings.
 * Booking does NOT store vendorEarnings/adminCommission.
 *
 * POST /api/workers/bookings/:bookingId/bill
 */
const createOrUpdateBill = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { services, parts, customItems, transportCharges, applyPartsGST = true, send = false } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const { USER_ROLES } = require('../../utils/constants');

    // Auth check: Worker
    const isWorkerAuth = booking.vendorId.toString() === req.user.id && req.userRole === USER_ROLES.WORKER;

    if (!isWorkerAuth) {
      return res.status(403).json({ success: false, message: 'Not authorized for this booking' });
    }

    // Never change a bill the customer is paying or has paid
    const lockReason = billLockReason(booking);
    if (lockReason) {
      return res.status(409).json({ success: false, message: lockReason });
    }

    // Always use the booking's vendorId for the bill
    const billWorkerId = booking.vendorId;

    // ── Fetch Settings (frozen snapshot) ──
    const settings = await Settings.findOne({ type: 'global' });
    const serviceGstPct = settings?.serviceGstPercentage ?? 18;
    const partsGstPct = settings?.partsGstPercentage ?? 18;

    // Commission for this worker and category, frozen into the bill.
    const commission = await resolveCommission({ workerId: billWorkerId, categoryId: booking.categoryId });

    // ═══════════════════════════════════════
    // 1. ORIGINAL SERVICE (from booking)
    // ═══════════════════════════════════════
    // basePrice already includes add-ons and any emergency surcharge. A plan
    // covers the service itself, so on plan bookings only those extras are billed.
    const isPlanBooking = booking.paymentMethod === 'plan_benefit';
    const bookingExtras = (Number(booking.addOnsTotal) || 0) + (Number(booking.emergencyCharge) || 0);
    // The bill must start from exactly what the customer agreed to at booking time:
    // the discount they got is kept, and the GST recorded on the booking is reused
    // (not recomputed from today's settings), so the "original booking" line always
    // matches the booking total the user saw. Worker earnings still use the gross base.
    const bookingDiscount = Math.max(0, Number(booking.discount) || 0);
    const originalServiceBaseForBill = isPlanBooking
      ? bookingExtras
      : Math.max(0, parseFloat(((booking.basePrice || 0) - bookingDiscount).toFixed(2)));
    const originalServiceBaseForEarnings = booking.basePrice || 0;
    const originalGST = parseFloat((Number(booking.tax) || 0).toFixed(2));
    const originalGstPct = originalServiceBaseForBill > 0
      ? parseFloat(((originalGST / originalServiceBaseForBill) * 100).toFixed(2))
      : 0;
    const visitingCharges = Number(booking.visitingCharges) || 0;

    // ═══════════════════════════════════════
    // 2. WORKER-ADDED SERVICES
    // ═══════════════════════════════════════
    const processedServices = [];
    let vendorServiceBase = 0;
    let vendorServiceGST = 0;

    if (services && Array.isArray(services)) {
      for (const item of services) {
        // Customer-added lines are rebuilt from the booking below; never trust them from the client
        if (item?.addedByCustomer) continue;

        let catalogItem = null;
        if (item.catalogId) {
          catalogItem = await WorkerServiceCatalog.findById(item.catalogId);
        }

        const name = catalogItem ? catalogItem.name : item.name;
        // Catalog prices are BASE PRICES (excl GST)
        const unitBasePrice = catalogItem ? catalogItem.price : (Number(item.price) || 0);
        const quantity = Number(item.quantity) || 1;

        const base = unitBasePrice * quantity;
        const gst = parseFloat(((base * serviceGstPct) / 100).toFixed(2));
        const totalInclusive = parseFloat((base + gst).toFixed(2));

        processedServices.push({
          catalogId: item.catalogId,
          name,
          price: unitBasePrice,
          gstPercentage: serviceGstPct,
          quantity,
          gstAmount: gst,
          total: totalInclusive,
          isOriginal: false
        });

        vendorServiceBase += base;
        vendorServiceGST += gst;
      }
    }

    // ═══════════════════════════════════════
    // 2.5 CUSTOMER-ADDED REPAIR SERVICES
    // ═══════════════════════════════════════
    // Picked by the customer after inspection; unit prices were resolved from
    // the catalog when they were added. "Other" problems carry no price — the
    // worker prices them as a service or custom item.
    for (const item of booking.customerAddedServices || []) {
      if (item.isOther || !(item.unitPrice > 0)) continue;
      const quantity = Number(item.quantity) || 1;
      const base = item.unitPrice * quantity;
      const gst = parseFloat(((base * serviceGstPct) / 100).toFixed(2));

      processedServices.push({
        name: item.title,
        price: item.unitPrice,
        gstPercentage: serviceGstPct,
        quantity,
        gstAmount: gst,
        total: parseFloat((base + gst).toFixed(2)),
        isOriginal: false,
        addedByCustomer: true
      });

      vendorServiceBase += base;
      vendorServiceGST += gst;
    }

    // ═══════════════════════════════════════
    // 3. PARTS
    // ═══════════════════════════════════════
    const processedParts = [];
    let totalPartsBase = 0;
    let partsGST = 0;

    if (parts && Array.isArray(parts)) {
      for (const item of parts) {
        let catalogItem = null;
        if (item.catalogId) {
          catalogItem = await WorkerPartsCatalog.findById(item.catalogId);
        }

        const name = catalogItem ? catalogItem.name : item.name;
        const unitBasePrice = catalogItem ? catalogItem.price : (Number(item.price) || 0);
        const quantity = Number(item.quantity) || 1;
        const pGstPct = catalogItem ? (catalogItem.gstPercentage || partsGstPct) : (Number(item.gstPercentage) || partsGstPct);

        const base = unitBasePrice * quantity;
        // Honour the worker's GST toggle — if applyPartsGST=false, force zero GST
        const effectivePGstPct = applyPartsGST ? pGstPct : 0;
        const gst = applyPartsGST ? parseFloat(((base * pGstPct) / 100).toFixed(2)) : 0;

        processedParts.push({
          catalogId: item.catalogId,
          name,
          price: unitBasePrice,
          gstPercentage: effectivePGstPct,
          quantity,
          gstAmount: gst,
          total: parseFloat((base + gst).toFixed(2))
        });

        totalPartsBase += base;
        partsGST += gst;
      }
    }

    // ═══════════════════════════════════════
    // 3.5 CUSTOM ITEMS (treated as Parts for revenue logic)
    // ═══════════════════════════════════════
    const processedCustomItems = []; // To store in bill

    if (customItems && Array.isArray(customItems)) {
      for (const item of customItems) {
        const name = item.name || 'Custom Item';
        const unitBasePrice = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;
        // Default custom items to parts GST % if not provided (usually from settings)
        const cGstPct = Number(item.gstPercentage) || partsGstPct;

        const base = unitBasePrice * quantity;
        // Honour the worker's GST toggle — if applyPartsGST=false, force zero GST on custom items too
        const effectiveCGstPct = applyPartsGST ? cGstPct : 0;
        const gst = applyPartsGST ? parseFloat(((base * cGstPct) / 100).toFixed(2)) : 0;

        processedCustomItems.push({
          name,
          price: unitBasePrice,
          gstPercentage: effectiveCGstPct,
          quantity,
          gstAmount: gst,
          total: parseFloat((base + gst).toFixed(2)),
          hsnCode: item.hsnCode || '',
          gstApplicable: applyPartsGST
        });

        // Add to PARTS totals
        totalPartsBase += base;
        partsGST += gst;
      }
    }

    // ═══════════════════════════════════════
    // 4. AGGREGATION
    // ═══════════════════════════════════════
    const totalServiceBaseForBill = parseFloat((originalServiceBaseForBill + vendorServiceBase).toFixed(2));
    const totalServiceBaseForEarnings = parseFloat((originalServiceBaseForEarnings + vendorServiceBase).toFixed(2));
    totalPartsBase = parseFloat(totalPartsBase.toFixed(2));

    const totalGST = parseFloat((originalGST + vendorServiceGST + partsGST).toFixed(2));
    const finalTransportCharges = Number(transportCharges) || 0;
    // A cancellation fee the customer still owed when this booking was made. Booking creation clears
    // it from their account, so it has to be collected here or it is lost.
    const penaltyCharges = Math.max(0, Number(booking.penalty) || 0);
    const grandTotal = parseFloat((totalServiceBaseForBill + totalPartsBase + totalGST + visitingCharges + finalTransportCharges + penaltyCharges).toFixed(2));

    // ═══════════════════════════════════════
    // 5. REVENUE SPLIT (% applied on BASE only)
    // ═══════════════════════════════════════
    const { vendorServiceEarning, vendorPartsEarning, vendorTotalEarning } = computeWorkerEarnings(commission, {
      serviceBase: totalServiceBaseForEarnings,
      partsBase: totalPartsBase
    });
    const companyRevenue = parseFloat((grandTotal - vendorTotalEarning).toFixed(2));

    // ═══════════════════════════════════════
    // 6. ALL SERVICES (original + worker-added)
    // ═══════════════════════════════════════
    const allServices = [
      {
        name: booking.serviceName || 'Original Service',
        price: originalServiceBaseForBill,
        gstPercentage: originalGstPct,
        quantity: 1,
        gstAmount: originalGST,
        total: parseFloat((originalServiceBaseForBill + originalGST).toFixed(2)),
        isOriginal: true
      },
      ...processedServices
    ];

    // ═══════════════════════════════════════
    // 7. SAVE BILL
    // ═══════════════════════════════════════
    let bill = await WorkerBill.findOne({ bookingId });

    const billData = {
      vendorId: billWorkerId,
      services: allServices,
      parts: processedParts,
      customItems: processedCustomItems,
      originalServiceBase: originalServiceBaseForBill,
      vendorServiceBase: parseFloat(vendorServiceBase.toFixed(2)),
      totalServiceBase: totalServiceBaseForBill,
      totalPartsBase,
      originalGST,
      vendorServiceGST: parseFloat(vendorServiceGST.toFixed(2)),
      partsGST: parseFloat(partsGST.toFixed(2)),
      totalGST,
      visitingCharges,
      transportCharges: finalTransportCharges,
      penaltyCharges,
      grandTotal,
      payoutConfig: toPayoutConfig(commission, {
        serviceGstPercentage: serviceGstPct,
        partsGstPercentage: partsGstPct
      }),
      vendorServiceEarning,
      vendorPartsEarning,
      vendorTotalEarning,
      companyRevenue,
      applyPartsGST,
      status: BILL_STATUS.GENERATED,
      generatedAt: new Date()
    };

    if (bill) {
      Object.assign(bill, billData);
      await bill.save();
    } else {
      bill = await WorkerBill.create({ bookingId, ...billData });
    }

    // ═══════════════════════════════════════
    // 8. UPDATE BOOKING (no earnings!)
    // ═══════════════════════════════════════
    const advancePaidAmount = booking.advancePayment?.status === 'paid'
      ? Number(booking.advancePayment?.paidAmount || booking.advancePayment?.requestedAmount || 0)
      : 0;

    // A booking paid online up front has already covered the booking as it was. Remember that amount before the
    // bill replaces finalAmount, so a bill that grows (repair services, parts) only asks for the difference
    // instead of the whole bill again.
    if (!(Number(booking.prepaidAmount) > 0) && !booking.vendorBillId && !booking.billFinalizedAt && !booking.cashCollected
      && PAID_STATUSES.includes(booking.paymentStatus)) {
      booking.prepaidAmount = Number(booking.finalAmount) || 0;
    }
    const prepaidAmount = Number(booking.prepaidAmount) || 0;

    booking.finalAmount = grandTotal;
    booking.userPayableAmount = Math.max(0, parseFloat((grandTotal - advancePaidAmount - prepaidAmount).toFixed(2)));
    if (prepaidAmount > 0) {
      // "Paid" means paid in full: a balance owed puts the booking back to pending, and it returns to paid
      // when the balance is settled (or if the bill comes back down to what was already paid).
      if (booking.userPayableAmount > 0 && PAID_STATUSES.includes(booking.paymentStatus)) {
        booking.paymentStatus = PAYMENT_STATUS.PENDING;
      } else if (booking.userPayableAmount === 0 && booking.paymentStatus === PAYMENT_STATUS.PENDING) {
        booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
      }
    }
    booking.vendorBillId = bill._id;
    // The customer sees the bill only when the worker sends it (opens the Review step); any other
    // save withdraws it until it is sent again.
    const wasSent = !!booking.billFinalizedAt;
    const sendNow = send === true && booking.status === BOOKING_STATUS.WORK_DONE;
    booking.billFinalizedAt = sendNow ? (booking.billFinalizedAt || new Date()) : null;

    if (sendNow) {
      issuePaymentCode(booking);
    }
    await booking.save();

    if (sendNow && !wasSent) {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          status: booking.status,
          finalAmount: booking.finalAmount,
          userPayableAmount: booking.userPayableAmount,
          billFinalizedAt: booking.billFinalizedAt,
          customerConfirmationOTP: booking.customerConfirmationOTP,
          paymentOtp: booking.customerConfirmationOTP // old name, kept for app builds that still read it
        });
      }
      try {
        const { createNotification } = require('../notificationControllers/notificationController');
        await createNotification({
          userId: booking.userId,
          type: 'work_done',
          title: 'Your bill is ready',
          message: `Bill: ₹${booking.userPayableAmount}. Review it and pay online, or share your verification code with the professional.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high',
          pushData: {
            type: 'work_done',
            bookingId: booking._id.toString(),
            link: `/user/booking/${booking._id}`
          }
        });
      } catch (notifyError) {
        console.error('Bill ready notification failed:', notifyError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Bill generated successfully',
      bill,
      financials: {
        grandTotal,
        vendorTotalEarning,
        companyRevenue,
        breakdown: {
          serviceBase: totalServiceBaseForBill,
          partsBase: totalPartsBase,
          totalGST
        }
      }
    });

  } catch (error) {
    console.error('Create bill error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate bill' });
  }
};

/**
 * Get Bill by Booking ID
 * GET /api/workers/bookings/:bookingId/bill
 */
const getBillByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const { USER_ROLES } = require('../../utils/constants');

    const isWorkerAuth = booking.vendorId.toString() === req.user.id && req.userRole === USER_ROLES.WORKER;

    if (!isWorkerAuth) {
      return res.status(403).json({ success: false, message: 'Not authorized for this booking' });
    }

    const bill = await WorkerBill.findOne({ bookingId }).populate('services.catalogId parts.catalogId');

    if (!bill) {
      // Return 200 instead of 404 to gracefully tell the frontend that a bill is not yet created
      // This prevents Ugly `404 (Not Found)` network errors in the console from Axios on page load
      return res.status(200).json({ success: true, bill: null, message: 'Bill not found' });
    }

    res.status(200).json({ success: true, bill });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch bill' });
  }
};

module.exports = {
  createOrUpdateBill,
  getBillByBookingId
};
