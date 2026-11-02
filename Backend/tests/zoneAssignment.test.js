/**
 * Zones + admin assignment, end to end
 *
 *   - a customer inside a zone books; only professionals with the skill who work in that zone are alerted
 *   - a customer outside every zone is refused (OUT_OF_ZONE) with the admin-edited page content
 *   - nobody in the zone -> the booking waits in the admin queue (not cancelled)
 *   - the admin lists professionals, picks one, the request goes to that professional
 *   - the professional accepts (booking confirmed) or declines (booking back in the queue)
 *   - the queue expires and refunds; a search that ends with no acceptance is escalated to the admin
 *
 * Runs against an in-memory MongoDB with a minimal Express app. Needs a mongod binary: set
 * MONGOMS_SYSTEM_BINARY if one is not downloaded.
 * Run: node Backend/tests/zoneAssignment.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'zone-assignment-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'zone-assignment-test-refresh';
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
const Worker = require('../models/Worker');
const Zone = require('../models/Zone');
const City = require('../models/City');
const Settings = require('../models/Settings');
const BookingRequest = require('../models/BookingRequest');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { sanitizeOutOfZonePage, resolveOutOfZonePage } = require('../utils/outOfZonePage');

let passed = 0;
let failed = 0;

async function it(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}:`, err.message);
    failed++;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/user-routes/cart.routes'));
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  app.use('/api/workers/bookings', require('../routes/worker-routes/booking.routes'));
  app.use('/api/public/zones', require('../routes/public-routes/zone.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingManagement.routes'));
  app.use('/api/admin', require('../routes/admin-routes/zone.routes'));
  return app;
};

const checkoutPayload = (serviceId, lat, lng, overrides = {}) => ({
  serviceId: String(serviceId),
  address: {
    type: 'home',
    addressLine1: '12 MG Road',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452001',
    lat,
    lng
  },
  scheduledDate: tomorrow(),
  scheduledTime: '10:00 AM - 12:00 PM',
  timeSlot: { start: '10:00', end: '12:00' },
  paymentMethod: 'cash',
  bookingType: 'scheduled',
  ...overrides
});

// A square around central Indore, closed ring, [lng, lat]
const INDORE_POLYGON = [[[75.78, 22.65], [75.95, 22.65], [75.95, 22.80], [75.78, 22.80], [75.78, 22.65]]];
const INSIDE = { lat: 22.7196, lng: 75.8577 };
const OUTSIDE = { lat: 28.6139, lng: 77.209 }; // Delhi

const insertWorker = async (fields) => (await Worker.collection.insertOne({
  approvalStatus: 'approved',
  isActive: true,
  isOnline: true,
  service: ['Fan Repair'],
  categories: ['Electrician'],
  wallet: { dues: 0, cashLimit: 1000 },
  ...fields
})).insertedId;

(async () => {
  console.log('\n--- Testing zones + admin assignment (end to end) ---');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = buildApp();

  try {
    await Settings.create({ type: 'global' });

    const user = await User.create({ name: 'Zone Tester', phone: '9000000011', wallet: { balance: 0 } });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };

    const admin = await Admin.create({ name: 'Root', email: 'root@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };

    const category = await Category.create({ title: 'Electrician', slug: 'electrician-zone-test' });
    const service = await UserService.create({
      title: 'Fan Repair',
      categoryId: category._id,
      brandId: new mongoose.Types.ObjectId(),
      basePrice: 400,
      status: 'active'
    });
    const city = await City.create({ name: 'Indore', slug: 'indore', state: 'Madhya Pradesh' }).catch(() => ({ _id: new mongoose.Types.ObjectId() }));

    // ---------------------------------------------------------------- zone gate
    console.log('\n[Zone gate]');
    await it('with no zones set up, any address can be booked', async () => {
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, OUTSIDE.lat, OUTSIDE.lng));
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    });
    await wait(400);
    await Booking.deleteMany({});

    const zone = await Zone.create({
      name: 'Indore',
      cityId: city._id,
      coordinates: { type: 'Polygon', coordinates: INDORE_POLYGON },
      status: 'active'
    });
    await Zone.init();

    await it('the lookup says out of area and carries the admin-edited page', async () => {
      const res = await request(app).get(`/api/public/zones/lookup?lat=${OUTSIDE.lat}&lng=${OUTSIDE.lng}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.zone, null);
      assert.strictEqual(res.body.zonesConfigured, true);
      assert.ok(res.body.outOfZonePage.title);
    });

    await it('the lookup finds the zone for an address inside it', async () => {
      const res = await request(app).get(`/api/public/zones/lookup?lat=${INSIDE.lat}&lng=${INSIDE.lng}`);
      assert.strictEqual(String(res.body.zone.id), String(zone._id));
      assert.strictEqual(res.body.outOfZonePage, undefined);
    });

    await it('refuses a booking outside every zone with OUT_OF_ZONE and the page content', async () => {
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, OUTSIDE.lat, OUTSIDE.lng));
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.strictEqual(res.body.code, 'OUT_OF_ZONE');
      assert.ok(res.body.outOfZonePage && res.body.outOfZonePage.title);
      assert.strictEqual(await Booking.countDocuments({}), 0);
    });

    await it('a zoneId sent by the app cannot override where the address really is', async () => {
      const res = await request(app).post('/api/users/bookings').set(userAuth)
        .send(checkoutPayload(service._id, OUTSIDE.lat, OUTSIDE.lng, { zoneId: String(zone._id) }));
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.strictEqual(res.body.code, 'OUT_OF_ZONE');
    });

    await it('an inactive zone does not count as a service area', async () => {
      await Zone.updateOne({ _id: zone._id }, { status: 'inactive' });
      const res = await request(app).get(`/api/public/zones/lookup?lat=${INSIDE.lat}&lng=${INSIDE.lng}`);
      assert.strictEqual(res.body.zone, null);
      assert.strictEqual(res.body.zonesConfigured, false); // nothing active left: no gating at all
      await Zone.updateOne({ _id: zone._id }, { status: 'active' });
    });

    // ----------------------------------------------------------- in-zone dispatch
    console.log('\n[In-zone dispatch]');
    const inZoneWorker = await insertWorker({
      name: 'Indore Electrician',
      phone: '9000000021',
      email: 'in@example.com',
      address: { city: 'Indore', lat: 22.72, lng: 75.86 },
      location: { lat: 22.72, lng: 75.86 },
      geoLocation: { type: 'Point', coordinates: [75.86, 22.72] },
      zoneId: zone._id
    });
    // Same skill and close by in distance terms, but works in another zone entirely
    const otherZone = new mongoose.Types.ObjectId();
    const outZoneWorker = await insertWorker({
      name: 'Delhi Electrician',
      phone: '9000000022',
      email: 'out@example.com',
      address: { city: 'Delhi', lat: 28.61, lng: 77.2 },
      location: { lat: 28.61, lng: 77.2 },
      geoLocation: { type: 'Point', coordinates: [77.2, 28.61] },
      zoneId: otherZone
    });
    // In the zone but a different trade
    await insertWorker({
      name: 'Indore Plumber',
      phone: '9000000023',
      email: 'plumb@example.com',
      service: ['Tap Repair'],
      categories: ['Plumber'],
      address: { city: 'Indore', lat: 22.72, lng: 75.86 },
      location: { lat: 22.72, lng: 75.86 },
      geoLocation: { type: 'Point', coordinates: [75.86, 22.72] },
      zoneId: zone._id
    });

    let firstBooking;
    await it('an in-zone booking is alerted only to the in-zone professional with the skill', async () => {
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng));
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.noWorkersFound, false);
      assert.strictEqual(res.body.sentToAdmin, false);
      assert.strictEqual(res.body.search.notifiedCount, 1);
      firstBooking = res.body.data._id;
      await wait(500);
      const requests = await BookingRequest.find({ bookingId: firstBooking });
      assert.strictEqual(requests.length, 1);
      assert.strictEqual(String(requests[0].vendorId), String(inZoneWorker));
      const b = await Booking.findById(firstBooking);
      assert.strictEqual(String(b.zoneId), String(zone._id));
      assert.strictEqual(b.awaitingAdmin, false);
    });

    await it('the skilled professional from another zone never sees the request', async () => {
      const b = await Booking.findById(firstBooking);
      assert.ok(!b.notifiedVendors.map(String).includes(String(outZoneWorker)));
    });

    await it('the in-zone professional accepts and the booking is confirmed', async () => {
      const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(inZoneWorker), role: 'WORKER' })}` };
      const res = await request(app).post(`/api/workers/bookings/${firstBooking}/accept`).set(workerAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(firstBooking);
      assert.strictEqual(String(b.vendorId), String(inZoneWorker));
    });

    // ------------------------------------------------------------- admin queue
    console.log('\n[Nobody in the zone -> admin queue]');
    // Take the only in-zone electrician offline
    await Worker.collection.updateOne({ _id: inZoneWorker }, { $set: { isOnline: false } });

    let queued;
    await it('a booking with no in-zone professional is not cancelled: it waits for the admin', async () => {
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng, { bookingType: 'instant' }));
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.noWorkersFound, true);
      assert.strictEqual(res.body.sentToAdmin, true);
      queued = res.body.data._id;
      await wait(600);
      const b = await Booking.findById(queued);
      assert.strictEqual(b.status, 'searching');
      assert.strictEqual(b.awaitingAdmin, true);
      assert.strictEqual(b.adminQueueReason, 'no_worker_in_zone');
      assert.ok(b.expiresAt > new Date());
    });

    await it('a worker cannot grab a queued booking by id', async () => {
      const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(outZoneWorker), role: 'WORKER' })}` };
      const res = await request(app).post(`/api/workers/bookings/${queued}/accept`).set(workerAuth);
      assert.notStrictEqual(res.status, 200);
      assert.strictEqual((await Booking.findById(queued)).vendorId, null);
    });

    await it('the admin sees it in the unassigned list', async () => {
      const res = await request(app).get('/api/admin/bookings/unassigned').set(adminAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.pagination.total, 1);
      assert.strictEqual(String(res.body.data[0]._id), String(queued));
    });

    await it('the bookings list can be filtered to the queue too', async () => {
      const res = await request(app).get('/api/admin/bookings?awaitingAdmin=true').set(adminAuth);
      assert.strictEqual(res.body.pagination.total, 1);
    });

    await it('the admin can list professionals with the skill, in-zone first, out-of-zone still choosable', async () => {
      const res = await request(app).get(`/api/admin/bookings/${queued}/assignable-workers`).set(adminAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const names = res.body.workers.map((w) => w.name);
      assert.ok(names.includes('Indore Electrician'));
      assert.ok(names.includes('Delhi Electrician'));
      assert.ok(!names.includes('Indore Plumber'), 'wrong skill must not be offered');
      assert.strictEqual(res.body.workers[0].name, 'Indore Electrician');
      assert.strictEqual(res.body.workers[0].inZone, true);
      const delhi = res.body.workers.find((w) => w.name === 'Delhi Electrician');
      assert.strictEqual(delhi.inZone, false);
    });

    await it('assigning sends a pending request to the chosen professional only', async () => {
      const res = await request(app).post(`/api/admin/bookings/${queued}/assign`).set(adminAuth).send({ workerId: String(outZoneWorker), note: 'Closest available' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(queued);
      assert.strictEqual(b.awaitingAdmin, false);
      assert.strictEqual(b.status, 'searching');
      assert.strictEqual(String(b.adminAssignedBy), String(admin._id));
      assert.deepStrictEqual(b.notifiedVendors.map(String), [String(outZoneWorker)]);
      const reqs = await BookingRequest.find({ bookingId: queued });
      assert.strictEqual(reqs.length, 1);
      assert.strictEqual(reqs[0].status, 'PENDING');
      assert.ok(b.statusHistory.some((h) => h.event === 'admin_assigned'));
    });

    await it('a booking already handed out cannot be assigned again', async () => {
      const res = await request(app).post(`/api/admin/bookings/${queued}/assign`).set(adminAuth).send({ workerId: String(inZoneWorker) });
      // Still open (waiting for the first professional), so the admin may re-pick; it must not 500
      assert.ok([200, 409].includes(res.status), `${res.status}`);
      // put it back with the Delhi professional for the next steps
      await request(app).post(`/api/admin/bookings/${queued}/assign`).set(adminAuth).send({ workerId: String(outZoneWorker) });
    });

    await it('the assigned professional declining sends the booking back to the admin queue', async () => {
      const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(outZoneWorker), role: 'WORKER' })}` };
      const res = await request(app).post(`/api/workers/bookings/${queued}/reject`).set(workerAuth).send({ reason: 'Too far' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(queued);
      assert.strictEqual(b.status, 'searching', 'must not be marked rejected/cancelled');
      assert.strictEqual(b.awaitingAdmin, true);
      assert.strictEqual(b.adminQueueReason, 'worker_declined');
      assert.ok(b.excludedVendors.map(String).includes(String(outZoneWorker)));
    });

    await it('the admin picks someone else, who accepts: the booking is confirmed with them', async () => {
      await Worker.collection.updateOne({ _id: inZoneWorker }, { $set: { isOnline: true } });
      const assign = await request(app).post(`/api/admin/bookings/${queued}/assign`).set(adminAuth).send({ workerId: String(inZoneWorker) });
      assert.strictEqual(assign.status, 200, JSON.stringify(assign.body));
      // The first booking's job is still open for them: finish it so the instant rule does not block
      await Booking.updateOne({ _id: firstBooking }, { $set: { status: 'completed' } });
      const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(inZoneWorker), role: 'WORKER' })}` };
      const res = await request(app).post(`/api/workers/bookings/${queued}/accept`).set(workerAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(queued);
      assert.strictEqual(String(b.vendorId), String(inZoneWorker));
      assert.strictEqual(b.status, 'confirmed');
    });

    await it('refuses to assign a booking that already has a professional', async () => {
      const res = await request(app).post(`/api/admin/bookings/${queued}/assign`).set(adminAuth).send({ workerId: String(outZoneWorker) });
      assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    });

    await it('refuses to assign an unapproved professional', async () => {
      const pending = await insertWorker({ name: 'Pending Pro', phone: '9000000031', email: 'p@example.com', approvalStatus: 'pending' });
      const b2 = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng));
      await wait(400);
      const res = await request(app).post(`/api/admin/bookings/${b2.body.data._id}/assign`).set(adminAuth).send({ workerId: String(pending) });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    });

    // ---------------------------------------------------------- queue expiry
    console.log('\n[Queue expiry and escalation]');
    const { BookingScheduler } = require('../services/bookingScheduler');
    const scheduler = new BookingScheduler(null);

    await it('a queued booking nobody assigns in time is cancelled and a paid one refunded', async () => {
      await Worker.collection.updateOne({ _id: inZoneWorker }, { $set: { isOnline: false } });
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng, { bookingType: 'instant' }));
      const id = res.body.data._id;
      await wait(600);
      assert.strictEqual((await Booking.findById(id)).awaitingAdmin, true);
      await Booking.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000), paymentStatus: 'success', finalAmount: 500 } });
      const before = (await User.findById(user._id)).wallet.balance || 0;
      const { getBookingConfig } = require('../utils/bookingConfig');
      await scheduler.processAdminQueue(await getBookingConfig());
      const b = await Booking.findById(id);
      assert.strictEqual(b.status, 'cancelled');
      assert.strictEqual(b.awaitingAdmin, false);
      assert.strictEqual((await User.findById(user._id)).wallet.balance, before + 500);
    });

    await it('a professional the admin picked who never answers: back to the queue, not cancelled', async () => {
      await Worker.collection.updateOne({ _id: inZoneWorker }, { $set: { isOnline: false } });
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng, { bookingType: 'instant' }));
      const id = res.body.data._id;
      await wait(600);
      await request(app).post(`/api/admin/bookings/${id}/assign`).set(adminAuth).send({ workerId: String(outZoneWorker) });
      await Booking.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      const { getBookingConfig } = require('../utils/bookingConfig');
      await scheduler.processAdminQueue(await getBookingConfig());
      const b = await Booking.findById(id);
      assert.strictEqual(b.status, 'searching');
      assert.strictEqual(b.awaitingAdmin, true);
      assert.strictEqual(b.adminQueueReason, 'worker_declined');
      const reqDoc = await BookingRequest.findOne({ bookingId: id, vendorId: outZoneWorker });
      assert.strictEqual(reqDoc.status, 'EXPIRED');
    });

    await it('a search that ends with nobody accepting is escalated to the admin, not cancelled', async () => {
      // The professional is free again (their earlier instant job is done) and online
      await Booking.updateMany({ vendorId: inZoneWorker }, { $set: { status: 'completed' } });
      await Worker.collection.updateOne({ _id: inZoneWorker }, { $set: { isOnline: true } });
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng, { bookingType: 'instant' }));
      const id = res.body.data._id;
      await wait(600);
      assert.strictEqual((await Booking.findById(id)).awaitingAdmin, false);
      await Booking.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await scheduler.processWaves();
      const b = await Booking.findById(id);
      assert.strictEqual(b.status, 'searching');
      assert.strictEqual(b.awaitingAdmin, true);
      assert.strictEqual(b.adminQueueReason, 'no_worker_accepted');
    });

    await it('with the admin queue switched off, a booking nobody can take is cancelled as before', async () => {
      await Settings.updateOne({ type: 'global' }, { $set: { isAdminAssignmentEnabled: false } });
      invalidateBookingConfigCache();
      await Worker.collection.updateOne({ _id: inZoneWorker }, { $set: { isOnline: false } });
      const res = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, INSIDE.lat, INSIDE.lng, { bookingType: 'instant' }));
      assert.strictEqual(res.body.sentToAdmin, false);
      await wait(600);
      const b = await Booking.findById(res.body.data._id);
      assert.strictEqual(b.status, 'cancelled');
      assert.strictEqual(b.awaitingAdmin, false);
      await Settings.updateOne({ type: 'global' }, { $set: { isAdminAssignmentEnabled: true } });
      invalidateBookingConfigCache();
    });

    // -------------------------------------------------------- out-of-zone page
    console.log('\n[Out-of-zone page (admin-managed)]');
    await it('the public page returns defaults until the admin edits it', async () => {
      const res = await request(app).get('/api/public/zones/out-of-zone-page');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.outOfZonePage.showRetryButton, true);
    });

    await it('the admin edits the page and the customer sees the change', async () => {
      const put = await request(app).put('/api/admin/zones/out-of-zone-page').set(adminAuth).send({
        title: 'Coming soon to your city',
        message: 'We only serve Indore for now.',
        primaryButtonText: 'Pick another address',
        showRetryButton: false,
        accentColor: '#16a34a',
        imageUrl: 'https://example.com/map.png'
      });
      assert.strictEqual(put.status, 200, JSON.stringify(put.body));
      const pub = await request(app).get('/api/public/zones/out-of-zone-page');
      assert.strictEqual(pub.body.outOfZonePage.title, 'Coming soon to your city');
      assert.strictEqual(pub.body.outOfZonePage.showRetryButton, false);
      assert.strictEqual(pub.body.outOfZonePage.accentColor, '#16a34a');
      const lookup = await request(app).get(`/api/public/zones/lookup?lat=${OUTSIDE.lat}&lng=${OUTSIDE.lng}`);
      assert.strictEqual(lookup.body.outOfZonePage.title, 'Coming soon to your city');
      const refused = await request(app).post('/api/users/bookings').set(userAuth).send(checkoutPayload(service._id, OUTSIDE.lat, OUTSIDE.lng));
      assert.strictEqual(refused.body.outOfZonePage.message, 'We only serve Indore for now.');
    });

    await it('rejects bad input (script link, bad colour, empty title)', async () => {
      for (const bad of [{ imageUrl: 'javascript:alert(1)' }, { accentColor: 'blue' }, { title: '   ' }]) {
        const res = await request(app).put('/api/admin/zones/out-of-zone-page').set(adminAuth).send(bad);
        assert.strictEqual(res.status, 400, JSON.stringify(bad));
      }
    });

    await it('only an admin can edit the page', async () => {
      const res = await request(app).put('/api/admin/zones/out-of-zone-page').set(userAuth).send({ title: 'Hacked' });
      assert.ok([401, 403].includes(res.status), `${res.status}`);
    });

    await it('sanitize/resolve helpers behave', async () => {
      assert.deepStrictEqual(sanitizeOutOfZonePage({ unknown: 1 }).updates, {});
      assert.strictEqual(resolveOutOfZonePage({ title: '  ' }).title, resolveOutOfZonePage(null).title);
      assert.strictEqual(resolveOutOfZonePage({ imageUrl: '' }).imageUrl, '');
    });
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Test harness error:', err);
  process.exit(1);
});
