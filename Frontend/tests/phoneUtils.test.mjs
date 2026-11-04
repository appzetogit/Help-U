import assert from 'node:assert/strict';
import { cleanIndianPhoneNumber, isValidIndianPhone } from '../src/utils/phoneUtils.js';

console.log('\n--- Testing cleanIndianPhoneNumber & isValidIndianPhone ---');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}: ${err.message}`);
    failed++;
  }
}

// 1. Mobile autofill formats
it('handles standard international mobile autofill (+919876543210)', () => {
  assert.equal(cleanIndianPhoneNumber('+919876543210'), '9876543210');
});

it('handles international format with spaces (+91 98765 43210)', () => {
  assert.equal(cleanIndianPhoneNumber('+91 98765 43210'), '9876543210');
});

it('handles raw digits with 91 prefix (919876543210)', () => {
  assert.equal(cleanIndianPhoneNumber('919876543210'), '9876543210');
});

it('handles leading 0 prefix (09876543210)', () => {
  assert.equal(cleanIndianPhoneNumber('09876543210'), '9876543210');
});

it('handles clean 10-digit phone number (9876543210)', () => {
  assert.equal(cleanIndianPhoneNumber('9876543210'), '9876543210');
});

// 2. Incremental typing
it('handles single digit typing ("9")', () => {
  assert.equal(cleanIndianPhoneNumber('9'), '9');
});

it('handles partial digits ("98765")', () => {
  assert.equal(cleanIndianPhoneNumber('98765'), '98765');
});

// 3. Formatting symbols
it('handles dashes and parentheses ("(987) 654-3210")', () => {
  assert.equal(cleanIndianPhoneNumber('(987) 654-3210'), '9876543210');
});

// 4. Edge cases
it('handles empty / null / undefined gracefully', () => {
  assert.equal(cleanIndianPhoneNumber(''), '');
  assert.equal(cleanIndianPhoneNumber(null), '');
  assert.equal(cleanIndianPhoneNumber(undefined), '');
});

// 5. Validation helper
it('validates correct 10-digit Indian numbers starting with 6-9', () => {
  assert.equal(isValidIndianPhone('9876543210'), true);
  assert.equal(isValidIndianPhone('8876543210'), true);
  assert.equal(isValidIndianPhone('7876543210'), true);
  assert.equal(isValidIndianPhone('6876543210'), true);
  assert.equal(isValidIndianPhone('5876543210'), false);
  assert.equal(isValidIndianPhone('98765'), false);
  assert.equal(isValidIndianPhone('+919876543210'), false); // Needs clean first
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

