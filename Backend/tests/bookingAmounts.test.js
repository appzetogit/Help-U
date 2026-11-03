/**
 * The running total of a booking, as the customer, the professional and the admin see it: repair services the
 * customer adds, money paid before the final bill (an advance, or paying online up front), and the balance due.
 * In-memory MongoDB. Run: node tests/bookingAmounts.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'amounts-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'amounts-test-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Admin = require('../models/Admin');
const Worker = require('../models/Worker');
const Category = require('../models/Category');
const UserService = require('../models/UserService');
const Booking = require('../models/Booking');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { computeBookingTotals } = require('../utils/bookingTotals');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg || ''} expected ${b}, got ${a}`);

(async () => {
  console.log('\n--- Testing booking amounts ---');

  console.log('\n[The calculation on its own]');
  await it('a plain booking: total is what it cost, nothing paid, all due', () => {
    const t = computeBookingTotals({ basePrice: 500, discount: 0, tax: 90, visitingCharges: 149, finalAmount: 739, paymentStatus: 'pending' });
    close(t.total, 739); close(t.paid, 0); close(t.due, 739); assert.strictEqual(t.estimated, false);
  });
  await it('repair services are priced with GST and added before a bill exists', () => {
    const t = computeBookingTotals({ basePrice: 500, tax: 90, visitingCharges: 149, finalAmount: 739, customerAddedServices: [{ title: 'Compressor', unitPrice: 300, quantity: 2 }] });
    close(t.lines.repair[0].base, 600); close(t.lines.repair[0].gst, 108); close(t.total, 1447); assert.strictEqual(t.estimated, true);
  });
  await it('a free-text "other problem" has no price yet: flagged, not added', () => {
    const t = computeBookingTotals({ basePrice: 500, tax: 90, visitingCharges: 149, finalAmount: 739, customerAddedServices: [{ isOther: true, title: 'Other problem', unitPrice: 0, quantity: 1 }] });
    close(t.total, 739); assert.strictEqual(t.unpricedRepairs, 1); assert.strictEqual(t.estimated, true);
  });
  await it('an advance reduces what is due', () => {
    const t = computeBookingTotals({ basePrice: 500, tax: 90, visitingCharges: 149, finalAmount: 739, advancePayment: { status: 'paid', paidAmount: 300 } });
    close(t.paid, 300); close(t.due, 439);
  });
  await it('paid online up front, then a repair is added: only the repair is due', () => {
    const t = computeBookingTotals({ basePrice: 500, tax: 90, visitingCharges: 149, finalAmount: 739, paymentStatus: 'success', customerAddedServices: [{ title: 'X', unitPrice: 300, quantity: 2 }] });
    close(t.prepaid, 739); close(t.total, 1447); close(t.due, 708);
  });
  await it('the lines add up to the total (including a professional\'s additions on a sent bill)', () => {
    const t = computeBookingTotals({ basePrice: 500, tax: 90, visitingCharges: 149, finalAmount: 1801, vendorBillId: 'b', billFinalizedAt: new Date(), customerAddedServices: [{ title: 'X', unitPrice: 300, quantity: 2 }] });
    const l = t.lines;
    close(l.service + l.addOns + l.emergency - l.discount + l.repair.reduce((s, r) => s + r.base, 0) + l.visiting + l.penalty + l.gst + l.additional, t.total);
    assert.ok(l.additional > 0, 'the professional\'s own work shows as an addition');
  });

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  app.use('/api/workers/bookings', require('../routes/worker-routes/booking.routes'));
  app.use('/api/workers', require('../routes/worker-routes/workerBill.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingManagement.routes'));
  app.use('/api/users', require('../routes/user-routes/profile.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    await Settings.create({ type: 'global', dispatchMode: 'distance', serviceGstPercentage: 18, partsGstPercentage: 18, visitedCharges: 149 });
    invalidateBookingConfigCache();
    const user = await User.create({ name: 'Amount Customer', phone: '9000000091' });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };
    const admin = await Admin.create({ name: 'Root', email: 'root-amt@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };
    const workerId = (await Worker.collection.insertOne({
      name: 'Pro', phone: '9100000091', email: 'pro91@x.com', approvalStatus: 'approved', isActive: true, wallet: { dues: 0, cashLimit: 100000 }
    })).insertedId;
    const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(workerId), role: 'WORKER' })}` };
    const category = await Category.create({ title: 'Cooling', slug: 'cooling-amounts-test' });
    const service = await UserService.create({
      title: 'Inspection', categoryId: category._id, brandId: new mongoose.Types.ObjectId(), basePrice: 500, status: 'active'
    });

    const REPAIR = [{ serviceId: new mongoose.Types.ObjectId(), title: 'Compressor repair', unitPrice: 300, quantity: 2, isOther: false }];
    const makeBooking = async (set = {}) => {
      const res = await request(server).post('/api/users/bookings').set(userAuth).send({
        serviceId: String(service._id),
        address: { type: 'home', addressLine1: '1 Main', city: 'Indore', state: 'MP', pincode: '452001', lat: 22.7, lng: 75.85 },
        scheduledDate: daysFromNow(3).toISOString(), scheduledTime: '10:00 AM - 12:00 PM', timeSlot: { start: '10:00', end: '12:00' },
        paymentMethod: 'pay_at_home', bookingType: 'scheduled'
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      await wait(350);
      const id = res.body.data._id;
      await Booking.updateOne({ _id: id }, { $set: { status: 'work_done', vendorId: workerId, ...set } });
      return id;
    };
    const asCustomer = async (id) => (await request(server).get(`/api/users/bookings/${id}`).set(userAuth)).body.data;
    const asWorker = async (id) => (await request(server).get(`/api/workers/bookings/${id}`).set(workerAuth)).body.data;
    const asAdmin = async (id) => (await request(server).get(`/api/admin/bookings/${id}`).set(adminAuth)).body.data;
    const buildBill = (id, send) => request(server).post(`/api/workers/bookings/${id}/bill`).set(workerAuth).send({
      services: [{ name: 'Gas refill', price: 200, quantity: 1 }], parts: [{ name: 'Pipe', price: 100, quantity: 1 }], transportCharges: 0, send
    });

    console.log('\n[A repair service the customer adds]');
    await it('everyone sees the new total before any bill: customer, professional and admin', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR });
      for (const who of [asCustomer, asWorker, asAdmin]) {
        const b = await who(id);
        assert.ok(b.totals, 'has totals');
        close(b.totals.total, 1447, 'total'); assert.strictEqual(b.totals.estimated, true);
        assert.strictEqual(b.totals.lines.repair.length, 1);
      }
    });

    await it('an advance the customer paid is deducted from what is due', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR, advancePayment: { status: 'paid', requestedAmount: 300, paidAmount: 300 } });
      const t = (await asCustomer(id)).totals;
      close(t.total, 1447); close(t.paid, 300); close(t.due, 1147);
    });

    await it('while the bill is only a draft the customer still sees the estimate; the professional sees the bill', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR });
      const bill = await buildBill(id, false);
      assert.strictEqual(bill.status, 200, JSON.stringify(bill.body));
      close((await asWorker(id)).totals.total, 1801, 'professional');
      close((await asCustomer(id)).totals.total, 1447, 'customer');
    });

    await it('once the bill is sent, both see the bill total, and it matches what is due', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR });
      await buildBill(id, true);
      const b = await asCustomer(id);
      close(b.totals.total, 1801); close(b.totals.due, 1801); close(b.userPayableAmount, 1801);
      close((await asWorker(id)).totals.due, 1801);
    });

    console.log('\n[Paid online up front, then the bill grows]');
    await it('only the difference is asked for, and the booking is no longer marked fully paid', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR, paymentStatus: 'success', paymentMethod: 'online' });
      const before = (await asCustomer(id)).totals;
      close(before.prepaid, 739); close(before.due, 708);
      await buildBill(id, true);
      const doc = await Booking.findById(id).lean();
      close(doc.prepaidAmount, 739, 'prepaid is remembered');
      close(doc.userPayableAmount, 1062, 'balance due');
      assert.strictEqual(doc.paymentStatus, 'pending', 'a balance is owed, so not "paid"');
      const t = (await asCustomer(id)).totals;
      close(t.total, 1801); close(t.paid, 739); close(t.due, 1062);
      close((await asWorker(id)).totals.due, 1062, 'the professional collects only the balance');
    });

    await it('a second save of the bill keeps the same prepaid amount (no double counting)', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR, paymentStatus: 'success', paymentMethod: 'online' });
      await buildBill(id, false);
      await buildBill(id, true);
      const doc = await Booking.findById(id).lean();
      close(doc.prepaidAmount, 739); close(doc.userPayableAmount, 1062);
    });

    await it('once the balance is paid the booking is fully paid with nothing due', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR, paymentStatus: 'success', paymentMethod: 'online' });
      await buildBill(id, true);
      await Booking.updateOne({ _id: id }, { $set: { paymentStatus: 'success' } }); // the online payment of the balance verified
      const t = (await asCustomer(id)).totals;
      assert.strictEqual(t.paidInFull, true); close(t.due, 0); close(t.paid, t.total);
    });

    await it('a prepaid booking whose bill stays the same owes nothing more and stays paid', async () => {
      const id = await makeBooking({ paymentStatus: 'success', paymentMethod: 'online' });
      const res = await request(server).post(`/api/workers/bookings/${id}/bill`).set(workerAuth).send({ services: [], parts: [], transportCharges: 0, send: true });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const doc = await Booking.findById(id).lean();
      close(doc.userPayableAmount, 0); assert.strictEqual(doc.paymentStatus, 'success');
    });

    await it('an unpaid booking is unaffected: the whole bill is due', async () => {
      const id = await makeBooking({ customerAddedServices: REPAIR });
      await buildBill(id, true);
      const doc = await Booking.findById(id).lean();
      close(doc.prepaidAmount || 0, 0); close(doc.userPayableAmount, 1801); assert.strictEqual(doc.paymentStatus, 'pending');
    });

    console.log('\n[A cancellation fee owed from an earlier booking]');
    await it('checkout tells the customer about it, so the total they see matches what they are charged', async () => {
      await User.updateOne({ _id: user._id }, { $set: { 'wallet.penalty': 149 } });
      const res = await request(server).get('/api/users/checkout-data').set(userAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.pendingPenalty, 149);
      // and the booking really does add it
      const id = await makeBooking({ status: 'confirmed' });
      const b = await Booking.findById(id).lean();
      close(b.penalty, 149); close(b.finalAmount, 739 + 149, 'the booking bill includes the fee');
      const totals = (await asCustomer(id)).totals;
      close(totals.lines.penalty, 149); close(totals.total, 888);
      await User.updateOne({ _id: user._id }, { $set: { 'wallet.penalty': 0 } });
      assert.strictEqual((await request(server).get('/api/users/checkout-data').set(userAuth)).body.pendingPenalty, 0);
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
