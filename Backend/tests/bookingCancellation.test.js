/**
 * Cancelling a booking: who can cancel, until when, and that it can never undo a finished job or pay out twice.
 * In-memory MongoDB. Run: node tests/bookingCancellation.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'cancel-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'cancel-test-refresh';
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
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const Worker = require('../models/Worker');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { claimCancellation } = require('../services/bookingCancellation');
const { USER_CANCELLABLE_STATUSES, ADMIN_CANCELLABLE_STATUSES } = require('../utils/constants');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

(async () => {
  console.log('\n--- Testing booking cancellation ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = express();
  app.use(express.json());
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingManagement.routes'));
  app.use('/api/workers/bookings', require('../routes/worker-routes/booking.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    await Settings.create({ type: 'global', dispatchMode: 'distance' });
    invalidateBookingConfigCache();
    const user = await User.create({ name: 'Canceller', phone: '9000000061', wallet: { balance: 0 } });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };
    const category = await Category.create({ title: 'Plumbing', slug: 'plumbing-cancel-test' });
    const service = await UserService.create({
      title: 'Tap Repair', categoryId: category._id, brandId: new mongoose.Types.ObjectId(), basePrice: 500, status: 'active'
    });

    const makeBooking = async (status, extra = {}) => {
      const res = await request(server).post('/api/users/bookings').set(userAuth).send({
        serviceId: String(service._id),
        address: { type: 'home', addressLine1: '1 Main', city: 'Indore', state: 'MP', pincode: '452001', lat: 22.7, lng: 75.85 },
        scheduledDate: daysFromNow(3).toISOString(),
        scheduledTime: '10:00 AM - 12:00 PM',
        timeSlot: { start: '10:00', end: '12:00' },
        paymentMethod: 'pay_at_home',
        bookingType: 'scheduled'
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      await wait(350);
      const id = res.body.data._id;
      await Booking.updateOne({ _id: id }, { $set: { status, ...extra } });
      return id;
    };
    const admin = await Admin.create({ name: 'Root', email: 'root-cancel@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };
    const adminCancel = (id) => request(server).post(`/api/admin/bookings/${id}/cancel`).set(adminAuth).send({ cancellationReason: 'support decision' });
    const workerId = (await Worker.collection.insertOne({
      name: 'Pro', phone: '9100000061', email: 'pro61@x.com', approvalStatus: 'approved', isActive: true, isOnline: true,
      availability: 'AVAILABLE', wallet: { dues: 0, cashLimit: 1000 }
    })).insertedId;
    const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(workerId), role: 'WORKER' })}` };
    const workerSetStatus = (id, status) => request(server).put(`/api/workers/bookings/${id}/status`).set(workerAuth).send({ status });
    const cancel = (id) => request(server).post(`/api/users/bookings/${id}/cancel`).set(userAuth).send({ cancellationReason: 'changed my mind' });
    const wallet = async () => (await User.findById(user._id).lean()).wallet?.balance || 0;
    const statusOf = async (id) => (await Booking.findById(id).lean()).status;

    console.log('\n[Customer: when a cancel is allowed]');
    for (const status of USER_CANCELLABLE_STATUSES.filter((s) => ['confirmed', 'assigned', 'journey_started', 'visited'].includes(s))) {
      await it(`allowed while "${status}"`, async () => {
        const id = await makeBooking(status);
        const res = await cancel(id);
        assert.strictEqual(res.status, 200, JSON.stringify(res.body));
        const b = await Booking.findById(id).lean();
        assert.strictEqual(b.status, 'cancelled');
        assert.strictEqual(b.cancelledBy, 'user');
        assert.ok(b.cancelledAt);
        assert.ok(b.statusHistory.some((h) => h.status === 'cancelled' && h.by === 'user'), 'recorded in the status history');
      });
    }

    console.log('\n[Customer: when a cancel is refused]');
    for (const status of ['in_progress', 'work_done', 'completed', 'cancelled', 'rejected']) {
      await it(`refused once "${status}", and nothing changes`, async () => {
        const id = await makeBooking(status, { paymentStatus: 'success', paymentMethod: 'wallet' });
        const before = await wallet();
        const txBefore = await Transaction.countDocuments({ userId: user._id });
        const res = await cancel(id);
        assert.strictEqual(res.status, 400, JSON.stringify(res.body));
        assert.strictEqual(await statusOf(id), status, 'status untouched');
        assert.strictEqual(await wallet(), before, 'no refund');
        assert.strictEqual(await Transaction.countDocuments({ userId: user._id }), txBefore, 'no transaction');
      });
    }

    await it('the refusal explains why', async () => {
      const done = await makeBooking('work_done');
      assert.match((await cancel(done)).body.message, /finished.*dispute/i);
      const working = await makeBooking('in_progress');
      assert.match((await cancel(working)).body.message, /already started/i);
    });

    console.log('\n[Money is paid back once]');
    await it('a paid booking is refunded in full on a free cancel', async () => {
      const id = await makeBooking('confirmed', { paymentStatus: 'success', paymentMethod: 'wallet', vendorId: null });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const before = await wallet();
      const res = await cancel(id);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(await wallet(), before + amount);
      const b = await Booking.findById(id).lean();
      assert.strictEqual(b.refundedAmount, amount);
      assert.strictEqual(b.paymentStatus, 'refunded');
    });

    await it('two cancels at the same moment: one wins, the refund is paid once', async () => {
      const id = await makeBooking('confirmed', { paymentStatus: 'success', paymentMethod: 'wallet', vendorId: null });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const before = await wallet();
      const [a, b] = await Promise.all([cancel(id), cancel(id)]);
      assert.deepStrictEqual([a.status, b.status].sort(), [200, 400], `got ${a.status} and ${b.status}`);
      assert.strictEqual(await wallet(), before + amount, 'refunded exactly once');
      assert.strictEqual(await Transaction.countDocuments({ bookingId: id, type: 'refund' }), 1);
    });

    console.log('\n[A finished job cannot be undone]');
    await it('a cancel prepared on an old copy cannot overwrite a completed booking', async () => {
      const id = await makeBooking('work_done');
      const stale = await Booking.findById(id); // what a slow request would be holding
      await Booking.updateOne({ _id: id }, { $set: { status: 'completed', completedAt: new Date() } }); // completion lands first
      const claimed = await claimCancellation(stale._id, { allowedStatuses: USER_CANCELLABLE_STATUSES, by: 'user', reason: 'late' });
      assert.strictEqual(claimed, null, 'the claim is refused');
      assert.strictEqual(await statusOf(id), 'completed');
    });

    console.log('\n[A failure part-way can be retried]');
    await it('if the refund step fails the booking is put back, and a retry then works', async () => {
      const id = await makeBooking('confirmed', { paymentStatus: 'success', paymentMethod: 'wallet', vendorId: null });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const before = await wallet();
      const original = User.findById;
      User.findById = () => { throw new Error('simulated database failure'); };
      let res;
      try { res = await cancel(id); } finally { User.findById = original; }
      assert.strictEqual(res.status, 500);
      assert.strictEqual(await statusOf(id), 'confirmed', 'booking restored');
      const b = await Booking.findById(id).lean();
      assert.ok(!b.cancelledAt && !b.cancelledBy, 'cancel markers cleared');
      assert.strictEqual(await wallet(), before, 'no money moved');
      res = await cancel(id);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(await wallet(), before + amount, 'the retry refunds once');
    });

    console.log('\n[Admin]');
    await it('support can cancel while the work is in progress, and the customer is refunded', async () => {
      const id = await makeBooking('in_progress', { paymentStatus: 'success', paymentMethod: 'wallet' });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const before = await wallet();
      const res = await adminCancel(id);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(id).lean();
      assert.strictEqual(b.status, 'cancelled');
      assert.strictEqual(b.cancelledBy, 'admin');
      assert.strictEqual(await wallet(), before + amount);
      assert.strictEqual(b.paymentStatus, 'refunded');
    });

    for (const status of ['work_done', 'completed', 'cancelled']) {
      await it(`support cannot cancel a "${status}" booking, and nothing changes`, async () => {
        const id = await makeBooking(status, { paymentStatus: 'success', paymentMethod: 'wallet' });
        const before = await wallet();
        const res = await adminCancel(id);
        assert.strictEqual(res.status, 400, JSON.stringify(res.body));
        assert.strictEqual(await statusOf(id), status);
        assert.strictEqual(await wallet(), before);
      });
    }

    await it('two admin cancels at once: one wins, the refund is paid once', async () => {
      const id = await makeBooking('assigned', { paymentStatus: 'success', paymentMethod: 'wallet' });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const before = await wallet();
      const [a, b] = await Promise.all([adminCancel(id), adminCancel(id)]);
      assert.deepStrictEqual([a.status, b.status].sort(), [200, 400], `got ${a.status} and ${b.status}`);
      assert.strictEqual(await wallet(), before + amount);
    });

    await it('a customer cancel and an admin cancel at once: one wins, one refund', async () => {
      const id = await makeBooking('confirmed', { paymentStatus: 'success', paymentMethod: 'wallet', vendorId: null });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const before = await wallet();
      const [a, b] = await Promise.all([cancel(id), adminCancel(id)]);
      assert.deepStrictEqual([a.status, b.status].sort(), [200, 400], `got ${a.status} and ${b.status}`);
      assert.strictEqual(await wallet(), before + amount, 'refunded exactly once');
    });

    await it('a failed admin cancel puts the booking back, including its place in the admin queue', async () => {
      const id = await makeBooking('searching', { paymentStatus: 'success', paymentMethod: 'wallet', awaitingAdmin: true });
      const before = await wallet();
      const original = User.findByIdAndUpdate;
      User.findByIdAndUpdate = () => { throw new Error('simulated database failure'); };
      let res;
      try { res = await adminCancel(id); } finally { User.findByIdAndUpdate = original; }
      assert.strictEqual(res.status, 500);
      const b = await Booking.findById(id).lean();
      assert.strictEqual(b.status, 'searching');
      assert.strictEqual(b.awaitingAdmin, true, 'still waiting for an admin');
      assert.ok(!b.cancelledBy, 'cancel markers cleared');
      assert.strictEqual(await wallet(), before);
      assert.strictEqual((await adminCancel(id)).status, 200, 'the retry works');
    });

    console.log('\n[Professional]');
    for (const status of ['visited', 'in_progress', 'work_done']) {
      await it(`a bare "cancelled" status change is refused while "${status}", and nothing changes`, async () => {
        const id = await makeBooking(status, { vendorId: workerId, paymentStatus: 'success', paymentMethod: 'wallet' });
        const before = await wallet();
        const res = await workerSetStatus(id, 'cancelled');
        assert.strictEqual(res.status, 400, JSON.stringify(res.body));
        assert.match(res.body.message, /contact support/i);
        assert.strictEqual(await statusOf(id), status);
        assert.strictEqual(await wallet(), before);
      });
    }

    await it('finishing the job still works normally', async () => {
      const id = await makeBooking('in_progress', { vendorId: workerId });
      const res = await workerSetStatus(id, 'completed');
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(id).lean();
      assert.strictEqual(b.status, 'completed');
      assert.ok(b.completedAt);
      assert.ok(b.statusHistory.some((h) => h.status === 'completed' && h.by), 'recorded in the status history');
    });

    await it('an update based on an old status is refused if the booking was cancelled meanwhile', async () => {
      const id = await makeBooking('visited', { vendorId: workerId, paymentStatus: 'success', paymentMethod: 'wallet' });
      // Simulate the customer's cancel landing between the professional's request loading the booking and saving it
      const originalSave = Booking.prototype.save;
      Booking.prototype.save = async function patchedSave(...args) {
        Booking.prototype.save = originalSave;
        await Booking.updateOne({ _id: this._id }, { $set: { status: 'cancelled', cancelledBy: 'user', cancelledAt: new Date() } });
        return originalSave.apply(this, args);
      };
      let res;
      try { res = await workerSetStatus(id, 'in_progress'); } finally { Booking.prototype.save = originalSave; }
      assert.strictEqual(res.status, 409, JSON.stringify(res.body));
      assert.strictEqual(await statusOf(id), 'cancelled', 'the cancellation stands');
    });

    await it('a customer cancel and a professional status update at once always end consistently', async () => {
      for (let i = 0; i < 4; i += 1) {
        const id = await makeBooking('visited', { vendorId: workerId });
        const [c, w] = await Promise.all([cancel(id), workerSetStatus(id, 'in_progress')]);
        const final = await statusOf(id);
        assert.ok(!(c.status === 200 && w.status === 200), `both succeeded (${c.status}/${w.status})`);
        if (c.status === 200) assert.strictEqual(final, 'cancelled', 'cancelled stays cancelled');
        else assert.strictEqual(final, 'in_progress', 'the customer was refused once the work started');
      }
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
