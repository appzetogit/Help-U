import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiClock, FiMapPin, FiCheckCircle, FiXCircle, FiLoader, FiCalendar,
  FiChevronRight, FiNavigation, FiSearch, FiTool, FiUser, FiCreditCard
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import PageHeader from '../../components/layout/PageHeader';
import { motion } from 'framer-motion';
import { bookingService } from '../../../../services/bookingService';
import { getCategoryIllustration } from '../../utils/categoryIcons';
import ChatButton from '../../../../components/booking/ChatButton';
import RescheduleModal from '../../components/booking/RescheduleModal';
import useBookingConfig from '../../../../hooks/useBookingConfig';
import { cancelledSummary, isEnded } from '../../../../utils/bookingAmounts';
import { canRescheduleBooking } from '../../../../utils/reschedule';

const PAGE_SIZE = 10;

// Each tab maps to the booking statuses stored by the backend (comma list -> $in query)
const TABS = [
  { id: 'all', label: 'All', statuses: null },
  { id: 'upcoming', label: 'Upcoming', statuses: ['searching', 'requested', 'pending', 'awaiting_payment', 'confirmed', 'accepted', 'assigned'] },
  { id: 'in-progress', label: 'In Progress', statuses: ['journey_started', 'visited', 'in_progress', 'work_done'] },
  { id: 'completed', label: 'Completed', statuses: ['completed'] },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'rejected'] },
];

const TONES = {
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  green: 'bg-accent-soft text-accent',
  red: 'bg-red-50 text-red-600',
  gray: 'bg-gray-100 text-gray-600',
};

const getStatusMeta = (status) => {
  switch (status) {
    case 'searching': return { label: 'Finding professional', tone: 'amber', Icon: FiSearch };
    case 'requested': return { label: 'Requested', tone: 'amber', Icon: FiClock };
    case 'pending': return { label: 'Pending', tone: 'amber', Icon: FiClock };
    case 'awaiting_payment': return { label: 'Request Accepted', tone: 'amber', Icon: FiCreditCard };
    case 'confirmed': return { label: 'Confirmed', tone: 'blue', Icon: FiCheckCircle };
    case 'accepted': return { label: 'Accepted', tone: 'blue', Icon: FiCheckCircle };
    case 'assigned': return { label: 'Professional assigned', tone: 'blue', Icon: FiUser };
    case 'journey_started': return { label: 'On the way', tone: 'violet', Icon: FiNavigation };
    case 'visited': return { label: 'Arrived', tone: 'violet', Icon: FiMapPin };
    case 'in_progress':
    case 'in-progress': return { label: 'In progress', tone: 'violet', Icon: FiLoader };
    case 'work_done': return { label: 'Work completed', tone: 'violet', Icon: FiCheckCircle };
    case 'completed': return { label: 'Completed', tone: 'green', Icon: FiCheckCircle };
    case 'cancelled': return { label: 'Cancelled', tone: 'red', Icon: FiXCircle };
    case 'rejected': return { label: 'Rejected', tone: 'red', Icon: FiXCircle };
    default: return {
      label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Unknown',
      tone: 'gray',
      Icon: FiClock
    };
  }
};

const formatDate = (dateString) => {
  if (!dateString) return 'Date not set';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Date not set';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getAddressString = (address) => {
  if (typeof address === 'string') return address;
  if (address && typeof address === 'object') {
    return [address.addressLine1, address.addressLine2, address.city].filter(Boolean).join(', ');
  }
  return 'Address not available';
};

