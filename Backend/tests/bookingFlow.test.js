/**
 * User Booking Flow Test Suite
 * Cart -> checkout (create booking) -> list/detail -> reschedule -> cancel.
 *
 * Runs against an in-memory MongoDB and a minimal Express app that mounts only
 * the user cart and booking routes, so it never touches the real database.
 * Needs a mongod binary: set MONGOMS_SYSTEM_BINARY if one is not downloaded.
 * Run: node Backend/tests/bookingFlow.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'booking-flow-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'booking-flow-test-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Category = require('../models/Category');
const UserService = require('../models/UserService');
const Booking = require('../models/Booking');
const Cart = require('../models/Cart');
const Worker = require('../models/Worker');
const BookingRequest = require('../models/BookingRequest');
const { generateAccessToken } = require('../utils/tokenService');

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

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/user-routes/cart.routes'));
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  return app;
};

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const checkoutPayload = (serviceId, overrides = {}) => ({
  serviceId: String(serviceId),
  address: {
    type: 'home',
    addressLine1: '12 MG Road',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452001'
  },
  scheduledDate: tomorrow(),
  scheduledTime: '10:00 AM - 12:00 PM',
  timeSlot: { start: '10:00', end: '12:00' },
  paymentMethod: 'cash',
  bookingType: 'scheduled',
  ...overrides
});

(async () => {
  console.log('\n--- Testing user booking flow (cart -> checkout -> manage) ---');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = buildApp();
  // One server for the whole run: a fresh server on a random port per request can land on a port another program just took
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    const user = await User.create({ name: 'Flow Tester', phone: '9000000001' });
    const token = generateAccessToken({ userId: user._id.toString(), role: 'USER' });
    const auth = { Authorization: `Bearer ${token}` };

    const category = await Category.create({ title: 'Electrician', slug: 'electrician-flow-test' });
    const service = await UserService.create({
      title: 'Fan Repair',
      categoryId: category._id,
      brandId: new mongoose.Types.ObjectId(),
      basePrice: 400,
      status: 'active'
    });
    const inactive = await UserService.create({
      title: 'Retired Service',
      categoryId: category._id,
      brandId: new mongoose.Types.ObjectId(),
      basePrice: 400,
      status: 'inactive'
    });

    console.log('\n[Auth]');
    await it('rejects checkout without a token', async () => {
      const res = await request(server).post('/api/users/bookings').send(checkoutPayload(service._id));
      assert.strictEqual(res.status, 401);
    });

    console.log('\n[Cart]');
    let cartItemId;
    await it('adds a service to the cart', async () => {
      const res = await request(server).post('/api/users/cart').set(auth).send({
        serviceId: String(service._id),
        title: 'Fan Repair',
        category: 'Electrician',
        categoryId: String(category._id),
        price: 400,
        unitPrice: 400,
        serviceCount: 1
      });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.data.length, 1);
      cartItemId = res.body.data[0]._id;
    });

    await it('adding the same service again merges into one line with quantity 2', async () => {
      const res = await request(server).post('/api/users/cart').set(auth).send({
        serviceId: String(service._id),
        title: 'Fan Repair',
        category: 'Electrician',
        price: 400,
        unitPrice: 400,
        serviceCount: 1
      });
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].serviceCount, 2);
      assert.strictEqual(res.body.data[0].price, 800);
    });

    await it('updating quantity recalculates the line price', async () => {
      const res = await request(server).put(`/api/users/cart/${cartItemId}`).set(auth).send({ serviceCount: 3 });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data[0].price, 1200);
    });

    await it('rejects adding a service id that does not exist', async () => {
      const res = await request(server).post('/api/users/cart').set(auth).send({
        serviceId: String(new mongoose.Types.ObjectId()),
        title: 'Ghost',
        category: 'Electrician',
        price: 1
      });
      assert.strictEqual(res.status, 404);
    });

    console.log('\n[Checkout validation]');
    await it('rejects a malformed service id', async () => {
      const res = await request(server).post('/api/users/bookings').set(auth).send(checkoutPayload('not-an-id'));
      assert.strictEqual(res.status, 400);
    });

    await it('rejects an address missing pincode', async () => {
      const payload = checkoutPayload(service._id);
      delete payload.address.pincode;
      const res = await request(server).post('/api/users/bookings').set(auth).send(payload);
      assert.strictEqual(res.status, 400);
    });

    await it('rejects a missing time slot', async () => {
      const payload = checkoutPayload(service._id);
      delete payload.timeSlot;
      const res = await request(server).post('/api/users/bookings').set(auth).send(payload);
      assert.strictEqual(res.status, 400);
    });

    await it('returns 404 for an unknown service', async () => {
      const res = await request(server).post('/api/users/bookings').set(auth)
        .send(checkoutPayload(new mongoose.Types.ObjectId()));
      assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    });

    await it('refuses to book an inactive service', async () => {
      const res = await request(server).post('/api/users/bookings').set(auth).send(checkoutPayload(inactive._id));
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      assert.strictEqual(res.body.code, 'SERVICE_UNAVAILABLE');
    });

    console.log('\n[Checkout: no professional nearby]');
    // No worker exists yet, so the search finds nobody. The booking is still
    // accepted (201, noWorkersFound) and then waits in the admin queue for a manual assignment.
    await it('accepts a booking with coordinates when no zones are set up and reports noWorkersFound', async () => {
      const payload = checkoutPayload(service._id);
      payload.address.lat = 22.7196;
      payload.address.lng = 75.8577;
      const res = await request(server).post('/api/users/bookings').set(auth).send(payload);
      assert.strictEqual(res.status, 201, `${res.status} ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.bookingNumber);
      assert.strictEqual(res.body.noWorkersFound, true);
    });

    await it('accepts a booking for an address without coordinates (city fallback)', async () => {
      const res = await request(server).post('/api/users/bookings').set(auth).send(checkoutPayload(service._id));
      assert.strictEqual(res.status, 201, `${res.status} ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.noWorkersFound, true);
    });

    await it('sends a booking nobody can take to the admin queue instead of cancelling it', async () => {
      await wait(500); // dispatch runs after the response
      const bookings = await Booking.find({ userId: user._id });
      assert.strictEqual(bookings.length, 2);
      assert.ok(bookings.every((b) => b.status === 'searching' && b.awaitingAdmin === true),
        bookings.map((b) => `${b.status}/${b.awaitingAdmin}`).join(','));
      assert.ok(bookings.every((b) => b.adminQueueReason === 'no_worker_nearby'));
    });

    console.log('\n[Checkout: professional nearby]');
    // Raw insert: the Worker model requires KYC documents irrelevant to dispatch.
    const worker = (await Worker.collection.insertOne({
      name: 'Nearby Electrician',
      email: 'worker@example.com',
      phone: '9000000002',
      approvalStatus: 'approved',
      isActive: true,
      isOnline: true,
      service: ['Fan Repair'],
      categories: ['Electrician'],
      address: { city: 'Indore', lat: 22.72, lng: 75.86 },
      location: { lat: 22.72, lng: 75.86 },
      // Real partners have a stored map position (saved from their address / live location). Without it the
      // distance search can only find them while MongoDB has not yet finished building its geo index, which
      // made this test pass or fail depending on timing.
      geoLocation: { type: 'Point', coordinates: [75.86, 22.72] },
      wallet: { dues: 0, cashLimit: 1000 }
    })).insertedId;

    let bookingId;
    await it('creates a booking and finds the nearby professional', async () => {
      const payload = checkoutPayload(service._id);
      payload.address.lat = 22.7196;
      payload.address.lng = 75.8577;
      const res = await request(server).post('/api/users/bookings').set(auth).send(payload);
      assert.strictEqual(res.status, 201, `${res.status} ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.noWorkersFound, false);
      assert.strictEqual(res.body.search.notifiedCount, 1);
      assert.strictEqual(res.body.data.status, 'searching');
      bookingId = res.body.data._id;
    });

    await it('sends the booking request to that professional and keeps the booking open', async () => {
      await wait(500); // dispatch runs after the response
      const requests = await BookingRequest.find({ bookingId });
      assert.strictEqual(requests.length, 1);
      assert.strictEqual(String(requests[0].vendorId), String(worker));
      const b = await Booking.findById(bookingId);
      assert.strictEqual(b.status, 'searching');
    });

    await it('clears the cart after a successful booking', async () => {
      const cart = await Cart.findOne({ userId: user._id });
      assert.strictEqual(cart.items.length, 0);
    });

    console.log('\n[Manage booking]');
    await it('lists the booking', async () => {
      const res = await request(server).get('/api/users/bookings').set(auth);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.data.length >= 1);
    });

    await it('returns booking details', async () => {
      const res = await request(server).get(`/api/users/bookings/${bookingId}`).set(auth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(String(res.body.data._id), String(bookingId));
    });

    await it('reschedules the booking', async () => {
      const res = await request(server).put(`/api/users/bookings/${bookingId}/reschedule`).set(auth).send({
        scheduledDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        scheduledTime: '2:00 PM - 4:00 PM',
        timeSlot: { start: '14:00', end: '16:00' }
      });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    });

    await it('cancels the booking', async () => {
      const res = await request(server).post(`/api/users/bookings/${bookingId}/cancel`).set(auth)
        .send({ cancellationReason: 'Changed my mind' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const b = await Booking.findById(bookingId);
      assert.strictEqual(b.status, 'cancelled');
    });

    await it('refuses to cancel twice', async () => {
      const res = await request(server).post(`/api/users/bookings/${bookingId}/cancel`).set(auth).send({});
      assert.strictEqual(res.status, 400);
    });

    await it('refuses to reschedule a cancelled booking', async () => {
      const res = await request(server).put(`/api/users/bookings/${bookingId}/reschedule`).set(auth).send({
        scheduledDate: tomorrow(),
        scheduledTime: '10:00 AM - 12:00 PM',
        timeSlot: { start: '10:00', end: '12:00' }
      });
      assert.strictEqual(res.status, 400);
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
