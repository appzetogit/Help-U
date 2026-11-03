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

  if (refunded > 0 && fee > 0) {
    return { headline: `Refunded ${inr(refunded)}`, detail: `Your ${inr(fee)} cancellation fee was deducted from the refund.`, fee, refunded };
  }
  if (refunded > 0) {
    return { headline: `Refunded ${inr(refunded)}`, detail: 'The full amount went back to your wallet.', fee, refunded };
  }
  if (fee > 0) {
    return { headline: `Fee ${inr(fee)}`, detail: `A ${inr(fee)} cancellation fee applies. It will be added to your next booking.`, fee, refunded };
  }
  return { headline: 'No charge', detail: 'Nothing is due for this booking.', fee, refunded };
};

export { inr };
