import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiCheckCircle, FiTruck, FiPackage, FiClipboard, FiXCircle, FiLoader } from 'react-icons/fi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminBookingService } from '../../../../services/adminBookingService';
import { toast } from 'react-hot-toast';

const Tracking = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  // The Track action on the bookings list opens this page with ?search=<booking number>
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState(() => urlParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => urlParams.get('search') || '');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE_SIZE = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const fromUrl = urlParams.get('search');
    if (fromUrl !== null) setSearch(fromUrl);
  }, [urlParams]);

  // A new search starts again from the first page
  useEffect(() => { setPage(1); }, [debouncedSearch]);

  // Fetch bookings: page 1 replaces the list, later pages are added to it
  useEffect(() => {
    let alive = true;
    const fetchData = async () => {
      try {
        if (page === 1) setLoading(true); else setLoadingMore(true);
        const res = await adminBookingService.getAllBookings({ page, limit: PAGE_SIZE, search: debouncedSearch });
        if (!alive) return;
        if (res.success) {
          setBookings((prev) => (page === 1 ? res.data : [...prev, ...res.data.filter((b) => !prev.some((p) => p._id === b._id))]));
          setTotal(res.pagination?.total ?? res.data.length);
          if (page === 1 && res.data.length === 1) setSelectedOrder(res.data[0]);
        }
      } catch (error) {
        console.error('Error fetching bookings:', error);
        toast.error(error?.message || 'Failed to load bookings');
      } finally {
        if (alive) { setLoading(false); setLoadingMore(false); }
      }
    };
    fetchData();
    return () => { alive = false; };
  }, [debouncedSearch, page]);

  const isEnded = (status) => ['cancelled', 'rejected'].includes(status);

  const getStatusStep = (status) => {
    // Map status to step index based on project workflow
    switch (status) {
      case 'searching':
      case 'requested':
      case 'awaiting_payment':
      case 'pending':
      case 'confirmed':
      case 'accepted': return 0;
      case 'assigned': return 1;
      case 'journey_started':
      case 'visited': return 2;
      case 'in_progress': return 3;
      case 'work_done': return 4;
      case 'completed': return 5;
      default: return 0;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-600';
      case 'work_done': return 'bg-emerald-500';
      case 'in_progress': return 'bg-blue-500';
      case 'journey_started':
      case 'visited': return 'bg-purple-500';
      case 'assigned': return 'bg-indigo-500';
      case 'confirmed':
      case 'accepted':
      case 'pending': return 'bg-yellow-500';
      case 'cancelled':
      case 'rejected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const steps = [
    { title: 'Booking Placed', icon: FiClipboard, key: 'pending' },
    { title: 'Worker Assigned', icon: FiClipboard, key: 'assigned' },
    { title: 'Journey Started', icon: FiTruck, key: 'journey_started' },
    { title: 'Work In Progress', icon: FiPackage, key: 'in_progress' },
    { title: 'Work Done', icon: FiCheckCircle, key: 'work_done' },
    { title: 'Completed', icon: FiCheckCircle, key: 'completed' }
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative w-full">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by booking number, customer or professional (name, phone, email), service or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start h-[calc(100vh-250px)]">
        {/* Left: Orders Table */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10 shadow-sm">
                <tr className="bg-gray-50/50">
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">BOOKING ID</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">CUSTOMER</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">STATUS</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">BOOKING DATE</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500">Loading orders...</td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-500">No orders found</td>
                  </tr>
                ) : (
                  bookings.map((booking) => (
                    <tr
                      key={booking._id}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedOrder?._id === booking._id ? 'bg-blue-50/50' : ''}`}
                      onClick={() => setSelectedOrder(booking)}
                    >
                      <td className="p-4">
                        <span className="font-semibold text-gray-800 text-sm">#{booking.bookingNumber || booking._id.slice(-6).toUpperCase()}</span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">{booking.userId?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{booking.userId?.email || 'No email'}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white uppercase tracking-wide
                                    ${getStatusColor(booking.status)}`}>
                          {booking.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600 text-sm">
                        {new Date(booking.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(booking);
                          }}
                          className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded-lg font-medium text-xs transition-colors"
                        >
                          Track
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && bookings.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/40 px-4 py-3">
              <p className="text-xs font-semibold text-gray-500">Showing {bookings.length} of {total}</p>
              {bookings.length < total && (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingMore && <FiLoader className="h-3.5 w-3.5 animate-spin" />} Load more
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Tracking Details Panel */}
        <AnimatePresence mode='wait'>
          {selectedOrder ? (
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              className="w-full lg:w-96 bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col h-full overflow-y-auto"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-6">Tracking Details</h2>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">Order ID</p>
                <p className="text-lg font-bold text-gray-900">#{selectedOrder.bookingNumber || selectedOrder._id.slice(-6).toUpperCase()}</p>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">Customer</p>
                <p className="text-base font-semibold text-gray-900">{selectedOrder.userId?.name || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{selectedOrder.userId?.phone || selectedOrder.userId?.email}</p>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">Service</p>
                <p className="text-base font-semibold text-gray-900">{selectedOrder.serviceName || selectedOrder.serviceId?.title || '—'}</p>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-1">Professional</p>
                <p className="text-base font-semibold text-gray-900">
                  {selectedOrder.vendorId ? (selectedOrder.vendorId.businessName || selectedOrder.vendorId.name) : 'Not assigned yet'}
                </p>
                {selectedOrder.vendorId?.phone && <p className="text-xs text-gray-500">{selectedOrder.vendorId.phone}</p>}
              </div>

              {isEnded(selectedOrder.status) && (
                <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3">
                  <FiXCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-semibold text-red-700 capitalize">{selectedOrder.status}</p>
                    {selectedOrder.cancellationReason && <p className="text-xs text-red-600">{selectedOrder.cancellationReason}</p>}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="flex-1 relative pl-4 border-l-2 border-gray-100 space-y-8 mb-8">
                {steps.map((step, index) => {
                  const currentStepIdx = getStatusStep(selectedOrder.status);
                  // A cancelled booking did not reach the later steps, so only the first one is shown as done
                  const isCompleted = isEnded(selectedOrder.status) ? index === 0 : index <= currentStepIdx;

                  return (
                    <div key={index} className="relative pl-6">
                      {/* Dot */}
                      <div className={`absolute -left-[23px] top-0 w-8 h-8 rounded-full flex items-center justify-center border-2 
                        ${isCompleted ? 'bg-green-50 border-green-500 text-green-600' : 'bg-gray-50 border-gray-200 text-gray-300'}
                      `}>
                        <step.icon className="w-4 h-4" />
                      </div>

                      <div>
                        <h3 className={`text-sm font-semibold ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                          {step.title}
                        </h3>
                        <p className={`text-xs ${isCompleted ? 'text-green-600' : 'text-gray-400'}`}>
                          {isCompleted ? 'Completed' : 'Pending'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-6 border-t border-gray-100 mt-auto">
                <button
                  onClick={() => navigate(`/admin/bookings/${selectedOrder._id}`)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                >
                  View Full Details
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="w-full lg:w-96 bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center justify-center h-full text-center text-gray-500">
              <FiSearch className="w-12 h-12 text-gray-300 mb-4" />
              <p>Select an order to view tracking details</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default Tracking;
