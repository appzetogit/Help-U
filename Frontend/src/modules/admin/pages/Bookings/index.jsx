import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiSearch, FiCalendar, FiDownload, FiMoreVertical, FiEye, FiNavigation, FiUserCheck, FiXCircle,
  FiClock, FiCheckCircle, FiTruck, FiShoppingBag, FiLoader
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { adminBookingService } from '../../../../services/adminBookingService';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';
import AssignmentQueue from './AssignmentQueue';
import AssignWorkerModal from './AssignWorkerModal';

// Cards and the status filter share the same groups, which the server also understands
const STATUS_GROUPS = [
  { key: 'awaiting', title: 'Awaiting', icon: FiClock, bg: 'bg-yellow-50', color: 'text-yellow-600' },
  { key: 'confirmed', title: 'Confirmed', icon: FiCheckCircle, bg: 'bg-blue-50', color: 'text-blue-600' },
  { key: 'in_progress', title: 'In progress', icon: FiTruck, bg: 'bg-purple-50', color: 'text-purple-600' },
  { key: 'completed', title: 'Completed', icon: FiCheckCircle, bg: 'bg-green-50', color: 'text-green-600' },
  { key: 'cancelled', title: 'Cancelled', icon: FiXCircle, bg: 'bg-red-50', color: 'text-red-600' }
];

const STATUS_STYLE = {
  completed: 'bg-green-100 text-green-700',
  work_done: 'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-purple-100 text-purple-700',
  visited: 'bg-purple-100 text-purple-700',
  journey_started: 'bg-purple-100 text-purple-700',
  assigned: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-blue-100 text-blue-700',
  accepted: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  rejected: 'bg-red-100 text-red-700'
};

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const StatCard = ({ title, count, icon: Icon, color, bg, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`p-3 rounded-xl border text-left shadow-sm flex items-center justify-between transition-all ${bg} ${active ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-100 hover:border-gray-300'}`}
  >
    <div>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 bg-white/70 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">{title}</h3>
      <p className="text-xl font-bold text-gray-800 mt-0.5">{count}</p>
    </div>
  </button>
);

/**
 * The three-dots menu on a row. It opens at the button's position (fixed, so the table's own scrolling
 * area cannot clip it) and offers only what the server says is allowed for this booking.
 */
