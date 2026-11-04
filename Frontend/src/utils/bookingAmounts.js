/**
 * Small helpers for how a booking's money is described to the customer.
 * The numbers themselves come from the server (`booking.totals`, `cancellationFee`, `refundedAmount`).
 */

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const isEnded = (status) => ['cancelled', 'rejected'].includes(String(status || '').toLowerCase());

/**
 * What a cancelled booking cost the customer, in words: the cancellation fee (if any) and any refund.
 * A cancelled booking is never "owed" at its full price; at most the fee is, and an unpaid fee is carried onto the
 * customer's next booking.
 */
export const cancelledSummary = (booking) => {
  const fee = Number(booking?.cancellationFee) || 0;
  const refunded = Number(booking?.refundedAmount) || 0;

  const advancePaid = booking?.advancePayment?.status === 'paid'
    ? Number(booking?.advancePayment?.paidAmount || booking?.advancePayment?.requestedAmount || 0)
    : 0;
  const prepaid = Number(booking?.prepaidAmount || 0);
  const isPaid = ['success', 'paid', 'collected_by_vendor', 'collected_by_worker'].includes(String(booking?.paymentStatus || '').toLowerCase());
  const finalAmt = isPaid ? Number(booking?.finalAmount || 0) : 0;
  const totalPaid = Math.max(advancePaid + prepaid, advancePaid + finalAmt, Number(booking?.totals?.paid || 0));

  const feeCovered = booking?.feeCovered === true ||
    String(booking?.paymentStatus || '').toLowerCase() === 'fee_settled' ||
    (fee > 0 && totalPaid >= fee);

  if (refunded > 0 && fee > 0) {
    return { headline: `Refunded ${inr(refunded)}`, detail: `Your ${inr(fee)} cancellation fee was deducted from the refund.`, fee, refunded, feeSettled: true };
  }
  if (refunded > 0) {
    return { headline: `Refunded ${inr(refunded)}`, detail: 'The full amount went back to your wallet.', fee, refunded, feeSettled: true };
  }
  if (feeCovered && fee > 0) {
    return { headline: 'Fee Settled', detail: `Your ${inr(fee)} cancellation fee was covered by your payment. No amount is due.`, fee, refunded, feeSettled: true };
  }
  if (fee > 0) {
    return { headline: `Fee ${inr(fee)}`, detail: `A ${inr(fee)} cancellation fee applies. It will be added to your next booking.`, fee, refunded, feeSettled: false };
  }
  return { headline: 'No charge', detail: 'Nothing is due for this booking.', fee, refunded, feeSettled: true };
};

export { inr };
