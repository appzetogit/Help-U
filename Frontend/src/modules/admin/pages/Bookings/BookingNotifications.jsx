import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiBell, FiPlusCircle, FiXCircle, FiCheckCircle, FiCreditCard, FiRotateCcw, FiAlertTriangle, FiUserCheck,
  FiRefreshCw, FiLoader
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { adminBookingService } from '../../../../services/adminBookingService';

const TYPES = {
  new_booking: { label: 'New bookings', icon: FiPlusCircle, tone: 'text-blue-500', bg: 'bg-blue-50' },
  cancelled: { label: 'Cancelled', icon: FiXCircle, tone: 'text-red-500', bg: 'bg-red-50' },
  completed: { label: 'Completed', icon: FiCheckCircle, tone: 'text-green-600', bg: 'bg-green-50' },
  payment: { label: 'Payments', icon: FiCreditCard, tone: 'text-emerald-600', bg: 'bg-emerald-50' },
  refund: { label: 'Refunds', icon: FiRotateCcw, tone: 'text-purple-600', bg: 'bg-purple-50' },
  payment_failed: { label: 'Payment issues', icon: FiAlertTriangle, tone: 'text-yellow-600', bg: 'bg-yellow-50' },
  needs_assignment: { label: 'Needs a professional', icon: FiUserCheck, tone: 'text-amber-600', bg: 'bg-amber-50' }
};

const REFRESH_MS = 30000;

const ago = (value) => {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
};
const exact = (value) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * What is happening across bookings, newest first: new bookings, cancellations, completions, payments, refunds,
 * failed payments and bookings that need a professional. It is read from the bookings themselves, so it is always
 * current, and refreshes every half minute.
 */
const BookingNotifications = () => {
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Newest page: replaces the list on a filter change, and adds anything new to the top on a refresh
  const load = useCallback(async ({ replace = true } = {}) => {
    try {
      const res = await adminBookingService.getBookingNotifications({ type: filter || undefined, limit: 30 });
      setItems((prev) => {
        if (replace) return res.data;
        const known = new Set(prev.map((n) => n.id));
        const fresh = res.data.filter((n) => !known.has(n.id));
        // Keep what is already loaded, but take the server's latest read/unread state for items it returned
        const byId = new Map(res.data.map((n) => [n.id, n]));
        return [...fresh, ...prev.map((n) => byId.get(n.id) || n)];
      });
      if (replace) { setHasMore(res.hasMore); setNextBefore(res.nextBefore); }
      setUnreadCount(res.unreadCount || 0);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); load({ replace: true }); }, [load]);

  useEffect(() => {
    const t = setInterval(() => load({ replace: false }), REFRESH_MS);
    const onFocus = () => load({ replace: false });
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const res = await adminBookingService.getBookingNotifications({ type: filter || undefined, limit: 30, before: nextBefore });
      setItems((prev) => {
        const known = new Set(prev.map((n) => n.id));
        return [...prev, ...res.data.filter((n) => !known.has(n.id))];
      });
      setHasMore(res.hasMore);
      setNextBefore(res.nextBefore);
    } catch (err) {
      toast.error(err?.message || 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const markAllRead = async () => {
    try {
      await adminBookingService.markBookingNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
      setUnreadCount(0);
    } catch (err) {
      toast.error(err?.message || 'Could not mark as read');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Type"
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:border-blue-500 cursor-pointer min-w-[180px]"
        >
          <option value="">All types</option>
          {Object.entries(TYPES).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
        </select>

        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-md">{unreadCount} unread</span>
          )}
          <button
            type="button"
            onClick={() => { setLoading(true); load({ replace: true }); }}
            title="Refresh"
            aria-label="Refresh"
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Mark all read
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
        {loading ? (
          <div className="p-8 text-center text-gray-500"><FiLoader className="inline animate-spin mr-2" />Loading...</div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-600">{error}</p>
            <button type="button" onClick={() => { setLoading(true); load({ replace: true }); }} className="mt-3 text-sm font-semibold text-blue-600 hover:underline">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            <FiBell className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            Nothing to show{filter ? ' for this type' : ' in the last 30 days'}.
          </div>
        ) : (
          items.map((n) => {
            const t = TYPES[n.type] || { icon: FiBell, tone: 'text-gray-500', bg: 'bg-gray-50' };
            const Icon = t.icon;
            return (
              <div key={n.id} className={`p-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors ${n.unread ? 'bg-blue-50/30' : ''}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${t.bg}`}>
                    <Icon className={`w-5 h-5 ${t.tone}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      {n.title}
                      {n.unread && <span className="inline-block h-2 w-2 rounded-full bg-blue-500" title="Unread" />}
                    </h3>
                    <p className="text-sm text-gray-500">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400" title={exact(n.at)}>{ago(n.at)} · {exact(n.at)}</p>
                  </div>
                </div>
                <Link
                  to={`/admin/bookings/${n.bookingId}`}
                  className="shrink-0 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
                >
                  #{n.bookingNumber}
                </Link>
              </div>
            );
          })
        )}

        {!loading && !error && hasMore && (
          <div className="p-4 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingMore && <FiLoader className="h-4 w-4 animate-spin" />} Load older
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default BookingNotifications;
