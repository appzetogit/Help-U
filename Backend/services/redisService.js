/**
 * Redis Service
 * High-performance caching for worker online status, locations, and availability
 */

const Redis = require('ioredis');

let redis = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
const initRedis = () => {
  if (process.env.REDIS_ENABLED !== 'true') {
    console.log('[Redis] Disabled (REDIS_ENABLED is not true)');
    return null;
  }

  try {
    const redisUrl = process.env.REDIS_URL;
    const redisOptions = {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) {
          console.log('[Redis] Max retries (3) reached. Running without Redis cache.');
          return null; // Stop retrying
        }
        return Math.min(times * 300, 2000);
      }
    };

    if (redisUrl) {
      redis = new Redis(redisUrl, redisOptions);
    } else {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        ...redisOptions
      });
    }

    redis.on('connect', () => {
      isConnected = true;
      console.log('[Redis] ✅ Connected successfully');
    });

    redis.on('error', (err) => {
      isConnected = false;
      console.error('[Redis] ❌ Error:', err.message);
    });

    redis.on('close', () => {
      isConnected = false;
      console.log('[Redis] Connection closed');
    });

    // Attempt connection
    redis.connect().catch((err) => {
      console.warn('[Redis] Initial connection failed:', err.message);
    });

    return redis;
  } catch (error) {
    console.error('[Redis] Init failed:', error);
    return null;
  }
};

/**
 * Get Redis instance
 */
const getRedis = () => redis;

/**
 * Check if Redis is connected
 */
const isRedisConnected = () => isConnected && redis !== null;

// ==========================================
// WORKER ONLINE STATUS
// ==========================================

/**
 * Set worker online/offline status
 */
const setWorkerOnline = async (vendorId, isOnline) => {
  if (!isRedisConnected()) return false;
  try {
    const key = 'vendors:online';
    if (isOnline) {
      await redis.sadd(key, vendorId.toString());
      await redis.hset('vendors:lastSeen', vendorId.toString(), Date.now());
    } else {
      await redis.srem(key, vendorId.toString());
      await redis.hset('vendors:lastSeen', vendorId.toString(), Date.now());
    }
    return true;
  } catch (error) {
    console.error('[Redis] setWorkerOnline error:', error);
    return false;
  }
};

/**
 * Get all online worker IDs
 */
const getOnlineWorkers = async () => {
  if (!isRedisConnected()) return [];
  try {
    return await redis.smembers('vendors:online');
  } catch (error) {
    console.error('[Redis] getOnlineWorkers error:', error);
    return [];
  }
};

/**
 * Check if worker is online
 */
const isWorkerOnline = async (vendorId) => {
  if (!isRedisConnected()) return null; // null means unknown
  try {
    return await redis.sismember('vendors:online', vendorId.toString()) === 1;
  } catch (error) {
    console.error('[Redis] isWorkerOnline error:', error);
    return null;
  }
};

// ==========================================
// WORKER LOCATION (GEO)
// ==========================================

/**
 * Update worker location in Redis geo index
 */
const setWorkerLocation = async (vendorId, lat, lng) => {
  if (!isRedisConnected()) return false;
  try {
    // GEOADD expects: key longitude latitude member
    await redis.geoadd('vendors:locations', lng, lat, vendorId.toString());
    return true;
  } catch (error) {
    console.error('[Redis] setWorkerLocation error:', error);
    return false;
  }
};

/**
 * Find workers within radius using Redis geo
 * Returns array of { vendorId, distance }
 */
const getNearbyWorkersFromCache = async (lat, lng, radiusKm = 10) => {
  if (!isRedisConnected()) return null; // null means cache miss
  try {
    // GEORADIUS returns [member, distance] pairs
    const results = await redis.georadius(
      'vendors:locations',
      lng, lat,
      radiusKm, 'km',
      'WITHDIST', 'ASC', 'COUNT', 50
    );

    // Filter to only online workers
    const onlineWorkers = await getOnlineWorkers();
    const onlineSet = new Set(onlineWorkers);

    return results
      .filter(([vendorId]) => onlineSet.has(vendorId))
      .map(([vendorId, distance]) => ({
        vendorId,
        distance: parseFloat(distance)
      }));
  } catch (error) {
    console.error('[Redis] getNearbyWorkersFromCache error:', error);
    return null;
  }
};

