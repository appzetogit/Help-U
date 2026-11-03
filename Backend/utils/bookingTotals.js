/**
 * The running total of a booking: what it costs right now, what has been paid, and what is still due.
 *
 * One calculation for every screen (the customer's order summary, the professional's invoice and the amount
 * to collect), so they can never disagree. Rules:
 *
 *   - Before a bill exists, the booking's own amount does not yet include repair services the customer added
 *     after inspection, so they are added here (priced, with GST, exactly as the bill will price them).
 *   - Once the professional's bill is sent, `finalAmount` is the bill total and already includes everything.
 *   - While a bill is only a draft the customer must not see its numbers, so for the customer the total stays
 *     the estimate (the booking's own parts plus the repair services).
 *   - Money paid before the final bill counts: an advance the professional asked for, and a booking paid
 *     online up front.
 */

const { PAYMENT_STATUS, BOOKING_STATUS } = require('./constants');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

const PAID = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.PAID, PAYMENT_STATUS.COLLECTED_BY_WORKER, PAYMENT_STATUS.COLLECTED_BY_WORKER_LEGACY];

/**
 * @param booking  a booking (document or plain object)
 * @param options  { gstPct: service GST %, forCustomer: hide a draft bill's numbers }
 */
const computeBookingTotals = (booking, { gstPct = 18, forCustomer = false } = {}) => {
  const hasBill = !!booking.vendorBillId;
  const billSent = hasBill && !!booking.billFinalizedAt;

  // Repair services the customer added after inspection (a free-text "other problem" has no price yet)
  const repair = [];
  let unpricedRepairs = 0;
  for (const item of booking.customerAddedServices || []) {
    if (item.isOther || !(num(item.unitPrice) > 0)) { unpricedRepairs += 1; continue; }
    const quantity = Math.max(1, num(item.quantity) || 1);
    const base = round2(num(item.unitPrice) * quantity);
    const gst = round2((base * gstPct) / 100);
    repair.push({ title: item.title, quantity, unitPrice: round2(item.unitPrice), base, gst, total: round2(base + gst) });
  }
  const repairBase = round2(repair.reduce((s, r) => s + r.base, 0));
  const repairGst = round2(repair.reduce((s, r) => s + r.gst, 0));
  const repairTotal = round2(repairBase + repairGst);

  // What the booking cost when it was made (rebuilt from its parts, since a bill overwrites finalAmount)
  const addOns = round2(num(booking.addOnsTotal));
  const emergency = round2(num(booking.emergencyCharge));
  const discount = round2(num(booking.discount));
  const service = round2(Math.max(0, num(booking.basePrice) - addOns - emergency));
  const visiting = round2(num(booking.visitingCharges));
  const penalty = round2(num(booking.penalty));
  const bookingGst = round2(num(booking.tax));
  const original = round2(Math.max(0, num(booking.basePrice) - discount) + bookingGst + visiting + penalty);

  let total;
  if (billSent) total = round2(num(booking.finalAmount));
  else if (hasBill) total = forCustomer ? round2(original + repairTotal) : round2(num(booking.finalAmount));
  else total = round2(num(booking.finalAmount) + repairTotal);

  // The professional's own additions (their services and parts) show up once a bill exists
  const known = round2(service + addOns + emergency - discount + repairBase + repairGst + visiting + penalty + bookingGst);
  const additional = hasBill && (billSent || !forCustomer) ? round2(total - known) : 0;

  // Money already paid
  const advancePaid = booking.advancePayment?.status === 'paid'
    ? round2(num(booking.advancePayment.paidAmount) || num(booking.advancePayment.requestedAmount))
    : 0;
  const paidInFull = !!booking.cashCollected
    || booking.status === BOOKING_STATUS.COMPLETED
    || (PAID.includes(booking.paymentStatus) && billSent);
  // Paid online before any bill: that payment covered the booking as it was then
  const prepaid = num(booking.prepaidAmount) > 0
    ? round2(num(booking.prepaidAmount))
    : (PAID.includes(booking.paymentStatus) && !hasBill && !paidInFull ? round2(num(booking.finalAmount)) : 0);

  const paid = paidInFull ? total : round2(Math.min(total, advancePaid + prepaid));
  const due = round2(Math.max(0, total - paid));

  return {
    hasBill,
    billSent,
    estimated: !billSent && (repair.length > 0 || unpricedRepairs > 0),
    unpricedRepairs,
    lines: {
      service,
      addOns,
      emergency,
      discount,
      repair,
      visiting,
      penalty,
      gst: round2(bookingGst + repairGst),
      additional
    },
    total,
    advancePaid,
    prepaid,
    paid,
    due,
    paidInFull
  };
};

module.exports = { computeBookingTotals, PAID };
