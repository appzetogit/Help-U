// Server Entry Point
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const rateLimiter = require('./middleware/rateLimiter');
const maintenanceMode = require('./middleware/maintenanceMiddleware');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Connect to database
connectDB();

// Initialize Redis (if enabled)
const { initRedis } = require('./services/redisService');
initRedis();

// Initialize Express app
const app = express();

// Trust proxy (required when behind reverse proxy like Nginx/Cloudflare for rate limiter and client IP detection)
app.set('trust proxy', 1);

// Security middleware - allow cross-origin resource loading (images) for user app
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://www.help-u.in',
  'https://help-u.in',
  'https://api.help-u.in',
  // Legacy domain, kept until the homster.in -> help-u.in migration is complete
  'https://www.homster.in',
  'https://homster.in',
  'https://api.homster.in'
];

if (process.env.FRONTEND_URL) {
  // Support comma-separated URLs in .env
  const envOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
  envOrigins.forEach(origin => {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  });
}

// Normalise so a trailing slash or different casing can never cause a false block
const normaliseOrigin = (origin) => origin.trim().toLowerCase().replace(/\/+$/, '');
const allowedOriginSet = new Set(allowedOrigins.map(normaliseOrigin));

// Logged once at boot so a stale deploy is obvious from the logs alone
console.log(`[CORS] Allowed origins: ${[...allowedOriginSet].join(', ')}`);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const candidate = normaliseOrigin(origin);
    const isAllowed = allowedOriginSet.has(candidate);

    // Vercel preview deployments only (full-origin match, not a substring match)
    const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(candidate);

    if (isAllowed || isVercelPreview) {
      callback(null, true);
    } else {
      console.error(`BLOCKED CORS ORIGIN: "${origin}" | Allowed list: ${[...allowedOriginSet].join(', ')}`);
      // Flagged, not thrown: the error handler turns this into a 403 rather than a 500
      const corsError = new Error(`Not allowed by CORS: ${origin}`);
      corsError.status = 403;
      corsError.isCorsError = true;
      callback(corsError);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

//For camera clicks feature 
// app.use(express.json({ limit: "20mb" })); // REMOVED redundant
// app.use(express.urlencoded({ extended: true, limit: "20mb" })); // REMOVED redundant

// DEBUG: Log Booking Request Body
app.use('/api/users/bookings', (req, res, next) => {
  if (req.method === 'POST') {
    console.log('DEBUG: POST /api/users/bookings BODY:', JSON.stringify(req.body, null, 2));
  }
  next();
});
// (Old Worker Register Logger Removed)



// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev', {
    skip: function (req, res) { return res.statusCode === 304 }
  }));
}

// Rate limiting
app.use('/api', rateLimiter);

// Maintenance mode: returns 503 for app traffic while the flag is on.
// Mounted after rate limiting so admin routes and /api/public/config stay open.
app.use('/api', maintenanceMode);

// Health check route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Help U API is running',
    timestamp: new Date().toISOString()
  });
});

// Quick Redis Test Route
app.get('/api/test/redis', async (req, res) => {
  try {
    const { getRedis, isRedisConnected } = require('./services/redisService');
    const redis = getRedis();

    if (!isRedisConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Redis is not connected or disabled',
        redisEnabled: process.env.REDIS_ENABLED === 'true',
        status: redis ? redis.status : 'no_instance'
      });
    }

    const testKey = `test:time:${Date.now()}`;
    const testValue = 'Hello from Redis!';

    // Test Set
    await redis.set(testKey, testValue, 'EX', 60);

    // Test Get
    const retrievedValue = await redis.get(testKey);

    // Test Delete
    const deleted = await redis.del(testKey);

    res.json({
      success: true,
      message: 'Redis is working correctly',
      testResults: {
        set: 'Retrieved value: ' + retrievedValue,
        match: retrievedValue === testValue,
        delete: deleted === 1 ? 'Success' : 'Failed'
      },
      connectionInfo: {
        status: redis.status,
        host: redis.options.host
      }
    });
  } catch (error) {
    console.error('[Redis Test Route] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Redis test failed',
      error: error.message
    });
  }
});

// Root / Health Route
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Help-U Backend API is running live 🚀',
    timestamp: new Date().toISOString()
  });
});

// API Routes

app.use('/api/public/cities', require('./routes/public-routes/city.routes.js'));


// User routes
app.use('/api/users/auth', require('./routes/user-routes/auth.routes'));
app.use('/api/users', require('./routes/user-routes/profile.routes'));
app.use('/api/user/wallet', require('./routes/user-routes/userWallet.routes'));
app.use('/api/users/bookings', require('./routes/user-routes/booking.routes'));
app.use('/api/users', require('./routes/user-routes/cart.routes'));
app.use('/api/users/fcm-tokens', require('./routes/user-routes/fcmToken.routes'));

