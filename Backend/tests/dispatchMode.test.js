/**
 * Dispatch mode: ONE rule decides who gets a booking, switchable by the admin.
 *
 *   zone      only professionals in the customer's zone, however far; addresses outside every zone are
 *             refused; the search radius and a professional's own service radius are NOT used
 *   distance  zones are not used at all: radius decides, nothing is refused for being out of a zone
 *
 * Same data under both modes, so any difference seen is the mode. In-memory MongoDB.
 * Run: node Backend/tests/dispatchMode.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'dispatch-mode-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dispatch-mode-test-refresh';
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
const Coupon = require('../models/Coupon');
const Settings = require('../models/Settings');
const BookingRequest = require('../models/BookingRequest');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { validateCoupon, getAvailableCoupons } = require('../services/couponService');

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
  app.use('/api/public/zones', require('../routes/public-routes/zone.routes'));
  app.use('/api/public', require('../routes/public-routes/catalog.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingFeatures.routes'));
  app.use('/api/admin', require('../routes/admin-routes/bookingManagement.routes'));
  return app;
};

const payload = (serviceId, lat, lng, overrides = {}) => ({
  serviceId: String(serviceId),
  address: { type: 'home', addressLine1: '12 MG Road', city: 'Indore', state: 'MP', pincode: '452001', lat, lng },
  scheduledDate: tomorrow(),
  scheduledTime: '10:00 AM - 12:00 PM',
  timeSlot: { start: '10:00', end: '12:00' },
  paymentMethod: 'cash',
  bookingType: 'scheduled',
  ...overrides
});

// Square ~17 x 17 km around Indore (closed ring, [lng, lat])
const POLYGON = [[[75.78, 22.65], [75.95, 22.65], [75.95, 22.80], [75.78, 22.80], [75.78, 22.65]]];
const CUSTOMER_SW = { lat: 22.66, lng: 75.79 }; // south-west corner, inside the zone
const FAR_WORKER_NE = { lat: 22.79, lng: 75.94 }; // north-east corner, inside the zone but ~21 km away
const DELHI = { lat: 28.6139, lng: 77.209 }; // outside every zone

(async () => {
  console.log('\n--- Testing dispatch mode (zone vs distance) ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = buildApp();
  // One server for the whole run: a fresh server on a random port per request can land on a port another program just took
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    await Settings.create({ type: 'global' });
    const user = await User.create({ name: 'Mode Tester', phone: '9000000041' });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };
    const admin = await Admin.create({ name: 'Root', email: 'root@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };

    const category = await Category.create({ title: 'Electrician', slug: 'electrician-mode-test' });
    const service = await UserService.create({
      title: 'Fan Repair', categoryId: category._id, brandId: new mongoose.Types.ObjectId(), basePrice: 400, status: 'active'
    });
    const city = await City.create({ name: 'Indore', slug: 'indore' });
    const zone = await Zone.create({
      name: 'Indore',
      cityId: city._id,
      coordinates: { type: 'Polygon', coordinates: POLYGON },
      status: 'active',
      surgePricing: { enabled: true, multiplier: 2 }
    });
    await Zone.init();

    const insertWorker = async (name, phone, at, extra = {}) => (await Worker.collection.insertOne({
      name, phone, email: `${phone}@x.com`,
      approvalStatus: 'approved', isActive: true, isOnline: true, availability: 'AVAILABLE',
      service: ['Fan Repair'], categories: ['Electrician'],
      address: { city: 'Indore', lat: at.lat, lng: at.lng },
      location: { lat: at.lat, lng: at.lng },
      geoLocation: { type: 'Point', coordinates: [at.lng, at.lat] },
      wallet: { dues: 0, cashLimit: 1000 },
      ...extra
    })).insertedId;

    const farInZone = await insertWorker('Far In Zone', '9100000001', FAR_WORKER_NE);
    const nearOutside = await insertWorker('Delhi Pro', '9100000002', DELHI);

    const setMode = async (mode) => {
      await Settings.updateOne({ type: 'global' }, { $set: { dispatchMode: mode } });
      invalidateBookingConfigCache();
    };
    const book = async (at, overrides) => {
      const res = await request(server).post('/api/users/bookings').set(userAuth).send(payload(service._id, at.lat, at.lng, overrides));
      await wait(450);
      return res;
    };
    const alerted = async (res) => (await BookingRequest.find({ bookingId: res.body.data._id })).map((r) => String(r.vendorId));

    // -------------------------------------------------------------- admin toggle
    console.log('\n[Admin toggle]');
    await it('defaults to zone mode', async () => {
      const res = await request(server).get('/api/admin/booking-config').set(adminAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.config.dispatchMode, 'zone');
    });
    await it('the admin can switch to distance and back, and a bad value is refused', async () => {
      let res = await request(server).put('/api/admin/booking-config').set(adminAuth).send({ dispatchMode: 'distance' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual((await request(server).get('/api/admin/booking-config').set(adminAuth)).body.config.dispatchMode, 'distance');
      res = await request(server).put('/api/admin/booking-config').set(adminAuth).send({ dispatchMode: 'both' });
      assert.strictEqual(res.status, 400, JSON.stringify(res.body));
      res = await request(server).put('/api/admin/booking-config').set(adminAuth).send({ dispatchMode: 'zone' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual((await request(server).get('/api/admin/booking-config').set(adminAuth)).body.config.dispatchMode, 'zone');
    });

    // ------------------------------------------------------------------ ZONE
    console.log('\n[Zone mode]');
    await setMode('zone');

    await it('a professional in the zone gets it however far away (radius not used)', async () => {
      const res = await book(CUSTOMER_SW);
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.noWorkersFound, false);
      assert.deepStrictEqual(await alerted(res), [String(farInZone)]);
      assert.strictEqual(res.body.search.radiusKm, null, 'no radius is shown when the zone decides');
      const b = await Booking.findById(res.body.data._id);
      assert.strictEqual(String(b.zoneId), String(zone._id));
      assert.deepStrictEqual(b.surgePricing.toObject(), { enabled: true, multiplier: 2 });
    });

    await it('a professional\'s own small service radius is not applied inside a zone', async () => {
      await Settings.updateOne({ type: 'global' }, { $set: { isWorkerServiceRadiusEnabled: true } });
      invalidateBookingConfigCache();
      await Worker.collection.updateOne({ _id: farInZone }, { $set: { 'settings.serviceRange': 1 } });
      const res = await book(CUSTOMER_SW);
      assert.deepStrictEqual(await alerted(res), [String(farInZone)]);
    });

    await it('an address outside every zone is refused', async () => {
      const res = await request(server).post('/api/users/bookings').set(userAuth).send(payload(service._id, DELHI.lat, DELHI.lng));
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.code, 'OUT_OF_ZONE');
    });

    await it('the lookup reports out-of-area outside the zone, and the zone inside it', async () => {
      const out = await request(server).get(`/api/public/zones/lookup?lat=${DELHI.lat}&lng=${DELHI.lng}`);
      assert.strictEqual(out.body.zonesConfigured, true);
      assert.strictEqual(out.body.zone, null);
      const inn = await request(server).get(`/api/public/zones/lookup?lat=${CUSTOMER_SW.lat}&lng=${CUSTOMER_SW.lng}`);
      assert.strictEqual(String(inn.body.zone.id), String(zone._id));
    });

    await it('a zone-limited coupon is checked against the zone', async () => {
      await Coupon.collection.insertOne({
        code: 'ZONEONLY', title: 'Zone only', discountType: 'fixed', discountValue: 50, isActive: true,
        zones: [zone._id], cities: [], services: [], categories: [], minOrderAmount: 0,
        validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 86400000), usageLimit: 0, usageLimitPerUser: 0, usedCount: 0
      });
      const without = await validateCoupon('ZONEONLY', { userId: user._id, orderAmount: 500 });
      assert.strictEqual(without.valid, false);
      assert.match(without.reason, /zone/i);
    });

    await it('a zone-limited coupon is listed inside its zone and hidden everywhere else', async () => {
      const inside = await getAvailableCoupons({ userId: user._id, orderAmount: 500, zoneId: zone._id });
      assert.ok(inside.some((c) => c.code === 'ZONEONLY' && c.applicable), 'listed and usable in its zone');
      const unknown = await getAvailableCoupons({ userId: user._id, orderAmount: 500 });
      assert.ok(!unknown.some((c) => c.code === 'ZONEONLY'), 'hidden when the zone is unknown');
      const otherZone = await getAvailableCoupons({ userId: user._id, orderAmount: 500, zoneId: new mongoose.Types.ObjectId() });
      assert.ok(!otherZone.some((c) => c.code === 'ZONEONLY'), 'hidden for another zone');
    });

    await it('booking with a zone-limited coupon from inside the zone works (zone is resolved from the address)', async () => {
      const res = await book(CUSTOMER_SW, { couponCode: 'ZONEONLY' });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      const b = await Booking.findById(res.body.data._id);
      assert.strictEqual(b.couponCode, 'ZONEONLY');
      assert.strictEqual(b.couponDiscount, 50);
    });

    // -------------------------------------------------------------- DISTANCE
    console.log('\n[Distance mode]');
    await setMode('distance');
    await Worker.collection.updateOne({ _id: farInZone }, { $unset: { 'settings.serviceRange': '' } });
    await Settings.updateOne({ type: 'global' }, { $set: { isWorkerServiceRadiusEnabled: false } });
    invalidateBookingConfigCache();

    await it('zones are not used: the same far, in-zone professional is NOT alerted (outside the radius)', async () => {
      const res = await book(CUSTOMER_SW);
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.noWorkersFound, true);
      assert.deepStrictEqual(await alerted(res), []);
      const b = await Booking.findById(res.body.data._id);
      assert.strictEqual(b.zoneId, null, 'no zone is recorded');
      assert.deepStrictEqual(b.surgePricing.toObject(), { enabled: false, multiplier: 1 }, 'no zone surge');
    });

    await it('an address outside every zone is NOT refused: a nearby professional gets it', async () => {
      const res = await book(DELHI);
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.noWorkersFound, false);
      assert.deepStrictEqual(await alerted(res), [String(nearOutside)]);
      assert.strictEqual(res.body.search.radiusKm, 10);
    });

    await it('the lookup never reports out-of-area, so the apps block nothing', async () => {
      const out = await request(server).get(`/api/public/zones/lookup?lat=${DELHI.lat}&lng=${DELHI.lng}`);
      assert.strictEqual(out.body.zone, null);
      assert.strictEqual(out.body.zonesConfigured, false);
      assert.strictEqual(out.body.dispatchMode, 'distance');
      const inn = await request(server).get(`/api/public/zones/lookup?lat=${CUSTOMER_SW.lat}&lng=${CUSTOMER_SW.lng}`);
      assert.strictEqual(inn.body.zone, null);
    });

    await it('a professional\'s own service radius applies in distance mode', async () => {
      await Settings.updateOne({ type: 'global' }, { $set: { isWorkerServiceRadiusEnabled: true } });
      invalidateBookingConfigCache();
      // Delhi Pro lives in Delhi and only travels 1 km from home: a customer 8 km away is out of his area
      await Worker.collection.updateOne({ _id: nearOutside }, { $set: { 'settings.serviceRange': 1 } });
      const eightKmAway = { lat: DELHI.lat + 0.072, lng: DELHI.lng };
      const res = await book(eightKmAway);
      assert.strictEqual(res.body.noWorkersFound, true);
      await Settings.updateOne({ type: 'global' }, { $set: { isWorkerServiceRadiusEnabled: false } });
      invalidateBookingConfigCache();
    });

    await it('a zone-limited coupon is no longer tied to a zone', async () => {
      const res = await validateCoupon('ZONEONLY', { userId: user._id, orderAmount: 500 });
      assert.ok(!/zone/i.test(res.reason || ''), `still blocked by the zone: ${res.reason}`);
    });

    await it('the admin assign list shows no zone badges and orders by distance', async () => {
      const b = await Booking.findOne({}).sort({ createdAt: -1 });
      await Booking.updateOne({ _id: b._id }, { $set: { awaitingAdmin: true, status: 'searching', vendorId: null } });
      const res = await request(server).get(`/api/admin/bookings/${b._id}/assignable-workers`).set(adminAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.dispatchMode, 'distance');
      assert.ok(res.body.workers.every((w) => w.inZone === null));
    });

    // ------------------------------------------- moved settings, radius, badges
    console.log('\n[Search settings live in Booking Config]');
    await it('search radius, search time and wave timer are edited here, with ranges', async () => {
      let res = await request(server).put('/api/admin/booking-config').set(adminAuth).send({ searchRadius: 12, maxSearchTime: 7, waveDuration: 45 });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const cfg = (await request(server).get('/api/admin/booking-config').set(adminAuth)).body.config;
      assert.deepStrictEqual([cfg.searchRadius, cfg.maxSearchTime, cfg.waveDuration], [12, 7, 45]);
      // stored on the same Settings fields every reader already uses
      const stored = await Settings.findOne({ type: 'global' }).lean();
      assert.deepStrictEqual([stored.searchRadius, stored.maxSearchTime, stored.waveDuration], [12, 7, 45]);
      for (const bad of [{ searchRadius: 0 }, { searchRadius: 500 }, { maxSearchTime: 0 }, { waveDuration: 5 }]) {
        res = await request(server).put('/api/admin/booking-config').set(adminAuth).send(bad);
        assert.strictEqual(res.status, 400, JSON.stringify(bad));
      }
      await Settings.updateOne({ type: 'global' }, { $set: { searchRadius: 10, maxSearchTime: 5, waveDuration: 60 } });
      invalidateBookingConfigCache();
    });

    await it('the radius the admin sets is the one a distance-mode booking uses', async () => {
      await setMode('distance');
      const eightKmAway = { lat: DELHI.lat + 0.072, lng: DELHI.lng };
      await Settings.updateOne({ type: 'global' }, { $set: { searchRadius: 5 } });
      invalidateBookingConfigCache();
      assert.strictEqual((await book(eightKmAway)).body.noWorkersFound, true, '8 km is outside a 5 km radius');
      await Settings.updateOne({ type: 'global' }, { $set: { searchRadius: 12 } });
      invalidateBookingConfigCache();
      const wide = await book(eightKmAway);
      assert.strictEqual(wide.body.noWorkersFound, false, '8 km is inside a 12 km radius');
      assert.strictEqual(wide.body.search.radiusKm, 12);
      await Settings.updateOne({ type: 'global' }, { $set: { searchRadius: 10 } });
      invalidateBookingConfigCache();
    });

    await it('a radius of exactly 10 is no longer silently replaced by the global one', async () => {
      const { findNearbyWorkers } = require('../services/locationService');
      await Settings.updateOne({ type: 'global' }, { $set: { searchRadius: 5 } });
      const eightKmAway = { lat: DELHI.lat + 0.072, lng: DELHI.lng };
      const asked10 = await findNearbyWorkers(eightKmAway, 10, { service: ['Fan Repair'] });
      assert.ok(asked10.some((w) => String(w._id) === String(nearOutside)), 'explicit 10 km was overridden by the global 5 km');
      const asked5 = await findNearbyWorkers(eightKmAway, 5, { service: ['Fan Repair'] });
      assert.ok(!asked5.some((w) => String(w._id) === String(nearOutside)));
      await Settings.updateOne({ type: 'global' }, { $set: { searchRadius: 10 } });
      invalidateBookingConfigCache();
    });

    await it('the Settings endpoint can no longer change them (one writer only)', async () => {
      const { updateSettings } = require('../controllers/adminControllers/settingsController');
      const before = await Settings.findOne({ type: 'global' }).lean();
      const out = {};
      const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
      await updateSettings(
        { body: { searchRadius: 99, maxSearchTime: 55, waveDuration: 500, supportEmail: 'help@example.com' }, app: { get: () => null } },
        res, (e) => { out.error = e; }
      );
      assert.ok(!out.error, String(out.error));
      const after = await Settings.findOne({ type: 'global' }).lean();
      assert.deepStrictEqual([after.searchRadius, after.maxSearchTime, after.waveDuration],
        [before.searchRadius, before.maxSearchTime, before.waveDuration], 'Settings endpoint still writes the moved fields');
      assert.strictEqual(after.supportEmail, 'help@example.com', 'its other fields must still save');
    });

    console.log('\n[Arrival-time badges follow the dispatch mode]');
    const eta = (at) => request(server).get(`/api/public/categories/eta?lat=${at.lat}&lng=${at.lng}`);
    await it('zone mode: a customer in the zone sees a badge from an in-zone professional, however far', async () => {
      await setMode('zone');
      const res = await eta(CUSTOMER_SW);
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.eta[String(category._id)], `no badge: ${JSON.stringify(res.body)}`);
    });
    await it('zone mode: a professional outside the zone is never promised (even if close)', async () => {
      // Customer at the zone's edge; Delhi Pro is far away anyway, so move him next to the customer
      await Worker.collection.updateOne({ _id: farInZone }, { $set: { isOnline: false } });
      await Worker.collection.updateOne({ _id: nearOutside }, { $set: {
        location: { lat: CUSTOMER_SW.lat, lng: CUSTOMER_SW.lng }, geoLocation: { type: 'Point', coordinates: [CUSTOMER_SW.lng, CUSTOMER_SW.lat - 0.001] } } });
      // he is physically inside the polygon now, so he DOES count - move him just outside instead
      await Worker.collection.updateOne({ _id: nearOutside }, { $set: { geoLocation: { type: 'Point', coordinates: [75.77, 22.64] } } });
      const res = await eta(CUSTOMER_SW);
      assert.strictEqual(res.body.eta[String(category._id)], undefined, 'badge promised a professional outside the zone');
      await Worker.collection.updateOne({ _id: farInZone }, { $set: { isOnline: true } });
      await Worker.collection.updateOne({ _id: nearOutside }, { $set: { geoLocation: { type: 'Point', coordinates: [DELHI.lng, DELHI.lat] }, location: { lat: DELHI.lat, lng: DELHI.lng } } });
    });
    await it('distance mode: only professionals within the radius count (the far in-zone one does not)', async () => {
      await setMode('distance');
      const res = await eta(CUSTOMER_SW);
      assert.strictEqual(res.body.eta[String(category._id)], undefined);
      const delhi = await eta(DELHI);
      assert.ok(delhi.body.eta[String(category._id)], 'a nearby professional should give a badge');
    });

    console.log('\n[Partner app only offers a travel radius when it has an effect]');
    await it('the public config hides the partner radius while a zone decides, shows it otherwise', async () => {
      const { getPublicBookingConfig } = require('../utils/bookingConfig');
      await Settings.updateOne({ type: 'global' }, { $set: { isWorkerServiceRadiusEnabled: true } });
      await setMode('zone');
      assert.strictEqual((await getPublicBookingConfig()).isWorkerServiceRadiusEnabled, false, 'zone mode + active zone: radius is ignored');
      await setMode('distance');
      assert.strictEqual((await getPublicBookingConfig()).isWorkerServiceRadiusEnabled, true);
      await setMode('zone');
      await Zone.updateOne({ _id: zone._id }, { status: 'inactive' });
      assert.strictEqual((await getPublicBookingConfig()).isWorkerServiceRadiusEnabled, true, 'zone mode with no active zone uses distance rules');
      await Zone.updateOne({ _id: zone._id }, { status: 'active' });
      await Settings.updateOne({ type: 'global' }, { $set: { isWorkerServiceRadiusEnabled: false } });
      assert.strictEqual((await getPublicBookingConfig()).isWorkerServiceRadiusEnabled, false, 'admin switch off stays off');
      invalidateBookingConfigCache();
    });

    // ----------------------------------------------- switching back is immediate
    console.log('\n[Switching back]');
    await it('back to zone mode the zone rules apply again straight away', async () => {
      await setMode('zone');
      const refused = await request(server).post('/api/users/bookings').set(userAuth).send(payload(service._id, DELHI.lat, DELHI.lng));
      assert.strictEqual(refused.body.code, 'OUT_OF_ZONE');
      const ok = await book(CUSTOMER_SW);
      assert.deepStrictEqual(await alerted(ok), [String(farInZone)]);
    });

    await it('zone mode with no active zone behaves like distance (nothing to enforce)', async () => {
      await Zone.updateOne({ _id: zone._id }, { status: 'inactive' });
      const res = await book(DELHI);
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.deepStrictEqual(await alerted(res), [String(nearOutside)]);
      await Zone.updateOne({ _id: zone._id }, { status: 'active' });
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
