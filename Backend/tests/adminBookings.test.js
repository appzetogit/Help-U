/**
 * Admin bookings: search, status groups and counts, dates, the booking detail, and the notification feed.
 * In-memory MongoDB. Run: node tests/adminBookings.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-bookings-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'admin-bookings-refresh';
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

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

(async () => {
  console.log('\n--- Testing admin bookings ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingManagement.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    await Settings.create({ type: 'global', dispatchMode: 'distance' });
    invalidateBookingConfigCache();
    const admin = await Admin.create({ name: 'Root', email: 'root-ab@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };
    const category = await Category.create({ title: 'Appliances', slug: 'appliances-ab-test' });
    const service = await UserService.create({
      title: 'AC Repair', categoryId: category._id, brandId: new mongoose.Types.ObjectId(), basePrice: 500, status: 'active'
    });
    const workerId = (await Worker.collection.insertOne({
      name: 'Ramesh Kumar', businessName: 'Kumar Cooling', phone: '9111111111', email: 'rk@example.com',
      approvalStatus: 'approved', isActive: true
    })).insertedId;

    const book = async (name, phone, email, { city = 'Indore', date = daysFromNow(3) } = {}) => {
      const customer = await User.create({ name, phone, email });
      const auth = { Authorization: `Bearer ${generateAccessToken({ userId: customer._id.toString(), role: 'USER' })}` };
      const res = await request(server).post('/api/users/bookings').set(auth).send({
        serviceId: String(service._id),
        address: { type: 'home', addressLine1: '12 MG Road', city, state: 'MP', pincode: '452001', lat: 22.7, lng: 75.85 },
        scheduledDate: date.toISOString(), scheduledTime: '10:00 AM - 12:00 PM', timeSlot: { start: '10:00', end: '12:00' },
        paymentMethod: 'pay_at_home', bookingType: 'scheduled'
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      await wait(350);
      return { booking: res.body.data, customer, auth };
    };
    const list = (query) => request(server).get('/api/admin/bookings').set(adminAuth).query(query);

    const alice = await book('Alice Sharma', '9000000001', 'alice@example.com', { city: 'Indore' });
    const bob = await book('Bob Verma', '9000000002', 'bob@example.com', { city: 'Bhopal' });
    const carol = await book('Carol Singh', '9000000003', 'carol@example.com', { city: 'Indore' });
    await Booking.updateOne({ _id: bob.booking._id }, { $set: { vendorId: workerId, status: 'assigned' } });
    await Booking.updateOne({ _id: carol.booking._id }, { $set: { status: 'cancelled' } });

    console.log('\n[Search finds a booking by anything an admin would type]');
    const found = async (q) => (await list({ search: q })).body.data.map((b) => b.bookingNumber);
    const cases = [
      ['the full booking number', () => alice.booking.bookingNumber, [alice]],
      ['part of a booking number', () => alice.booking.bookingNumber.slice(0, 8), [alice, bob, carol]],
      ['the booking id', () => String(alice.booking._id), [alice]],
      ['the service name', () => 'AC Repair', [alice, bob, carol]],
      ['the customer name', () => 'Alice', [alice]],
      ['the customer name in lower case', () => 'bob verma', [bob]],
      ['the customer phone', () => '9000000002', [bob]],
      ['the customer email', () => 'carol@example', [carol]],
      ['the professional name', () => 'Ramesh', [bob]],
      ['the professional business name', () => 'Kumar Cooling', [bob]],
      ['the professional phone', () => '9111111111', [bob]],
      ['the city', () => 'Bhopal', [bob]]
    ];
    for (const [label, term, expected] of cases) {
      await it(`by ${label}`, async () => {
        const got = (await found(term())).sort();
        assert.deepStrictEqual(got, expected.map((x) => x.booking.bookingNumber).sort());
      });
    }
    await it('a search with no match returns nothing', async () => {
      assert.deepStrictEqual(await found('zzzz-no-such-thing'), []);
    });
    await it('special characters in a search are treated as text, not as a pattern', async () => {
      const res = await list({ search: '.*(' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 0);
    });
    await it('search combines with a status filter', async () => {
      const res = await list({ search: 'AC Repair', status: 'cancelled' });
      assert.deepStrictEqual(res.body.data.map((b) => b.bookingNumber), [carol.booking.bookingNumber]);
    });

    console.log('\n[Status groups and counts]');
    await it('a status group matches all its statuses', async () => {
      assert.deepStrictEqual((await list({ status: 'confirmed' })).body.data.map((b) => b.bookingNumber), [bob.booking.bookingNumber]);
      assert.deepStrictEqual((await list({ status: 'cancelled' })).body.data.map((b) => b.bookingNumber), [carol.booking.bookingNumber]);
    });
    await it('a single raw status still works, in any case', async () => {
      assert.strictEqual((await list({ status: 'ASSIGNED' })).body.data.length, 1);
    });
    await it('the counts per group add up, and ignore the status filter but not the search', async () => {
      const all = (await list({})).body.statusCounts;
      assert.strictEqual(all.total, 3);
      assert.strictEqual(all.confirmed, 1);
      assert.strictEqual(all.cancelled, 1);
      assert.strictEqual(all.awaiting + all.confirmed + all.in_progress + all.completed + all.cancelled, 3);
      const filtered = (await list({ status: 'cancelled' })).body.statusCounts;
      assert.strictEqual(filtered.total, 3, 'the status filter does not shrink the cards');
      const searched = (await list({ search: 'Bob' })).body.statusCounts;
      assert.strictEqual(searched.total, 1);
      assert.strictEqual(searched.confirmed, 1);
    });

    console.log('\n[Dates and paging]');
    await it('the end date includes bookings on that whole day', async () => {
      const day = daysFromNow(5);
      await book('Dave Day', '9000000004', 'dave@example.com', { date: day });
      const ymd = day.toISOString().slice(0, 10);
      const res = await list({ startDate: ymd, endDate: ymd });
      assert.strictEqual(res.body.data.length, 1, `got ${res.body.data.length}`);
    });
    await it('paging returns every booking exactly once', async () => {
      const total = (await list({})).body.pagination.total;
      const seen = new Set();
      for (let page = 1; page <= Math.ceil(total / 2); page += 1) {
        (await list({ page, limit: 2 })).body.data.forEach((b) => seen.add(String(b._id)));
      }
      assert.strictEqual(seen.size, total);
    });

    console.log('\n[Booking detail]');
    await it('returns the booking with the customer, professional and timeline', async () => {
      const res = await request(server).get(`/api/admin/bookings/${bob.booking._id}`).set(adminAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = res.body.data;
      assert.strictEqual(b.bookingNumber, bob.booking.bookingNumber);
      assert.strictEqual(b.userId.name, 'Bob Verma');
      assert.strictEqual(b.vendorId.name, 'Ramesh Kumar');
      assert.ok(Array.isArray(b.statusHistory) && b.statusHistory.length >= 1, 'has a status history');
      assert.strictEqual(b.address.city, 'Bhopal');
      assert.ok(Number(b.finalAmount) > 0);
    });
    await it('an unknown or malformed id is a clean 404, not an error', async () => {
      const missing = await request(server).get(`/api/admin/bookings/${new mongoose.Types.ObjectId()}`).set(adminAuth);
      assert.strictEqual(missing.status, 404);
      const bad = await request(server).get('/api/admin/bookings/not-an-id').set(adminAuth);
      assert.strictEqual(bad.status, 404, JSON.stringify(bad.body));
    });
    await it('says what the admin may do: assign only without a professional, cancel only before the work is finished', async () => {
      const unassigned = (await request(server).get(`/api/admin/bookings/${alice.booking._id}`).set(adminAuth)).body.data;
      assert.deepStrictEqual(unassigned.adminActions, { canCancel: true, canAssign: true }, 'a searching booking with nobody on it can be assigned');
      await Booking.updateOne({ _id: alice.booking._id }, { $set: { status: 'confirmed', vendorId: null } });
      const open = (await request(server).get(`/api/admin/bookings/${alice.booking._id}`).set(adminAuth)).body.data;
      assert.deepStrictEqual(open.adminActions, { canCancel: true, canAssign: true });
      const assigned = (await request(server).get(`/api/admin/bookings/${bob.booking._id}`).set(adminAuth)).body.data;
      assert.deepStrictEqual(assigned.adminActions, { canCancel: true, canAssign: false });
      const cancelled = (await request(server).get(`/api/admin/bookings/${carol.booking._id}`).set(adminAuth)).body.data;
      assert.deepStrictEqual(cancelled.adminActions, { canCancel: false, canAssign: false });
      await Booking.updateOne({ _id: bob.booking._id }, { $set: { status: 'work_done' } });
      const done = (await request(server).get(`/api/admin/bookings/${bob.booking._id}`).set(adminAuth)).body.data;
      assert.strictEqual(done.adminActions.canCancel, false, 'finished work cannot be cancelled');
      await Booking.updateOne({ _id: bob.booking._id }, { $set: { status: 'assigned' } });
    });
    await it('every row in the list carries the same actions', async () => {
      const rows = (await list({})).body.data;
      assert.ok(rows.every((r) => r.adminActions && typeof r.adminActions.canCancel === 'boolean'));
    });

    console.log('\n[Notification feed]');
    const feed = (query = {}) => request(server).get('/api/admin/bookings/notifications').set(adminAuth).query(query);
    const dave = await book('Dana Feed', '9000000011', 'dana@example.com');
    await wait(20);

    await it('is a real route (not mistaken for a booking id) and needs an admin', async () => {
      const res = await feed();
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.ok(Array.isArray(res.body.data));
      const anon = await request(server).get('/api/admin/bookings/notifications');
      assert.strictEqual(anon.status, 401);
    });

    await it('shows a new booking with the customer and service', async () => {
      const res = await feed({ type: 'new_booking' });
      const item = res.body.data.find((n) => n.bookingNumber === dave.booking.bookingNumber);
      assert.ok(item, 'the new booking is listed');
      assert.strictEqual(item.title, 'New booking received');
      assert.match(item.message, /Dana Feed/);
      assert.match(item.message, /AC Repair/);
      assert.strictEqual(item.bookingId, String(dave.booking._id));
    });

    await it('shows a cancellation with who did it, and a refund when money went back', async () => {
      await Booking.updateOne({ _id: dave.booking._id }, { $set: { status: 'confirmed', vendorId: null, paymentStatus: 'success', paymentMethod: 'wallet' } });
      const cancelRes = await request(server).post(`/api/users/bookings/${dave.booking._id}/cancel`).set(dave.auth).send({ cancellationReason: 'plans changed' });
      assert.strictEqual(cancelRes.status, 200, JSON.stringify(cancelRes.body));
      await wait(100);
      const cancelled = (await feed({ type: 'cancelled' })).body.data.find((n) => n.bookingNumber === dave.booking.bookingNumber);
      assert.ok(cancelled, 'the cancellation is listed');
      assert.match(cancelled.message, /cancelled by the customer/);
      assert.match(cancelled.message, /plans changed/);
      const refund = (await feed({ type: 'refund' })).body.data.find((n) => n.bookingNumber === dave.booking.bookingNumber);
      assert.ok(refund, 'the refund is listed');
      assert.match(refund.message, /₹/);
    });

    await it('shows a completed booking', async () => {
      await Booking.findOneAndUpdate({ _id: alice.booking._id }, { $set: { status: 'completed' } }, { actor: 'worker' });
      const done = (await feed({ type: 'completed' })).body.data.find((n) => n.bookingNumber === alice.booking.bookingNumber);
      assert.ok(done && done.title === 'Booking completed');
    });

    await it('shows a payment that failed, and bookings waiting for a professional', async () => {
      await Booking.updateOne({ _id: bob.booking._id }, { $set: { paymentStatus: 'failed' } });
      const failed = (await feed({ type: 'payment_failed' })).body.data;
      assert.ok(failed.some((n) => n.bookingNumber === bob.booking.bookingNumber));
      const needs = (await feed({ type: 'needs_assignment' })).body.data;
      assert.ok(needs.length >= 1 && needs.every((n) => n.type === 'needs_assignment'));
    });

    await it('the type filter returns only that type', async () => {
      for (const type of ['new_booking', 'cancelled', 'completed']) {
        const items = (await feed({ type })).body.data;
        assert.ok(items.length >= 1, `some ${type}`);
        assert.ok(items.every((n) => n.type === type), `only ${type}`);
      }
    });

    await it('is newest first, and pages with no repeats', async () => {
      const all = (await feed({ limit: 100 })).body.data;
      assert.ok(all.length >= 6);
      for (let i = 1; i < all.length; i += 1) assert.ok(new Date(all[i - 1].at) >= new Date(all[i].at), 'newest first');
      const seen = [];
      let before;
      for (let guard = 0; guard < 20; guard += 1) {
        const page = (await feed({ limit: 3, before })).body;
        seen.push(...page.data.map((n) => n.id));
        if (!page.hasMore) break;
        before = page.nextBefore;
      }
      assert.strictEqual(new Set(seen).size, seen.length, 'no item appears twice');
      assert.strictEqual(seen.length, all.length, 'paging reaches every item');
    });

    await it('counts unread, and "mark all read" clears it until something new happens', async () => {
      const first = (await feed()).body;
      assert.ok(first.unreadCount > 0, 'unread to start with');
      assert.ok(first.data.some((n) => n.unread));
      const read = await request(server).post('/api/admin/bookings/notifications/read').set(adminAuth);
      assert.strictEqual(read.status, 200);
      const after = (await feed()).body;
      assert.strictEqual(after.unreadCount, 0);
      assert.ok(after.data.every((n) => !n.unread), 'nothing is unread');
      await wait(30);
      await book('Eve After', '9000000012', 'eve@example.com');
      const fresh = (await feed()).body;
      assert.ok(fresh.unreadCount >= 1, 'a booking made after reading is unread');
      assert.ok(fresh.data.some((n) => n.unread && /Eve After/.test(n.message)), 'the new booking is listed as unread');
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