// Scrap routes
const scrapRoutes = require('./routes/scrap.routes');
app.use('/api/scrap', scrapRoutes);

// Worker routes
app.use('/api/workers/auth', require('./routes/worker-routes/auth.routes'));
app.use('/api/workers', require('./routes/worker-routes/profile.routes'));
app.use('/api/workers', require('./routes/worker-routes/settings.routes'));
app.use('/api/workers', require('./routes/worker-routes/wallet.routes'));
app.use('/api/workers', require('./routes/worker-routes/dashboard.routes'));
app.use('/api/workers', require('./routes/worker-routes/service.routes'));
app.use('/api/workers/bookings', require('./routes/worker-routes/booking.routes'));
app.use('/api/workers/fcm-tokens', require('./routes/worker-routes/fcmToken.routes'));
app.use('/api/workers', require('./routes/worker-routes/workerBill.routes'));
app.use('/api/workers/catalog', require('./routes/worker-routes/catalog.routes'));
app.use('/api/workers', require('./routes/worker-routes/referral.routes'));


// Admin routes
app.use('/api/admin/auth', require('./routes/admin-routes/adminAuth.routes'));
app.use('/api/admin', require('./routes/admin-routes/cityManagement.routes.js'));
app.use('/api/admin', require('./routes/admin-routes/dashboard.routes'));
app.use('/api/admin', require('./routes/admin-routes/userManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/workerManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/referral.routes'));
app.use('/api/admin', require('./routes/admin-routes/categoryManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/brandManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/serviceManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/workerCatalogManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/homePageManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/bookingManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/paymentManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/transactionManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/upload.routes'));
app.use('/api/admin', require('./routes/admin-routes/planManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/settings.routes'));
app.use('/api/admin', require('./routes/admin-routes/reviewManagement.routes'));
app.use('/api/admin', require('./routes/admin-routes/reportManagement.routes'));
app.use('/api/admin/settlements', require('./routes/admin-routes/settlementManagement.routes'));
app.use('/api/admin/admins', require('./routes/admin-routes/adminManagement.routes'));
app.use('/api/image', require('./routes/admin-routes/image.routes'));
app.use('/api', require('./routes/admin-routes/upload.routes')); // Generic upload access

// Worker Wallet/Ledger routes
// Worker Wallet/Ledger routes
// WARNING: This mounts at /api/workers, meaning routes inside are relative to that.
// e.g., router.post('/withdrawal') becomes /api/workers/withdrawal
app.use('/api/workers', require('./routes/worker-routes/workerWallet.routes'));

// Booking routes
app.use('/api/bookings', require('./routes/booking-routes/userBooking.routes'));
app.use('/api/bookings/cash', require('./routes/booking-routes/cashCollection.routes'));

// Payment routes
app.use('/api/payments', require('./routes/payment-routes/payment.routes'));

// Notification routes
app.use('/api/notifications', require('./routes/notification.routes'));

// Public routes (no authentication required)
app.use('/api/public', require('./routes/public-routes/catalog.routes'));
app.use('/api/public', require('./routes/public-routes/plan.routes'));
app.use('/api/public', require('./routes/public-routes/config.routes'));

// 404 handler
app.use((req, res) => {
  console.log(`[404 HANDLER] Route not found - Method: ${req.method}, Path: ${req.path}, OriginalUrl: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    method: req.method,
    path: req.path
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.isCorsError || (err.message && err.message.startsWith('Not allowed by CORS'))) {
    console.error(`[CORS] Rejected ${req.method} ${req.path} from origin "${req.headers.origin}"`);
    return res.status(403).json({
      success: false,
      message: 'Origin not allowed',
      code: 'CORS_ORIGIN_REJECTED'
    });
  }

  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize Socket.io
let server;
if (process.env.VERCEL !== '1' && !process.env.VERCEL_ENV) {
  const PORT = process.env.PORT || 5000;
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });

  // Initialize Socket.io
  const { initializeSocket, getIO } = require('./sockets');
  initializeSocket(server);

  // Make io instance available in request
  app.set('io', getIO());

  // Initialize Booking Scheduler for Wave-Based Alerting
  const { initializeScheduler } = require('./services/bookingScheduler');
  initializeScheduler(getIO());
  console.log('[Server] Booking Scheduler initialized for wave-based alerting');

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    server.close(() => {
      process.exit(1);
    });
  });
} else {
  // For Vercel, create HTTP server for Socket.io
  const http = require('http');
  server = http.createServer(app);
  const { initializeSocket } = require('./sockets');
  initializeSocket(server);
}

module.exports = app;





