import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiBriefcase, FiUsers, FiBell, FiArrowRight, FiUser, FiClock, FiMapPin, FiCheckCircle, FiTrendingUp, FiChevronRight, FiGift } from 'react-icons/fi';
import { FaWallet } from 'react-icons/fa';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import { workerDashboardService } from '../../services/dashboardService';
import { acceptBooking, rejectBooking } from '../../services/bookingService';
// Booking alert handled globally
import { toast } from 'react-hot-toast';
import { io } from 'socket.io-client';
import api from '../../../../services/api';
import { registerFCMToken } from '../../../../services/pushNotificationService';
import LogoLoader from '../../../../components/common/LogoLoader';
import StatsCards from './components/StatsCards';
import PendingBookings from './components/PendingBookings';


const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

const Dashboard = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const [stats, setStats] = useState({
    todayEarnings: 0,
    activeJobs: 0,
    pendingAlerts: 0,
    totalEarnings: 0,
    completedJobs: 0,
    rating: 0,
  });
  const [workerProfile, setWorkerProfile] = useState({
    name: 'Worker Name',
    businessName: 'Business Name',
    photo: null,
    service: [],
    isOnline: false
  });
  const [isOnline, setIsOnline] = useState(false);
  const [recentJobs, setRecentJobs] = useState([]);
  const [pendingBookings, setPendingBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [globalConfig, setGlobalConfig] = useState({ maxSearchTime: 5, waveDuration: 60 });

  const ignoredBookingIds = useRef(new Set());

  // Set background gradient
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



  // Process API response - extracted to avoid duplication
  const processApiResponse = useCallback((response) => {
    if (!response.success) return;

    const { stats: apiStats, recentBookings, config } = response.data;
    if (config) setGlobalConfig(config);

    // Separate requested/searching bookings from other bookings
    const requestedBookings = (recentBookings || []).filter(booking => {
      const status = booking.status?.toLowerCase();
      return status === 'requested' || status === 'searching';
    });
    const otherBookings = (recentBookings || []).filter(booking => {
      const status = booking.status?.toLowerCase();
      return status !== 'requested' && status !== 'searching';
    });

    // Build pending bookings map
    const mergedMap = new Map();
    const workerData = JSON.parse(localStorage.getItem('workerData') || '{}');
    const vendorId = workerData._id || workerData.id;

    requestedBookings.forEach(b => {
      const id = String(b._id || b.id);

      // Find distance for this worker if available
      let distance = 'N/A';
      if (b.potentialVendors && vendorId) {
        const potentialWorker = b.potentialVendors.find(pv =>
          String(pv.vendorId?._id || pv.vendorId) === String(vendorId)
        );
        if (potentialWorker && potentialWorker.distance) {
          distance = `${potentialWorker.distance.toFixed(1)} km`;
        }
      }

      mergedMap.set(id, {
        ...b, // Spread first!
        id,
        serviceName: b.serviceName || b.serviceId?.title || 'New Booking Request',
        serviceCategory: b.serviceCategory || b.serviceId?.categoryId?.title || 'General Service',
        customerName: b.userId?.name || 'Customer',
        location: {
          address: b.address?.addressLine1 || 'Address not available',
          distance: distance
        },
        // Prioritize vendorEarnings, fallback to 90% of finalAmount if it's not a free plan (finalAmount > 0)
        price: (b.vendorEarnings > 0 ? b.vendorEarnings : (b.finalAmount > 0 ? b.finalAmount * 0.9 : 0)).toFixed(2),
        vendorEarnings: b.vendorEarnings, // Ensure it's explicitly passed
        timeSlot: {
          date: new Date(b.scheduledDate).toLocaleDateString(),
          time: b.scheduledTime || 'Time not set'
        },
        status: b.status,
        expiresAt: b.expiresAt || (b.createdAt && config ? new Date(new Date(b.createdAt).getTime() + (config.maxSearchTime || 5) * 60000).toISOString() : null)
      });
    });

    // Filter out locally ignored bookings
    const finalMap = new Map();
    mergedMap.forEach((value, key) => {
      if (!ignoredBookingIds.current.has(key)) {
        finalMap.set(key, value);
      }
    });

    // Merge with local storage to avoid losing real-time updates that haven't hit API yet
    const localPending = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
    const apiPending = Array.from(finalMap.values());
    const mergedPending = [...apiPending];

    localPending.forEach(localJob => {
      const id = String(localJob.id || localJob._id);
      if (!mergedPending.find(job => String(job.id || job._id) === id) && !ignoredBookingIds.current.has(id)) {

        const createdAt = localJob.createdAt ? new Date(localJob.createdAt).getTime() : Date.now();
        const expiresAt = localJob.expiresAt || (localJob.createdAt && config ? new Date(createdAt + (config.maxSearchTime || 5) * 60000).toISOString() : null);
        const isExpired = (expiresAt && new Date(expiresAt) <= new Date()) || (Date.now() - createdAt > 300000);

        const lowerStatus = String(localJob.status || '').toLowerCase();

        if (!isExpired && (lowerStatus === 'requested' || lowerStatus === 'searching')) {
          mergedPending.push({
            ...localJob,
            id,
            serviceName: localJob.serviceName || localJob.serviceId?.title || 'New Booking Request',
            serviceCategory: localJob.serviceCategory || localJob.serviceId?.categoryId?.title || 'General Service',
            customerName: localJob.customerName || localJob.userId?.name || 'Customer',
            expiresAt
          });
        }
      }
    });

    setPendingBookings(mergedPending);
    localStorage.setItem('workerPendingJobs', JSON.stringify(mergedPending));

    // Update stats
    setStats({
      todayEarnings: apiStats.todayEarnings || 0,
      monthlyEarnings: apiStats.monthlyEarnings || 0,
      totalRevenue: apiStats.totalRevenue || apiStats.totalEarnings || 0,
      totalEarnings: apiStats.totalEarnings || apiStats.totalRevenue || 0,
      activeJobs: apiStats.activeJobs || apiStats.inProgressBookings || 0,
      pendingAlerts: mergedPending.length,
      completedJobs: apiStats.completedJobs || apiStats.completedBookings || 0,
      rating: apiStats.rating || apiStats.averageRating || 0,
    });

    // Recent jobs (non-requested)
    const recentJobsData = otherBookings.slice(0, 3).map(booking => ({
      id: booking._id,
      serviceType: booking.serviceId?.title || 'Service',
      customerName: booking.userId?.name || 'Customer',
      location: booking.address?.addressLine1 || 'Address not available',
      price: (booking.vendorEarnings > 0 ? booking.vendorEarnings : (booking.finalAmount ? booking.finalAmount * 0.9 : 0)).toFixed(2),
      vendorEarnings: booking.vendorEarnings,
      timeSlot: {
        date: new Date(booking.scheduledDate).toLocaleDateString(),
        time: booking.scheduledTime || 'Time not set'
      },
      status: booking.status,
      assignedTo: booking.assignedAt ? { name: 'You (Self)' } : null,
    }));
    setRecentJobs(recentJobsData);

    // Load worker profile from localStorage (once)
    const profile = JSON.parse(localStorage.getItem('workerData') || '{}');
    setWorkerProfile({
      name: profile.name || 'Worker Name',
      businessName: profile.businessName || 'Business Name',
      photo: profile.profilePhoto || null,
      service: profile.service || [],
      isOnline: profile.isOnline || false
    });
    setIsOnline(profile.isOnline || false);
  }, []);

  // Main data loader - useCallback to prevent recreation
  const loadDashboardData = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);

      const response = await workerDashboardService.getDashboardStats();
      processApiResponse(response);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(String(err.message || 'Failed to load dashboard data'));
    } finally {
      setLoading(false);
    }
  }, [processApiResponse]);

  const handleToggleOnline = async (e) => {
    e.stopPropagation();
    const newStatus = !isOnline;
    // Optimistic UI update
    setIsOnline(newStatus);
    try {
      const res = await api.put('/workers/status', { isOnline: newStatus });
      if (res.data.success) {
        toast.success(newStatus ? 'You are now Online!' : 'You are now Offline!');
        const profile = JSON.parse(localStorage.getItem('workerData') || '{}');
        profile.isOnline = newStatus;
        localStorage.setItem('workerData', JSON.stringify(profile));
      }
    } catch (err) {
      // Revert if failed
      setIsOnline(!newStatus);
      toast.error('Failed to change status');
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Check for redirected state (to open a specific alert modal)
  useEffect(() => {
    if (location.state?.openBookingId && pendingBookings.length > 0) {
      const bId = String(location.state.openBookingId);
      const booking = pendingBookings.find(b => String(b.id || b._id) === bId);
      if (booking) {
        setActiveAlertBookings(prev => {
          if (prev.find(p => String(p.id || p._id) === bId)) return prev;
          return [...prev, booking];
        });
        // Clear state to avoid reopening on refresh
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, pendingBookings, navigate]);

  // Listen for real-time updates via window events (dispatched by useAppNotifications)
  useEffect(() => {
    const handleUpdate = () => {
      loadDashboardData(false); // false = don't show spinner for background refresh
    };

    // Ask for notification permission and register FCM
    registerFCMToken('worker', true).catch(err => console.error('FCM registration failed:', err));

    // Listen for custom dashboard events from SocketContext
    const handleShowAlert = (e) => {
      // e.detail contains the new booking job
      if (e.detail) {
        // Also add to pending if not present
        setPendingBookings(prev => {
          if (prev.find(b => b.id === e.detail.id)) return prev;
          return [e.detail, ...prev];
        });
      }
    };

    const handleRemoveBooking = (e) => {
      if (e.detail?.id) {
        const idToRemove = String(e.detail.id);

        // Add to ignored list so it doesn't come back on next fetch
        ignoredBookingIds.current.add(idToRemove);

        // Remove from pending bookings state immediately
        setPendingBookings(prev => prev.filter(b => String(b.id || b._id) !== idToRemove));

        // Remove from recent jobs state
        setRecentJobs(prev => prev.filter(b => String(b.id || b._id) !== idToRemove));

        // Remove from localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        const updatedPending = pendingJobs.filter(job => String(job.id || job._id) !== idToRemove);
        localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));
      }
    };

    window.addEventListener('workerJobsUpdated', handleUpdate);
    window.addEventListener('workerStatsUpdated', handleUpdate);
    window.addEventListener('showDashboardBookingAlert', handleShowAlert);
    window.addEventListener('removeWorkerBooking', handleRemoveBooking);

    return () => {
      window.removeEventListener('workerJobsUpdated', handleUpdate);
      window.removeEventListener('workerStatsUpdated', handleUpdate);
      window.removeEventListener('showDashboardBookingAlert', handleShowAlert);
      window.removeEventListener('removeWorkerBooking', handleRemoveBooking);
    };
  }, [loadDashboardData]);


  // Alert Action Handlers
  const handleAcceptAlert = async (bookingId) => {
    try {
      const response = await acceptBooking(bookingId);
      if (response.success) {
        toast.success('Booking accepted successfully!');
        setPendingBookings(prev => prev.filter(b => String(b.id || b._id) !== String(bookingId)));

        // Sync localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        const updated = pendingJobs.filter(b => String(b.id || b._id) !== String(bookingId));
        localStorage.setItem('workerPendingJobs', JSON.stringify(updated));

        window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: bookingId } }));
        window.dispatchEvent(new Event('workerStatsUpdated'));
      }
    } catch (error) {
      console.error('Error accepting:', error);
      toast.error('Failed to accept booking');
    }
  };

  const handleRejectAlert = async (bookingId) => {
    try {
      const response = await rejectBooking(bookingId);
      if (response.success) {
        toast.success('Booking rejected');
        setPendingBookings(prev => prev.filter(b => String(b.id || b._id) !== String(bookingId)));

        // Sync localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        const updated = pendingJobs.filter(b => String(b.id || b._id) !== String(bookingId));
        localStorage.setItem('workerPendingJobs', JSON.stringify(updated));

        window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: bookingId } }));
      }
    } catch (error) {
      console.error('Error rejecting:', error);
      toast.error('Failed to reject booking');
    }
  };

  // Memoize quickActions to prevent recreation on every render
  const quickActions = useMemo(() => [
    {
      title: 'Active Jobs',
      icon: FiBriefcase,
      color: '#00a6a6',
      path: '/worker/jobs',
      count: stats.activeJobs,
      subtitle: `${stats.activeJobs} running`,
    },
    {
      title: 'Wallet',
      icon: FaWallet,
      color: '#F59E0B',
      path: '/worker/wallet',
      subtitle: `₹${stats.totalEarnings.toLocaleString()} total`,
    },
  ], [stats.activeJobs, stats.totalEarnings]);

  const getStatusColor = (status) => {
    const s = String(status).toLowerCase();
    const statusColors = {
      'accepted': '#3B82F6',
      'confirmed': '#10B981',
      'assigned': '#8B5CF6',
      'journey_started': '#F59E0B',
      'visited': '#F59E0B',
      'in_progress': '#F59E0B',
      'work_done': '#10B981',
      'completed': '#10B981',
      'settlement_pending': '#F97316',
    };
    return statusColors[s] || '#6B7280';
  };

  const getStatusLabel = (status) => {
    const s = String(status).toLowerCase();
    const labels = {
      'requested': 'Requested',
      'searching': 'Searching',
      'accepted': 'Accepted',
      'confirmed': 'Confirmed',
      'assigned': 'Assigned',
      'journey_started': 'On the way',
      'visited': 'Visited',
      'in_progress': 'In Progress',
      'work_done': 'Work Done',
      'completed': 'Completed',
      'settlement_pending': 'Settlement',
      'cancelled': 'Cancelled',
      'rejected': 'Rejected'
    };
    return labels[s] || status;
  };

  // Show loading state
  if (loading) {
    return <LogoLoader />;
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen pb-20 flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <div className="text-center px-6">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-semibold mb-2">Failed to Load Dashboard</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && error.length > 0 && !loading) {
    return (
      <div className="min-h-screen pb-20 flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <div className="text-center px-6">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-xl font-semibold mb-2">Failed to Load Dashboard</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Dashboard" showBack={false} notificationCount={stats.pendingAlerts} />

      <main className="pt-0">
        {/* Profile Card Section */}
        <div className="px-4 pt-4 pb-2">
          <div
            className="rounded-2xl p-4 cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden"
            onClick={() => navigate('/worker/profile')}
            style={{
              background: themeColors.button,
              border: `2px solid ${themeColors.button}`,
            }}
          >
            {/* Decorative Pattern */}
            <div
              className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
              style={{
                background: `radial-gradient(circle, ${themeColors.button} 0%, transparent 70%)`,
                transform: 'translate(20px, -20px)',
              }}
            />

            <div className="relative z-10 flex items-center gap-3">
              {/* Profile Photo */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.button}dd 100%)`,
                  border: `2.5px solid #FFFFFF`,
                }}
              >
                {workerProfile.photo ? (
                  <img
                    src={workerProfile.photo}
                    alt={workerProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FiUser className="w-7 h-7" style={{ color: '#FFFFFF' }} />
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold uppercase tracking-wider mb-0.5" style={{
                  color: '#FFFFFF',
                  textShadow: `1px 1px 0px rgba(0, 0, 0, 0.2)`,
                  letterSpacing: '0.12em',
                }}>
                  WELCOME !
                </p>
                <h2 className="text-base font-bold text-white truncate mb-0.5">{workerProfile.name}</h2>
                <p className="text-xs text-white truncate font-medium opacity-90">{workerProfile.businessName}</p>
              </div>

              {/* Online/Offline Toggle */}
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-full z-20"
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(5px)'
                }}
                onClick={handleToggleOnline}
              >
                <div 
                  className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-300 ease-in-out cursor-pointer flex ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
                >
                  <div 
                    className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${isOnline ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </div>
              </div>

              {/* Arrow Icon */}
              <div
                className="p-2.5 rounded-lg flex-shrink-0"
                style={{
                  background: 'rgba(255, 255, 255, 0.35)',
                  backdropFilter: 'blur(10px)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                }}
              >
                <FiChevronRight className="w-6 h-6" style={{ color: '#FFFFFF', fontWeight: 'bold' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Incomplete Profile Prompt */}
        {(!workerProfile.service || workerProfile.service.length === 0) && (
          <div className="px-4 pt-2 -mb-2">
            <div
              onClick={() => navigate('/worker/profile')}
              className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r shadow-sm cursor-pointer hover:bg-orange-100 transition-colors"
            >
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FiClock className="h-5 w-5 text-orange-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-bold text-orange-700">Profile Incomplete</p>
                  <p className="text-sm text-orange-600">
                    Add services to your profile to start receiving bookings.
                  </p>
                </div>
                <div className="ml-auto">
                  <FiArrowRight className="h-4 w-4 text-orange-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards - Optimized Component */}
        <StatsCards stats={stats} />

        {/* Content Section (below gradient) */}
        <div className="px-4 py-4 space-y-4">
          {/* Pending Booking Alerts - Optimized Component */}
          <PendingBookings
            bookings={pendingBookings}
            maxSearchTimeMins={globalConfig.maxSearchTime}
            setPendingBookings={setPendingBookings}
            setActiveAlertBooking={(booking) => {
              // Dispatch to global alert via CustomEvent
              window.dispatchEvent(new CustomEvent('showDashboardBookingAlert', { detail: booking }));
            }}
          />

          {/* Performance Metrics */}
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Performance</h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Completed Jobs Card */}
              <div
                className="rounded-2xl shadow-lg relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #FFFFFF 0%, #F0FDF4 100%)',
                  boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15), 0 4px 12px rgba(16, 185, 129, 0.1), 0 0 0 2px rgba(16, 185, 129, 0.2)',
                  border: '2px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                {/* Left border accent */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
                  style={{
                    background: 'linear-gradient(180deg, #10B981 0%, #059669 100%)',
                  }}
                />
                {/* Top Border with Heading */}
                <div
                  className="w-full py-3 px-4 rounded-t-2xl"
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <p className="text-base font-bold text-white text-center">Completed</p>
                </div>
                {/* Icon at top left - just below heading */}
                <div
                  className="absolute top-14 left-4 p-3 rounded-xl z-10"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.2) 100%)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2)',
                    border: '2px solid rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <FiCheckCircle className="w-7 h-7" style={{ color: '#10B981' }} />
                </div>
                {/* Content */}
                <div className="p-5 pt-16">
                  <p className="text-4xl font-bold mb-2 text-center" style={{ color: '#10B981' }}>
                    {stats.completedJobs}
                  </p>
                  <p className="text-sm text-gray-600 font-semibold text-center">Total jobs</p>
                </div>
              </div>

              {/* Rating Card */}
              <div
                className="rounded-2xl shadow-lg relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #FFFFFF 0%, #FFFBEB 100%)',
                  boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15), 0 4px 12px rgba(245, 158, 11, 0.1), 0 0 0 2px rgba(245, 158, 11, 0.2)',
                  border: '2px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                {/* Left border accent */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
                  style={{
                    background: 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)',
                  }}
                />
                {/* Top Border with Heading */}
                <div
                  className="w-full py-3 px-4 rounded-t-2xl"
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                  }}
                >
                  <p className="text-base font-bold text-white text-center">Rating</p>
                </div>
                {/* Icon at top left - just below heading */}
                <div
                  className="absolute top-14 left-4 p-3 rounded-xl z-10"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.2) 100%)',
                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2)',
                    border: '2px solid rgba(245, 158, 11, 0.4)',
                  }}
                >
                  <FiTrendingUp className="w-7 h-7" style={{ color: '#F59E0B' }} />
                </div>
                {/* Content */}
                <div className="p-5 pt-16">
                  <p className="text-4xl font-bold mb-2 text-center" style={{ color: '#F59E0B' }}>
                    {stats.rating > 0 ? stats.rating.toFixed(1) : 'N/A'}
                  </p>
                  <p className="text-sm text-gray-600 font-semibold text-center">Average rating</p>
                </div>
              </div>
            </div>
          </div>

          {/* Refer & Earn Promotional Card */}
          {globalConfig.vendorReferralEnabled !== false && (
            <div
              onClick={() => navigate('/worker/refer-earn')}
              className="rounded-2xl p-4 bg-gradient-to-r from-[#2b6573] to-[#347989] text-white shadow-lg cursor-pointer active:scale-98 transition-all relative overflow-hidden flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5 z-10">
                <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-amber-300 shadow-inner">
                  <FiGift className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded-full">
                    Refer & Earn
                  </span>
                  <h3 className="text-sm font-extrabold text-white mt-1">
                    Invite Workers & Earn ₹{globalConfig.referralReward || stats.referralReward || 100}
                  </h3>
                  <p className="text-[11px] text-teal-100 font-medium">Get cash reward directly into your wallet</p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white z-10">
                <FiChevronRight className="w-5 h-5" />
              </div>
            </div>
          )}

          {/* Recent Jobs - List View */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Active Jobs</h2>
              {recentJobs.length > 0 && (
                <button
                  onClick={() => navigate('/worker/jobs')}
                  className="px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.button}dd 100%)`,
                    color: '#FFFFFF',
                    boxShadow: `0 4px 12px ${hexToRgba(themeColors.button, 0.3)}, 0 2px 6px ${hexToRgba(themeColors.button, 0.2)}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 6px 16px ${hexToRgba(themeColors.button, 0.4)}, 0 3px 8px ${hexToRgba(themeColors.button, 0.3)}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 4px 12px ${hexToRgba(themeColors.button, 0.3)}, 0 2px 6px ${hexToRgba(themeColors.button, 0.2)}`;
                  }}
                >
                  View All
                </button>
              )}
            </div>
            {recentJobs.length > 0 ? (
              <div className="space-y-3">
                {recentJobs.map((job, index) => {
                  // Alternating colors
                  const isDarkBlue = index % 2 === 0;
                  const accentColor = isDarkBlue ? '#001947' : '#406788';

                  return (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/worker/booking/${job.id}`)}
                      className="bg-white rounded-xl shadow-lg cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden"
                      style={{
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.08)',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      {/* Left accent border */}
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
                        style={{
                          background: `linear-gradient(180deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                        }}
                      />

                      {/* Compact Content - All in one row */}
                      <div className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          {/* Profile Image Circle */}
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                            style={{
                              border: `2.5px solid ${accentColor}40`,
                              boxShadow: `0 2px 8px ${hexToRgba(accentColor, 0.25)}, inset 0 1px 0 rgba(255, 255, 255, 0.4)`,
                              background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}10 100%)`,
                            }}
                          >
                            <FiUser className="w-5 h-5" style={{ color: accentColor }} />
                          </div>

                          {/* Main Content */}
                          <div className="flex-1 min-w-0">
                            {/* Name and Service in one line */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <p className="text-sm font-bold text-gray-800 truncate">{job.customerName}</p>
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded-lg flex-shrink-0"
                                style={{
                                  background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                                  color: '#FFFFFF',
                                  boxShadow: `0 2px 5px ${hexToRgba(accentColor, 0.3)}`,
                                }}
                              >
                                {job.serviceType || 'Service'}
                              </span>
                            </div>

                            {/* Address, Time, Status in one line */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded"
                                style={{
                                  background: 'rgba(0, 166, 166, 0.1)',
                                  border: '1px solid rgba(0, 166, 166, 0.2)',
                                }}
                              >
                                <FiMapPin className="w-3 h-3" style={{ color: themeColors.button }} />
                                <span className="text-xs font-semibold text-gray-700 truncate max-w-[100px]">{job.location}</span>
                              </div>
                              <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded"
                                style={{
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  border: '1px solid rgba(245, 158, 11, 0.2)',
                                }}
                              >
                                <FiClock className="w-3 h-3" style={{ color: '#F59E0B' }} />
                                <span className="text-xs font-semibold text-gray-700">{job.time}</span>
                              </div>
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  background: `${accentColor}15`,
                                  color: accentColor,
                                  border: `1px solid ${accentColor}30`,
                                }}
                              >
                                {getStatusLabel(job.status)}
                              </span>
                            </div>
                          </div>

                          {/* Navigate Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/worker/booking/${job.id}`);
                            }}
                            className="p-2 rounded-lg flex-shrink-0 transition-all duration-300 active:scale-95"
                            style={{
                              background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                              boxShadow: `0 3px 10px ${hexToRgba(accentColor, 0.3)}, 0 2px 5px ${hexToRgba(accentColor, 0.2)}`,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.1)';
                              e.currentTarget.style.boxShadow = `0 5px 14px ${hexToRgba(accentColor, 0.4)}, 0 3px 7px ${hexToRgba(accentColor, 0.3)}`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = `0 3px 10px ${hexToRgba(accentColor, 0.3)}, 0 2px 5px ${hexToRgba(accentColor, 0.2)}`;
                            }}
                          >
                            <FiArrowRight className="w-4 h-4" style={{ color: '#FFFFFF' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="bg-white rounded-xl p-6 shadow-md text-center"
                style={{
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                }}
              >
                <FiBriefcase className="w-12 h-12 mx-auto mb-3" style={{ color: '#D1D5DB' }} />
                <p className="text-sm text-gray-600 mb-1">No active jobs</p>
                <p className="text-xs text-gray-500">New bookings will appear here</p>
              </div>
            )}
          </div>
        </div>
      </main>

    </div>
  );
});

export default Dashboard;