// ==========================================
// WORKER AVAILABILITY
// ==========================================

/**
 * Set worker availability status
 */
const setWorkerAvailability = async (vendorId, status) => {
  if (!isRedisConnected()) return false;
  try {
    await redis.hset('vendors:availability', vendorId.toString(), status);
    return true;
  } catch (error) {
    console.error('[Redis] setWorkerAvailability error:', error);
    return false;
  }
};

/**
 * Get worker availability
 */
const getWorkerAvailability = async (vendorId) => {
  if (!isRedisConnected()) return null;
  try {
    return await redis.hget('vendors:availability', vendorId.toString());
  } catch (error) {
    console.error('[Redis] getWorkerAvailability error:', error);
    return null;
  }
};

/**
 * Get available worker IDs from a list
 */
const filterAvailableWorkers = async (workerIds) => {
  if (!isRedisConnected()) return workerIds; // Return all if Redis unavailable
  try {
    const pipeline = redis.pipeline();
    workerIds.forEach(id => {
      pipeline.hget('vendors:availability', id.toString());
    });
    const results = await pipeline.exec();

    return workerIds.filter((id, index) => {
      const status = results[index]?.[1];
      return !status || status === 'AVAILABLE' || status === 'BUSY';
    });
  } catch (error) {
    console.error('[Redis] filterAvailableWorkers error:', error);
    return workerIds;
  }
};

// ==========================================
// BOOKING CACHE
// ==========================================

/**
 * Cache booking data temporarily (for fast access during search)
 */
const cacheBookingSearch = async (bookingId, data, ttlSeconds = 300) => {
  if (!isRedisConnected()) return false;
  try {
    await redis.setex(`booking:search:${bookingId}`, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('[Redis] cacheBookingSearch error:', error);
    return false;
  }
};

/**
 * Get cached booking search data
 */
const getBookingSearchCache = async (bookingId) => {
  if (!isRedisConnected()) return null;
  try {
    const data = await redis.get(`booking:search:${bookingId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[Redis] getBookingSearchCache error:', error);
    return null;
  }
};

/**
 * Clear booking search cache
 */
const clearBookingSearchCache = async (bookingId) => {
  if (!isRedisConnected()) return false;
  try {
    await redis.del(`booking:search:${bookingId}`);
    return true;
  } catch (error) {
    console.error('[Redis] clearBookingSearchCache error:', error);
    return false;
  }
};

// ==========================================
// LIVE LOCATION TRACKING (TTL-based)
// ==========================================

/**
 * Cache live location for a booking with TTL
 * Used for real-time tracking recovery on disconnect
 */
const setLiveLocation = async (bookingId, data, ttlSeconds = 30) => {
  if (!isRedisConnected()) return false;
  try {
    const key = `live:booking:${bookingId}`;
    await redis.setex(key, ttlSeconds, JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
    return true;
  } catch (error) {
    console.error('[Redis] setLiveLocation error:', error);
    return false;
  }
};

/**
 * Get cached live location for a booking
 */
const getLiveLocation = async (bookingId) => {
  if (!isRedisConnected()) return null;
  try {
    const key = `live:booking:${bookingId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[Redis] getLiveLocation error:', error);
    return null;
  }
};

module.exports = {
  initRedis,
  getRedis,
  isRedisConnected,
  // Worker status
  setWorkerOnline,
  getOnlineWorkers,
  isWorkerOnline,
  // Worker location
  setWorkerLocation,
  getNearbyWorkersFromCache,
  // Worker availability
  setWorkerAvailability,
  getWorkerAvailability,
  filterAvailableWorkers,
  // Booking cache
  cacheBookingSearch,
  getBookingSearchCache,
  clearBookingSearchCache,
  // Live tracking
  setLiveLocation,
  getLiveLocation
};
