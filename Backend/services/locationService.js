const axios = require('axios');

/**
 * Location Service
 * Handles location-based operations using Google Maps API
 */

const GOOGLE_MAPS_API_URL = 'https://maps.googleapis.com/maps/api';

let cachedApiKey = null;
let lastApiKeyFetch = 0;
const API_KEY_CACHE_TTL = 30000; // 30s cache

/**
 * Get active Google Maps API key from DB settings with fallback to environment
 */
const getActiveApiKey = async () => {
  const now = Date.now();
  if (cachedApiKey && (now - lastApiKeyFetch) < API_KEY_CACHE_TTL) {
    return cachedApiKey;
  }
  try {
    const Settings = require('../models/Settings');
    const settings = await Settings.findOne({ type: 'global' }).select('googleMapsApiKey');
    cachedApiKey = settings?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || null;
    lastApiKeyFetch = now;
    return cachedApiKey;
  } catch (err) {
    return process.env.GOOGLE_MAPS_API_KEY || null;
  }
};

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
 * @param {string} [language] - Optional language code (e.g. 'en', 'hi')
 * @returns {Promise<Object>} {lat, lng} coordinates
 */
const geocodeAddress = async (address, language = 'en') => {
  try {
    const apiKey = await getActiveApiKey();
    if (!apiKey) {
      console.warn('Google Maps API key not configured, geocoding skipped');
      return null;
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_URL}/geocode/json`, {
      params: {
        address: address,
        key: apiKey,
        ...(language ? { language } : {})
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

/**
 * Reverse geocode coordinates to formatted address and components
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} [language] - Language code
 * @returns {Promise<Object|null>}
 */
const reverseGeocode = async (lat, lng, language = 'en') => {
  try {
    const apiKey = await getActiveApiKey();
    if (!apiKey) {
      console.warn('Google Maps API key not configured, reverse geocoding skipped');
      return null;
    }

    const response = await axios.get(`${GOOGLE_MAPS_API_URL}/geocode/json`, {
      params: {
        latlng: `${lat},${lng}`,
        key: apiKey,
        language
      }
    });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      return response.data.results[0];
    }
    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};

/**
 * Detect regional language recommendation from coordinates using Google Maps API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{language: string, state: string}|null>}
 */
const detectLanguageFromLocation = async (lat, lng) => {
  try {
    const result = await reverseGeocode(lat, lng, 'en');
    if (!result) return null;

    const stateComponent = result.address_components?.find(c =>
      c.types.includes('administrative_area_level_1')
    );
    const stateName = (stateComponent?.long_name || '').toLowerCase();

    // Map Indian states to primary regional language codes
    const stateLanguageMap = {
      'madhya pradesh': 'hi',
      'uttar pradesh': 'hi',
      'bihar': 'hi',
      'rajasthan': 'hi',
      'delhi': 'hi',
      'haryana': 'hi',
      'himachal pradesh': 'hi',
      'uttarakhand': 'hi',
      'jharkhand': 'hi',
      'chhattisgarh': 'hi',
      'maharashtra': 'mr',
      'gujarat': 'gu',
      'west bengal': 'bn',
      'tamil nadu': 'ta',
      'karnataka': 'kn',
      'telangana': 'te',
      'andhra pradesh': 'te',
      'punjab': 'pa',
      'kerala': 'ml',
      'odisha': 'or',
      'assam': 'as'
    };

    for (const [key, lang] of Object.entries(stateLanguageMap)) {
      if (stateName.includes(key)) {
        return { language: lang, state: stateComponent.long_name };
      }
    }
    return { language: 'en', state: stateComponent?.long_name || '' };
  } catch (err) {
    console.error('Error detecting language from location:', err);
    return null;
  }
};

const _buildWorkerQuery = (filters = {}) => {
  const { WORKER_STATUS } = require('../utils/constants');
  
  const checkCashLimit = filters.checkCashLimit;
  const serviceCategory = filters.service;
  const zoneId = filters.zoneId;
  const zoneCoordinates = filters.zoneCoordinates;
  
  const includeOffline = filters.includeOffline === true;
  const queryFilters = { ...filters };
  delete queryFilters.includeOffline;
  delete queryFilters.checkCashLimit;
  delete queryFilters.service;
  delete queryFilters.serviceCategory;
  delete queryFilters.city;
  delete queryFilters.zoneId;
  delete queryFilters.zoneCoordinates;

  const baseQuery = {
    approvalStatus: WORKER_STATUS.APPROVED,
    isActive: true,
    // Scheduled bookings also go to workers who are offline right now (they see the alert
    // when they next open the app); instant ones need someone online.
    ...(includeOffline ? {} : { isOnline: true }),
    ...queryFilters
  };

  if (filters.city) {
    // Only used by the no-coordinates fallback; escape the user-entered city text
    const escapedCity = String(filters.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    baseQuery['address.city'] = { $regex: new RegExp(escapedCity, 'i') };
  }

  if (serviceCategory) {
    const serviceList = Array.isArray(serviceCategory)
      ? serviceCategory.filter(Boolean)
      : [serviceCategory];

    const regexList = serviceList.map(s =>
      new RegExp(`^${String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    );

    baseQuery.$or = [
      { categories: { $in: regexList } },
      { service: { $in: regexList } }
    ];
  }

  if (zoneId || zoneCoordinates) {
    const zoneClauses = [];
    if (zoneId) {
      zoneClauses.push({ zoneId });
      zoneClauses.push({ zoneIds: zoneId });
    }
    if (zoneCoordinates) {
      zoneClauses.push({
        geoLocation: {
          $geoWithin: {
            $geometry: zoneCoordinates
          }
        }
      });
    }
    if (zoneClauses.length > 0) {
      if (baseQuery.$or) {
        baseQuery.$and = [
          { $or: baseQuery.$or },
          { $or: zoneClauses }
        ];
        delete baseQuery.$or;
      } else {
        baseQuery.$or = zoneClauses;
      }
    }
  }

  if (checkCashLimit) {
    baseQuery.$expr = { $lte: ["$wallet.dues", "$wallet.cashLimit"] };
  }

  return baseQuery;
};

