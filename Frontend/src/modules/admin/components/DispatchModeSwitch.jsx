import React from 'react';
import { FiMap, FiTarget, FiCheck } from 'react-icons/fi';

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

/** The two choices, side by side. Used only by Booking Configuration, the single place the mode is changed. */
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
