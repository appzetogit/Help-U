import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FiLoader } from 'react-icons/fi';
import api from '../../../../services/api';
import { getAllWorkers } from '../../services/workerService';
import Modal from '../../components/Modal';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-xs font-bold text-gray-700 mb-1';
const money = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const toDateInput = (value) => {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

/** Choose the professional, day and time window for a pickup. A request with nothing to quote is confirmed by this. */
export const PickupModal = ({ item, onClose, onDone }) => {
  const [workers, setWorkers] = useState(null);
  const [vendorId, setVendorId] = useState(item?.vendorId?._id || item?.vendorId || '');
  const [date, setDate] = useState(toDateInput(item?.pickupDate || item?.preferredDate));
  const [slot, setSlot] = useState(item?.pickupSlot || item?.preferredSlot || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getAllWorkers({ approvalStatus: 'approved', isScrapOpted: true, limit: 200 })
      .then((res) => { if (active) setWorkers(res.data || []); })
      .catch(() => { if (active) { setWorkers([]); toast.error('Could not load professionals'); } });
    return () => { active = false; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!vendorId) return toast.error('Choose a professional');
    if (!date) return toast.error('Choose the pickup date');
    setSaving(true);
    try {
      const res = await api.put(`/scrap/${item._id}/assign`, { vendorId, pickupDate: date, pickupSlot: slot });
      if (res.data.success) {
        toast.success(res.data.message || 'Pickup scheduled');
        onDone();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not schedule the pickup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Schedule pickup" size="sm">
      <form onSubmit={save} className="space-y-4 overflow-y-auto p-5">
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700"><span className="font-bold">{item.title}</span><br />{item.userId?.name || 'Customer'}</p>
        <div>
          <label className={labelClass}>Scrap Professional</label>
          {workers === null ? (
            <div className="flex items-center gap-2 text-xs text-gray-500"><FiLoader className="animate-spin" /> Loading…</div>
          ) : (
            <>
              <select className={inputClass} value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
                <option value="">{workers.length > 0 ? `Select a professional (${workers.length} opted in)` : 'No scrap professionals available'}</option>
                {workers.map((w) => <option key={w._id} value={w._id}>{w.name}{w.phone ? ` · ${w.phone}` : ''}</option>)}
              </select>
              {workers.length === 0 ? (
                <p className="mt-1 text-[11px] text-amber-600">
                  ⚠️ No professionals have opted in for scrap pickups yet. Partners can opt in from their app profile or signup.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-gray-500">
                  Showing only professionals who have opted in for scrap pickups.
                </p>
              )}
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Time window</label>
            <input className={inputClass} value={slot} maxLength={40} onChange={(e) => setSlot(e.target.value)} placeholder="e.g. 10am to 1pm" />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          {item.status === 'pending' && !item.hasQuoteItems
            ? 'This confirms the pickup. The customer and the professional are notified.'
            : 'The customer and the professional are notified.'}
        </p>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Schedule'}</button>
        </div>
      </form>
    </Modal>
  );
};

/**
 * For a pickup that is weighed or waiting to be: see the weights, change the final amount (the
 * customer then confirms it), or finish it by paying the customer now.
 */
export const AmountModal = ({ item, onClose, onDone }) => {
  const [amount, setAmount] = useState(item.finalPrice != null ? String(item.finalPrice) : '');
  const [reason, setReason] = useState(item.adjustReason || '');
  const [method, setMethod] = useState('wallet');
  const [saving, setSaving] = useState(false);

  const call = async (request, okMessage) => {
    setSaving(true);
    try {
      const res = await request();
      if (res.data.success) {
        toast.success(res.data.message || okMessage);
        onDone();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const valid = amount !== '' && Number(amount) >= 0;

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title="Final amount" size="md">
      <div className="space-y-4 overflow-y-auto p-5">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-bold text-gray-900">{item.title}</p>
          <ul className="mt-2 space-y-1">
            {(item.items || []).map((it) => (
              <li key={it._id} className="flex justify-between gap-3 text-xs text-gray-700">
                <span>
                  {it.name}: {it.actualQuantity != null ? `${it.actualQuantity} ${it.unit} weighed` : `${it.quantity} ${it.unit} (not weighed yet)`}
                  {it.actualQuantity != null && it.actualQuantity !== it.quantity ? <span className="text-gray-400"> (customer said {it.quantity})</span> : null}
                </span>
                <span className="font-semibold">{it.finalAmount != null ? money(it.finalAmount) : '—'}</span>
              </li>
            ))}
          </ul>
          {item.weightDispute?.reason && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">Customer questioned the weight: “{item.weightDispute.reason}”</p>
          )}
          {item.weighNote && <p className="mt-2 text-xs text-gray-500">Professional’s note: {item.weighNote}</p>}
        </div>

        <div>
          <label className={labelClass}>Final amount (₹)</label>
          <input type="number" min="0" step="0.5" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 975" />
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-bold text-gray-800">Change it and ask the customer to confirm</p>
          <input className={inputClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Reason, shown to the customer" />
          <button
            type="button"
            disabled={saving || !valid || !reason.trim()}
            onClick={() => call(() => api.put(`/scrap/${item._id}/adjust`, { finalPrice: Number(amount), reason }), 'Amount updated')}
            className="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-amber-600 disabled:opacity-40"
          >
            Update amount
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <p className="mb-2 text-xs font-bold text-gray-800">Or finish now and pay the customer</p>
          <div className="flex items-center gap-2">
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="wallet">Add to their wallet</option>
              <option value="cash">Cash was paid by the professional</option>
            </select>
            <button
              type="button"
              disabled={saving || !valid}
              onClick={() => {
                if (!window.confirm(`Complete and ${method === 'wallet' ? 'add' : 'record'} ${money(amount)}?`)) return;
                call(() => api.put(`/scrap/${item._id}/complete`, { finalPrice: Number(amount), payoutMethod: method }), 'Completed');
              }}
              className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-green-700 disabled:opacity-40"
            >
              Complete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
