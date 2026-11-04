import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiSearch, FiLoader, FiCalendar, FiClock, FiUser, FiShoppingBag, FiZap } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import { adminUserService } from '../../../../services/adminUserService';

const UserBookings = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadBookings = async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: pagination.limit,
        status: filterStatus === 'all' ? undefined : filterStatus,
        search: debouncedSearch.trim() || undefined
      };
      const response = await adminUserService.getAllUserBookings(params);
      if (response.success) {
        setBookings(response.data);
        setPagination(response.pagination);
      }
    } catch (error) {
      console.error('Error loading user bookings:', error);
      toast.error('Failed to load user bookings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings(1);
  }, [filterStatus, debouncedSearch]);

  const getStatusStyle = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      ongoing: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const formatBookingDate = (b) => {
    const raw = b.scheduledDate || b.createdAt || b.bookingDate;
    if (!raw) return 'Date not set';
    const d = new Date(raw);
    return isNaN(d.getTime())
      ? 'Date not set'
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatBookingSlot = (b) => {
    const isInstant = Boolean(b.isInstant || b.bookingType === 'instant' || b.pricingType === 'instant');
    if (isInstant) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-xs">
          <FiZap className="w-3 h-3 text-amber-500 fill-amber-500" /> Instant
        </span>
      );
    }
    const timeStr = b.scheduledTime || b.bookingSlot || (b.timeSlot?.start ? `${b.timeSlot.start} - ${b.timeSlot.end}` : null);
    return timeStr ? (
      <span className="font-medium text-gray-800">{timeStr}</span>
    ) : (
      <span className="text-gray-400">Standard</span>
    );
  };

  return (
    <div className="space-y-6">
      <CardShell
        icon={FiShoppingBag}
      >
        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
              <FiSearch className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by user name, phone or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* Bookings List */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiLoader className="w-8 h-8 text-gray-400 animate-spin mr-3" />
              <span className="text-gray-600">Loading bookings...</span>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No bookings found</div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {bookings.map((booking) => (
                <motion.div
                  key={booking._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <FiShoppingBag className="text-blue-600 w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-gray-900">{booking.serviceId?.title || 'General Service'}</h4>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusStyle(booking.status)}`}>
                            {booking.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <FiUser className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>Customer: <span className="font-medium text-gray-800">{booking.userId?.name || 'Customer'}</span></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiCalendar className="w-4 h-4 text-gray-400 shrink-0" />
                            <span>Date: <span className="font-medium text-gray-800">{formatBookingDate(booking)}</span></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiUser className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              Partner:{' '}
                              {booking.vendorId ? (
                                <span className="font-medium text-gray-800">
                                  {booking.vendorId.businessName || booking.vendorId.name || 'Assigned'}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  Unassigned
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FiClock className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="flex items-center gap-1.5">Slot: {formatBookingSlot(booking)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-lg font-bold text-gray-900">₹{booking.finalAmount}</div>
                      <button
                        onClick={() => navigate(`/admin/bookings/${booking._id}`)}
                        className="text-sm text-blue-600 font-semibold hover:underline cursor-pointer"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && pagination.pages > 1 && (
          <div className="flex justify-center mt-8 gap-2">
            {[...Array(pagination.pages)].map((_, i) => (
              <button
                key={i}
                onClick={() => loadBookings(i + 1)}
                className={`w-10 h-10 rounded-lg font-semibold transition-all ${pagination.page === i + 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </CardShell>
    </div>
  );
};

export default UserBookings;
