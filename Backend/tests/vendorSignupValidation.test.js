/**
 * Vendor Signup Validation Test:
 * - GSTIN format validation (rejects invalid formats, accepts valid 15-char GSTIN)
 * - Referral code validation (rejects invalid/non-existent code, rejects self-referral)
 * - Public validate-referral endpoint
 *
 * In-memory MongoDB. Run: node tests/vendorSignupValidation.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'worker-signup-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'worker-signup-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Worker = require('../models/Worker');
const { generateVerificationToken } = require('../utils/tokenService');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${desc}: ${err.message}`);
    failed++;
  }
}

(async () => {
  console.log('\n--- Testing Vendor Signup Validations (GSTIN & Referral) ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/workers/auth', require('../routes/worker-routes/auth.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    // Seed an existing active worker with referral code
    const existingWorker = await Worker.create({
      name: 'Ramesh Patel',
      phone: '9876543210',
      email: 'ramesh@example.com',
      referralCode: 'RAMESH99',
      approvalStatus: 'approved',
      isActive: true,
      service: ['Cleaning']
    });

    // Seed an inactive worker with referral code
    await Worker.create({
      name: 'Inactive Worker',
      phone: '9876543211',
      email: 'inactive@example.com',
      referralCode: 'INACTIVE01',
      approvalStatus: 'rejected',
      isActive: false,
      service: ['Plumbing']
    });

    // 1. Test validate-referral endpoint
    await it('GET /validate-referral/:code returns valid: true for active existing worker', async () => {
      const res = await request(server).get('/api/workers/auth/validate-referral/RAMESH99');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.valid, true);
      assert.strictEqual(res.body.referrerName, 'Ramesh Patel');
    });

    await it('GET /validate-referral/:code returns valid: false for non-existent code', async () => {
      const res = await request(server).get('/api/workers/auth/validate-referral/NONEXISTENT123');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.valid, false);
      assert.ok(res.body.message.includes('Invalid'));
    });

    await it('GET /validate-referral/:code returns valid: false for rejected/inactive worker', async () => {
      const res = await request(server).get('/api/workers/auth/validate-referral/INACTIVE01');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.valid, false);
      assert.ok(res.body.message.includes('inactive or rejected account'));
    });

    // Base registration helper
    const makeRegPayload = (overrides = {}) => {
      const phone = overrides.phone || '9123456789';
      return {
        name: 'New Worker',
        email: `worker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`,
        phone,
        verificationToken: generateVerificationToken(phone),
        aadhar: '123456789012',
        pan: 'ABCDE1234F',
        aadharDocument: 'https://example.com/aadhar-front.jpg',
        aadharBackDocument: 'https://example.com/aadhar-back.jpg',
        panDocument: 'https://example.com/pan.jpg',
        service: ['Cleaning'],
        ...overrides
      };
    };

    // 2. Test registration with wrong referral code
    await it('Register rejects non-existent referral code with 400', async () => {
      const payload = makeRegPayload({ referralCode: 'WRONGCODE999' });
      const res = await request(server).post('/api/workers/auth/register').send(payload);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('Invalid referral code'));
    });

    await it('Register rejects self-referral with 400', async () => {
      const payload = makeRegPayload({ phone: '9876543210', referralCode: 'RAMESH99' });
      const res = await request(server).post('/api/workers/auth/register').send(payload);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message);
    });

    // 3. Test GSTIN validation
    await it('Register rejects malformed GSTIN (random string "12345") with 400', async () => {
      const payload = makeRegPayload({ gstin: '12345' });
      const res = await request(server).post('/api/workers/auth/register').send(payload);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('GSTIN format'));
    });

    await it('Register rejects GSTIN with invalid length or characters with 400', async () => {
      const payload = makeRegPayload({ customFields: { gstin: 'INVALID_GST_123' } });
      const res = await request(server).post('/api/workers/auth/register').send(payload);
      assert.strictEqual(res.status, 400);
      assert.ok(res.body.message.includes('GSTIN format'));
    });

    await it('Register accepts valid GSTIN (e.g. "22AAAAA0000A1Z5") and valid referral code', async () => {
      const payload = makeRegPayload({
        phone: '9555544444',
        referralCode: 'RAMESH99',
        gstin: '22AAAAA0000A1Z5'
      });
      const res = await request(server).post('/api/workers/auth/register').send(payload);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.worker.gstin, '22AAAAA0000A1Z5');

      const saved = await Worker.findById(res.body.worker.id).lean();
      assert.strictEqual(saved.gstin, '22AAAAA0000A1Z5');
      assert.strictEqual(String(saved.referredBy), String(existingWorker._id));
    });

  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