const RowMenu = ({ booking, onAssign, onCancel }) => {
  const navigate = useNavigate();
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const actions = booking.adminActions || {};

  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos, close]);

  const toggle = () => {
    if (pos) { close(); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = 170;
    const top = rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight) : rect.bottom + 4;
    setPos({ top, right: Math.max(8, window.innerWidth - rect.right) });
  };

  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-gray-50';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Booking actions"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={toggle}
        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <FiMoreVertical className="w-4 h-4" />
      </button>

      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div role="menu" style={{ top: pos.top, right: pos.right }} className="fixed z-50 w-48 overflow-hidden rounded-lg border border-gray-100 bg-white py-1 text-gray-700 shadow-xl">
            <button type="button" role="menuitem" className={item} onClick={() => { close(); navigate(`/admin/bookings/${booking._id}`); }}>
              <FiEye className="h-4 w-4 text-gray-400" /> View details
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => { close(); navigate(`/admin/bookings/tracking?search=${encodeURIComponent(booking.bookingNumber || booking._id)}`); }}>
              <FiNavigation className="h-4 w-4 text-gray-400" /> Track
            </button>
            {actions.canAssign && (
              <button type="button" role="menuitem" className={item} onClick={() => { close(); onAssign(booking); }}>
                <FiUserCheck className="h-4 w-4 text-amber-500" /> Assign professional
              </button>
            )}
            {actions.canCancel && (
              <button type="button" role="menuitem" className={`${item} text-red-600 hover:bg-red-50`} onClick={() => { close(); onCancel(booking); }}>
                <FiXCircle className="h-4 w-4" /> Cancel booking
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
};

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const Bookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0 });

  // 'all' bookings, or the queue of bookings waiting for the admin to pick a professional
  const [view, setView] = useState(() => (new URLSearchParams(window.location.search).get('view') === 'queue' ? 'queue' : 'all'));
  const [queueCount, setQueueCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const loadCount = async () => {
      try {
        const res = await adminBookingService.getUnassignedBookings({ limit: 1 });
        if (alive && res.success) setQueueCount(res.pagination?.total || 0);
      } catch { /* the badge is a nicety */ }
    };
    loadCount();
    const t = setInterval(loadCount, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Filters
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  // The header search opens this list with ?search=…; follow it when it changes
  const [urlParams] = useSearchParams();
  useEffect(() => {
    const fromUrl = urlParams.get('search');
    if (fromUrl !== null) setSearch(fromUrl);
  }, [urlParams]);

  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Any change of filter starts again from the first page; otherwise page 3 of a shorter result is empty
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, startDate, endDate]);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let alive = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = { page, limit: 10, search: debouncedSearch, startDate, endDate };
        if (statusFilter) params.status = statusFilter;
        const res = await adminBookingService.getAllBookings(params);
        if (!alive) return;
        if (res.success) {
          setBookings(res.data);
          setPagination({ pages: res.pagination?.pages || 1, total: res.pagination?.total || 0 });
          if (res.statusCounts) setCounts(res.statusCounts);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        if (alive) toast.error(error?.message || 'Failed to load bookings');
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchData();
    return () => { alive = false; };
  }, [page, debouncedSearch, statusFilter, startDate, endDate, reloadKey]);

  // Row actions
  const [assigning, setAssigning] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  const handleCancel = async () => {
    const booking = cancelling;
    setCancelling(null);
    try {
      await adminBookingService.cancelBooking(booking._id, 'Cancelled by admin');
      toast.success(`Booking #${booking.bookingNumber} cancelled`);
      reload();
    } catch (err) {
      toast.error(err?.message || 'Failed to cancel the booking');
    }
  };

  const handleExport = () => {
    const headers = ['Order ID', 'Customer', 'Phone', 'Service', 'Professional', 'Total', 'Status', 'Payment', 'Service date', 'Ordered on'];
    const rows = bookings.map((b) => [
      b.bookingNumber,
      b.userId?.name || 'Guest',
      b.userId?.phone || '',
      b.serviceName || b.serviceId?.title || '',
      b.vendorId ? (b.vendorId.businessName || b.vendorId.name) : '',
      b.finalAmount,
      b.status,
      b.paymentStatus,
      fmtDay(b.scheduledDate),
      new Date(b.createdAt).toLocaleString('en-IN')
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bookings.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* All bookings / the assignment queue */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setView('all')}
          className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors ${view === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          All bookings
        </button>
        <button
          type="button"
          onClick={() => setView('queue')}
          className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2 ${view === 'queue' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          Needs assignment
          {queueCount > 0 && (
            <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center ${view === 'queue' ? 'bg-white text-amber-600' : 'bg-red-500 text-white'}`}>
              {queueCount}
            </span>
          )}
        </button>
      </div>

      {view === 'queue' ? (
        <AssignmentQueue onCountChange={setQueueCount} />
      ) : (
      <>
      {/* Cards: bookings per status under the current search and dates. Click one to filter. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_GROUPS.map((g) => (
          <StatCard
            key={g.key}
            title={g.title}
            count={counts[g.key] ?? 0}
            icon={g.icon}
            color={g.color}
            bg={g.bg}
            active={statusFilter === g.key}
            onClick={() => setStatusFilter((cur) => (cur === g.key ? '' : g.key))}
          />
        ))}
        <StatCard
          title="Total"
          count={counts.total ?? 0}
          icon={FiShoppingBag}
          color="text-gray-600"
          bg="bg-gray-50"
          active={statusFilter === ''}
          onClick={() => setStatusFilter('')}
        />
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex flex-col lg:flex-row gap-3 justify-between items-center">
        <div className="relative w-full lg:w-96">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search booking no., customer, professional, service, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus:outline-none focus:border-green-500 cursor-pointer"
          >
            <option value="">All status</option>
            {STATUS_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}
          </select>

          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5" title="Filters by the day of the service">
            <FiCalendar className="text-gray-400 w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold text-gray-400">Service date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-[11px] text-gray-600 focus:outline-none w-[104px]"
            />
            <span className="text-gray-400 text-[10px]">to</span>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-[11px] text-gray-600 focus:outline-none w-[104px]"
            />
          </div>

          <button
            onClick={handleExport}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shadow-green-200"
          >
            <FiDownload className="w-4 h-4" /> Export page
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Order ID', 'Customer', 'Service', 'Professional', 'Total (₹)', 'Status', 'Payment', 'Service date'].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-xs text-gray-500"><FiLoader className="inline animate-spin mr-2" />Loading bookings...</td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-xs text-gray-500">No bookings found</td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/admin/bookings/${booking._id}`} className="font-bold text-blue-700 text-xs hover:underline">
                        #{booking.bookingNumber || booking._id.slice(-6).toUpperCase()}
                      </Link>
                      <p className="text-[10px] text-gray-400">
                        {new Date(booking.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-gray-900 text-xs">{booking.userId?.name || 'Guest'}</p>
                      <p className="text-[10px] text-gray-400">{booking.userId?.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-gray-800">{booking.serviceName || booking.serviceId?.title || '—'}</p>
                      <p className="text-[10px] text-gray-400">{booking.serviceCategory || booking.categoryId?.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      {booking.vendorId ? (
                        <>
                          <p className="text-xs font-semibold text-gray-800">{booking.vendorId.businessName || booking.vendorId.name}</p>
                          <p className="text-[10px] text-gray-400">{booking.vendorId.phone}</p>
                        </>
                      ) : (
                        <span className={`text-[11px] font-semibold ${booking.awaitingAdmin ? 'text-amber-600' : 'text-gray-400'}`}>
                          {booking.awaitingAdmin ? 'Needs assignment' : 'Not assigned'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-gray-900 text-xs">₹{booking.finalAmount?.toLocaleString('en-IN')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLE[booking.status] || 'bg-yellow-100 text-yellow-700'}`}>
                        {booking.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-gray-600 capitalize font-medium">{booking.paymentMethod?.replace(/_/g, ' ')}</span>
                      <p className="text-[10px] text-gray-400 capitalize">{booking.paymentStatus?.replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-gray-700 font-medium">{fmtDay(booking.scheduledDate)}</span>
                      <p className="text-[10px] text-gray-400">{booking.scheduledTime}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowMenu booking={booking} onAssign={setAssigning} onCancel={setCancelling} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && bookings.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/30">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
              Showing {(page - 1) * 10 + 1}–{(page - 1) * 10 + bookings.length} of {pagination.total}
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-gray-400 mr-1">Page {page} of {pagination.pages}</span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {assigning && (
        <AssignWorkerModal
          booking={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => { setAssigning(null); toast.success('Request sent to the professional'); reload(); }}
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
      </>
      )}
    </motion.div>
  );
};

export default Bookings;
