import React, { useEffect, useMemo, useState } from 'react';
import { FiGlobe, FiMapPin, FiGrid, FiSearch, FiAlertCircle, FiCheck } from 'react-icons/fi';
import zoneService from '../../services/zoneService';
import bookingFeaturesAdminService from '../../services/bookingFeaturesAdminService';
import { areaIsIncomplete } from './couponArea';

/**
 * One question instead of two filters: "Where can customers use this coupon?"
 *
 *   Everywhere        no limit
 *   Specific cities   pick cities
 *   Specific zones    pick zones, listed under their city (a zone already
 *                     belongs to one city, so no separate city step is needed)
 *
 * Empty selection means "no limit" on the server, so a limited mode with
 * nothing picked is flagged here (and blocked on save by the parent) rather
 * than silently becoming "everywhere".
 */

const idOf = (v) => String(v?._id || v?.id || v);

const MODES = [
  { key: 'all', label: 'Everywhere', icon: FiGlobe },
  { key: 'cities', label: 'Specific cities', icon: FiMapPin },
  { key: 'zones', label: 'Specific zones', icon: FiGrid }
];

const Chip = ({ selected, onClick, children, tone = 'purple' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
      selected
        ? tone === 'purple'
          ? 'bg-purple-600 text-white border-purple-600'
          : 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
    }`}
  >
    {selected && <FiCheck className="w-3 h-3" />}
    {children}
  </button>
);

const CouponAreaPicker = ({ mode, onModeChange, cities, selectedCities, selectedZones, onChange }) => {
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [dispatchMode, setDispatchMode] = useState('zone');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    zoneService.getAll({ status: 'active' })
      .then((res) => { if (alive && res?.success) setZones(res.zones || []); })
      .catch(() => {})
      .finally(() => { if (alive) setZonesLoading(false); });
    bookingFeaturesAdminService.getConfig()
      .then((res) => { if (alive && res?.success) setDispatchMode(res.config.dispatchMode === 'distance' ? 'distance' : 'zone'); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const zonesInUse = dispatchMode !== 'distance';

  // Active zones grouped under their city, in the order the cities are listed.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCity = new Map();
    zones.forEach((z) => {
      const cityId = idOf(z.cityId);
      const cityName = z.cityId?.name || cities.find((c) => idOf(c) === cityId)?.name || 'Other';
      if (q && !z.name.toLowerCase().includes(q) && !cityName.toLowerCase().includes(q)) return;
      if (!byCity.has(cityId)) byCity.set(cityId, { cityId, cityName, zones: [] });
      byCity.get(cityId).zones.push(z);
    });
    return [...byCity.values()].sort((a, b) => a.cityName.localeCompare(b.cityName));
  }, [zones, cities, search]);

  const switchMode = (next) => {
    if (next === mode) return;
    onModeChange(next);
    // Changing the kind of limit starts clean, so an old pick cannot linger unseen.
    onChange({ cities: [], zones: [] });
  };

  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const toggleCity = (id) => onChange({ cities: toggle(selectedCities, id), zones: [] });
  const toggleZone = (id) => onChange({ cities: [], zones: toggle(selectedZones, id) });

  const toggleCityZones = (group) => {
    const ids = group.zones.map(idOf);
    const allOn = ids.every((id) => selectedZones.includes(id));
    const next = allOn
      ? selectedZones.filter((id) => !ids.includes(id))
      : [...new Set([...selectedZones, ...ids])];
    onChange({ cities: [], zones: next });
  };

  const summary = (() => {
    if (mode === 'all') return 'Valid everywhere customers can book.';
    if (mode === 'cities') {
      const names = cities.filter((c) => selectedCities.includes(idOf(c))).map((c) => c.name);
      return names.length ? `Valid only in: ${names.join(', ')}.` : null;
    }
    const picked = zones.filter((z) => selectedZones.includes(idOf(z)));
    if (!picked.length) return null;
    const cityCount = new Set(picked.map((z) => idOf(z.cityId))).size;
    return `Valid only in ${picked.length} zone${picked.length > 1 ? 's' : ''} across ${cityCount} cit${cityCount > 1 ? 'ies' : 'y'}. Customers elsewhere will not see it.`;
  })();

  const incomplete = areaIsIncomplete(mode, selectedCities, selectedZones);

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">Where can customers use it?</label>

      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
        {MODES.map(({ key, label, icon: Icon }) => {
          const disabled = key === 'zones' && !zonesInUse && mode !== 'zones';
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              title={disabled ? 'Zones are not used while Booking Config dispatch is set to distance' : undefined}
              onClick={() => switchMode(key)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                mode === key ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          );
        })}
      </div>

      {!zonesInUse && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          <FiAlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
          {mode === 'zones'
            ? 'Bookings are dispatched by distance right now, so zone limits are ignored until you switch back to zone dispatch.'
            : 'Bookings are dispatched by distance right now, so zone limits are unavailable. Use cities instead.'}
        </p>
      )}

      {mode === 'cities' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {cities.length === 0 && <p className="text-xs text-gray-400">No cities found.</p>}
          {cities.map((city) => (
            <Chip key={idOf(city)} selected={selectedCities.includes(idOf(city))} onClick={() => toggleCity(idOf(city))}>
              {city.name}
            </Chip>
          ))}
        </div>
      )}

      {mode === 'zones' && (
        <div className="mt-3 space-y-3">
          {zones.length > 8 && (
            <div className="relative">
              <FiSearch className="absolute left-3 top-3 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search zones or cities..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
          )}

          {zonesLoading && <p className="text-xs text-gray-400">Loading zones...</p>}
          {!zonesLoading && groups.length === 0 && (
            <p className="text-xs text-gray-400">{search ? 'No zones match.' : 'No active zones yet. Create zones first, or use Specific cities.'}</p>
          )}

          {groups.map((group) => {
            const ids = group.zones.map(idOf);
            const pickedHere = ids.filter((id) => selectedZones.includes(id)).length;
            const allOn = pickedHere === ids.length;
            return (
              <div key={group.cityId} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-700">
                    {group.cityName}
                    <span className="ml-1.5 font-normal text-gray-400">{pickedHere}/{ids.length} selected</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleCityZones(group)}
                    className="text-[11px] font-semibold text-purple-600 hover:text-purple-800"
                  >
                    {allOn ? 'Clear' : 'Select all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.zones.map((z) => (
                    <Chip key={idOf(z)} selected={selectedZones.includes(idOf(z))} onClick={() => toggleZone(idOf(z))}>
                      {z.name}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {incomplete ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
          <FiAlertCircle className="w-3.5 h-3.5" />
          Pick at least one {mode === 'cities' ? 'city' : 'zone'}, or choose Everywhere.
        </p>
      ) : (
        summary && <p className="mt-2 text-[11px] text-gray-500">{summary}</p>
      )}
    </div>
  );
};

export default CouponAreaPicker;
