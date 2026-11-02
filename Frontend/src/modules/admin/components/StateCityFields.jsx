import React, { useMemo, useState } from 'react';
import { INDIA_STATES, findState, findCity, takenCityNames } from '../../../data/indiaStatesCities';

const OTHER = '__other__';

const STYLES = {
  compact: {
    label: 'block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1',
    input: 'w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium disabled:bg-gray-50 disabled:text-gray-400',
    hint: 'mt-1 text-[10px] text-gray-400'
  },
  default: {
    label: 'block text-sm font-medium text-gray-700 mb-1',
    input: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white disabled:bg-gray-50 disabled:text-gray-400',
    hint: 'mt-1 text-xs text-gray-400'
  }
};

/**
 * State first, then the city: pick a state, then choose from that state's cities (cities already added are
 * marked and cannot be picked twice, including under an old name such as Bijapur / Vijayapura).
 * "Other" lets the admin type a state or city that is not in the list, so nobody is ever blocked.
 *
 * Controlled: `state` and `city` are plain names; onChange({ state, city }) fires with the proper spelling.
 *   existingCities  cities already in the system ({ _id | id, name, state })
 *   editingId       the city being edited (it must stay selectable)
 */
const StateCityFields = ({ state, city, onChange, existingCities = [], editingId = null, variant = 'default' }) => {
  const css = STYLES[variant] || STYLES.default;
  const listedState = findState(state);
  const [stateOther, setStateOther] = useState(() => !!state && !listedState);
  const [cityOther, setCityOther] = useState(() => !!city && !!listedState && !findCity(state, city));

  const isStateOther = stateOther || (!!state && !listedState);

  // Which listed cities of this state are already in the system
  const takenNames = useMemo(
    () => takenCityNames(listedState?.name, existingCities, editingId),
    [existingCities, editingId, listedState]
  );

  const listedCity = listedState ? findCity(listedState.name, city) : null;
  const citySelectValue = cityOther ? OTHER : listedCity ? listedCity.name : '';

  const pickState = (value) => {
    if (value === OTHER) {
      setStateOther(true);
      setCityOther(true);
      onChange({ state: '', city: '' });
      return;
    }
    setStateOther(false);
    setCityOther(false);
    onChange({ state: value, city: '' }); // a city belongs to one state, so start the city over
  };

  const pickCity = (value) => {
    if (value === OTHER) {
      setCityOther(true);
      onChange({ state, city: '' });
      return;
    }
    setCityOther(false);
    onChange({ state, city: value });
  };

  const duplicateTyped = !!city && !!listedState && cityOther && takenNames.has(findCity(listedState.name, city)?.name);

  return (
    <>
      <div>
        <label className={css.label}>State</label>
        <select
          value={isStateOther ? OTHER : listedState?.name || ''}
          onChange={(e) => pickState(e.target.value)}
          className={css.input}
        >
          <option value="">Select a state</option>
          {INDIA_STATES.map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
          <option value={OTHER}>Other (type the state)</option>
        </select>
        {isStateOther && (
          <input
            type="text"
            value={state}
            onChange={(e) => onChange({ state: e.target.value, city })}
            placeholder="State name"
            className={`${css.input} mt-2`}
          />
        )}
      </div>

      <div>
        <label className={css.label}>
          City <span className="text-red-500">*</span>
        </label>
        {isStateOther ? (
          <input
            type="text"
            required
            value={city}
            onChange={(e) => onChange({ state, city: e.target.value })}
            placeholder="City name"
            className={css.input}
          />
        ) : (
          <>
            <select
              value={citySelectValue}
              onChange={(e) => pickCity(e.target.value)}
              disabled={!listedState}
              required={!cityOther}
              className={css.input}
            >
              <option value="">{listedState ? 'Select a city' : 'Choose a state first'}</option>
              {listedState && listedState.cities.map((c) => {
                const taken = takenNames.has(c.name);
                return (
                  <option key={c.name} value={c.name} disabled={taken}>
                    {c.name}{taken ? ' (already added)' : ''}
                  </option>
                );
              })}
              {listedState && <option value={OTHER}>Other city (type the name)</option>}
            </select>
            {cityOther && listedState && (
              <input
                type="text"
                required
                value={city}
                onChange={(e) => onChange({ state: listedState.name, city: e.target.value })}
                placeholder={`City in ${listedState.name}`}
                className={`${css.input} mt-2`}
              />
            )}
            {duplicateTyped && (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                This city is already added. Pick it from the list instead.
              </p>
            )}
            {listedState && !cityOther && (
              <p className={css.hint}>
                {listedState.cities.length - takenNames.size} of {listedState.cities.length} listed cities in {listedState.name} can still be added.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default StateCityFields;
