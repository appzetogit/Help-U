import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { playNotificationSound, isSoundEnabled, playAlertRing } from '../utils/notificationSound';
import { registerFCMToken } from '../services/pushNotificationService';
import { setBookingConfigCache } from '../hooks/useBookingConfig';
import { FiMessageCircle } from 'react-icons/fi';

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

// Per-tab guard so a socket reconnect storm does not fire the FCM save flow
// (service-worker register → permission → getToken → POST backend) over and
// over. Keyed by userType so switching accounts in the same tab still
// re-registers once for the new role.
const fcmRegisteredThisSession = new Set();

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
      // WebSocket first avoids the polling preflight storm on dev (each poll
      // is a cross-origin XHR). Polling stays as a fallback for networks that
      // block WS.
      transports: ['websocket', 'polling'],
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

      // Register FCM token for push notifications ONCE per session per
      // userType. forceUpdate: false so the localStorage short-circuit in
      // registerFCMToken takes effect and we skip the full save flow on
      // every socket reconnect. The in-memory Set is a second guard that
      // also skips the work when localStorage is cleared mid-session.
      if (userType && token && !fcmRegisteredThisSession.has(userType)) {
        fcmRegisteredThisSession.add(userType);
        registerFCMToken(userType, false).then((fcmToken) => {
          if (!fcmToken) {
            // Permission denied or no token: allow a retry later in this
            // session (e.g. after the user grants permission).
            fcmRegisteredThisSession.delete(userType);
          }
        }).catch(() => {
          fcmRegisteredThisSession.delete(userType);
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

      // Dedicated chat_message socket event handles chat alerts with higher fidelity
      if (data?.type === 'chat_message') {
        return;
      }

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
            const notifType = (data?.type || '').toLowerCase();
            const relType = (data?.relatedType || data?.data?.relatedType || '').toLowerCase();
            const bookingId = data?.relatedId || data?.bookingId || data?.data?.bookingId || data?.data?.relatedId || data?.data?._id || data?.data?.booking?._id;
            const disputeId = data?.relatedId || data?.data?.disputeId || data?.data?.relatedId;
            const chatSuffix = notifType === 'chat_message' ? '?chat=1' : '';

            // 1. Worker new booking alert
            if (userType === 'worker' && notifType === 'booking_request') {
              navigate(bookingId ? `/worker/booking/${bookingId}` : '/worker/booking-alerts');
              return;
            }

            // 2. Dispute notifications
            if (relType === 'dispute' || notifType.startsWith('dispute_')) {
              if (userType !== 'admin') {
                navigate(`/${userType}/disputes${disputeId ? `/${disputeId}` : ''}`);
              }
              return;
            }

            // 3. Recurring bookings
            if (relType === 'recurring' || notifType.startsWith('recurring_')) {
              if (userType === 'user') navigate('/user/recurring-bookings');
              return;
            }

            // 4. Scrap notifications
            if (relType === 'scrap' || notifType.startsWith('scrap_')) {
              if (userType === 'worker') navigate('/worker/scrap-pickups');
              else if (userType === 'user') navigate('/user/scrap');
              return;
            }

            // 5. Payment & Wallet notifications
            if (
              relType === 'payment' ||
              relType === 'wallet' ||
              ['payment_', 'wallet_', 'payout_', 'refund_', 'vendor_settlement', 'vendor_cash_limit', 'vendor_withdrawal'].some(p => notifType.includes(p))
            ) {
              if (userType === 'worker') {
                navigate(notifType.includes('settlement') ? '/worker/wallet/settlements' : '/worker/wallet');
              } else if (userType === 'user') {
                navigate('/user/wallet');
              }
              return;
            }

            // 6. Ratings & Reviews
            if (notifType === 'review_submitted' || notifType.includes('rating')) {
              if (userType === 'worker') navigate('/worker/my-ratings');
              else if (userType === 'user') navigate('/user/my-rating');
              return;
            }

            // 7. Booking / Job details
            if (bookingId) {
              if (userType === 'worker') navigate(`/worker/booking/${bookingId}${chatSuffix}`);
              else if (userType === 'user') navigate(`/user/booking/${bookingId}${chatSuffix}`);
              return;
            }

            // 8. Fallback to notification center for each portal
            if (userType === 'worker') navigate('/worker/notifications');
            else if (userType === 'user') navigate('/user/notifications');
            else if (userType === 'admin') navigate('/admin/notifications');
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

    // Booking chat: forwarded as window events so any open chat or unread
    // badge can react without holding its own socket listener.
    newSocket.on('chat_message', (data) => {
      window.dispatchEvent(new CustomEvent('bookingChatMessage', { detail: data }));

      // If the chat modal is already open for this booking, do not show a notification toast
      const isChatActive = window.__activeChatBookingId && String(window.__activeChatBookingId) === String(data?.bookingId);
      if (isChatActive) return;

      // Only notify if message was sent by the other party (not ourselves)
      const senderType = data?.message?.senderType;
      const isFromOther = (userType === 'user' && senderType === 'worker') || (userType === 'worker' && senderType === 'user');
      if (!isFromOther) return;

      if (isSoundEnabled(userType)) {
        playNotificationSound();
      }

      const senderLabel = userType === 'user' ? 'Service Partner' : 'Customer';
      const previewText = data?.message?.message || (data?.message?.attachments?.length ? '📷 Sent a photo' : 'New message');
      const bookingId = data?.bookingId;

      toast.custom((t) => (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: t.visible ? 1 : 0, y: t.visible ? 0 : -20, scale: t.visible ? 1 : 0.95 }}
          className="max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex items-center p-3.5 border border-blue-100 ring-1 ring-black/5 cursor-pointer dark:bg-gray-800 dark:border-gray-700"
          onClick={() => {
            toast.dismiss(t.id);
            const targetPath = location.pathname.includes(`/booking/${bookingId}/track`)
              ? `/user/booking/${bookingId}/track?chat=1`
              : (userType === 'worker' ? `/worker/booking/${bookingId}?chat=1` : `/user/booking/${bookingId}?chat=1`);
            navigate(targetPath);
          }}
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
            <FiMessageCircle className="w-5 h-5" />
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Message from {senderLabel}
              </p>
              <span className="text-[10px] text-gray-400">Just now</span>
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate mt-0.5">
              {previewText}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toast.dismiss(t.id);
              const targetPath = location.pathname.includes(`/booking/${bookingId}/track`)
                ? `/user/booking/${bookingId}/track?chat=1`
                : (userType === 'worker' ? `/worker/booking/${bookingId}?chat=1` : `/user/booking/${bookingId}?chat=1`);
              navigate(targetPath);
            }}
            className="ml-3 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 rounded-xl text-xs font-bold shrink-0 active:scale-95 transition-transform"
          >
            Reply
          </button>
        </motion.div>
      ), {
        id: `chat-toast-${bookingId}`,
        duration: 4000,
        position: 'top-right'
      });
    });
    newSocket.on('chat_read', (data) => {
      window.dispatchEvent(new CustomEvent('bookingChatRead', { detail: data }));
    });

    // Admin changed the booking configuration (features, limits, prices).
    newSocket.on('booking_config_updated', (config) => {
      setBookingConfigCache(config);
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
          issuePhotos: data.issuePhotos || [],
          issueVideos: data.issueVideos || [],
          customerNotes: data.customerNotes || null,
          bookedDetails: data.bookedDetails || [],
          addOns: data.addOns || [],
          isEmergency: !!data.isEmergency,
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
