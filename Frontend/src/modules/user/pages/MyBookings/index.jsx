import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiMapPin, FiCheckCircle, FiXCircle, FiLoader, FiCalendar, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../../theme';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import NotificationBell from '../../components/common/NotificationBell';
import { motion } from 'framer-motion';
import { bookingService } from '../../../../services/bookingService';

const MyBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, confirmed, in-progress, completed, cancelled

  useEffect(() => {
    const loadBookings = async () => {
      try {
        setLoading(true);
        const params = {};
        if (filter !== 'all') {
          params.status = filter;
        }
        const response = await bookingService.getUserBookings(params);
        if (response.success) {
          setBookings(response.data || []);
        } else {
          toast.error(response.message || 'Failed to load bookings');
          setBookings([]);
        }
      } catch (error) {
        toast.error('Failed to load bookings. Please try again.');
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    loadBookings();

    // Listen for real-time updates
    window.addEventListener('userBookingsUpdated', loadBookings);

    return () => {
      window.removeEventListener('userBookingsUpdated', loadBookings);
    };
  }, [filter]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <FiCheckCircle className="w-3.5 h-3.5" />;
      case 'in_progress':
      case 'in-progress':
        return <FiLoader className="w-3.5 h-3.5 animate-spin" />;
      case 'journey_started':
      case 'visited':
        return <FiMapPin className="w-3.5 h-3.5 text-blue-500" />;
      case 'completed':
        return <FiCheckCircle className="w-3.5 h-3.5" />;
      case 'cancelled':
      case 'rejected':
        return <FiXCircle className="w-3.5 h-3.5" />;
      case 'awaiting_payment':
      default:
        return <FiClock className="w-3.5 h-3.5" />;
    }
  };

  const getStatusBorderColor = (status) => {
    switch (status) {
      case 'confirmed': return '!border-l-emerald-500';
      case 'in_progress':
      case 'in-progress':
      case 'journey_started':
      case 'visited':
        return '!border-l-blue-500';
      case 'completed': return '!border-l-violet-500';
      case 'cancelled':
      case 'rejected': return '!border-l-rose-500';
      case 'awaiting_payment': return '!border-l-amber-500';
      default: return '!border-l-gray-300';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-500 text-white border-emerald-600 ring-emerald-500';
      case 'in_progress':
      case 'in-progress':
      case 'journey_started':
      case 'visited':
        return 'bg-blue-500 text-white border-blue-600 ring-blue-500';
      case 'completed':
        return 'bg-violet-500 text-white border-violet-600 ring-violet-500';
      case 'cancelled':
      case 'rejected':
        return 'bg-rose-500 text-white border-rose-600 ring-rose-500';
      case 'awaiting_payment':
        return 'bg-amber-500 text-white border-amber-600 ring-amber-500';
      default:
        return 'bg-gray-500 text-white border-gray-600 ring-gray-500';
    }
  };

  const getStatusLabel = (status) => {
    if (!status) return 'Unknown';
    switch (status) {
      case 'in_progress':
      case 'in-progress':
        return 'In Progress';
      case 'journey_started': return 'On The Way';
      case 'visited': return 'Arrived';
      case 'awaiting_payment': return 'Request Accepted';
      case 'work_done': return 'Work Completed';
      default: return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
    }
  };

  const handleBookingClick = (booking) => {
    navigate(`/user/booking/${booking._id || booking.id}`);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    return timeString;
  };

  const getAddressString = (address) => {
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      const parts = [
        address.addressLine1,
        address.addressLine2,
        address.city
      ].filter(Boolean);
      return parts.join(', ');
    }
    return 'Detailed Address';
  };

  return (
    <div className="min-h-screen pb-24 relative bg-white">
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #FFFFFF
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Modern Glassmorphism Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">My Bookings</h1>
          </div>
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02] relative">
            <NotificationBell />
          </div>
        </header>

        {/* Filter Tabs */}
        <div className="bg-white border-b border-slate-100 sticky top-[61px] z-20 shadow-[0_4px_20px_-16px_rgba(0,0,0,0.1)]">
          <div className="flex overflow-x-auto px-4 py-3 gap-2.5 no-scrollbar scroll-smooth">
            {[
              { id: 'all', label: 'All Bookings' },
              { id: 'confirmed', label: 'Confirmed' },
              { id: 'in-progress', label: 'In Progress' },
              { id: 'completed', label: 'Completed' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 border ${filter === tab.id
                  ? 'border-transparent text-white shadow-lg shadow-blue-500/25 active:scale-95'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                style={filter === tab.id ? { backgroundColor: themeColors.button } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bookings List */}
        <main className="px-4 py-5 max-w-lg mx-auto w-full">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm animate-pulse">
                  <div className="flex justify-between mb-4 border-b border-slate-100 pb-4">
                    <div className="space-y-2">
                      <div className="h-3 w-20 bg-slate-200 rounded"></div>
                      <div className="h-5 w-48 bg-slate-200 rounded"></div>
                    </div>
                    <div className="h-6 w-24 bg-slate-200 rounded-full"></div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-4 mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                    <div className="space-y-1.5 py-1">
                      <div className="h-2.5 w-16 bg-slate-200 rounded"></div>
                      <div className="h-3.5 w-32 bg-slate-200 rounded"></div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                    <div className="space-y-1.5 py-1">
                      <div className="h-2.5 w-16 bg-slate-200 rounded"></div>
                      <div className="h-3.5 w-40 bg-slate-200 rounded"></div>
                    </div>
                  </div>
                  <div className="flex justify-between pt-4 border-t border-slate-200">
                    <div className="space-y-1">
                      <div className="h-2.5 w-16 bg-slate-200 rounded"></div>
                      <div className="h-6 w-24 bg-slate-200 rounded"></div>
                    </div>
                    <div className="h-9 w-28 bg-slate-200 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-24 text-center px-6"
            >
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-sm">
                <FiClock className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-slate-900 text-lg font-bold mb-2">No Bookings Found</h3>
              <p className="text-slate-500 text-sm max-w-xs leading-relaxed">
                {filter === 'all'
                  ? "Looks like you haven't booked any services yet. Explore our services to get started!"
                  : `You don't have any ${filter.replace('-', ' ')} bookings at the moment.`}
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                }
              }}
              className="space-y-4"
            >
              {bookings.map((booking) => (
                <motion.div
                  key={booking._id || booking.id}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: {
                      opacity: 1,
                      y: 0,
                      transition: { type: "spring", stiffness: 100, damping: 15 }
                    }
                  }}
                  onClick={() => handleBookingClick(booking)}
                  className={`group relative bg-white rounded-2xl p-5 border border-slate-200 border-l-4 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] hover:border-blue-300 active:scale-[0.99] transition-all duration-300 cursor-pointer overflow-hidden ${getStatusBorderColor(booking.status)}`}
                >
                  {/* Decorative Elements */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-slate-50 via-transparent to-transparent -z-0 opacity-50" />

                  {/* Header Section */}
                  <div className="relative z-10 flex items-start justify-between mb-4 border-b border-slate-100 pb-4">
                    <div className="pr-4 flex-1">
                      <p className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        #{booking.bookingNumber || (booking._id || booking.id).substring(0, 8)}
                      </p>

                      {/* Detailed Booking Info */}
                      <div className="space-y-1">
                        {/* 1. Category */}
                        {booking.serviceCategory && (
                          <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 w-fit rounded-md uppercase tracking-wider mb-1">
                            {booking.serviceCategory}
                          </div>
                        )}

                        {/* 2. Brand / Section (if available from booked items) */}
                        {booking.bookedItems && booking.bookedItems.length > 0 && booking.bookedItems[0].sectionTitle && (
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {booking.bookedItems.map(item => item.sectionTitle).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                          </div>
                        )}

                        {/* 3. Service Name */}
                        <h3 className="text-lg font-bold text-slate-800 leading-tight line-clamp-2 group-hover:text-blue-600 transition-colors">
                          {booking.serviceName || 'Service Request'}
                        </h3>

                        {/* Item Details (Preview) */}
                        {booking.bookedItems && booking.bookedItems.length > 0 && (
                          <p className="text-xs text-slate-400 line-clamp-1">
                            {booking.bookedItems.map(item => item.card?.title || item.title).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className={`shrink-0 px-3 py-1 pb-1.5 rounded-full border ring-1 ring-inset flex items-center gap-1.5 shadow-sm ${getStatusColor(booking.status)}`}>
                      {getStatusIcon(booking.status)}
                      <span className="text-[11px] font-bold uppercase tracking-wide">
                        {getStatusLabel(booking.status)}
                      </span>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="relative z-10 grid grid-cols-[auto_1fr] gap-x-3 gap-y-4 mb-5 p-3 rounded-xl bg-slate-50/50 border border-slate-200">
                    {/* Schedule */}
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                      <FiCalendar className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex flex-col justify-center">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Slot</p>
                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                        <span>{formatDate(booking.scheduledDate)}</span>
                        <span className="text-slate-300">•</span>
                        <span>{booking.scheduledTime || booking.timeSlot?.start || 'N/A'}</span>
                      </div>
                    </div>

                    {/* Location */}
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                      <FiMapPin className="w-4 h-4 text-rose-500" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Location</p>
                      <p className="text-sm font-medium text-slate-700 truncate w-full">
                        {getAddressString(booking.address)}
                      </p>
                    </div>
                  </div>

                  {/* Footer Section */}
                  <div className="relative z-10 flex items-center justify-between pt-4 border-t border-slate-200">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total Amount</p>
                      <p className="text-xl font-bold text-slate-900 flex items-baseline gap-0.5">
                        <span className="text-sm font-semibold text-slate-400">₹</span>
                        {(booking.finalAmount || booking.totalAmount || 0).toLocaleString('en-IN')}
                      </p>
                    </div>

                    <button
                      className="flex items-center gap-1.5 pl-4 pr-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold text-sm hover:bg-indigo-600 hover:border-indigo-600 hover:text-white transition-all shadow-sm active:scale-95"
                    >
                      View Details
                      <FiChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MyBookings;

