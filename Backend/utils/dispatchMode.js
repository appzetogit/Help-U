/**
 * Dispatch mode: how a booking finds professionals. Exactly one rule applies at a time.
 *
 *   zone      zone membership decides (any distance), addresses outside every zone are refused
 *   distance  zones are ignored; the search radius decides
 *
 * Set by the admin in Booking Config (dispatchMode). Zone code asks here before doing anything, so
 * switching the mode switches every zone feature (gate, worker filter, surge, category limits,
 * the customer app's zone lookup) together.
 */
const { getBookingConfig } = require('./bookingConfig');

// Zone mode ignores the search radius; this stands in for "no limit" in the geo queries.
const ZONE_WIDE_RADIUS_KM = 500;

const getDispatchMode = async () => {
  const config = await getBookingConfig();
  return config.dispatchMode === 'distance' ? 'distance' : 'zone';
};

const zonesInUse = async () => (await getDispatchMode()) === 'zone';

module.exports = { ZONE_WIDE_RADIUS_KM, getDispatchMode, zonesInUse };
