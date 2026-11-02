import React, { useCallback, useEffect, useState } from 'react';
import { FiSearch, FiMapPin, FiStar, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Modal from '../../components/Modal';
import { adminBookingService } from '../../../../services/adminBookingService';

const Badge = ({ tone, children }) => {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200'
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wide ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  );
};

/**
 * Pick a professional for a booking that nobody could take automatically.
 * Lists everyone approved who has the skill, in-zone first. The pick is sent to them as an ordinary
 * booking request: the booking is confirmed once they accept, and returns to the queue if they decline.
 */
const AssignWorkerModal = ({ booking, onClose, onAssigned }) => {
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState([]);
  const [zoneName, setZoneName] = useState(null);
  const [skills, setSkills] = useState([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    if (!booking) return;
    try {
      setLoading(true);
      const res = await adminBookingService.getAssignableWorkers(booking._id, debounced);
      if (res.success) {
        setWorkers(res.workers || []);
        setZoneName(res.zoneName || null);
        setSkills(res.booking?.skills || []);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to load professionals');
    } finally {
      setLoading(false);
    }
  }, [booking, debounced]);

  useEffect(() => { load(); }, [load]);

  if (!booking) return null;

  const selected = workers.find((w) => w._id === selectedId) || null;

  const handleAssign = async () => {
    if (!selected) return;
    try {
      setSaving(true);
      const res = await adminBookingService.assignBooking(booking._id, selected._id, note.trim());
      toast.success(res.message || 'Request sent to the professional');
      onAssigned?.(booking._id);
    } catch (err) {
      toast.error(err?.message || 'Failed to assign the booking');
      // Someone else may have just assigned it: refresh what is shown
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Assign a professional · #${booking.bookingNumber}`} size="lg">
      <div className="space-y-3">
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600 space-y-1">
          <p>
            <span className="font-bold text-gray-800">{booking.serviceName}</span>
            {booking.serviceCategory ? ` · ${booking.serviceCategory}` : ''}
          </p>
          <p className="flex items-start gap-1">
            <FiMapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
            <span>
              {[booking.address?.addressLine1, booking.address?.city, booking.address?.pincode].filter(Boolean).join(', ')}
              {zoneName ? ` (zone: ${zoneName})` : ''}
            </span>
          </p>
          {skills.length > 0 && <p className="text-[11px] text-gray-500">Showing professionals who list: {skills.join(', ')}</p>}
        </div>

        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, business or phone…"
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
          {loading ? (
            <p className="p-6 text-center text-xs text-gray-500">Loading professionals…</p>
          ) : workers.length === 0 ? (
            <p className="p-6 text-center text-xs text-gray-500">
              No approved professional lists this service. Add the skill to a professional, or cancel the booking.
            </p>
          ) : (
            workers.map((w) => {
              const active = w._id === selectedId;
              return (
                <button
                  type="button"
                  key={w._id}
                  onClick={() => setSelectedId(w._id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      {w.businessName || w.name}
                      {w.businessName && w.name ? <span className="font-normal text-gray-500"> · {w.name}</span> : null}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{w.phone}</span>
                      {w.city && <span>{w.city}</span>}
                      {w.rating > 0 && (
                        <span className="inline-flex items-center gap-0.5"><FiStar className="w-3 h-3 text-amber-500" />{Number(w.rating).toFixed(1)}</span>
                      )}
                      {w.distanceKm != null && <span>{w.distanceKm} km away</span>}
                    </p>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      <Badge tone={w.inZone ? 'green' : 'amber'}>{w.inZone ? 'In zone' : 'Outside zone'}</Badge>
                      <Badge tone={w.isOnline ? 'green' : 'gray'}>{w.isOnline ? 'Online' : 'Offline'}</Badge>
                      {w.isBusy && <Badge tone="blue">On a job</Badge>}
                      {w.declinedEarlier && <Badge tone="red">Declined earlier</Badge>}
                    </div>
                  </div>
                  {active && <FiCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {selected && (!selected.inZone || selected.declinedEarlier) && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-800">
            <FiAlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>
              {selected.declinedEarlier
                ? 'This professional already declined this booking. They will be asked again.'
                : 'This professional works outside the booking’s zone. You can still send it to them.'}
            </span>
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Note for the booking history (optional)"
          className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs resize-none"
        />

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-gray-500">The request goes to the professional, who then accepts or declines.</p>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="px-3.5 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50">
              Close
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={!selected || saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm"
            >
              {saving ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AssignWorkerModal;
