/**
 * The notification check in Settings: how many devices are registered, and a test notification the person can
 * send to their own phone. Counts only: tokens never leave the server. Firebase is replaced by a recorder.
 * Run: node tests/pushStatus.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'push-status-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'push-status-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const firebase = require('firebase-admin');
const pushes = [];
Object.defineProperty(firebase, 'messaging', {
  configurable: true,
  value: () => ({ sendEachForMulticast: async (m) => { pushes.push(m); return { successCount: m.tokens.length, failureCount: 0, responses: m.tokens.map(() => ({ success: true })) }; } })
});

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Worker = require('../models/Worker');
const { generateAccessToken } = require('../utils/tokenService');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}

(async () => {
  console.log('\n--- Testing the notification check ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/users/fcm-tokens', require('../routes/user-routes/fcmToken.routes'));
  app.use('/api/workers/fcm-tokens', require('../routes/worker-routes/fcmToken.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    const user = await User.create({ name: 'Cust', phone: '9000000081', fcmTokens: ['SECRET-WEB-1', 'SECRET-WEB-1', 'SECRET-WEB-2'], fcmTokenMobile: ['SECRET-MOB-1'] });
    const bare = await User.create({ name: 'No devices', phone: '9000000082' });
    const workerId = (await Worker.collection.insertOne({
      name: 'Pro', phone: '9100000081', email: 'pro81@x.com', approvalStatus: 'approved', isActive: true, fcmTokens: [], fcmTokenMobile: ['SECRET-WMOB-1']
    })).insertedId;
    const auth = (id, role) => ({ Authorization: `Bearer ${generateAccessToken({ userId: String(id), role })}` });
    const uAuth = auth(user._id, 'USER');
    const wAuth = auth(workerId, 'WORKER');

    console.log('\n[Status]');
    await it('a customer sees how many devices are registered (duplicates counted once)', async () => {
      const res = await request(server).get('/api/users/fcm-tokens/status').set(uAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual({ w: res.body.webDevices, m: res.body.mobileDevices, t: res.body.totalDevices }, { w: 2, m: 1, t: 3 });
    });
    await it('a professional sees theirs', async () => {
      const res = await request(server).get('/api/workers/fcm-tokens/status').set(wAuth);
      assert.deepStrictEqual({ w: res.body.webDevices, m: res.body.mobileDevices, t: res.body.totalDevices }, { w: 0, m: 1, t: 1 });
    });
    await it('a person with no device sees zero (the app can then say so)', async () => {
      const res = await request(server).get('/api/users/fcm-tokens/status').set(auth(bare._id, 'USER'));
      assert.strictEqual(res.body.totalDevices, 0);
    });
    await it('the tokens themselves are never returned', async () => {
      const a = JSON.stringify((await request(server).get('/api/users/fcm-tokens/status').set(uAuth)).body);
      const b = JSON.stringify((await request(server).get('/api/workers/fcm-tokens/status').set(wAuth)).body);
      assert.ok(!/SECRET/.test(a + b));
    });
    await it('it needs a login', async () => {
      assert.strictEqual((await request(server).get('/api/users/fcm-tokens/status')).status, 401);
      assert.strictEqual((await request(server).get('/api/workers/fcm-tokens/status')).status, 401);
    });

    console.log('\n[Test notification]');
    await it('is sent to all of the person\'s own devices, once each', async () => {
      pushes.length = 0;
      const res = await request(server).post('/api/users/fcm-tokens/test').set(uAuth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.devices, 3);
      assert.strictEqual(pushes.length, 1);
      assert.deepStrictEqual([...pushes[0].tokens].sort(), ['SECRET-MOB-1', 'SECRET-WEB-1', 'SECRET-WEB-2']);
      assert.ok(pushes[0].data.tag, 'carries the same tag as every other push');
    });
    await it('a second test straight away is held back, so the button cannot spam a phone', async () => {
      const res = await request(server).post('/api/users/fcm-tokens/test').set(uAuth);
      assert.strictEqual(res.status, 429);
    });
    await it('a person with no device is told to set one up, and nothing is sent', async () => {
      pushes.length = 0;
      const res = await request(server).post('/api/users/fcm-tokens/test').set(auth(bare._id, 'USER'));
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.error, /No device is registered/);
      assert.strictEqual(pushes.length, 0);
    });
    await it('a professional can test their own devices, and only theirs', async () => {
      pushes.length = 0;
      const res = await request(server).post('/api/workers/fcm-tokens/test').set(wAuth);
      assert.strictEqual(res.body.success, true);
      assert.deepStrictEqual(pushes[0].tokens, ['SECRET-WMOB-1']);
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
