/**
 * State -> city list used by the admin "Add city" forms.
 * Run: node Frontend/tests/indiaStatesCities.test.mjs
 */
import assert from 'assert';
import { INDIA_STATES, findState, findCity, samePlace, takenCityNames, groupCitiesByState } from '../src/data/indiaStatesCities.js';

let passed = 0;
let failed = 0;
const it = (desc, fn) => {
  try { fn(); console.log(`  ✅ ${desc}`); passed++; } catch (e) { console.error(`  ❌ ${desc}: ${e.message}`); failed++; }
};

// The cities in the admin screenshot, spelled exactly as stored
const existing = [
  { _id: '1', name: 'indore', state: 'Madhya Pradesh' },
  { _id: '2', name: 'BANGALORE', state: 'KARNATAKA' },
  { _id: '3', name: 'VIJAYAPURA', state: 'KARNATAKA' },
  { _id: '4', name: 'BIJAPUR', state: 'KARNATAKA' },
  { _id: '5', name: 'RAICHUR', state: 'KARNATAKA' },
  { _id: '6', name: 'BIDAR', state: 'KARNATAKA' },
  { _id: '7', name: 'Kalaburagi', state: 'Karnataka' },
  { _id: '8', name: 'Gulbarga', state: 'Karnataka' }
];

console.log('\n--- India state / city list ---');

it('covers every state and union territory', () => {
  assert.strictEqual(INDIA_STATES.length, 36);
  ['Madhya Pradesh', 'Karnataka', 'Maharashtra', 'Delhi', 'Ladakh', 'Puducherry'].forEach((n) => assert.ok(findState(n), n));
});

it('every state has cities, no duplicate city inside a state, states are A-Z', () => {
  INDIA_STATES.forEach((s) => {
    assert.ok(s.cities.length > 0, `${s.name} has no cities`);
    const names = s.cities.map((c) => c.name.toLowerCase());
    assert.strictEqual(new Set(names).size, names.length, `${s.name} lists a city twice`);
  });
  const names = INDIA_STATES.map((s) => s.name);
  assert.deepStrictEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

it('stored states match whatever the case ("KARNATAKA" is Karnataka)', () => {
  assert.strictEqual(findState('KARNATAKA').name, 'Karnataka');
  assert.strictEqual(findState('  madhya   pradesh ').name, 'Madhya Pradesh');
  assert.strictEqual(findState('Atlantis'), null);
});

it('old names resolve to the listed city', () => {
  assert.strictEqual(findCity('Karnataka', 'Bengaluru').name, 'Bangalore');
  assert.strictEqual(findCity('Karnataka', 'bijapur').name, 'Vijayapura');
  assert.strictEqual(findCity('Karnataka', 'GULBARGA').name, 'Kalaburagi');
  assert.strictEqual(findCity('Maharashtra', 'Bombay').name, 'Mumbai');
  assert.strictEqual(findCity('Karnataka', 'Indore'), null, 'Indore is not in Karnataka');
});

it('samePlace treats a city and its old name as one', () => {
  assert.ok(samePlace('Karnataka', 'Bijapur', 'Vijayapura'));
  assert.ok(samePlace('Karnataka', 'bangalore', 'BENGALURU'));
  assert.ok(!samePlace('Karnataka', 'Raichur', 'Bidar'));
});

it('the cities already in the system are marked as taken, however they were spelled', () => {
  const taken = takenCityNames('Karnataka', existing);
  ['Bangalore', 'Vijayapura', 'Raichur', 'Bidar', 'Kalaburagi'].forEach((n) => assert.ok(taken.has(n), `${n} should be taken`));
  assert.ok(!taken.has('Mysuru') && !taken.has('Belagavi'), 'unrelated cities stay available');
  assert.deepStrictEqual([...takenCityNames('Madhya Pradesh', existing)], ['Indore']);
});

it('Bijapur and Vijayapura are not offered twice (one place, two records)', () => {
  const onlyOld = [{ _id: '4', name: 'BIJAPUR', state: 'KARNATAKA' }];
  assert.ok(takenCityNames('Karnataka', onlyOld).has('Vijayapura'));
});

it('a city is only taken within its own state', () => {
  const taken = takenCityNames('Maharashtra', existing);
  assert.strictEqual(taken.size, 0);
});

it('the city being edited stays selectable', () => {
  const taken = takenCityNames('Madhya Pradesh', existing, '1');
  assert.ok(!taken.has('Indore'));
});

it('an unknown state offers nothing (the form falls back to typing)', () => {
  assert.strictEqual(takenCityNames('Nowhere', existing).size, 0);
});

console.log('\n--- Cities page: grouped by state ---');

it('groups the screenshot data by state, merging KARNATAKA and Karnataka', () => {
  const groups = groupCitiesByState(existing.map((c, i) => ({ ...c, isActive: true, isDefault: i === 1 })));
  assert.deepStrictEqual(groups.map((g) => [g.name, g.cities.length]), [['Karnataka', 7], ['Madhya Pradesh', 1]]);
  const karnataka = groups[0];
  assert.strictEqual(karnataka.activeCount, 7);
  assert.strictEqual(karnataka.hasDefault, true);
  assert.strictEqual(groups[1].hasDefault, false);
});

it('flags the same place saved twice (Vijayapura / Bijapur, Kalaburagi / Gulbarga)', () => {
  const karnataka = groupCitiesByState(existing)[0];
  assert.strictEqual(karnataka.duplicates['3'], 'BIJAPUR');
  assert.strictEqual(karnataka.duplicates['4'], 'VIJAYAPURA');
  assert.strictEqual(karnataka.duplicates['7'], 'Gulbarga');
  assert.strictEqual(karnataka.duplicates['8'], 'Kalaburagi');
  assert.strictEqual(karnataka.duplicates['2'], undefined, 'Bangalore has no twin');
  assert.strictEqual(Object.keys(karnataka.duplicates).length, 4);
});

it('cities cost nothing extra: sorted A-Z inside a state, inactive counted separately', () => {
  const [g] = groupCitiesByState([
    { _id: 'a', name: 'Raichur', state: 'Karnataka', isActive: false },
    { _id: 'b', name: 'Bidar', state: 'karnataka', isActive: true }
  ]);
  assert.deepStrictEqual(g.cities.map((c) => c.name), ['Bidar', 'Raichur']);
  assert.strictEqual(g.activeCount, 1);
});

it('a state we do not list still gets its own group, and cities with no state go last', () => {
  const groups = groupCitiesByState([
    { _id: 'a', name: 'Somewhere', state: '' },
    { _id: 'b', name: 'Paris', state: 'Ile-de-France' },
    { _id: 'c', name: 'Indore', state: 'Madhya Pradesh' }
  ]);
  assert.deepStrictEqual(groups.map((g) => g.name), ['Ile-de-France', 'Madhya Pradesh', 'No state set']);
  assert.strictEqual(groups[0].listed, false);
});

it('an empty list gives no groups', () => {
  assert.deepStrictEqual(groupCitiesByState([]), []);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
