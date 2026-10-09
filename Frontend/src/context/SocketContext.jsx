import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { playNotificationSound, isSoundEnabled, playAlertRing } from '../utils/notificationSound';
import { registerFCMToken } from '../services/pushNotificationService';

const SwipeableNotification = ({ t, data, onClick }) => {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-200, 0, 200], [0, 1, 0]);

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      style={{ x, opacity }}
      onDragEnd={(e, { offset, velocity }) => {
        const swipe = Math.abs(offset.x) * velocity.x;
        if (Math.abs(offset.x) > 80) { // Threshold
          toast.dismiss(t.id);
        }
      }}
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{
        opacity: t.visible ? 1 : 0,
        y: t.visible ? 0 : -20,
        scale: t.visible ? 1 : 0.95
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      whileTap={{ scale: 0.98 }}
      className="max-w-md w-full bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-gray-900/5 cursor-pointer dark:bg-gray-800 dark:ring-gray-700"
      onClick={onClick}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
              <span className="text-lg">🔔</span>
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {data.title}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {data.message}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200 dark:border-gray-700">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t.id);
          }}
          className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-gray-500 focus:outline-none"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
};

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Determine user type based on path
  const getUserType = (path) => {
    if (path.startsWith('/worker')) return 'worker';
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/user')) return 'user';
    return null;
  };

  const userType = getUserType(location.pathname);

  useEffect(() => {
    if (!userType) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    let tokenKey = 'accessToken';
    switch (userType) {
      case 'worker':
        tokenKey = 'workerAccessToken';
        break;
      case 'admin':
        tokenKey = 'adminAccessToken';
        break;
      case 'user':
      default:
        tokenKey = 'accessToken';
        break;
    }

    const token = localStorage.getItem(tokenKey);
    // If no token, we don't connect
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Reuse existing socket if userType hasn't changed (effectively) is handled by React deps
    // But basic useEffect will re-run if dependencies change.
    // userType changes -> re-run.

    // Disconnect previous if any
    if (socket) {
      // Optimization: if we are already connected with same token/auth, maybe don't reconnect?
      // But determining that is hard. Simpler to reconnect.
      socket.disconnect();
    }

    // Use HTTP URL for socket.io client - it handles WS upgrade automatically
    const socketBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

    const newSocket = io(socketBaseUrl, {
      auth: {
        token: token
      },
      transports: ['polling', 'websocket'], // Try polling first for reliability
      path: '/socket.io/',
      secure: true,
      rejectUnauthorized: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      // console.log(`✅ ${userType.toUpperCase()} App Socket connected`);

      // Register FCM token for push notifications (on page load/refresh)
      if (userType && token) {
        // console.log(`[SocketContext] Registering FCM token for ${userType}...`);
        registerFCMToken(userType, true).then((fcmToken) => {
          if (fcmToken) {
            // console.log(`[SocketContext] ✅ FCM token registered for ${userType}`);
          } else {
            // console.log(`[SocketContext] ⚠️ FCM token registration returned null for ${userType}`);
          }
        }).catch((err) => {
          // console.error(`[SocketContext] ❌ FCM token registration failed for ${userType}:`, err);
        });
      }

      // If worker, join worker-specific room just in case backend expects it
      if (userType === 'worker') {
        const workerData = JSON.parse(localStorage.getItem('workerData') || '{}');
        const vendorId = workerData.id || workerData._id;
        if (vendorId) {
          newSocket.emit('join_vendor_room', vendorId);
        }
      }
    });

    newSocket.on('disconnect', () => {
      // console.log(`❌ ${userType.toUpperCase()} App Socket disconnected`);
    });

    newSocket.on('connect_error', (err) => {
      // Silently handle typical connection errors to avoid spam, or log only critical ones
      // console.error(`Socket connection error (${userType}):`, err);
    });

    // Listen for generic notifications
    newSocket.on('notification', (data) => {
      // console.log('🔔 App Notification received:', data);

      if (isSoundEnabled(userType)) {
        playNotificationSound();
      }

      // Show custom toast for all notifications
      toast.custom((t) => (
        <SwipeableNotification
          t={t}
          data={data}
          onClick={() => {
            toast.dismiss(t.id);
            // Optional: navigate based on relatedId
            if (data.relatedId) {
              if (userType === 'worker') navigate(`/worker/booking/${data.relatedId}`);
              else navigate(`/user/booking/${data.relatedId}`);
            }
          }}
        />
      ), {
        id: 'socket-notification', // Prevent stacking
        duration: 3500, // Slightly longer to allow interaction/reading since it's dismissible
        position: 'top-right'
      });

      // Dispatch update events to refresh UI components
      if (userType === 'worker') {
        window.dispatchEvent(new Event('workerJobsUpdated'));
        window.dispatchEvent(new Event('workerNotificationsUpdated'));
        window.dispatchEvent(new Event('workerStatsUpdated'));
      }
      if (userType === 'user') {
        window.dispatchEvent(new Event('userBookingsUpdated'));
      }
    });

    // Listen for real-time booking updates
    newSocket.on('booking_updated', (data) => {
      // console.log('Booking Updated:', data);
      if (userType === 'user') window.dispatchEvent(new Event('userBookingsUpdated'));
      if (userType === 'worker') window.dispatchEvent(new Event('workerJobsUpdated'));
    });

    // Listen for special Worker Booking Requests
    if (userType === 'worker') {
      newSocket.on('new_booking_request', (data) => {
        // console.log('🚨 New Booking Request Alert:', data);

        // Play urgent alert ring
        playAlertRing();

        // Save to localStorage for the Alert screen and Dashboard to read
        // Note: Even though we are moving to backend, keeping this for immediate UI responsiveness before potential refresh lag
        const newJob = {
          id: data.bookingId,
          serviceType: data.serviceName,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          location: {
            address: data.address?.addressLine1 || 'Location shared',
            distance: data.distance ? `${data.distance.toFixed(1)} km` : 'Near you'
          },
          price: data.price,
          vendorEarnings: data.vendorEarnings,
          serviceCategory: data.serviceCategory,
          brandName: data.brandName,
          brandIcon: data.brandIcon,
          categoryIcon: data.categoryIcon,
          scheduledDate: data.scheduledDate,
          scheduledTime: data.scheduledTime,
          timeSlot: {
            date: new Date(data.scheduledDate).toLocaleDateString(),
            time: data.scheduledTime
          },
          status: 'requested',
          createdAt: data.createdAt || new Date().toISOString(),
          expiresAt: data.expiresAt
        };

        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        if (!pendingJobs.find(job => job.id === newJob.id)) {
          pendingJobs.unshift(newJob);
          localStorage.setItem('workerPendingJobs', JSON.stringify(pendingJobs));

          // Update stats
          const stats = JSON.parse(localStorage.getItem('workerStats') || '{}');
          stats.pendingAlerts = (stats.pendingAlerts || 0) + 1;
          localStorage.setItem('workerStats', JSON.stringify(stats));
        }

        // Notify app components to refresh
        window.dispatchEvent(new Event('workerJobsUpdated'));
        window.dispatchEvent(new Event('workerStatsUpdated'));
        window.dispatchEvent(new Event('workerNotificationsUpdated'));

        // Always show the global alert instead of navigating
        const event = new CustomEvent('showDashboardBookingAlert', { detail: newJob });
        window.dispatchEvent(event);
      });

      // Listen for booking_taken - when another worker accepts a job
      newSocket.on('booking_taken', (data) => {
        // console.log('⚡ Booking taken by another worker:', data);
        const takenBookingId = String(data.bookingId);

        // Remove from localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        const updatedPending = pendingJobs.filter(job => {
          const jobId = String(job.id || job._id);
          return jobId !== takenBookingId;
        });
        localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));

        // Update stats
        const stats = JSON.parse(localStorage.getItem('workerStats') || '{}');
        if (stats.pendingAlerts > 0) {
          stats.pendingAlerts = Math.max(0, (stats.pendingAlerts || 0) - 1);
          localStorage.setItem('workerStats', JSON.stringify(stats));
        }

        // Show toast notification
        toast.error(data.message || 'Job taken by another worker', { icon: '⚡' });

        // Dispatch specific remove event for instant UI update
        window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: takenBookingId } }));

        // Notify app components to refresh
        window.dispatchEvent(new Event('workerJobsUpdated'));
        window.dispatchEvent(new Event('workerStatsUpdated'));
      });

      // Listen for removeWorkerBooking - generic removal (timeout, cancellation, etc.)
      newSocket.on('removeWorkerBooking', (data) => {
        const bookingId = String(data.bookingId || data.id);

        // Remove from localStorage
        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        const updatedPending = pendingJobs.filter(job => String(job.id || job._id) !== bookingId);
        localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));

        // Update stats
        const stats = JSON.parse(localStorage.getItem('workerStats') || '{}');
        if (stats.pendingAlerts > 0) {
          stats.pendingAlerts = Math.max(0, (stats.pendingAlerts || 0) - 1);
          localStorage.setItem('workerStats', JSON.stringify(stats));
        }

        // Dispatch specific remove event for instant UI update
        window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: bookingId } }));
        window.dispatchEvent(new Event('workerJobsUpdated'));
        window.dispatchEvent(new Event('workerStatsUpdated'));
      });
    }

    return () => {
      newSocket.disconnect();
    };
  }, [userType]); // Only re-run if userType changes. Navigate is stable.

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
