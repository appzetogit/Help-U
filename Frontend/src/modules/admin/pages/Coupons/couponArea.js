// Helpers for the coupon "where can customers use it?" picker.

// An empty list means "no limit" on the server, so a limited mode with nothing
// picked would quietly become "everywhere"; callers use this to stop that.
export const areaIsIncomplete = (mode, cities, zones) =>
  (mode === 'cities' && cities.length === 0) || (mode === 'zones' && zones.length === 0);

export const initialAreaMode = (cities = [], zones = []) =>
  zones.length > 0 ? 'zones' : cities.length > 0 ? 'cities' : 'all';