/**
 * Find workers within specified radius of a location
 */
const findNearbyByLiveLocation = async (centerLocation, radiusKm = null, filters = {}) => {
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
    // Only when no radius was given is the admin's search radius used. (It used to replace ANY radius of
    // exactly 10, so a deliberate emergency radius of 10 km was silently swapped for the normal one.)
    if (radiusKm === null || radiusKm === undefined) {
      const globalSettings = await Settings.findOne({ type: 'global' }).select('searchRadius').lean();
      radiusKm = globalSettings?.searchRadius || 10;
    }

    // Matching is purely by distance + service radius: the city name is not a
    // filter here, so a nearby worker registered under another city still qualifies.
    const { city: _ignoredCity, ...geoFilters } = filters;
    const baseQuery = _buildWorkerQuery(geoFilters);
    const totalApprovedWorkers = await Worker.countDocuments({ approvalStatus: { $in: ['approved', 'APPROVED'] }, isActive: true });
    console.log(`[LocationService] Total Approved/Active Workers in DB: ${totalApprovedWorkers}`);
    console.log(`[LocationService] Searching with query: ${JSON.stringify(baseQuery)}`);


    // OPTION 1: Try Redis geo cache first (fastest - <5ms)
    if (isRedisConnected() && !geoFilters.includeOffline) {
      const cachedWorkers = await getNearbyWorkersFromCache(centerLocation.lat, centerLocation.lng, radiusKm);

      if (cachedWorkers && cachedWorkers.length > 0) {
        console.log(`[LocationService] Found ${cachedWorkers.length} workers from Redis cache`);

        // Fetch full worker details from MongoDB
        const workerIds = cachedWorkers.map(v => v.vendorId);
        const workers = await Worker.find({
          _id: { $in: workerIds },
          ...baseQuery
        }).select('name businessName phone address profilePhoto service rating isOnline availability geoLocation settings');

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

        // The partner's own radius is applied afterwards, for every search path alike (see findNearbyWorkers)
        nearbyWorkers = nearbyWorkers.filter(v => v.distance <= radiusKm);

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

      return {
        ...worker.toObject(),
        distance: distance,
        withinRange: distance !== null && distance <= radiusKm,
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

/**
 * Partners whose OWN service area covers the customer although they are not within the platform radius of
 * him right now (for example a partner at the other end of his city who accepts 15 km from home).
 * Found by their saved home address; the same filters as the normal search apply (online, service, zone, cash
 * limit). `extraQuery` adds conditions (the "pro arrives" badges only want available partners).
 */
const findServiceAreaWorkers = async (center, config, filters = {}, excludeIds = [], extraQuery = {}) => {
  const Worker = require('../models/Worker');
  const serviceArea = require('../utils/serviceArea');
  const { city: _ignoredCity, ...geoFilters } = filters;
  const box = serviceArea.boundingBox(center, Number(config.workerServiceRadiusMaxKm) || 25);

  const candidates = await Worker.find({
    ..._buildWorkerQuery(geoFilters),
    ...extraQuery,
    ...(excludeIds.length ? { _id: { $nin: excludeIds } } : {}),
    'settings.serviceRange': { $gt: 0 },
    'address.lat': { $gte: box.minLat, $lte: box.maxLat },
    'address.lng': { $gte: box.minLng, $lte: box.maxLng }
  })
    .select('name businessName phone address profilePhoto service categories rating isOnline availability geoLocation settings')
    .limit(100);

  const found = [];
  for (const doc of candidates) {
    const worker = doc.toObject();
    if (serviceArea.insideOwnArea(worker, center, config) !== true) continue;
    const homeDistance = serviceArea.homeDistanceKm(worker, center);
    const coords = worker.geoLocation && worker.geoLocation.coordinates;
    const hasLive = Array.isArray(coords) && coords.length === 2 && !(coords[0] === 0 && coords[1] === 0);
    // Ranked by how far he really is from the customer now; his home distance when his position is unknown
    worker.distance = hasLive ? calculateDistance(center, { lat: coords[1], lng: coords[0] }) : homeDistance;
    worker.homeDistance = homeDistance;
    worker.viaServiceArea = true;
    found.push(worker);
  }
  return found;
};

/**
 * Find partners for a customer location.
 *
 * Normally: partners within the platform search radius of the customer (by their current position). While the
 * admin has "Partner service area" switched on, a partner who chose his own radius is judged by that instead,
 * measured from his saved home address: left out when the customer is beyond it, and included when the customer
 * is inside it even though his current position is outside the platform radius. Everyone else is unchanged.
 */
const findNearbyWorkers = async (centerLocation, radiusKm = null, filters = {}, options = {}) => {
  const pool = await findNearbyByLiveLocation(centerLocation, radiusKm, filters);
  if (!centerLocation || typeof centerLocation.lat !== 'number' || typeof centerLocation.lng !== 'number') return pool;

  let config;
  try {
    config = await require('../utils/bookingConfig').getBookingConfig();
  } catch (err) {
    return pool;
  }
  // ignoreServiceArea: the zone decides who qualifies, so a professional's own radius is not applied
  if (!config.isWorkerServiceRadiusEnabled || options.ignoreServiceArea) return pool;

  const serviceArea = require('../utils/serviceArea');
  const kept = pool.filter((w) => serviceArea.insideOwnArea(w, centerLocation, config) !== false);
  try {
    const extras = await findServiceAreaWorkers(centerLocation, config, filters, pool.map((w) => w._id));
    if (extras.length) console.log(`[LocationService] ${extras.length} more partner(s) whose own service area covers this address`);
    return [...kept, ...extras];
  } catch (err) {
    console.warn('[LocationService] service-area search failed, using the platform radius only:', err.message);
    return kept;
  }
};

const getDistanceMatrix = async (origins, destinations, language = 'en') => {
  try {
    const apiKey = await getActiveApiKey();
    if (!apiKey) {
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
        key: apiKey,
        units: 'metric',
        ...(language ? { language } : {})
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
  reverseGeocode,
  detectLanguageFromLocation,
  getActiveApiKey,
  findNearbyWorkers,
  findServiceAreaWorkers,
  findWorkersByCity,
  calculateDistance,
  getDistanceMatrix
};
