import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase, FiMapPin, FiClock, FiUser, FiFilter, FiSearch, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import LogoLoader from '../../../../components/common/LogoLoader';

import { getBookings } from '../../services/bookingService';
import { ConfirmDialog } from '../../components/common';

const ActiveJobs = memo(() => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('in_progress'); // Default to showing active jobs
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  // Memoize loadJobs to prevent recreation
  const loadJobs = useCallback(async (currentFilter, currentSearch) => {
    try {
      setLoading(true);
      const response = await getBookings({
        status: currentFilter,
        q: currentSearch,
        limit: 50 // Fetch more than default since we removed client-side filter
      });
      const jobsData = response.data || [];
      // Map API response to Component State structure
      const mappedJobs = jobsData.map(job => ({
        id: job._id || job.id,
        serviceType: job.serviceName || 'Service',
        user: {
          name: job.userId?.name || 'Customer'
        },
        location: {
          address: job.address?.addressLine1 || 'Address not available'
        },
        price: (job.finalAmount ? job.finalAmount * 0.9 : 0).toFixed(2),
        status: job.status,
        assignedTo: job.assignedAt ? { name: 'You (Self)' } : null,
        timeSlot: {
          date: job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : 'Date',
          time: job.scheduledTime || 'Time'
        }
      }));
      setJobs(mappedJobs);
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast.error('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  // Use a debounced search to avoid spamming the API
  useEffect(() => {
    const timer = setTimeout(() => {
      loadJobs(filter, searchQuery);
    }, filter === 'all' && searchQuery === '' ? 0 : 500); // Only debounce if active searching

    return () => clearTimeout(timer);
  }, [filter, searchQuery, loadJobs]);

  useEffect(() => {
    const handleUpdate = () => loadJobs(filter, searchQuery);
    window.addEventListener('workerJobsUpdated', handleUpdate);
    return () => {
      window.removeEventListener('workerJobsUpdated', handleUpdate);
    };
  }, [loadJobs, filter, searchQuery]);

  // filteredJobs is now just the jobs from the server
  const filteredJobs = jobs;

  const hexToRgba = useCallback((hex, alpha) => {
    if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }, []);

  const getStatusColor = useCallback((status) => {
    const colors = {
      'ACCEPTED': '#F59E0B',
      'ASSIGNED': '#3B82F6',
      'JOURNEY_STARTED': '#F59E0B',
      'VISITED': '#8B5CF6',
      'WORK_DONE': '#10B981',
      'SETTLEMENT_PENDING': '#F97316',
      'COMPLETED': '#059669',
    };
    return colors[status?.toUpperCase()] || '#6B7280';
  }, []);

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Active Jobs" showSearch={true} />

      <main className="px-4 py-6">
        {/* Search Bar */}
        <div className="mb-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
              style={{ focusRingColor: themeColors.button }}
            />
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'assigned', label: 'Assigned' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'completed', label: 'Completed' },
          ].map((filterOption) => (
            <button
              key={filterOption.id}
              onClick={() => setFilter(filterOption.id)}
              className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${filter === filterOption.id
                ? 'text-white'
                : 'bg-white text-gray-700'
                }`}
              style={
                filter === filterOption.id
                  ? {
                    background: themeColors.button,
                    boxShadow: `0 2px 8px ${themeColors.button}40`,
                  }
                  : {
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }
              }
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {/* Jobs List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm animate-pulse">
                <div className="flex justify-between mb-4 pb-4 border-b border-slate-50">
                  <div className="space-y-2">
                    <div className="h-3 w-20 bg-slate-100 rounded"></div>
                    <div className="h-5 w-48 bg-slate-100 rounded"></div>
                  </div>
                  <div className="h-10 w-20 bg-slate-100 rounded-lg"></div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100"></div>
                    <div className="h-4 w-32 bg-slate-100 rounded"></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100"></div>
                    <div className="h-4 w-40 bg-slate-100 rounded"></div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-50 flex gap-3">
                  <div className="h-10 flex-1 bg-slate-100 rounded-lg"></div>
                  <div className="h-10 flex-1 bg-slate-100 rounded-lg"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div
            className="bg-white rounded-xl p-8 text-center shadow-md"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <FiBriefcase className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-600 font-semibold mb-2">No jobs found</p>
            <p className="text-sm text-gray-500">
              {searchQuery ? 'Try a different search term' : 'No active jobs at the moment'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map((job) => {
              const statusColor = getStatusColor(job.status);

              return (
                <div
                  key={job.id}
                  onClick={() => navigate(`/worker/booking/${job.id}`)}
                  className="rounded-xl p-4 shadow-lg cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)',
                    boxShadow: `0 8px 24px ${hexToRgba(statusColor, 0.15)}, 0 4px 12px ${hexToRgba(statusColor, 0.1)}, 0 0 0 2px ${hexToRgba(statusColor, 0.2)}`,
                    border: `2px solid ${hexToRgba(statusColor, 0.3)}`,
                  }}
                >
                  {/* Left border accent */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                    style={{
                      background: `linear-gradient(180deg, ${statusColor} 0%, ${statusColor}dd 100%)`,
                    }}
                  />

                  <div className="relative z-10 pl-2">
                    {/* Header Section */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="p-1.5 rounded-lg"
                            style={{
                              background: `${statusColor}15`,
                            }}
                          >
                            <FiBriefcase className="w-4 h-4" style={{ color: statusColor }} />
                          </div>
                          <h3 className="font-bold text-gray-800 text-base">{job.serviceType}</h3>
                        </div>
                        <div className="ml-8 mb-2">
                          <span
                            className="text-xs font-bold px-3 py-1.5 rounded-full"
                            style={{
                              background: `linear-gradient(135deg, ${statusColor} 0%, ${statusColor}dd 100%)`,
                              color: '#FFFFFF',
                              boxShadow: `0 2px 8px ${hexToRgba(statusColor, 0.3)}`,
                            }}
                          >
                            {job.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <div
                        className="px-3 py-2 rounded-lg font-bold text-lg flex items-center justify-center min-w-[80px]"
                        style={{
                          background: `linear-gradient(135deg, ${themeColors.button}15 0%, ${themeColors.button}10 100%)`,
                          color: themeColors.button,
                          border: `1px solid ${hexToRgba(themeColors.button, 0.2)}`,
                        }}
                      >
                        {job.status?.toLowerCase() === 'completed' ? `₹${job.price}` : <FiClock className="w-5 h-5 opacity-40" title="Earnings visible after completion" />}
                      </div>
                    </div>

                    {/* Info Section */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                          <FiUser className="w-4 h-4" style={{ color: statusColor }} />
                        </div>
                        <span className="text-gray-700 font-medium">{job.user?.name || 'Customer'}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                          <FiMapPin className="w-4 h-4" style={{ color: statusColor }} />
                        </div>
                        <span className="text-gray-700 font-medium truncate">{job.location?.address || 'Address not available'}</span>
                      </div>

                      {job.assignedTo && (
                        <div className="flex items-center gap-2 text-sm">
                          <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                            <FiUser className="w-4 h-4" style={{ color: statusColor }} />
                          </div>
                          <span className="text-gray-700 font-medium">
                            Assigned to: <span className="font-semibold">{job.assignedTo === 'SELF' ? 'Yourself' : job.assignedTo.name}</span>
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <div className="p-1 rounded" style={{ background: 'rgba(0, 0, 0, 0.03)' }}>
                          <FiClock className="w-4 h-4" style={{ color: statusColor }} />
                        </div>
                        <span className="text-gray-700 font-medium">{job.timeSlot?.date} • {job.timeSlot?.time}</span>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      <BottomNav />
    </div>
  );
});

export default ActiveJobs;

