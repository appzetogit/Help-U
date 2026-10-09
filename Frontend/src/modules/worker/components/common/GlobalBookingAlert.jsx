import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { BookingAlertModal } from '../bookings';
import { acceptBooking, rejectBooking, getBookings } from '../../services/bookingService';
import { playAlertRing, stopAlertRing } from '../../../../utils/notificationSound';

export default function GlobalBookingAlert() {
  const [activeAlertBookings, setActiveAlertBookings] = useState([]);
  const ignoredBookingIds = useRef(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  const [maxSearchTime, setMaxSearchTime] = useState(1);

  useEffect(() => {
    // 1. Logic to sync with localStorage and optionally Server
    const syncAlerts = async (forceServerSync = false) => {
      try {
        const now = Date.now();
        let pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');

        // Every few heartbeats or if forced, sync with Server API for missed sockets
        const token = localStorage.getItem('workerAccessToken') || sessionStorage.getItem('workerAccessToken');
        if (token && (forceServerSync || (Math.random() > 0.8))) {
          try {
            const response = await getBookings();
            if (response.success && response.data) {
              const workerData = JSON.parse(localStorage.getItem('workerData') || '{}');
              const vId = String(workerData._id || workerData.id);
              
              const serverJobs = response.data
                .filter(b => {
                  const status = b.status?.toLowerCase();
                  const isRelevant = status === 'searching' || status === 'requested';
                  const isMine = !b.vendorId || String(b.vendorId?._id || b.vendorId) === vId;
                  return isRelevant && isMine;
                })
                .map(b => ({
                  ...b,
                  id: b._id || b.id,
                  serviceType: b.serviceName || b.serviceId?.title,
                  customerName: b.userId?.name || 'Customer'
                }));

              const existingIds = new Set(pendingJobs.map(j => String(j.id || j._id)));
              let updated = false;
              serverJobs.forEach(sj => {
                if (!existingIds.has(String(sj.id))) {
                  pendingJobs.unshift(sj);
                  updated = true;
                }
              });
              if (updated) localStorage.setItem('workerPendingJobs', JSON.stringify(pendingJobs));
            }
          } catch (e) { console.error("Server sync error:", e); }
        }

        const validJobs = pendingJobs.filter(job => {
          if (!job.expiresAt) return true;
          return new Date(job.expiresAt).getTime() > now;
        });

        if (validJobs.length > 0) {
          setActiveAlertBookings(prev => {
            const currentIds = new Set(prev.map(b => String(b.id || b._id)));
            const newJobsToAdd = validJobs.filter(v => !currentIds.has(String(v.id || v._id)));
            if (newJobsToAdd.length === 0) return prev;
            return [...newJobsToAdd, ...prev];
          });
        }
      } catch (err) {
        console.error('[GlobalAlert] Sync error:', err);
      }
    };

    // 2. Foreground Sync: Sync immediately when worker resumes app
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAlerts(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Fetch global config for accurate timer
    const fetchConfig = async () => {
      const token = localStorage.getItem('workerAccessToken') || sessionStorage.getItem('workerAccessToken');
      if (!token) return;

      try {
        const { workerDashboardService } = await import('../../services/dashboardService');
        const response = await workerDashboardService.getDashboardStats();
        if (response.success && response.data.config) {
          setMaxSearchTime(response.data.config.maxSearchTime || 1);
        }
      } catch (error) {
        console.error('Failed to fetch config for GlobalAlert:', error);
      }
    };

    syncAlerts(true);
    fetchConfig();

    // 3. Heartbeat: Periodic sync
    const heartbeat = setInterval(() => syncAlerts(false), 5000);

    // Listen for custom dashboard events from SocketContext
    const handleShowAlert = (e) => {
      if (e.detail) {
        setActiveAlertBookings(prev => {
          const bId = String(e.detail.id || e.detail._id);
          if (prev.find(b => String(b.id || b._id) === bId)) return prev;
          return [e.detail, ...prev];
        });
      }
    };

    const handleRemoveBooking = (e) => {
      if (e.detail?.id) {
        const idToRemove = String(e.detail.id);
        ignoredBookingIds.current.add(idToRemove);
        setActiveAlertBookings(prev => prev.filter(b => String(b.id || b._id) !== idToRemove));
      }
    };

    window.addEventListener('showDashboardBookingAlert', handleShowAlert);
    window.addEventListener('removeWorkerBooking', handleRemoveBooking);

    return () => {
      window.removeEventListener('showDashboardBookingAlert', handleShowAlert);
      window.removeEventListener('removeWorkerBooking', handleRemoveBooking);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(heartbeat);
    };
  }, []);

  // Effect to manage sound based on pending bookings
  useEffect(() => {
    if (activeAlertBookings.length > 0) {
      playAlertRing(true); // Always loop for worker until actioned
    } else {
      stopAlertRing();
    }
    return () => stopAlertRing();
  }, [activeAlertBookings.length]);

  if (activeAlertBookings.length === 0) return null;

  return (
    <BookingAlertModal
      isOpen={activeAlertBookings.length > 0}
      bookings={activeAlertBookings}
      maxSearchTimeMins={maxSearchTime}
      onAccept={async (id) => {
        try {
          await acceptBooking(id);

          // Remove from local storage
          const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
          const updated = pendingJobs.filter(b => String(b.id || b._id) !== String(id));
          localStorage.setItem('workerPendingJobs', JSON.stringify(updated));

          // Dispatch remove event
          window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id } }));
          setActiveAlertBookings(prev => prev.filter(b => String(b.id || b._id) !== String(id)));

          window.dispatchEvent(new Event('workerJobsUpdated'));
          window.dispatchEvent(new Event('workerStatsUpdated'));
          toast.success('Job claimed successfully! Assigned to you.');
        } catch (e) {
          toast.error('Failed to claim job');
        }
      }}
      onReject={async (id) => {
        try {
          // Reject is often silent or via reject api
          await rejectBooking(id);
        } catch (error) {
          console.error("Failed to reject job via API, removing locally");
        } finally {
          const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
          const updated = pendingJobs.filter(b => String(b.id || b._id) !== String(id));
          localStorage.setItem('workerPendingJobs', JSON.stringify(updated));

          window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id } }));
          setActiveAlertBookings(prev => prev.filter(b => String(b.id || b._id) !== String(id)));

          toast.success('Booking application rejected');
          window.dispatchEvent(new Event('workerJobsUpdated'));
        }
      }}
      onMinimize={() => {
        setActiveAlertBookings([]); // simply minimizes current visible ones. We can fetch them later from pending.
      }}
    />
  );
}
