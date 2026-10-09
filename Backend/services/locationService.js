const axios = require('axios');

/**
 * Location Service
 * Handles location-based operations using Google Maps API
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com/maps/api';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Object} coord1 - {lat, lng}
 * @param {Object} coord2 - {lat, lng}
 * @returns {number} Distance in kilometers
 */
const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Geocode address to coordinates using Google Maps API
 * @param {string} address - Full address string
 * @returns {Promise<Object>} {lat, lng} coordinates
 */
const geocodeAddress = async (address) => {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not configured, geocoding skipped');
      return null;
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_URL}/geocode/json`, {
      params: {
        address: address,
        key: GOOGLE_MAPS_API_KEY
      }
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng
      };
    }

    throw new Error(`Geocoding failed: ${response.data.status}`);
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

const _buildWorkerQuery = (filters = {}) => {
  const { WORKER_STATUS } = require('../utils/constants');
  
  const checkCashLimit = filters.checkCashLimit;
  const serviceCategory = filters.service;
  
  const queryFilters = { ...filters };
  delete queryFilters.checkCashLimit;
  delete queryFilters.service;
  delete queryFilters.city;

  const baseQuery = {
    approvalStatus: WORKER_STATUS.APPROVED,
    isActive: true,
    isOnline: true,
    ...queryFilters
  };

  if (filters.city) {
    baseQuery['address.city'] = { $regex: new RegExp(filters.city, 'i') };
  }

  if (serviceCategory) {
    baseQuery.$or = [
      { categories: { $in: [serviceCategory] } },
      { service: { $in: [serviceCategory] } }
    ];
  }

  if (checkCashLimit) {
    baseQuery.$expr = { $lte: ["$wallet.dues", "$wallet.cashLimit"] };
  }

  return baseQuery;
};

/**
 * Find workers within specified radius of a location
 */
const findNearbyWorkers = async (centerLocation, radiusKm = 10, filters = {}) => {
  const Worker = require('../models/Worker');
  const Settings = require('../models/Settings');
  const { getNearbyWorkersFromCache, isRedisConnected } = require('./redisService');

  if (!centerLocation || typeof centerLocation.lat !== 'number' || typeof centerLocation.lng !== 'number') {
    console.warn('[LocationService] Invalid coordinates. City fallback for:', filters.city);
    if (filters.city) {
      return findWorkersByCity(filters.city, filters);
    }
    return [];
  }

  try {
    // Fetch default radius from settings
    if (radiusKm === 10) {
      const globalSettings = await Settings.findOne({ type: 'global' }).select('searchRadius').lean();
      if (globalSettings?.searchRadius) radiusKm = globalSettings.searchRadius;
    }

    const baseQuery = _buildWorkerQuery(filters);
    const totalApprovedWorkers = await Worker.countDocuments({ approvalStatus: 'APPROVED', isActive: true });
    console.log(`[LocationService] Total Approved/Active Workers in DB: ${totalApprovedWorkers}`);
    console.log(`[LocationService] Searching with query: ${JSON.stringify(baseQuery)}`);


    // OPTION 1: Try Redis geo cache first (fastest - <5ms)
    if (isRedisConnected()) {
      const cachedWorkers = await getNearbyWorkersFromCache(centerLocation.lat, centerLocation.lng, radiusKm);

      if (cachedWorkers && cachedWorkers.length > 0) {
        console.log(`[LocationService] Found ${cachedWorkers.length} workers from Redis cache`);

        // Fetch full worker details from MongoDB
        const workerIds = cachedWorkers.map(v => v.vendorId);
        const workers = await Worker.find({
          _id: { $in: workerIds },
          ...baseQuery
        }).select('name businessName phone address profilePhoto service rating isOnline availability geoLocation');

        // Merge distance from cache
        const workerMap = new Map(workers.map(v => [v._id.toString(), v.toObject()]));
        const result = cachedWorkers
          .filter(cv => workerMap.has(cv.vendorId))
          .map(cv => ({
            ...workerMap.get(cv.vendorId),
            distance: cv.distance
          }));

        console.log(`[LocationService] Found ${result.length} matching workers via Redis path`);
        return result;
      }
    }

    // OPTION 2: Try MongoDB 2dsphere geo query (fast)
    let nearbyWorkers = [];

    try {
      // Check if any workers have geoLocation set
      const hasGeoWorkers = await Worker.countDocuments({
        ...baseQuery,
        'geoLocation.coordinates': { $ne: [0, 0] }
      });

      if (hasGeoWorkers > 0) {
        // Use fast 2dsphere query
        nearbyWorkers = await Worker.find({
          ...baseQuery,
          geoLocation: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [centerLocation.lng, centerLocation.lat] // GeoJSON is [lng, lat]
              },
              $maxDistance: radiusKm * 1000 // Convert km to meters
            }
          }
        })
          .select('name businessName phone address profilePhoto service rating isOnline availability geoLocation settings')
          .limit(50); // Increased limit as we filter below

        // Calculate distance for each worker
        nearbyWorkers = nearbyWorkers.map(worker => {
          const workerObj = worker.toObject();
          if (worker.geoLocation && worker.geoLocation.coordinates) {
            workerObj.distance = calculateDistance(centerLocation, {
              lat: worker.geoLocation.coordinates[1],
              lng: worker.geoLocation.coordinates[0]
            });
          } else {
            workerObj.distance = null;
          }
          return workerObj;
        });

        // Filter by individual worker range
        nearbyWorkers = nearbyWorkers.filter(v => {
          const vRange = v.settings?.serviceRange || radiusKm;
          return v.distance <= vRange;
        });

        console.log(`[LocationService] Found ${nearbyWorkers.length} workers using 2dsphere query`);
        return nearbyWorkers;
      }
    } catch (geoError) {
      console.warn('[LocationService] 2dsphere query failed, falling back to Haversine:', geoError.message);
    }

    // Fallback: Use Haversine formula (slower but works without geo index)
    const workers = await Worker.find(baseQuery)
      .select('name businessName phone address location profilePhoto service rating isOnline availability settings');

    console.log(`[LocationService] Haversine fallback: found ${workers.length} workers matching baseQuery before distance filter`);

    // Calculate distances and filter by radius
    nearbyWorkers = workers.map(worker => {
      let distance = null;

      // PRIORITY: Use real-time location (location) first, then registered address
      const vLat = worker.location?.lat || worker.address?.lat;
      const vLng = worker.location?.lng || worker.address?.lng;

      if (vLat && vLng) {
        distance = calculateDistance(centerLocation, {
          lat: vLat,
          lng: vLng
        });
      }

      const vRange = worker.settings?.serviceRange || radiusKm;
      return {
        ...worker.toObject(),
        distance: distance,
        withinRange: distance !== null && distance <= vRange,
        isUsingCurrentLocation: !!worker.location?.lat // Flag for debugging
      };
    }).filter(worker => worker.withinRange);

    const currentLocCount = nearbyWorkers.filter(v => v.isUsingCurrentLocation).length;
    console.log(`[LocationService] Found ${nearbyWorkers.length} workers (Online/Current: ${currentLocCount}) using Haversine`);
    return nearbyWorkers;
  } catch (error) {
    console.error('Find nearby workers error:', error);
    return [];
  }
};

const getDistanceMatrix = async (origins, destinations) => {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('Google Maps API key not configured, using mock distances');
      // Return mock distances
      return origins.map(() => destinations.map(() => ({ distance: { value: 5000 } })));
    }

    const originsStr = origins.map(coord => `${coord.lat},${coord.lng}`).join('|');
    const destinationsStr = destinations.map(coord => `${coord.lat},${coord.lng}`).join('|');

    const response = await axios.get(`${GOOGLE_MAPS_API_URL}/distancematrix/json`, {
      params: {
        origins: originsStr,
        destinations: destinationsStr,
        key: GOOGLE_MAPS_API_KEY,
        units: 'metric'
      }
    });

    return response.data.rows;
  } catch (error) {
    console.error('Distance matrix error:', error);
    return [];
  }
};

/**
 * Find workers in a specific city (fallback when coordinates are missing)
 * @param {string} city - City name
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Array of workers
 */
const findWorkersByCity = async (city, filters = {}) => {
  try {
    const Worker = require('../models/Worker');
    const baseQuery = _buildWorkerQuery({ ...filters, city });

    console.log(`[LocationService] City search query: ${JSON.stringify(baseQuery)}`);
    const workers = await Worker.find(baseQuery)
      .select('name businessName phone address location profilePhoto service rating isOnline availability settings')
      .limit(50);

    console.log(`[LocationService] Found ${workers.length} workers in city: ${city}`);
    return workers.map(v => ({ ...v.toObject(), distance: null }));
  } catch (error) {
    console.error('Find workers by city error:', error);
    return [];
  }
};

module.exports = {
  geocodeAddress,
  findNearbyWorkers,
  findWorkersByCity,
  calculateDistance,
  getDistanceMatrix
};
