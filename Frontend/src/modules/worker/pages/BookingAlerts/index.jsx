import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiClock, FiMapPin, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Header from '../../components/layout/Header';
import { workerTheme as themeColors } from '../../../../theme';
import LogoLoader from '../../../../components/common/LogoLoader';
import { workerDashboardService } from '../../services/dashboardService';
import { acceptBooking, rejectBooking, getBookings } from '../../services/bookingService';
import { useSocket } from '../../../../context/SocketContext';

import PendingJobCard from '../../components/bookings/PendingJobCard';

const BookingAlerts = () => {
  const navigate = useNavigate();
  const socket = useSocket();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState({ id: null, type: null });
  const [globalConfig, setGlobalConfig] = useState({ maxSearchTime: 5 });

  // Fetch pending alerts
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true);
        // Fetch stats to get global config (maxSearchTime)
        const statsRes = await workerDashboardService.getDashboardStats();
        let localConfig = { maxSearchTime: 5 };
        if (statsRes.success && statsRes.data?.config) {
          localConfig = statsRes.data.config;
          setGlobalConfig(localConfig);
        }

        const response = await getBookings();

        if (response.success && response.data) {
          let bookings = [];
          const workerData = JSON.parse(localStorage.getItem('workerData') || '{}');
          const currentWorkerId = String(workerData._id || workerData.id || '');

          bookings = response.data.filter(b => {
            const status = b.status?.toLowerCase();
            const isRelevantStatus = status === 'searching' || status === 'requested';
            const bWorkerId = b.vendorId?._id || b.vendorId;
            const isAssignedToMe = !bWorkerId || String(bWorkerId) === currentWorkerId;
            return isRelevantStatus && isAssignedToMe;
          });

          // Merge logic: Keep if in API OR if added recently (last 2 mins)
          const mergedPending = [];

          // Add active bookings from API, skipping expired ones
          bookings.forEach(b => {
            const bId = b._id || b.id;
            const expiresAt = b.expiresAt || (b.createdAt && localConfig ? new Date(new Date(b.createdAt).getTime() + (localConfig.maxSearchTime || 5) * 60000).toISOString() : null);
            const isExpired = expiresAt && new Date(expiresAt) <= new Date();
            if (!isExpired) {
              mergedPending.push({ ...b, id: bId, expiresAt });
            }
          });

          const apiIds = new Set(mergedPending.map(b => String(b.id)));
          const localPending = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');

          localPending.forEach(localB => {
            const id = String(localB.id || localB._id);
            if (!apiIds.has(id)) {
              const createdAt = localB.createdAt ? new Date(localB.createdAt).getTime() : Date.now();
              const expiresAt = localB.expiresAt || (localB.createdAt && localConfig ? new Date(createdAt + (localConfig.maxSearchTime || 5) * 60000).toISOString() : null);
              const isExpired = (expiresAt && new Date(expiresAt) <= new Date()) || (Date.now() - createdAt > 300000);

              if (!isExpired && (localB.status === 'requested' || localB.status === 'searching')) {
                mergedPending.push(localB);
              }
            }
          });

          localStorage.setItem('workerPendingJobs', JSON.stringify(mergedPending));

          // Map for PendingJobCard parity (now using already calculated/filtered results)
          const mappedAlerts = mergedPending.map(b => ({
            ...b,
            serviceName: b.serviceName || b.serviceId?.title || 'New Booking Request',
            serviceCategory: b.serviceCategory || b.serviceId?.categoryId?.title || 'General Service',
            customerName: b.userId?.name || 'Customer'
          }));

          setAlerts(mappedAlerts);
        }
      } catch (error) {
        console.error('Error fetching alerts:', error);
        toast.error('Failed to load alerts');
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();

    const handleUpdate = () => fetchAlerts();
    window.addEventListener('workerJobsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('workerJobsUpdated', handleUpdate);
    };
  }, []);

  // Socket listener for booking_taken (using shared socket from context)
  useEffect(() => {
    if (!socket) {
      console.log('[BookingAlerts] Socket not available yet');
      return;
    }

    console.log('[BookingAlerts] Setting up booking_taken listener on socket:', socket.id);

    const handleBookingTaken = (data) => {
      console.log('[BookingAlerts] booking_taken event received:', data);
      const takenBookingId = String(data.bookingId);

      // Remove from state immediately
      setAlerts(prev => prev.filter(a => {
        const alertId = String(a._id || a.id);
        return alertId !== takenBookingId;
      }));

      // Remove from localStorage
      const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => {
        const jobId = String(job.id || job._id);
        return jobId !== takenBookingId;
      });
      localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));

      // Show toast
      toast.error(data.message || 'This job was accepted by another worker.', { icon: '⚡' });

      // Trigger global update
      window.dispatchEvent(new Event('workerStatsUpdated'));
      window.dispatchEvent(new Event('workerJobsUpdated'));
    };

    socket.on('booking_taken', handleBookingTaken);

    return () => {
      socket.off('booking_taken', handleBookingTaken);
    };
  }, [socket]);

  // Listen for local remove events (like timer expiration)
  useEffect(() => {
    const handleRemove = (e) => {
      const idToRemove = String(e.detail?.id);
      if (!idToRemove) return;

      setAlerts(prev => prev.filter(a => String(a._id || a.id) !== idToRemove));

      // Also clean up localStorage
      const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => String(job.id || job._id) !== idToRemove);
      localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));
    };

    window.addEventListener('removeWorkerBooking', handleRemove);
    return () => window.removeEventListener('removeWorkerBooking', handleRemove);
  }, []);

  const handleAccept = async (e, booking) => {
    e?.stopPropagation();
    const bookingId = booking._id || booking.id;
    if (loadingAction.id) return;
    setLoadingAction({ id: bookingId, type: 'accept' });
    try {
      await acceptBooking(bookingId);
      toast.success('Booking accepted!');
      // Remove from list
      setAlerts(prev => prev.filter(a => (a._id || a.id) !== bookingId));

      // Remove from localStorage
      const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => (job.id || job._id) !== bookingId);
      localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));

      // Trigger global update
      window.dispatchEvent(new Event('workerStatsUpdated'));
      window.dispatchEvent(new Event('workerJobsUpdated'));
    } catch (error) {
      console.error('Accept error:', error);
      toast.error('Failed to accept booking');
    } finally {
      setLoadingAction({ id: null, type: null });
    }
  };

  const handleReject = async (e, booking) => {
    e?.stopPropagation();
    const bookingId = booking._id || booking.id;
    if (loadingAction.id) return;
    setLoadingAction({ id: bookingId, type: 'reject' });
    try {
      await rejectBooking(bookingId);
      toast.success('Booking rejected');
      setAlerts(prev => prev.filter(a => (a._id || a.id) !== bookingId));

      // Remove from localStorage
      const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => (job.id || job._id) !== bookingId);
      localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));

      window.dispatchEvent(new Event('workerStatsUpdated'));
      window.dispatchEvent(new Event('workerJobsUpdated'));
    } catch (error) {
      console.error('Reject error:', error);
      toast.error('Failed to reject booking');
    } finally {
      setLoadingAction({ id: null, type: null });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Header title="Pending Alerts" showBack={true} />

      <main className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="py-20 text-center">
            <LogoLoader fullScreen={false} />
            <p className="mt-4 text-gray-500 font-medium">Loading alerts...</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center pt-20 px-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiCheckCircle className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">No Pending Alerts</h3>
            <p className="text-gray-500">You're all caught up! No new booking requests at the moment.</p>
            <button
              onClick={() => navigate('/worker/dashboard')}
              className="mt-6 text-primary font-semibold hover:underline"
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          alerts.map(alert => (
            <PendingJobCard
              key={alert._id || alert.id}
              booking={alert}
              onAccept={handleAccept}
              onReject={handleReject}
              onClick={() => navigate('/worker/dashboard', { state: { openBookingId: alert._id || alert.id } })}
              loadingAction={loadingAction.id === (alert._id || alert.id) ? loadingAction.type : null}
              showTimer={true}
              maxSearchTimeMins={globalConfig.maxSearchTime}
            />
          ))
        )}
      </main>
    </div>
  );
};

export default BookingAlerts;
