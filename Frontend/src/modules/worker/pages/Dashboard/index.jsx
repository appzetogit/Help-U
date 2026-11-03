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
import DashboardSkeleton from '../../components/common/DashboardSkeleton';
import StatsCards from './components/StatsCards';
import PendingBookings from './components/PendingBookings';
import TodayOverview from './components/TodayOverview';


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
    monthlyEarnings: 0,
    totalEarnings: 0,
    activeJobs: 0,
    pendingAlerts: 0,
    completedJobs: 0,
    rating: 0,
    todayAccepted: 0,
    todayRejected: 0,
    todayPending: 0
  });
  const [workerProfile, setWorkerProfile] = useState({
    name: 'Service Partner',
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
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'granted';
  });
  const [isEnablingPush, setIsEnablingPush] = useState(false);

  const handleEnableNotifications = async () => {
    setIsEnablingPush(true);
    try {
      const token = await registerFCMToken('worker', true);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
      if (token) {
        toast.success('Push notifications enabled!');
      } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'denied') {
        toast.error('Notifications are blocked in your browser settings.');
      }
    } catch (err) {
      console.error('Failed to enable notifications:', err);
      toast.error('Failed to enable push notifications');
    } finally {
      setIsEnablingPush(false);
    }
  };

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
      todayAccepted: apiStats.todayAccepted ?? 0,
      todayRejected: apiStats.todayRejected ?? 0,
      todayPending: mergedPending.length || apiStats.todayPending || 0,
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
      name: profile.name || 'Service Partner',
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
        // Same popup the rest of this page uses (the old local alert list no longer exists)
        window.dispatchEvent(new CustomEvent('showDashboardBookingAlert', { detail: booking }));
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
    return (
      <div className="h-[calc(100dvh-6rem)] overflow-hidden">
        <DashboardSkeleton />
      </div>
    );
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
      <Header title="Dashboard" showBack={false} showLocation notificationCount={stats.pendingAlerts} />

      <main className="pt-0">
        {/* Push Notification Permission Card (User-Gesture Trigger) */}
        {notificationPermission === 'default' && (
          <div className="px-4 pt-3 pb-1 animate-fade-in">
            <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center flex-shrink-0">
                  <FiBell className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">Enable Order Push Alerts</h4>
                  <p className="text-[11px] text-amber-700/90 leading-tight mt-0.5">
                    Never miss a job! Get instant sound alerts for new booking requests.
                  </p>
                </div>
              </div>
              <button
                onClick={handleEnableNotifications}
                disabled={isEnablingPush}
                className="px-3 py-1.5 bg-[#163B66] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#122e50] active:scale-95 transition-all flex-shrink-0 cursor-pointer"
              >
                {isEnablingPush ? 'Enabling...' : 'Enable'}
              </button>
            </div>
          </div>
        )}

        {/* Profile Card Section */}
        <div className="px-4 pt-4 pb-2">
          <div
            className="rounded-2xl p-4 cursor-pointer active:scale-98 transition-all duration-200 relative overflow-hidden text-white"
            onClick={() => navigate('/worker/profile')}
            style={{
              background: 'linear-gradient(135deg, #163B66 0%, #0F2B48 100%)',
              boxShadow: '0 4px 16px rgba(22, 59, 102, 0.15)',
            }}
          >
            {/* Subtle ambient circle */}
            <div
              className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, #FFFFFF 0%, transparent 70%)',
                transform: 'translate(20px, -20px)',
              }}
            />

            <div className="relative z-10 flex items-center gap-3.5">
              {/* Profile Photo */}
              <div
                className="w-13 h-13 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-white/20 bg-white/10"
              >
                {workerProfile.photo ? (
                  <img
                    src={workerProfile.photo}
                    alt={workerProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FiUser className="w-6 h-6 text-white" />
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200/90 mb-0.5">
                  WELCOME !
                </p>
                <h2 className="text-base font-bold text-white truncate leading-tight">{workerProfile.name}</h2>
                <p className="text-xs text-white/75 truncate font-medium mt-0.5">{workerProfile.businessName}</p>
              </div>

              {/* Online/Offline Duty Status & Toggle (1st Arrow) */}
              <div 
                className="flex flex-col items-center justify-center gap-1 z-20 cursor-pointer"
                onClick={handleToggleOnline}
                title={isOnline ? 'Switch to Duty OFF' : 'Switch to Duty ON'}
              >
                <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full transition-all shadow-xs ${
                  isOnline 
                    ? 'text-emerald-300 bg-emerald-950/70 border border-emerald-400/40' 
                    : 'text-slate-300 bg-slate-900/60 border border-slate-700/60'
                }`}>
                  {isOnline ? 'Duty ON' : 'Duty OFF'}
                </span>
                <div 
                  className="flex items-center px-2 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/10 active:scale-95 transition-transform"
                >
                  <div 
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 ease-in-out flex ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  >
                    <div 
                      className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${isOnline ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Arrow Icon */}
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-white/10 border border-white/15 text-white"
              >
                <FiChevronRight className="w-5 h-5" />
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

          {/* Today's Overview & Customer Schedule Confirmation (2nd Arrow) */}
          <TodayOverview
            stats={stats}
            pendingBookings={pendingBookings}
            onAcceptBooking={handleAcceptAlert}
            onRejectBooking={handleRejectAlert}
            onOpenBookingAlert={(booking) => {
              window.dispatchEvent(new CustomEvent('showDashboardBookingAlert', { detail: booking }));
            }}
          />

          {/* Performance Metrics */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-800">Performance</h2>
              <span className="text-xs text-slate-400 font-medium">Partner metrics</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Completed Jobs Card */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-emerald-600">
                    <FiCheckCircle className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100/60">
                    Completed
                  </span>
                </div>
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight">
                    {stats.completedJobs ?? 0}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">Total jobs done</p>
                </div>
              </div>

              {/* Rating Card */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-amber-500">
                    <FiTrendingUp className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100/60">
                    Rating
                  </span>
                </div>
                <div>
                  <div className="text-3xl font-black text-slate-900 tracking-tight">
                    {stats.rating > 0 ? stats.rating.toFixed(1) : '5.0'}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1">Average rating</p>
                </div>
              </div>
            </div>
          </div>

          {/* Refer & Earn Promotional Card */}
          {globalConfig.vendorReferralEnabled !== false && (
            <div
              onClick={() => navigate('/worker/refer-earn')}
              className="rounded-2xl p-4 text-white cursor-pointer active:scale-98 transition-all relative overflow-hidden flex items-center justify-between shadow-xs hover:shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #163B66 0%, #1E4C82 100%)',
              }}
            >
              <div className="flex items-center gap-3.5 z-10">
                <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center text-amber-300">
                  <FiGift className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
                    Refer & Earn
                  </span>
                  <h3 className="text-sm font-bold text-white mt-1">
                    Invite Service Partners & Earn ₹{globalConfig.referralReward ?? stats.referralReward ?? 0}
                  </h3>
                  <p className="text-[11px] text-blue-100/80 font-medium">Get cash reward directly into your wallet</p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white z-10">
                <FiChevronRight className="w-5 h-5" />
              </div>
            </div>
          )}

          {/* Recent Jobs - List View */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-800">Active Jobs</h2>
              {recentJobs.length > 0 && (
                <button
                  onClick={() => navigate('/worker/jobs')}
                  className="px-3 py-1.5 rounded-lg font-bold text-xs text-white transition-all duration-200 active:scale-95 shadow-xs"
                  style={{
                    background: '#163B66',
                  }}
                >
                  View All
                </button>
              )}
            </div>
            {recentJobs.length > 0 ? (
              <div className="space-y-2.5">
                {recentJobs.map((job) => {
                  return (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/worker/booking/${job.id}`)}
                      className="bg-white rounded-xl border border-slate-200/80 p-3 shadow-xs hover:shadow-sm cursor-pointer active:scale-98 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        {/* Profile Image Circle */}
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-slate-100 text-[#163B66] border border-slate-200/60">
                          <FiUser className="w-5 h-5" />
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                          {/* Service on its own line (names can be long); customer below it */}
                          <p className="text-sm font-bold text-slate-800 truncate">{job.serviceType || 'Service'}</p>
                          <p className="text-xs font-medium text-slate-500 truncate mb-1">{job.customerName}</p>

                          {/* Address, Time, Status in one line */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1 text-slate-500 text-xs">
                              <FiMapPin className="w-3 h-3 text-slate-400" />
                              <span className="truncate max-w-[120px]">{job.location}</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-500 text-xs">
                              <FiClock className="w-3 h-3 text-slate-400" />
                              <span>{job.time}</span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#163B66] border border-blue-100">
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
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 transition-all active:scale-95"
                        >
                          <FiArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs text-center">
                <FiBriefcase className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mb-0.5">No active jobs</p>
                <p className="text-xs text-slate-400">New bookings will appear here</p>
              </div>
            )}
          </div>
        </div>
      </main>

    </div>
  );
});

export default Dashboard;
