/**
 * Recurring bookings end to end: a customer books with a repeat, a plan is created, the runner books
 * the later visits when they come due, and pause / cancel / limits behave. In-memory MongoDB.
 * Run: node tests/recurringBooking.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'recurring-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'recurring-test-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Admin = require('../models/Admin');
const Category = require('../models/Category');
const UserService = require('../models/UserService');
const Booking = require('../models/Booking');
const Settings = require('../models/Settings');
const RecurringBooking = require('../models/RecurringBooking');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { runDueRecurringBookings } = require('../services/recurringBookingService');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  app.use('/api/users/recurring-bookings', require('../routes/user-routes/recurring.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingFeatures.routes'));
  return app;
};

const payload = (serviceId, overrides = {}) => ({
  serviceId: String(serviceId),
  address: { type: 'home', addressLine1: '12 MG Road', city: 'Indore', state: 'MP', pincode: '452001', lat: 22.7, lng: 75.85 },
  scheduledDate: daysFromNow(3).toISOString(),
  scheduledTime: '10:00 AM - 12:00 PM',
  timeSlot: { start: '10:00', end: '12:00' },
  paymentMethod: 'pay_at_home',
  bookingType: 'scheduled',
  ...overrides
});

(async () => {
  console.log('\n--- Testing recurring bookings ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const server = require('http').createServer(buildApp()).listen(0, '127.0.0.1');

  try {
    // Distance mode: no zones needed; nobody needs to be nearby for the booking itself to exist.
    await Settings.create({ type: 'global', dispatchMode: 'distance' });
    invalidateBookingConfigCache();
    const user = await User.create({ name: 'Repeat Customer', phone: '9000000051' });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };
    const admin = await Admin.create({ name: 'Root', email: 'root2@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };
    const category = await Category.create({ title: 'Cleaning', slug: 'cleaning-recurring-test' });
    const service = await UserService.create({
      title: 'Home Cleaning', categoryId: category._id, brandId: new mongoose.Types.ObjectId(), basePrice: 500, status: 'active'
    });

    const create = async (recurring, extra = {}) => {
      const res = await request(server).post('/api/users/bookings').set(userAuth).send(payload(service._id, { recurring, ...extra }));
      await wait(400);
      return res;
    };

    let plan; let firstBookingId;

    console.log('\n[Creating a plan]');
    await it('a booking with a weekly repeat creates a plan linked to its first visit', async () => {
      const res = await create({ frequency: 'weekly', occurrences: 3 });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      plan = await RecurringBooking.findOne({ userId: user._id });
      assert.ok(plan, 'a recurring plan exists');
      assert.strictEqual(plan.frequency, 'weekly');
      assert.strictEqual(plan.occurrencesPlanned, 3);
      assert.strictEqual(plan.occurrencesCreated, 1);
      assert.strictEqual(plan.status, 'active');
      firstBookingId = res.body.data._id;
      const b = await Booking.findById(firstBookingId);
      assert.strictEqual(String(b.recurringBookingId), String(plan._id));
      const gapDays = Math.round((plan.nextOccurrenceAt - b.scheduledDate) / 86400000);
      assert.strictEqual(gapDays, 7, `next visit is ${gapDays} days after the first`);
    });

    await it('a repeat with fewer than 2 or more than the maximum visits is refused', async () => {
      assert.strictEqual((await create({ frequency: 'weekly', occurrences: 1 })).status, 400);
      assert.strictEqual((await create({ frequency: 'weekly', occurrences: 500 })).status, 400);
      assert.strictEqual((await create({ frequency: 'daily', occurrences: 3 })).status, 400);
    });

    await it('an instant booking cannot repeat', async () => {
      const res = await create({ frequency: 'weekly', occurrences: 3 }, { bookingType: 'instant' });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    console.log('\n[The runner books later visits]');
    await it('a visit not yet within the lead time is not booked', async () => {
      const before = await Booking.countDocuments({ recurringBookingId: plan._id });
      await runDueRecurringBookings();
      assert.strictEqual(await Booking.countDocuments({ recurringBookingId: plan._id }), before);
    });

    await it('a visit within the lead time is booked automatically, then the plan moves on', async () => {
      await RecurringBooking.updateOne({ _id: plan._id }, { $set: { nextOccurrenceAt: daysFromNow(0.5) } });
      const processed = await runDueRecurringBookings();
      await wait(400);
      assert.strictEqual(processed, 1);
      plan = await RecurringBooking.findById(plan._id);
      assert.strictEqual(plan.occurrencesCreated, 2, `lastError: ${plan.lastError}`);
      assert.strictEqual(plan.bookingIds.length, 2);
      const second = await Booking.findById(plan.bookingIds[1]);
      assert.strictEqual(String(second.recurringBookingId), String(plan._id));
      assert.strictEqual(second.bookingType, 'scheduled');
      assert.strictEqual(second.finalAmount > 0, true);
    });

    await it('the same visit is not booked twice by a second run', async () => {
      const before = await Booking.countDocuments({ recurringBookingId: plan._id });
      await runDueRecurringBookings();
      assert.strictEqual(await Booking.countDocuments({ recurringBookingId: plan._id }), before);
    });

    await it('the last visit completes the plan', async () => {
      await RecurringBooking.updateOne({ _id: plan._id }, { $set: { nextOccurrenceAt: daysFromNow(0.5) } });
      await runDueRecurringBookings();
      await wait(400);
      plan = await RecurringBooking.findById(plan._id);
      assert.strictEqual(plan.occurrencesCreated, 3);
      assert.strictEqual(plan.status, 'completed');
      assert.strictEqual(plan.nextOccurrenceAt, null);
    });

    await it('a missed visit (long overdue) is skipped, not booked late', async () => {
      const res = await create({ frequency: 'weekly', occurrences: 3 });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      const p = await RecurringBooking.findOne({ userId: user._id, status: 'active' });
      await RecurringBooking.updateOne({ _id: p._id }, { $set: { nextOccurrenceAt: daysFromNow(-3) } });
      await runDueRecurringBookings();
      const after = await RecurringBooking.findById(p._id);
      assert.strictEqual(after.occurrencesCreated, 2, 'the skipped visit still counts');
      assert.strictEqual(after.bookingIds.length, 1, 'but no booking was made for it');
      assert.match(after.lastError || '', /skipped/i);
    });

    console.log('\n[Pause, resume, cancel]');
    let managed;
    await it('a paused plan books nothing; resuming moves the next visit out of the past', async () => {
      const res = await create({ frequency: 'weekly', occurrences: 4 });
      assert.strictEqual(res.status, 201);
      managed = (await RecurringBooking.find({ userId: user._id, status: 'active' }).sort({ createdAt: -1 }))[0];
      let r = await request(server).post(`/api/users/recurring-bookings/${managed._id}/pause`).set(userAuth);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      await RecurringBooking.updateOne({ _id: managed._id }, { $set: { nextOccurrenceAt: daysFromNow(0.5) } });
      const before = await Booking.countDocuments({ recurringBookingId: managed._id });
      await runDueRecurringBookings();
      assert.strictEqual(await Booking.countDocuments({ recurringBookingId: managed._id }), before, 'nothing booked while paused');
      await RecurringBooking.updateOne({ _id: managed._id }, { $set: { nextOccurrenceAt: daysFromNow(-10) } });
      r = await request(server).post(`/api/users/recurring-bookings/${managed._id}/resume`).set(userAuth);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const resumed = await RecurringBooking.findById(managed._id);
      assert.ok(resumed.nextOccurrenceAt.getTime() >= Date.now() - 1000, 'next visit is not in the past');
    });

    await it('another customer cannot touch the plan', async () => {
      const other = await User.create({ name: 'Other', phone: '9000000052' });
      const otherAuth = { Authorization: `Bearer ${generateAccessToken({ userId: other._id.toString(), role: 'USER' })}` };
      const r = await request(server).post(`/api/users/recurring-bookings/${managed._id}/cancel`).set(otherAuth);
      assert.strictEqual(r.status, 404);
    });

    await it('cancelling stops further visits and ends the plan', async () => {
      const r = await request(server).post(`/api/users/recurring-bookings/${managed._id}/cancel`).set(userAuth);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      const p = await RecurringBooking.findById(managed._id);
      assert.strictEqual(p.status, 'cancelled');
      assert.strictEqual(p.nextOccurrenceAt, null);
      const again = await request(server).post(`/api/users/recurring-bookings/${managed._id}/pause`).set(userAuth);
      assert.strictEqual(again.status, 400, 'an ended plan cannot be changed');
    });

    console.log('\n[Admin page]');
    await it('the admin list returns plans with counts per status', async () => {
      const r = await request(server).get('/api/admin/recurring-bookings').set(adminAuth);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.ok(r.body.data.length >= 3);
      assert.strictEqual(r.body.stats.cancelled, 1);
      assert.strictEqual(r.body.stats.completed, 1);
      assert.ok(r.body.data[0].userId?.name, 'customer name is populated');
    });

    await it('the admin can filter by status and frequency', async () => {
      const r = await request(server).get('/api/admin/recurring-bookings?status=cancelled&frequency=weekly').set(adminAuth);
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.data.every((p) => p.status === 'cancelled' && p.frequency === 'weekly'));
      assert.strictEqual(r.body.data.length, 1);
    });

    await it('the admin can pause and cancel a customer plan', async () => {
      await create({ frequency: 'monthly', occurrences: 2 });
      const p = (await RecurringBooking.find({ status: 'active' }).sort({ createdAt: -1 }))[0];
      let r = await request(server).post(`/api/admin/recurring-bookings/${p._id}/pause`).set(adminAuth);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      r = await request(server).post(`/api/admin/recurring-bookings/${p._id}/cancel`).set(adminAuth);
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual((await RecurringBooking.findById(p._id)).cancelledBy, 'admin');
    });

    console.log('\n[Switched off]');
    await it('when recurring is switched off, nothing is booked and new repeats are refused', async () => {
      await Settings.updateOne({ type: 'global' }, { $set: { isRecurringEnabled: false } });
      invalidateBookingConfigCache();
      const p = await RecurringBooking.create({
        userId: user._id, serviceId: service._id, serviceName: 'x', frequency: 'weekly', occurrencesPlanned: 3, occurrencesCreated: 1,
        nextOccurrenceAt: daysFromNow(0.2), scheduledTime: '10:00 AM - 12:00 PM', timeSlot: { start: '10:00', end: '12:00' }, bookingTemplate: {}
      });
      assert.strictEqual(await runDueRecurringBookings(), 0);
      assert.strictEqual((await RecurringBooking.findById(p._id)).occurrencesCreated, 1);
      assert.strictEqual((await create({ frequency: 'weekly', occurrences: 3 })).status, 400);
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
