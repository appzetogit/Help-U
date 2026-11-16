import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBriefcase, FiMapPin, FiClock, FiUser, FiFilter, FiSearch, FiLoader } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
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
        price: Number(job.totals?.total || job.price || job.finalAmount || 0).toFixed(2),
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
                  className="bg-white rounded-2xl pl-4 pr-3.5 py-3 cursor-pointer active:scale-[0.99] transition-transform relative overflow-hidden border border-gray-100"
                  style={{ boxShadow: '0 2px 10px rgba(15, 27, 45, 0.06)' }}
                >
                  {/* Status accent */}
                  <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: statusColor }} />

                  {/* Title + earnings */}
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2 flex-1">{job.serviceType}</h3>
                    {job.status?.toLowerCase() === 'completed' && (
                      <span
                        className="shrink-0 px-2.5 py-1 rounded-lg font-bold text-[14px] leading-none"
                        style={{ background: `${themeColors.button}12`, color: themeColors.button }}
                      >
                        ₹{Number(job.price || 0).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Status + schedule */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full capitalize text-white leading-none"
                      style={{ background: statusColor }}
                    >
                      {job.status.replace(/_/g, ' ')}
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-gray-500 font-medium min-w-0">
                      <FiClock className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{job.timeSlot?.date} • {job.timeSlot?.time}</span>
                    </span>
                  </div>

                  {/* Details */}
                  <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5 text-[13px] text-gray-700">
                    <div className="flex items-center gap-2 min-w-0">
                      <FiUser className="w-3.5 h-3.5 shrink-0" style={{ color: statusColor }} />
                      <span className="font-medium truncate">{job.user?.name || 'Customer'}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <FiMapPin className="w-3.5 h-3.5 shrink-0" style={{ color: statusColor }} />
                      <span className="font-medium truncate">{job.location?.address || 'Address not available'}</span>
                    </div>
                    {job.assignedTo && (
                      <div className="flex items-center gap-2 min-w-0 text-gray-500">
                        <FiBriefcase className="w-3.5 h-3.5 shrink-0" style={{ color: statusColor }} />
                        <span className="truncate">
                          Assigned to <span className="font-semibold text-gray-700">{job.assignedTo === 'SELF' ? 'Yourself' : job.assignedTo.name}</span>
                        </span>
                      </div>
                    )}
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

    </div>
  );
});

export default ActiveJobs;

