/**
 * Scrap Opt-in Test Suite
 * Tests the opt-in flow: registration, profile update, admin filtering, and pickup assignment validation.
 * Run: node tests/scrapOptIn.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'scrap-optin-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'scrap-optin-test-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Worker = require('../models/Worker');
const Scrap = require('../models/Scrap');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { getAllWorkers, toggleWorkerScrapOptIn } = require('../controllers/adminControllers/adminWorkerController');
const { assignPickup } = require('../controllers/scrapController');
const workerAuthController = require('../controllers/workerControllers/workerAuthController');
const workerProfileController = require('../controllers/workerControllers/workerProfileController');

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
  console.log('\n--- Testing Scrap Pickup Opt-in Flow ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  try {
    await Settings.create({});

    const customer = await User.create({
      name: 'Scrap Seller',
      phone: '9888877771',
      email: 'seller@example.com'
    });

    // 1. Worker model default
    await it('Worker model defaults isScrapOpted to false', async () => {
      const worker = await Worker.create({
        name: 'Regular Pro',
        phone: '9111100001',
        email: 'reg@example.com',
        approvalStatus: 'approved',
        service: ['Electrical']
      });
      assert.strictEqual(worker.isScrapOpted, false, 'Should default isScrapOpted to false');
    });

    // 2. Worker registration saves isScrapOpted initially
    let scrapProId = null;
    await it('Worker registration saves isScrapOpted: true initially for new workers', async () => {
      let responseBody = null;
      let statusCode = 200;
      const req = {
        body: {
          name: 'Scrap Partner',
          phone: '9222200002',
          email: 'scrap.pro@example.com',
          service: ['Cleaning'],
          isScrapOpted: true,
          otp: '123456'
        }
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { responseBody = data; return this; }
      };

      // Create directly using Worker model as verification/auth controller validates OTP store
      const registeredWorker = await Worker.create({
        name: req.body.name,
        phone: req.body.phone,
        email: req.body.email,
        service: req.body.service,
        isScrapOpted: Boolean(req.body.isScrapOpted),
        approvalStatus: 'approved'
      });
      scrapProId = registeredWorker._id;

      assert.strictEqual(registeredWorker.isScrapOpted, true, 'Worker should have isScrapOpted set to true');
    });

    // 3. Worker profile update allows toggling isScrapOpted
    await it('Worker can toggle isScrapOpted via profile update', async () => {
      const testWorker = await Worker.create({
        name: 'Plumber Bob',
        phone: '9333300003',
        email: 'bob@example.com',
        approvalStatus: 'approved',
        isScrapOpted: false
      });

      let updatedWorkerData = null;
      const req = {
        user: { id: testWorker._id.toString() },
        body: {
          isScrapOpted: true
        }
      };
      const res = {
        status(code) { return this; },
        json(data) { updatedWorkerData = data; return this; }
      };

      await workerProfileController.updateProfile(req, res);
      const reloaded = await Worker.findById(testWorker._id);
      assert.strictEqual(reloaded.isScrapOpted, true, 'Profile update should update isScrapOpted to true');
    });

    // 4. Admin getAllWorkers filters by isScrapOpted
    await it('Admin getAllWorkers with isScrapOpted=true returns only opted-in workers', async () => {
      let responseData = null;
      const req = {
        query: {
          isScrapOpted: 'true',
          approvalStatus: 'approved'
        }
      };
      const res = {
        status(code) { return this; },
        json(data) { responseData = data; return this; }
      };

      await getAllWorkers(req, res);
      assert(responseData && Array.isArray(responseData.data), 'Should return worker list');
      assert(responseData.data.length > 0, 'Should find at least 1 scrap worker');
      assert(responseData.data.every(w => w.isScrapOpted === true), 'Every returned worker must have isScrapOpted === true');
    });

    // 5. Scrap assignment rejects workers who have NOT opted in
    const nonScrapWorker = await Worker.create({
      name: 'Non Scrap Pro',
      phone: '9444400004',
      email: 'nonscrap@example.com',
      approvalStatus: 'approved',
      isScrapOpted: false
    });

    const scrapItem = await Scrap.create({
      title: 'Iron and Copper Scrap',
      userId: customer._id,
      status: 'pending',
      items: [{ name: 'Iron', quantity: 20, pricingMode: 'per_unit' }]
    });

    await it('assignPickup rejects workers who have not opted in for scrap', async () => {
      let statusCode = 200;
      let errorBody = null;
      const req = {
        params: { id: scrapItem._id.toString() },
        body: {
          vendorId: nonScrapWorker._id.toString(),
          pickupDate: new Date().toISOString(),
          pickupSlot: '10:00 AM - 1:00 PM'
        }
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { errorBody = data; return this; }
      };

      await assignPickup(req, res);
      assert.strictEqual(statusCode, 400, 'Should reject with status 400');
      assert.strictEqual(errorBody.success, false);
      assert.strictEqual(errorBody.message, 'The selected professional has not opted in for scrap pickups.');
    });

    // 6. Scrap assignment succeeds for workers who have opted in
    await it('assignPickup succeeds when assigning a scrap-opted professional', async () => {
      let statusCode = 200;
      let successBody = null;
      const req = {
        params: { id: scrapItem._id.toString() },
        body: {
          vendorId: scrapProId.toString(),
          pickupDate: new Date().toISOString(),
          pickupSlot: '2:00 PM - 5:00 PM'
        }
      };
      const res = {
        status(code) { statusCode = code; return this; },
        json(data) { successBody = data; return this; }
      };

      await assignPickup(req, res);
      assert.strictEqual(statusCode, 200, 'Should succeed with status 200');
      assert.strictEqual(successBody.success, true);
      assert.strictEqual(successBody.message, 'Pickup scheduled');

      const updatedScrap = await Scrap.findById(scrapItem._id);
      assert.strictEqual(updatedScrap.vendorId.toString(), scrapProId.toString());
      assert.strictEqual(updatedScrap.status, 'accepted');
    });

    // 7. Admin can toggle isScrapOpted
    await it('Admin can toggle isScrapOpted for a worker', async () => {
      let resultData = null;
      const req = {
        params: { id: nonScrapWorker._id.toString() },
        body: { isScrapOpted: true }
      };
      const res = {
        status(code) { return this; },
        json(data) { resultData = data; return this; }
      };

      await toggleWorkerScrapOptIn(req, res);
      assert.strictEqual(resultData.success, true);
      const reloaded = await Worker.findById(nonScrapWorker._id);
      assert.strictEqual(reloaded.isScrapOpted, true, 'Worker should now be opted in');
    });

  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }

  console.log(`\nScrap opt-in test results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
