/**
 * Notifications around cancellations and refunds: who is pushed, that nothing is silently dropped, that a refund is
 * always mentioned, and that every push carries one tag so a repeat on a device collapses into one.
 * Firebase is replaced by a recorder; MongoDB is in-memory. Run: node tests/notifications.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'notif-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'notif-test-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const firebase = require('firebase-admin');

// Record every push instead of sending it (the SDK exposes messaging as a getter)
const pushes = [];
Object.defineProperty(firebase, 'messaging', {
  configurable: true,
  value: () => ({
    sendEachForMulticast: async (m) => {
      pushes.push(m);
      return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) };
    }
  })
});

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
const Notification = require('../models/Notification');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');
const { BookingScheduler } = require('../services/bookingScheduler');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);
const target = (m) => (m.tokens[0] || '').startsWith('U') ? 'user' : 'worker';

(async () => {
  console.log('\n--- Testing notifications ---');

  console.log('\n[Nothing is silently dropped]');
  await it('every notification type the code sends is accepted by the model', async () => {
    const allowed = Notification.schema.path('type').enumValues;
    const files = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir)) {
        if (['node_modules', 'scripts', 'tests'].includes(f)) continue;
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p);
      }
    })(path.join(__dirname, '..'));
    const rejected = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /createNotification\(\{([\s\S]*?)\}\)/g;
      let m;
      while ((m = re.exec(src))) {
        const t = /\btype:\s*['"]([a-z_]+)['"]/.exec(m[1]);
        if (t && !allowed.includes(t[1])) rejected.push(`${t[1]} (${path.relative(path.join(__dirname, '..'), f)})`);
      }
    }
    assert.deepStrictEqual(rejected, [], `rejected by the model: ${rejected.join(', ')}`);
  });

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
    const user = await User.create({ name: 'Customer', phone: '9000000071', fcmTokens: ['U-WEB'], fcmTokenMobile: ['U-MOBILE'] });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };
    const admin = await Admin.create({ name: 'Root', email: 'root-notif@example.com', password: 'secret123', role: 'super_admin' });
    const adminAuth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };
    const workerId = (await Worker.collection.insertOne({
      name: 'Pro', phone: '9100000071', email: 'pro71@x.com', approvalStatus: 'approved', isActive: true,
      fcmTokens: ['W-WEB'], fcmTokenMobile: ['W-MOBILE'], wallet: { dues: 0, cashLimit: 1000 }
    })).insertedId;
    const category = await Category.create({ title: 'Cleaning', slug: 'cleaning-notif-test' });
    const service = await UserService.create({
      title: 'Cleaning', categoryId: category._id, brandId: new mongoose.Types.ObjectId(), basePrice: 500, status: 'active'
    });

    const makeBooking = async (extra = {}) => {
      const res = await request(server).post('/api/users/bookings').set(userAuth).send({
        serviceId: String(service._id),
        address: { type: 'home', addressLine1: '1 Main', city: 'Indore', state: 'MP', pincode: '452001', lat: 22.7, lng: 75.85 },
        scheduledDate: daysFromNow(3).toISOString(), scheduledTime: '10:00 AM - 12:00 PM', timeSlot: { start: '10:00', end: '12:00' },
        paymentMethod: 'pay_at_home', bookingType: 'scheduled'
      });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      await wait(400);
      await Booking.updateOne({ _id: res.body.data._id }, { $set: extra });
      pushes.length = 0;
      await Notification.deleteMany({});
      return res.body.data._id;
    };
    const paid = { paymentStatus: 'success', paymentMethod: 'wallet' };

    console.log('\n[Customer cancels an assigned booking]');
    await it('the customer gets one notification and the professional gets one, each on all their devices', async () => {
      const id = await makeBooking({ ...paid, status: 'assigned', vendorId: workerId, assignedAt: new Date(), acceptedAt: new Date() });
      const res = await request(server).post(`/api/users/bookings/${id}/cancel`).set(userAuth).send({ cancellationReason: 'x' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      await wait(300);
      const toUser = pushes.filter((m) => target(m) === 'user');
      const toWorker = pushes.filter((m) => target(m) === 'worker');
      assert.strictEqual(toUser.length, 1, `customer pushes: ${toUser.length}`);
      assert.strictEqual(toWorker.length, 1, `professional pushes: ${toWorker.length}`);
      assert.deepStrictEqual(toUser[0].tokens.sort(), ['U-MOBILE', 'U-WEB']);
      assert.deepStrictEqual(toWorker[0].tokens.sort(), ['W-MOBILE', 'W-WEB']);
      assert.strictEqual(await Notification.countDocuments({ userId: user._id, type: 'booking_cancelled' }), 1);
      assert.strictEqual(await Notification.countDocuments({ vendorId: workerId, type: 'booking_cancelled' }), 1);
    });

    await it('the customer\'s cancellation notification states the refund', async () => {
      const id = await makeBooking({ ...paid, status: 'confirmed', vendorId: null });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      await request(server).post(`/api/users/bookings/${id}/cancel`).set(userAuth).send({});
      await wait(300);
      const n = await Notification.findOne({ userId: user._id, type: 'booking_cancelled' }).lean();
      assert.ok(n.message.includes(`₹${amount}`) && /refund/i.test(n.message), n.message);
    });

    await it('every push carries one tag, the same on every platform, so a repeat collapses into one', async () => {
      const id = await makeBooking({ ...paid, status: 'assigned', vendorId: workerId, assignedAt: new Date(), acceptedAt: new Date() });
      await request(server).post(`/api/users/bookings/${id}/cancel`).set(userAuth).send({});
      await wait(300);
      assert.ok(pushes.length >= 2);
      for (const m of pushes) {
        assert.ok(m.data.tag, 'tag in data');
        assert.strictEqual(m.webpush.notification.tag, m.data.tag);
        assert.strictEqual(m.android.notification.tag, m.data.tag);
        assert.strictEqual(m.apns.headers['apns-collapse-id'], m.data.tag);
      }
      const userTag = pushes.find((m) => target(m) === 'user').data.tag;
      assert.ok(userTag.length <= 60);
    });

    console.log('\n[Support cancels a paid booking]');
    await it('the customer is told about the refund', async () => {
      const id = await makeBooking({ ...paid, status: 'assigned', vendorId: workerId });
      const amount = (await Booking.findById(id).lean()).finalAmount;
      const res = await request(server).post(`/api/admin/bookings/${id}/cancel`).set(adminAuth).send({ cancellationReason: 'duplicate' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      await wait(300);
      const n = await Notification.findOne({ userId: user._id, type: 'booking_cancelled' }).lean();
      assert.ok(n.message.includes(`₹${amount}`) && /refunded/i.test(n.message), n.message);
      assert.ok(pushes.some((m) => target(m) === 'user'), 'a push was sent to the customer');
      assert.ok(pushes.some((m) => target(m) === 'worker'), 'a push was sent to the professional');
    });

    console.log('\n[No professional accepted in time]');
    await it('the booking is cancelled, refunded, and the customer is notified and pushed (they were not before)', async () => {
      const id = await makeBooking({ ...paid, status: 'searching', vendorId: null });
      const booking = await Booking.findById(id).lean();
      const before = (await User.findById(user._id).lean()).wallet?.balance || 0;
      const scheduler = new BookingScheduler(null);
      await scheduler.cancelExpiredBooking(booking);
      await wait(300);
      assert.strictEqual((await Booking.findById(id).lean()).status, 'cancelled');
      assert.strictEqual((await User.findById(user._id).lean()).wallet.balance, before + booking.finalAmount, 'wallet refunded');
      const n = await Notification.findOne({ userId: user._id, type: 'booking_cancelled' }).lean();
      assert.ok(n, 'a notification was saved');
      assert.ok(n.message.includes(`₹${booking.finalAmount}`) && /refunded/i.test(n.message), n.message);
      assert.strictEqual(pushes.filter((m) => target(m) === 'user').length, 1, 'one push to the customer');
    });

    await it('an unpaid booking that times out is still reported, without a refund line', async () => {
      const id = await makeBooking({ status: 'searching', vendorId: null, paymentStatus: 'pending' });
      const booking = await Booking.findById(id).lean();
      await new BookingScheduler(null).cancelExpiredBooking(booking);
      await wait(300);
      const n = await Notification.findOne({ userId: user._id, type: 'booking_cancelled' }).lean();
      assert.ok(n && !/refunded/i.test(n.message), n && n.message);
    });

    console.log('\n[A professional without a push token]');
    await it('the notification is still saved so it shows in their list', async () => {
      const bareId = (await Worker.collection.insertOne({
        name: 'No Token Pro', phone: '9100000072', email: 'pro72@x.com', approvalStatus: 'approved', isActive: true,
        wallet: { dues: 0, cashLimit: 1000 }
      })).insertedId;
      const id = await makeBooking({ status: 'assigned', vendorId: bareId, assignedAt: new Date(), acceptedAt: new Date() });
      await request(server).post(`/api/users/bookings/${id}/cancel`).set(userAuth).send({});
      await wait(300);
      assert.strictEqual(await Notification.countDocuments({ vendorId: bareId, type: 'booking_cancelled' }), 1, 'saved for the in-app list');
      assert.strictEqual(pushes.filter((m) => target(m) === 'worker').length, 0, 'nothing to push to');
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
