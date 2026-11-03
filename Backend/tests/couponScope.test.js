/**
 * Coupon location rules: a coupon limited to a city or zone must never apply
 * (or be advertised) where it does not belong, including when the location is
 * unknown. Pure logic, no database needed.
 */
const assert = require('assert');
const { locationProblem } = require('../services/couponService');

let failed = 0;
const it = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); } catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};

const CITY_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const CITY_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ZONE_1 = '111111111111111111111111';
const ZONE_2 = '222222222222222222222222';
const open = { cities: [], zones: [] };

console.log('\n[coupon location rules]');

it('an unrestricted coupon applies anywhere, even with no location', () => {
  assert.strictEqual(locationProblem(open, {}), null);
  assert.strictEqual(locationProblem(open, { zoneMode: true, zoneId: ZONE_1, cityId: CITY_A }), null);
});

it('a city-limited coupon applies in its city only', () => {
  const c = { ...open, cities: [CITY_A] };
  assert.strictEqual(locationProblem(c, { cityId: CITY_A }), null);
  assert.match(locationProblem(c, { cityId: CITY_B }), /city/i);
});

it('a city-limited coupon is not offered when the city is unknown', () => {
  assert.match(locationProblem({ ...open, cities: [CITY_A] }, {}), /specific cities/i);
});

it('a zone-limited coupon applies in its zone only (zone mode)', () => {
  const c = { ...open, zones: [ZONE_1] };
  assert.strictEqual(locationProblem(c, { zoneMode: true, zoneId: ZONE_1 }), null);
  assert.match(locationProblem(c, { zoneMode: true, zoneId: ZONE_2 }), /zone/i);
});

it('a zone-limited coupon is not offered when the zone is unknown (zone mode)', () => {
  assert.match(locationProblem({ ...open, zones: [ZONE_1] }, { zoneMode: true }), /specific service zones/i);
});

it('zone limits are ignored in distance mode', () => {
  assert.strictEqual(locationProblem({ ...open, zones: [ZONE_1] }, { zoneMode: false }), null);
});

it('populated references ({_id}) are compared by id', () => {
  const c = { ...open, zones: [{ _id: ZONE_1, name: 'Indiranagar' }], cities: [{ _id: CITY_A }] };
  assert.strictEqual(locationProblem(c, { zoneMode: true, zoneId: ZONE_1, cityId: CITY_A }), null);
});

it('both limits must hold', () => {
  const c = { ...open, cities: [CITY_A], zones: [ZONE_1] };
  assert.match(locationProblem(c, { zoneMode: true, zoneId: ZONE_1, cityId: CITY_B }), /city/i);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
