/**
 * Verification of cancellation fee and payment accounting:
 * When a user has paid advance/extras (e.g. >= 149), no balance due is shown,
 * no extra penalty is charged to the wallet, and excess paid is refunded.
 *
 * Run: cd Backend && node tests/cancellationFeeAccounting.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'cancel-accounting-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'cancel-accounting-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Booking = require('../models/Booking');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { computeBookingTotals } = require('../utils/bookingTotals');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}: ${err.message}`);
    failed++;
  }
}

const close = (a, b, msg) => assert.ok(Math.abs(Number(a) - Number(b)) < 0.011, `${msg || ''} expected ${b}, got ${a}`);

(async () => {
  console.log('\n--- Testing cancellation fee accounting & balance due ---');

  console.log('\n[computeBookingTotals for cancelled / rejected bookings]');
  await it('computeBookingTotals sets due = 0 for a cancelled booking even if only partially paid', () => {
    const t = computeBookingTotals({
      status: BOOKING_STATUS.CANCELLED,
      basePrice: 500,
      tax: 90,
      visitingCharges: 149,
      finalAmount: 739,
      paymentStatus: 'pending',
      advancePayment: { status: 'paid', paidAmount: 200 }
    });
    close(t.paid, 200, 'paid is 200');
    assert.strictEqual(t.due, 0, 'due must be 0 for cancelled booking');
  });

  await it('computeBookingTotals sets due = 0 for a cancelled booking with 0 paid', () => {
    const t = computeBookingTotals({
      status: BOOKING_STATUS.CANCELLED,
      basePrice: 500,
      tax: 90,
      visitingCharges: 149,
      finalAmount: 739,
      paymentStatus: 'pending'
    });
    close(t.paid, 0, 'paid is 0');
    assert.strictEqual(t.due, 0, 'due must be 0 for cancelled booking');
  });

  console.log('\n[Cancellation endpoint with in-memory database]');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = express();
  app.use(express.json());
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));

  await Settings.create({
    type: 'global',
    visitedCharges: 149,
    cancellationPenalty: 149,
    serviceGstPercentage: 18,
    partsGstPercentage: 18
  });
  invalidateBookingConfigCache();

  const user = await User.create({
    name: 'Customer One',
    email: 'cust1@example.com',
    phone: '9988776655',
    wallet: { balance: 0, penalty: 0 }
  });
  const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };

  const makeBooking = async (overrides = {}) => {
    return Booking.create({
      bookingNumber: `BK_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId: user._id,
      vendorId: new mongoose.Types.ObjectId(),
      categoryId: new mongoose.Types.ObjectId(),
      serviceId: new mongoose.Types.ObjectId(),
      serviceName: 'AC Repair',
      serviceCategory: 'AC',
      status: BOOKING_STATUS.JOURNEY_STARTED,
      paymentStatus: PAYMENT_STATUS.PENDING,
      paymentMethod: 'online',
      bookingType: 'scheduled',
      basePrice: 500,
      visitingCharges: 149,
      tax: 90,
      finalAmount: 739,
      journeyStartedAt: new Date(),
      address: { addressLine1: '123 Main St', city: 'Indore', state: 'MP', pincode: '452001' },
      scheduledDate: new Date(Date.now() + 86400e3),
      scheduledTime: '10:00',
      timeSlot: { start: '10:00', end: '11:00' },
      ...overrides
    });
  };

  await it('User cancels having paid advance > 149 (e.g. 300): refunds excess, penalty remains 0, feeCovered is true', async () => {
    await User.updateOne({ _id: user._id }, { $set: { 'wallet.balance': 0, 'wallet.penalty': 0 } });
    const b = await makeBooking({
      advancePayment: { status: 'paid', paidAmount: 300, paymentMethod: 'online' }
    });

    const res = await request(app)
      .post(`/api/users/bookings/${b._id}/cancel`)
      .set(userAuth)
      .send({ cancellationReason: 'Plans changed' });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.success, true);

    const updatedUser = await User.findById(user._id);
    close(updatedUser.wallet.balance, 151, 'user received 300 - 149 = 151 refund');
    assert.strictEqual(updatedUser.wallet.penalty, 0, 'no penalty added when fee is covered');

    const updatedBooking = await Booking.findById(b._id);
    assert.strictEqual(updatedBooking.status, BOOKING_STATUS.CANCELLED);
    close(updatedBooking.refundedAmount, 151, 'booking recorded 151 refund');
    assert.strictEqual(updatedBooking.feeCovered, true, 'booking records feeCovered = true');

    const totals = computeBookingTotals(updatedBooking.toObject());
    assert.strictEqual(totals.due, 0, 'due must be 0');
  });

  await it('User cancels having paid advance = 149: refunds 0, penalty remains 0, marked fee_settled', async () => {
    await User.updateOne({ _id: user._id }, { $set: { 'wallet.balance': 0, 'wallet.penalty': 0 } });
    const b = await makeBooking({
      advancePayment: { status: 'paid', paidAmount: 149, paymentMethod: 'online' }
    });

    const res = await request(app)
      .post(`/api/users/bookings/${b._id}/cancel`)
      .set(userAuth)
      .send({ cancellationReason: 'Plans changed' });

    assert.strictEqual(res.status, 200, res.body.message);
    assert.strictEqual(res.body.success, true);

    const updatedUser = await User.findById(user._id);
    close(updatedUser.wallet.balance, 0, 'no excess to refund');
    assert.strictEqual(updatedUser.wallet.penalty, 0, 'penalty remains 0');

    const updatedBooking = await Booking.findById(b._id);
    assert.strictEqual(updatedBooking.status, BOOKING_STATUS.CANCELLED);
    assert.strictEqual(updatedBooking.feeCovered, true, 'booking records feeCovered = true');
    assert.strictEqual(updatedBooking.paymentStatus, 'fee_settled', 'paymentStatus is fee_settled');

    const totals = computeBookingTotals(updatedBooking.toObject());
    assert.strictEqual(totals.due, 0, 'due must be 0');
  });

  await it('User cancels unpaid COD booking: fee added to penalty for next booking', async () => {
    await User.updateOne({ _id: user._id }, { $set: { 'wallet.balance': 0, 'wallet.penalty': 0 } });
    const b = await makeBooking({
      paymentMethod: 'cash',
      paymentStatus: PAYMENT_STATUS.PENDING
    });

    const res = await request(app)
      .post(`/api/users/bookings/${b._id}/cancel`)
      .set(userAuth)
      .send({ cancellationReason: 'Not needed' });

    assert.strictEqual(res.status, 200, res.body.message);

    const updatedUser = await User.findById(user._id);
    close(updatedUser.wallet.penalty, 149, 'penalty recorded for next booking');

    const updatedBooking = await Booking.findById(b._id);
    assert.strictEqual(updatedBooking.status, BOOKING_STATUS.CANCELLED);
    assert.strictEqual(updatedBooking.feeCovered, false, 'fee was not covered');

    const totals = computeBookingTotals(updatedBooking.toObject());
    assert.strictEqual(totals.due, 0, 'due must still be 0 on cancelled booking');
  });

  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
