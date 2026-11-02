import React, { useCallback, useEffect, useState } from 'react';
import { FiRefreshCw, FiUserCheck, FiXCircle, FiClock, FiMapPin } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { adminBookingService } from '../../../../services/adminBookingService';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';
import AssignWorkerModal from './AssignWorkerModal';

const REASONS = {
  no_worker_in_zone: 'Nobody with this skill works in the zone',
  no_worker_nearby: 'No professional available nearby',
  no_worker_accepted: 'Alerted professionals did not accept in time',
  worker_declined: 'The professional you picked did not accept'
};

const waitingFor = (since) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
};

const timeLeft = (expiresAt) => {
  if (!expiresAt) return null;
  const mins = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 60000);
  if (mins <= 0) return 'expiring now';
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
};

/**
 * Bookings the system could not give to anyone automatically. The admin picks a professional here
 * (or cancels and refunds the booking). Refreshes itself, since new ones arrive at any time.
 */
const AssignmentQueue = ({ onCountChange }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const load = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const res = await adminBookingService.getUnassignedBookings({ limit: 50 });
      if (res.success) {
        setRows(res.data || []);
        onCountChange?.(res.pagination?.total ?? (res.data || []).length);
      }
    } catch (err) {
      if (!quiet) toast.error(err?.message || 'Failed to load the assignment queue');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [load]);

  const handleCancel = async () => {
    const booking = cancelling;
    setCancelling(null);
    try {
      await adminBookingService.cancelBooking(booking._id, 'No professional available - cancelled by admin');
      toast.success('Booking cancelled and refunded');
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to cancel the booking');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-amber-50/50">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Needs a professional</h3>
          <p className="text-[11px] text-gray-500">
            No one could be found automatically. Pick a professional below — they get the request and accept or decline.
            Unassigned bookings are cancelled and refunded when their time runs out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          title="Refresh"
          className="p-2 text-gray-500 hover:text-gray-800 hover:bg-white rounded-lg border border-gray-200"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {['Order', 'Customer', 'Service', 'Where', 'Visit', 'Why it is here', 'Waiting', ''].map((h) => (
                <th key={h || 'actions'} className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && rows.length === 0 ? (
              <tr><td colSpan="8" className="px-4 py-8 text-center text-xs text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="8" className="px-4 py-10 text-center text-xs text-gray-500">Nothing is waiting for assignment. 🎉</td></tr>
            ) : rows.map((b) => (
              <tr key={b._id} className="hover:bg-gray-50 transition-colors align-top">
                <td className="px-4 py-3">
                  <span className="font-bold text-gray-900 text-xs">#{b.bookingNumber}</span>
                  {b.isEmergency && <span className="ml-1 text-[9px] font-bold text-red-600 uppercase">Emergency</span>}
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-gray-900 text-xs">{b.userId?.name || 'Customer'}</p>
                  <p className="text-[10px] text-gray-400">{b.userId?.phone}</p>
                </td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <p className="font-semibold">{b.serviceName}</p>
                  <p className="text-[10px] text-gray-400">{b.serviceCategory}</p>
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-600 max-w-[200px]">
                  <p className="flex items-start gap-1"><FiMapPin className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                    <span className="truncate">{[b.address?.addressLine1, b.address?.city].filter(Boolean).join(', ')}</span>
                  </p>
                  {b.zoneId?.name && <p className="text-[10px] text-gray-400 mt-0.5">Zone: {b.zoneId.name}</p>}
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-600 whitespace-nowrap">
                  <p>{b.bookingType === 'instant' ? 'Instant' : new Date(b.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                  <p className="text-[10px] text-gray-400">{b.scheduledTime}</p>
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-600 max-w-[200px]">
                  {REASONS[b.adminQueueReason] || 'Needs a manual assignment'}
                </td>
                <td className="px-4 py-3 text-[11px] text-gray-600 whitespace-nowrap">
                  <p className="flex items-center gap-1"><FiClock className="w-3 h-3 text-gray-400" />{waitingFor(b.adminQueuedAt || b.createdAt)}</p>
                  <p className="text-[10px] text-amber-600 font-semibold">{timeLeft(b.expiresAt)}</p>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => setAssigning(b)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 shadow-sm"
                  >
                    <FiUserCheck className="w-3.5 h-3.5" /> Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelling(b)}
                    title="Cancel and refund"
                    className="ml-1.5 p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <FiXCircle className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assigning && (
        <AssignWorkerModal
          booking={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => { setAssigning(null); load(true); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={handleCancel}
        type="danger"
        title="Cancel this booking?"
        message={cancelling ? `#${cancelling.bookingNumber} will be cancelled and anything the customer paid will be refunded to their wallet.` : ''}
        confirmLabel="Cancel booking"
        cancelLabel="Keep it"
      />
    </div>
  );
};

export default AssignmentQueue;