const BookingCard = ({ booking, onOpen, onReschedule }) => {
  const bookingConfig = useBookingConfig();
  const status = getStatusMeta(booking.status);
  const StatusIcon = status.Icon;
  const category = booking.serviceCategory || booking.categoryId?.title || '';
  const serviceName = booking.serviceName || booking.serviceId?.title || 'Service Request';
  const illustration = getCategoryIllustration(category) || getCategoryIllustration(serviceName);
  const items = [...new Set((booking.bookedItems || []).map(item => item.card?.title || item.title).filter(Boolean))];
  // e.g. "Bajaj · Split": the answers the customer gave, shown under the service
  const answers = [...new Set((booking.bookedItems || []).flatMap(item => (item.details || []).map(d => d.value)).filter(Boolean))];
  const professional = booking.vendorId?.businessName || booking.vendorId?.name;
  const ended = isEnded(booking.status);
  const money = ended ? cancelledSummary(booking) : null;
  const totals = booking.totals;
  const amount = totals?.total ?? (booking.finalAmount || booking.totalAmount || 0);
  const time = booking.scheduledTime || booking.timeSlot?.start;
  const bookingRef = booking.bookingNumber || String(booking._id || booking.id || '').slice(-8).toUpperCase();
  const canReschedule = canRescheduleBooking(booking, bookingConfig);

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 140, damping: 18 } }
      }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(booking)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(booking);
      }}
      className="bg-white rounded-[20px] border border-gray-100 p-4 cursor-pointer transition-colors hover:border-accent/25 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {/* Service + status */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center shrink-0">
          {illustration ? (
            <img src={illustration} alt="" className="w-[80%] h-[80%] object-contain" loading="lazy" decoding="async" />
          ) : (
            <FiTool className="w-5 h-5 text-accent" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 min-h-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">{category}</p>
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${TONES[status.tone]}`}>
              <StatusIcon className={`w-3 h-3 ${status.Icon === FiLoader ? 'animate-spin' : ''}`} strokeWidth={2.5} />
              {status.label}
            </span>
          </div>
          <h3 className="mt-0.5 text-[16px] font-bold text-ink leading-snug line-clamp-2">{serviceName}</h3>
          {items.length > 0 && (
            <p className="mt-0.5 text-[13px] text-gray-500 line-clamp-1">{items.join(', ')}</p>
          )}
          {answers.length > 0 && (
            <p className="text-[12px] font-medium text-accent line-clamp-1">{answers.join(' · ')}</p>
          )}
        </div>
      </div>

      {/* Slot, address, professional */}
      <div className="mt-4 space-y-2.5 rounded-2xl bg-canvas px-3.5 py-3">
        <div className="flex items-center gap-2.5 text-[13px] text-gray-700">
          <FiCalendar className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="font-semibold text-ink">{formatDate(booking.scheduledDate)}</span>
          {time && (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span className="font-semibold text-ink">{time}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-gray-600 min-w-0">
          <FiMapPin className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="truncate">{getAddressString(booking.address)}</span>
        </div>
        {professional && (
          <div className="flex items-center justify-between gap-2.5 text-[13px] text-gray-600 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 truncate">
              <FiUser className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="truncate">{professional}</span>
            </div>
            <ChatButton
              role="user"
              booking={booking}
              compact={true}
              className="w-8 h-8 shrink-0 bg-blue-50 text-blue-600 hover:bg-blue-100"
            />
          </div>
        )}
      </div>

      {/* Amount + action */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500">#{bookingRef}</p>
          {ended ? (
            <>
              <p className="text-[16px] font-bold text-ink leading-tight">{money.headline}</p>
              <p className="text-[11px] text-gray-500 line-clamp-1">{money.fee > 0 && money.refunded === 0 ? 'Added to your next booking' : 'Cancelled booking'}</p>
            </>
          ) : (
            <>
              <p className="text-[18px] font-bold text-ink leading-tight">
                ₹{Number(amount).toLocaleString('en-IN')}
                {totals?.estimated && <span className="ml-1.5 text-[10px] font-bold uppercase text-teal-600">estimate</span>}
              </p>
              {totals && totals.paid > 0 && !totals.paidInFull && (
                <p className="text-[11px] font-semibold text-orange-600">₹{Number(totals.due).toLocaleString('en-IN')} to pay · ₹{Number(totals.paid).toLocaleString('en-IN')} paid</p>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canReschedule && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onReschedule) onReschedule(booking);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-full border border-teal-200/80 transition-all active:scale-95 shadow-2xs"
            >
              <FiCalendar className="w-3 h-3" />
              Reschedule
            </button>
          )}
          <span className="inline-flex items-center gap-0.5 text-[14px] font-semibold text-accent">
            View details
            <FiChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </motion.article>
  );
};

const BookingSkeleton = () => (
  <div className="bg-white rounded-[20px] border border-gray-100 p-4 animate-pulse">
    <div className="flex items-start gap-3">
      <div className="w-12 h-12 rounded-full bg-gray-100" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-2.5 w-20 bg-gray-100 rounded" />
        <div className="h-4 w-40 bg-gray-100 rounded" />
      </div>
      <div className="h-6 w-20 bg-gray-100 rounded-full" />
    </div>
    <div className="mt-4 h-[68px] rounded-2xl bg-gray-50" />
    <div className="mt-4 flex items-end justify-between">
      <div className="space-y-1.5">
        <div className="h-2.5 w-24 bg-gray-100 rounded" />
        <div className="h-5 w-16 bg-gray-100 rounded" />
      </div>
      <div className="h-4 w-24 bg-gray-100 rounded" />
    </div>
  </div>
);

// Last loaded list per tab, kept across visits so returning to this page is instant.
// Entries are tied to the current login so another account never sees them.
const bookingsCache = new Map();
const currentSession = () => localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || '';
const readCache = (tab) => {
  const entry = bookingsCache.get(tab);
  return entry && entry.session === currentSession() ? entry : null;
};

const MyBookings = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [bookings, setBookings] = useState(() => readCache('all')?.bookings || []);
  const [loading, setLoading] = useState(() => !readCache('all'));
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(() => readCache('all')?.page || 1);
  const [hasMore, setHasMore] = useState(() => readCache('all')?.hasMore || false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const requestRef = useRef(0);
  const bookingsRef = useRef(bookings);
  bookingsRef.current = bookings;

  const fetchPage = useCallback(async (pageNum, { silent = false } = {}) => {
    const requestId = ++requestRef.current;
    const tab = TABS.find(t => t.id === filter);
    const params = { page: pageNum, limit: PAGE_SIZE };
    if (tab?.statuses) params.status = tab.statuses.join(',');

    if (pageNum === 1 && !silent) setLoading(true);
    if (pageNum > 1) setLoadingMore(true);
    try {
      const response = await bookingService.getUserBookings(params);
      if (requestId !== requestRef.current) return; // a newer request replaced this one
      if (response.success) {
        const data = response.data || [];
        const next = pageNum === 1 ? data : [...bookingsRef.current, ...data];
        const pages = response.pagination?.pages;
        const more = pages ? pageNum < pages : data.length === PAGE_SIZE;
        setBookings(next);
        setPage(pageNum);
        setHasMore(more);
        bookingsCache.set(filter, { bookings: next, page: pageNum, hasMore: more, session: currentSession() });
      } else {
        toast.error(response.message || 'Failed to load bookings');
        if (pageNum === 1 && !silent) setBookings([]);
      }
    } catch {
      if (requestId !== requestRef.current) return;
      // A failed background refresh keeps the list already on screen
      if (!silent) {
        toast.error('Failed to load bookings. Please try again.');
        if (pageNum === 1) setBookings([]);
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [filter]);

  useEffect(() => {
    // Show this tab's last loaded list instantly, then refresh it quietly
    const cached = readCache(filter);
    if (cached) {
      setBookings(cached.bookings);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setLoading(false);
    }
    fetchPage(1, { silent: Boolean(cached) });

    // Real-time updates refresh the first page without the skeleton
    const onUpdate = () => fetchPage(1, { silent: true });
    window.addEventListener('userBookingsUpdated', onUpdate);
    return () => window.removeEventListener('userBookingsUpdated', onUpdate);
  }, [fetchPage]);

  const handleBookingClick = (booking) => {
    navigate(`/user/booking/${booking._id || booking.id}`);
  };

  const activeTab = TABS.find(t => t.id === filter);

  return (
    <div className="min-h-screen pb-24 bg-canvas">
      <PageHeader title="My Bookings">
        {/* Filter tabs */}
        <div className="max-w-2xl mx-auto flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide" role="tablist">
            {TABS.map((tab) => {
              const isActive = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setFilter(tab.id)}
                  className={`h-9 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap border transition-colors ${isActive
                    ? 'bg-accent border-accent text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-ink'
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
        </div>
      </PageHeader>

      {/* Bookings list */}
      <main className="px-4 py-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <BookingSkeleton key={i} />)}
          </div>
        ) : bookings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center px-6"
          >
            <div className="w-20 h-20 rounded-full bg-accent-soft flex items-center justify-center mb-5">
              <FiCalendar className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-ink text-[18px] font-bold mb-1.5">No bookings yet</h3>
            <p className="text-gray-500 text-[14px] max-w-xs leading-relaxed">
              {filter === 'all'
                ? "You haven't booked any services yet. Explore services to get started."
                : `You don't have any ${activeTab?.label.toLowerCase()} bookings right now.`}
            </p>
            <button
              type="button"
              onClick={() => navigate('/user')}
              className="mt-6 h-11 px-6 rounded-full bg-accent text-white text-[14px] font-semibold hover:bg-accent-dark active:scale-95 transition-all"
            >
              Book a service
            </button>
          </motion.div>
        ) : (
          <>
            <motion.div
              key={filter}
              initial="hidden"
              animate="visible"
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
              className="space-y-3"
            >
              {bookings.map((booking) => (
                <BookingCard
                  key={booking._id || booking.id}
                  booking={booking}
                  onOpen={handleBookingClick}
                  onReschedule={setRescheduleTarget}
                />
              ))}
            </motion.div>

            {hasMore && (
              <button
                type="button"
                onClick={() => fetchPage(page + 1)}
                disabled={loadingMore}
                className="mt-4 w-full h-11 rounded-full border border-gray-200 bg-white text-[14px] font-semibold text-accent hover:border-accent/40 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                {loadingMore && <FiLoader className="w-4 h-4 animate-spin" />}
                {loadingMore ? 'Loading…' : 'Load more bookings'}
              </button>
            )}
          </>
        )}
      </main>

      {/* Reschedule Modal */}
      <RescheduleModal
        isOpen={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        booking={rescheduleTarget}
        onRescheduled={() => {
          bookingsCache.clear();
          fetchPage(1, { silent: true });
        }}
      />
    </div>
  );
};

export default MyBookings;
