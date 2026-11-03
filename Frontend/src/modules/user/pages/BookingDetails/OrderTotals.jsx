import React from 'react';
import { FiInfo, FiXCircle } from 'react-icons/fi';
import { cancelledSummary, inr, isEnded } from '../../../../utils/bookingAmounts';

const Row = ({ label, children, muted, bold, tone }) => (
  <div className={`flex items-start justify-between gap-3 text-[13px] ${bold ? 'font-bold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'}`}>
    <span className="min-w-0">{label}</span>
    <span className={`shrink-0 font-semibold ${tone || ''}`}>{children}</span>
  </div>
);

/**
 * The price part of the Order Summary: service charge, repair services the customer added, GST, the total, what has
 * been paid and what is still due. Everything comes from `booking.totals`, worked out on the server, so it matches
 * what the professional sees on their invoice. A cancelled booking shows what it cost (the fee) and any refund
 * instead of a total.
 */
const OrderTotals = ({ booking }) => {
  if (isEnded(booking?.status)) {
    const s = cancelledSummary(booking);
    return (
      <div className="pt-3 border-t border-dashed border-gray-100">
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
          <FiXCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="text-[13px]">
            <p className="font-bold text-red-700">Cancelled · {s.headline}</p>
            <p className="text-red-600">{s.detail}</p>
          </div>
        </div>
      </div>
    );
  }

  const t = booking?.totals;
  if (!t) return null;
  const l = t.lines;
  const showBalance = t.paid > 0 && !t.paidInFull;

  return (
    <div className="pt-3 border-t border-dashed border-gray-100 space-y-2" data-testid="order-totals">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Price details</p>

      <Row label="Service charge">{inr(l.service)}</Row>
      {l.addOns > 0 && <Row label="Add-ons">{inr(l.addOns)}</Row>}
      {l.emergency > 0 && <Row label="Emergency charge">{inr(l.emergency)}</Row>}

      {l.repair.map((r, i) => (
        <Row key={i} label={<>{r.title}{r.quantity > 1 ? ` × ${r.quantity}` : ''} <span className="text-[10px] font-bold uppercase text-teal-600">repair added</span></>}>
          {inr(r.base)}
        </Row>
      ))}

      {l.discount > 0 && <Row label="Discount" tone="text-green-600">− {inr(l.discount)}</Row>}
      {l.visiting > 0 && <Row label="Visiting charge">{inr(l.visiting)}</Row>}
      {l.penalty > 0 && <Row label="Earlier cancellation fee">{inr(l.penalty)}</Row>}
      {l.gst > 0 && <Row label="GST">{inr(l.gst)}</Row>}
      {l.additional > 0.009 && <Row label="Work and parts added by your professional (with GST)">{inr(l.additional)}</Row>}

      <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-[15px] font-black text-gray-900">
        <span>{t.estimated ? 'Estimated total' : 'Total'}</span>
        <span>{inr(t.total)}</span>
      </div>

      {t.paidInFull ? (
        <Row label="Paid in full" tone="text-green-600">{inr(t.paid)}</Row>
      ) : showBalance ? (
        <>
          <Row label={t.advancePaid > 0 && t.prepaid === 0 ? 'Advance paid' : 'Already paid'} tone="text-green-600">− {inr(t.paid)}</Row>
          <div className="flex items-center justify-between rounded-lg bg-orange-50 px-3 py-2 text-[14px] font-bold text-orange-700">
            <span>Balance to pay</span>
            <span>{inr(t.due)}</span>
          </div>
        </>
      ) : null}

      {t.estimated && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-500">
          <FiInfo className="mt-0.5 h-3 w-3 shrink-0" />
          This is an estimate. The final amount is confirmed when your professional sends the bill.
          {t.unpricedRepairs > 0 ? ' A problem you described in your own words will be priced by your professional.' : ''}
        </p>
      )}
    </div>
  );
};

export default OrderTotals;
