/**
 * Partner service picker: the "highest ticked level" rule.
 * Run: node Frontend/tests/skillTree.test.mjs
 */
import assert from 'assert';
import { buildIndex, decode, toggle, encode, stateOf, setAll, countServices } from '../src/modules/worker/utils/skillTree.js';

let passed = 0;
let failed = 0;
const it = (desc, fn) => {
  try { fn(); console.log(`  ✅ ${desc}`); passed++; } catch (e) { console.error(`  ❌ ${desc}: ${e.message}`); failed++; }
};

const tree = [
  {
    id: '1', title: 'Electrician',
    subCategories: [
      { id: '11', title: 'Fan', services: [{ id: '111', title: 'Fan Repair' }, { id: '112', title: 'Fan Install' }] },
      { id: '12', title: 'Wiring', services: [{ id: '121', title: 'Switch Fix' }] }
    ],
    services: [{ id: '19', title: 'Inspection' }]
  },
  { id: '2', title: 'Plumber', subCategories: [], services: [{ id: '21', title: 'Tap Fix' }] },
  { id: '3', title: 'Empty Category', subCategories: [], services: [] }
];
const index = buildIndex(tree);
const pick = (titles) => decode(index, titles);
const tick = (checked, key) => toggle(index, checked, key);

console.log('\n--- Partner service picker rules ---');

it('ticking a whole category stores ONLY the category title', () => {
  const { checked } = pick([]);
  const next = tick(checked, 'c:1');
  assert.deepStrictEqual(encode(index, next), ['Electrician']);
  assert.strictEqual(countServices(index, next), 4);
});

it('a stored category title shows everything under it as ticked', () => {
  const { checked } = pick(['Electrician']);
  ['s:11', 's:12', 'v:111', 'v:112', 'v:121', 'v:19'].forEach((k) => assert.ok(checked.has(k), k));
  assert.strictEqual(stateOf(index, checked, 'c:1'), 'all');
  assert.strictEqual(stateOf(index, checked, 'c:2'), 'none');
});

it('unticking one service turns the category into a partial: the rest are kept explicitly', () => {
  const { checked } = pick(['Electrician']);
  const next = tick(checked, 'v:112');
  assert.strictEqual(stateOf(index, next, 'c:1'), 'some');
  assert.strictEqual(stateOf(index, next, 's:11'), 'some');
  assert.deepStrictEqual(encode(index, next).sort(), ['Fan Repair', 'Inspection', 'Wiring'].sort());
});

it('re-ticking the missing service folds back up to the category title', () => {
  const { checked } = pick(['Electrician']);
  const partial = tick(checked, 'v:112');
  const whole = tick(partial, 'v:112');
  assert.deepStrictEqual(encode(index, whole), ['Electrician']);
});

it('ticking every sub-category and service one by one also folds up to the category', () => {
  let c = pick([]).checked;
  ['s:11', 's:12', 'v:19'].forEach((k) => { c = tick(c, k); });
  assert.deepStrictEqual(encode(index, c), ['Electrician']);
});

it('a sub-category ticked on its own stores the sub-category title', () => {
  const next = tick(pick([]).checked, 's:11');
  assert.deepStrictEqual(encode(index, next), ['Fan']);
  assert.strictEqual(stateOf(index, next, 'c:1'), 'some');
});

it('one service out of several stores just that service', () => {
  const next = tick(pick([]).checked, 'v:111');
  assert.deepStrictEqual(encode(index, next), ['Fan Repair']);
});

it('ticking the only service of a sub-category means the whole sub-category (nothing else is under it)', () => {
  const next = tick(pick([]).checked, 'v:121');
  assert.deepStrictEqual(encode(index, next), ['Wiring']);
});

it('unticking a category clears everything under it', () => {
  const { checked } = pick(['Electrician', 'Plumber']);
  const next = tick(checked, 'c:1');
  assert.deepStrictEqual(encode(index, next), ['Plumber']);
});

it('an old flat selection (category + one of its own services) collapses to the category', () => {
  const { checked } = pick(['Electrician', 'Fan Repair']);
  assert.deepStrictEqual(encode(index, checked), ['Electrician']);
});

it('matching ignores case and stray spaces (stored data is free text)', () => {
  const { checked } = pick(['  electrician ', 'TAP FIX']);
  assert.strictEqual(stateOf(index, checked, 'c:1'), 'all');
  assert.strictEqual(stateOf(index, checked, 'v:21'), 'all');
  assert.strictEqual(stateOf(index, checked, 'c:2'), 'all'); // its only service is ticked
});

it('titles not in the tree are kept, never silently dropped', () => {
  const { checked, extras } = pick(['Geyser (old)', 'Plumber']);
  assert.deepStrictEqual(extras, ['Geyser (old)']);
  assert.deepStrictEqual(encode(index, checked, extras), ['Plumber', 'Geyser (old)']);
});

it('a category with nothing under it can still be ticked', () => {
  const next = tick(pick([]).checked, 'c:3');
  assert.deepStrictEqual(encode(index, next), ['Empty Category']);
});

it('select all / clear all', () => {
  const all = setAll(index, true);
  assert.deepStrictEqual(encode(index, all), ['Electrician', 'Plumber', 'Empty Category']);
  assert.deepStrictEqual(encode(index, setAll(index, false)), []);
});

it('encode never emits a child next to its ticked parent', () => {
  const titles = encode(index, pick(['Electrician', 'Fan', 'Fan Repair', 'Plumber']).checked);
  assert.deepStrictEqual(titles, ['Electrician', 'Plumber']);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
