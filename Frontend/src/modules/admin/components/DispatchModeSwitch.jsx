import React, { useCallback, useEffect, useState } from 'react';
import { FiMap, FiTarget, FiCheck } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import bookingFeaturesAdminService from '../services/bookingFeaturesAdminService';

const MODES = [
  {
    value: 'zone',
    title: 'By zone',
    icon: FiMap,
    points: [
      'Only professionals who work in the customer\'s zone get the booking - however far away they are.',
      'Addresses outside every zone are refused and see the out-of-zone page.',
      'Zone surge pricing and zone category limits apply.',
      'The search radius and professionals\' own service radius are not used.'
    ]
  },
  {
    value: 'distance',
    title: 'By distance',
    icon: FiTarget,
    points: [
      'Professionals within the search radius of the address get the booking, nearest first.',
      'Zones are switched off: nothing is refused for being outside a zone.',
      'No zone surge pricing, zone category limits or zone-only coupons.',
      'Professionals\' own service radius applies (if enabled).'
    ]
  }
];

/** The two choices, side by side. Controlled: the caller decides when it is saved. */
export const DispatchModeCards = ({ value, onChange, disabled }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {MODES.map(({ value: mode, title, icon, points }) => {
      const active = value === mode;
      return (
        <button
          type="button"
          key={mode}
          disabled={disabled}
          onClick={() => !active && onChange(mode)}
          className={`text-left rounded-xl border p-3.5 transition-all disabled:opacity-60 ${
            active ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
              {React.createElement(icon, { className: `w-4 h-4 ${active ? 'text-blue-600' : 'text-gray-400'}` })} {title}
            </span>
            {active && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                <FiCheck className="w-3 h-3" /> In use
              </span>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-gray-600 list-disc pl-4">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </button>
      );
    })}
  </div>
);

/**
 * Self-contained switch (loads the current mode, saves the moment it is changed).
 * Used on the Zones page; Booking Config uses DispatchModeCards inside its own save flow.
 */
const DispatchModeSwitch = ({ onChanged, onLoaded, compact = false }) => {
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await bookingFeaturesAdminService.getConfig();
      if (res?.success) {
        const loaded = res.config.dispatchMode === 'distance' ? 'distance' : 'zone';
        setMode(loaded);
        onLoaded?.(loaded);
      }
    } catch {
      toast.error('Could not load the dispatch mode');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const change = async (next) => {
    const label = next === 'zone' ? 'by zone' : 'by distance';
    if (!window.confirm(`Send new bookings ${label}? It takes effect immediately for every new booking.`)) return;
    try {
      setSaving(true);
      const res = await bookingFeaturesAdminService.updateConfig({ dispatchMode: next });
      if (res?.success) {
        setMode(next);
        toast.success(`Bookings are now sent ${label}`);
        onChanged?.(next);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not change the dispatch mode');
    } finally {
      setSaving(false);
    }
  };

  if (!mode) return null;

  if (compact) {
    return (
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-bold">
        {MODES.map(({ value, title }) => (
          <button
            type="button"
            key={value}
            disabled={saving}
            onClick={() => mode !== value && change(value)}
            className={`px-2.5 py-1 rounded-md transition-colors ${mode === value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
          >
            {title}
          </button>
        ))}
      </div>
    );
  }

  return <DispatchModeCards value={mode} onChange={change} disabled={saving} />;
};

export default DispatchModeSwitch;
