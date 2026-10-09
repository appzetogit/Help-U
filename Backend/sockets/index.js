// Socket.io initialization
const { Server } = require('socket.io');
const { authenticateSocket } = require('../middleware/authMiddleware');

let io = null;

const initializeSocket = (server) => {
  io = new Server(server, {
    pingTimeout: 60000,
    pingInterval: 25000,
    cors: {
      origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'].filter(Boolean),
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket']
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify token using the same method as HTTP middleware
      const { verifyAccessToken } = require('../utils/tokenService');
      const decoded = verifyAccessToken(token);

      socket.userId = decoded.userId;
      socket.userRole = decoded.role;

      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userId}, Role: ${socket.userRole})`);

    // Join user-specific room for notifications
    if (socket.userRole === 'USER') {
      socket.join(`user_${socket.userId.toString()}`);
    } else if (socket.userRole === 'WORKER') {
      socket.join(`vendor_${socket.userId.toString()}`);
      // Update worker online status
      updateWorkerOnlineStatus(socket.userId, true, socket.id);
    } else if (socket.userRole === 'ADMIN') {
      socket.join(`admin_${socket.userId.toString()}`);
    }

    // Explicit Room Join Events (Fallback/Frontend Initiated)
    socket.on('join_vendor_room', (vendorId) => {
      // Security check: ensure the socket user actually IS this worker
      if (socket.userRole === 'WORKER' && socket.userId.toString() === vendorId.toString()) {
        socket.join(`vendor_${vendorId.toString()}`);
        console.log(`Socket ${socket.id} explicitly joined room vendor_${vendorId}`);
      }
    });

    socket.on('join_user_room', (userId) => {
      // Ensure strings for comparison
      if (socket.userRole === 'USER' && socket.userId.toString() === userId.toString()) {
        socket.join(`user_${userId.toString()}`);
        console.log(`Socket ${socket.id} explicitly joined room user_${userId}`);
      }
    });

    // Live Tracking Events
    socket.on('join_tracking', async (bookingId) => {
      socket.join(`booking_${bookingId}`);
      console.log(`User ${socket.userId} joined tracking for booking_${bookingId}`);

      // Disconnect Recovery: Send last known location from Redis
      try {
        const { getLiveLocation } = require('../services/redisService');
        const cachedLocation = await getLiveLocation(bookingId);
        if (cachedLocation) {
          socket.emit('live_location_update', cachedLocation);
          console.log(`[Socket] Sent cached location to user for booking ${bookingId}`);
        }
      } catch (error) {
        console.error('[Socket] Error fetching cached location:', error);
      }
    });

    // Worker acknowledges receiving booking alert
    socket.on('booking_alert_received', async (data) => {
      try {
        const BookingRequest = require('../models/BookingRequest');
        await BookingRequest.findOneAndUpdate(
          { bookingId: data.bookingId, vendorId: socket.userId },
          { status: 'VIEWED', viewedAt: new Date(), socketDelivered: true }
        );
        console.log(`[Socket] Worker ${socket.userId} viewed booking ${data.bookingId}`);
      } catch (error) {
        console.error('[Socket] Error updating booking request:', error);
      }
    });

    // Worker sets availability
    socket.on('set_availability', async (data) => {
      try {
        const Worker = require('../models/Worker');

        if (socket.userRole === 'WORKER') {
          await Worker.findByIdAndUpdate(socket.userId, {
            availability: data.status // 'AVAILABLE', 'BUSY', etc.
          });
        }
        console.log(`[Socket] ${socket.userRole} ${socket.userId} set availability to ${data.status}`);
      } catch (error) {
        console.error('[Socket] Error setting availability:', error);
      }
    });

    // Rate limiting map for location updates
    const locationUpdateTimestamps = new Map();

    socket.on('update_location', async (data) => {
      // data: { bookingId, lat, lng, heading }
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      const heading = parseFloat(data.heading) || 0;

      if (isNaN(lat) || isNaN(lng)) return;

      // Rate limiting: max 1 update per 2 seconds per booking
      const rateLimitKey = `${socket.userId}:${data.bookingId}`;
      const lastUpdate = locationUpdateTimestamps.get(rateLimitKey) || 0;
      const now = Date.now();
      if (now - lastUpdate < 2000) {
        return; // Skip this update, too frequent
      }
      locationUpdateTimestamps.set(rateLimitKey, now);

      const locationPayload = {
        lat,
        lng,
        heading,
        role: socket.userRole
      };

      // DEBUG: Log the broadcast
      console.log(`[Socket] 📍 Broadcasting location to booking_${data.bookingId}:`, { lat: lat.toFixed(6), lng: lng.toFixed(6), heading });

      // 1. Broadcast to everyone in the booking room (User is listening)
      socket.to(`booking_${data.bookingId}`).emit('live_location_update', locationPayload);

      // 2. Cache in Redis with TTL for disconnect recovery
      try {
        const { setLiveLocation, setWorkerLocation } = require('../services/redisService');
        await setLiveLocation(data.bookingId, locationPayload, 30); // 30 second TTL

        // Also update worker geo cache
        if (socket.userRole === 'WORKER') {
          await setWorkerLocation(socket.userId, lat, lng);
        }
      } catch (error) {
        console.error('[Socket] Error caching live location:', error);
      }

      // 3. Save latest location to Database (for initial tracking load)
      try {
        const Worker = require('../models/Worker');

        const updateData = {
          location: {
            lat,
            lng,
            heading,
            updatedAt: new Date()
          },
          geoLocation: {
            type: 'Point',
            coordinates: [lng, lat]
          }
        };

        if (socket.userRole === 'WORKER') {
          await Worker.findByIdAndUpdate(socket.userId, updateData);
        }
      } catch (error) {
        console.error('Error saving live location:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Update online status
      if (socket.userRole === 'WORKER') {
        updateWorkerOnlineStatus(socket.userId, false, null);
      }
    });
  });

  console.log('Socket.io initialized successfully');
};

// Helper function to update worker online status
const updateWorkerOnlineStatus = async (vendorId, isOnline, socketId) => {
  try {
    const Worker = require('../models/Worker');
    const { setWorkerOnline, setWorkerAvailability } = require('../services/redisService');

    const updateData = {
      isOnline,
      currentSocketId: socketId
    };

    if (isOnline) {
      updateData.availability = 'AVAILABLE';
    } else {
      updateData.lastSeenAt = new Date();
      updateData.availability = 'OFFLINE';
    }

    // Update MongoDB
    await Worker.findByIdAndUpdate(vendorId, updateData);

    // Update Redis cache (fast lookup)
    await setWorkerOnline(vendorId, isOnline);
    await setWorkerAvailability(vendorId, updateData.availability);

    console.log(`[Socket] Worker ${vendorId} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  } catch (error) {
    console.error('[Socket] Error updating worker online status:', error);
  }
};

// Get io instance for emitting notifications
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = { initializeSocket, getIO };

