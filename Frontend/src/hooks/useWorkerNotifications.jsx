import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { playNotificationSound, isSoundEnabled } from '../utils/notificationSound';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';

/**
 * Custom hook for worker real-time notifications
 * Connects to Socket.IO and listens for booking requests
 */
export const useWorkerNotifications = (vendorId, onNewBooking) => {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!vendorId) return;

    // Initialize Socket.IO connection
    const socket = io(SOCKET_URL, {
      auth: {
        token: localStorage.getItem('workerAccessToken'),
        vendorId: vendorId
      },
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      // Join worker-specific room
      socket.emit('join_vendor_room', vendorId);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
    });

    // Listen for new booking requests
    socket.on('new_booking_request', (data) => {
      console.log('🔔 New booking request received:', data);

      // Play notification sound
      if (data.playSound && isSoundEnabled()) {
        playNotificationSound().catch(err => console.warn('Sound play failed:', err));
      }

      // Show toast notification
      toast.success(
        <div>
          <strong>New Booking Request!</strong>
          <p className="text-sm mt-1">{data.serviceName}</p>
          <p className="text-xs text-gray-600">
            {data.customerName} • {data.distance?.toFixed(1)}km away
          </p>
        </div>,
        {
          duration: 8000,
          icon: '🔔',
          style: {
            background: '#10b981',
            color: '#fff',
          }
        }
      );

      // Callback to parent component
      if (onNewBooking) {
        onNewBooking(data);
      }
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [vendorId, onNewBooking]);

  return socketRef.current;
};

export default useWorkerNotifications;
