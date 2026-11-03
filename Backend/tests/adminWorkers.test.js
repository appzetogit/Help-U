/**
 * Admin worker list/details: the referral code, who referred the professional (by name), and the services they chose.
 * In-memory MongoDB. Run: node tests/adminWorkers.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-workers-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'admin-workers-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Admin = require('../models/Admin');
const { generateAccessToken } = require('../utils/tokenService');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}: ${err.message}`); failed++; }
}

(async () => {
  console.log('\n--- Testing admin worker details ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin-routes/workerManagement.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    const admin = await Admin.create({ name: 'Root', email: 'root-aw@example.com', password: 'secret123', role: 'super_admin' });
    const auth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };
    const col = require('../models/Worker').collection;
    const base = { approvalStatus: 'approved', isActive: true };
    const referrerId = (await col.insertOne({ ...base, name: 'Ramesh Kumar', businessName: 'Kumar Cooling', phone: '9111111111', email: 'rk@x.com', referralCode: 'RAMESH01', service: ['AC Repair'] })).insertedId;
    const referredId = (await col.insertOne({
      ...base, name: 'Suresh Rao', phone: '9222222222', email: 'sr@x.com', referralCode: 'SURESH02', referredBy: referrerId,
      service: ['AC Repair', 'Refrigerator Repair'], categories: ['AC & Appliance Repair'], skills: ['Gas refilling']
    })).insertedId;
    const loneId = (await col.insertOne({ ...base, name: 'Lone Worker', phone: '9333333333', email: 'lw@x.com', referralCode: 'LONE03', service: [] })).insertedId;

    const list = async () => {
      const res = await request(server).get('/api/admin/workers').set(auth).query({ limit: 50 });
      assert.strictEqual(res.status, 200, `list answered ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`);
      return res.body.data;
    };
    const pick = (rows, id) => rows.find((w) => String(w._id) === String(id));

    await it('the list gives the referrer\'s name, phone and code, not just an id', async () => {
      const w = pick(await list(), referredId);
      assert.strictEqual(w.referralCode, 'SURESH02');
      assert.strictEqual(typeof w.referredBy, 'object');
      assert.strictEqual(w.referredBy.name, 'Ramesh Kumar');
      assert.strictEqual(w.referredBy.businessName, 'Kumar Cooling');
      assert.strictEqual(w.referredBy.phone, '9111111111');
      assert.strictEqual(w.referredBy.referralCode, 'RAMESH01');
    });
    await it('someone nobody referred has no referrer, but still has their own code', async () => {
      const w = pick(await list(), loneId);
      assert.strictEqual(w.referredBy ?? null, null);
      assert.strictEqual(w.referralCode, 'LONE03');
    });
    await it('the chosen services, categories and skills come back with each professional', async () => {
      const w = pick(await list(), referredId);
      assert.deepStrictEqual(w.service, ['AC Repair', 'Refrigerator Repair']);
      assert.deepStrictEqual(w.categories, ['AC & Appliance Repair']);
      assert.deepStrictEqual(w.skills, ['Gas refilling']);
    });
    await it('the single-worker details give the referrer by name too', async () => {
      const res = await request(server).get(`/api/admin/workers/${referredId}`).set(auth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const w = res.body.data.worker || res.body.data;
      assert.strictEqual(w.referredBy.name, 'Ramesh Kumar');
    });
    await it('the password is never returned', async () => {
      assert.ok(!JSON.stringify(await list()).includes('"password"'));
    });
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(failed ? 1 : 0);
  }
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
