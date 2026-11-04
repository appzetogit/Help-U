/**
 * Dispute reasons: role-specific reasons for workers vs customers.
 * Run: node tests/disputeReasons.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dispute-reasons-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dispute-reasons-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  DEFAULT_CUSTOMER_DISPUTE_REASONS,
  DEFAULT_WORKER_DISPUTE_REASONS,
  raiseDispute,
  DisputeError
} = require('../services/disputeService');
const disputeController = require('../controllers/disputeController');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Dispute = require('../models/Dispute');
const Settings = require('../models/Settings');
const { getBookingConfig } = require('../utils/bookingConfig');
const { USER_ROLES, BOOKING_STATUS } = require('../utils/constants');

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
  console.log('\n--- Testing Role-Specific Dispute Reasons ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  try {
    await Settings.create({});

    const user = await User.create({
      name: 'Test Customer',
      phone: '9876543210',
      email: 'customer@example.com'
    });

    const worker = await Worker.create({
      name: 'Test Partner',
      phone: '9123456780',
      email: 'worker@example.com',
      service: ['Cleaning'],
      approvalStatus: 'approved'
    });

    const makeBooking = async (number, extra = {}) => {
      const doc = {
        bookingNumber: number,
        userId: user._id,
        vendorId: worker._id,
        status: BOOKING_STATUS.COMPLETED,
        finalAmount: 1500,
        paymentStatus: 'success',
        scheduledDate: new Date(),
        scheduledTime: '10:00 AM - 12:00 PM',
        timeSlot: { start: '10:00', end: '12:00' },
        serviceName: 'Cleaning Service',
        serviceCategory: 'Home Cleaning',
        serviceId: new mongoose.Types.ObjectId(),
        basePrice: 1500,
        address: { addressLine1: '123 Test Street', city: 'Indore', state: 'MP', pincode: '452001' },
        disputeStatus: 'none',
        ...extra
      };
      const res = await Booking.collection.insertOne(doc);
      return { _id: res.insertedId, ...doc };
    };

    const booking = await makeBooking('BK-DISPUTE-TEST-01');

    await it('defaults are distinct and appropriate for worker vs customer', async () => {
      assert(Array.isArray(DEFAULT_CUSTOMER_DISPUTE_REASONS), 'customer reasons should be an array');
      assert(Array.isArray(DEFAULT_WORKER_DISPUTE_REASONS), 'worker reasons should be an array');

      // Customer reasons include "Professional misbehaved" and "Poor quality of work"
      assert(DEFAULT_CUSTOMER_DISPUTE_REASONS.includes('Professional misbehaved'));
      assert(DEFAULT_CUSTOMER_DISPUTE_REASONS.includes('Damage to property'));
      assert(DEFAULT_CUSTOMER_DISPUTE_REASONS.includes('Poor quality of work'));

      // Worker reasons include vendor-centric issues
      assert(DEFAULT_WORKER_DISPUTE_REASONS.includes('Customer unavailable / Not at location'));
      assert(DEFAULT_WORKER_DISPUTE_REASONS.includes('Customer refused to pay'));
      assert(DEFAULT_WORKER_DISPUTE_REASONS.includes('Customer misbehaved / Inappropriate behavior'));
      assert(DEFAULT_WORKER_DISPUTE_REASONS.includes('Scope mismatch / Extra work demanded'));
      assert(DEFAULT_WORKER_DISPUTE_REASONS.includes('Safety or security concern'));

      // Worker should NOT have "Professional misbehaved" or "Professional did not arrive"
      assert(!DEFAULT_WORKER_DISPUTE_REASONS.includes('Professional misbehaved'));
      assert(!DEFAULT_WORKER_DISPUTE_REASONS.includes('Professional did not arrive'));
    });

    await it('getBookingDisputeInfo returns worker dispute reasons when called as a worker', async () => {
      let responseData = null;
      const req = {
        params: { bookingId: booking._id.toString() },
        user: { id: worker._id.toString(), role: USER_ROLES.WORKER, name: worker.name },
        userRole: USER_ROLES.WORKER
      };
      const res = {
        status(code) {
          assert.strictEqual(code, 200);
          return this;
        },
        json(body) {
          responseData = body;
          return this;
        }
      };

      await disputeController.getBookingDisputeInfo(req, res);
      assert(responseData && responseData.success, 'Response should be successful');
      assert(Array.isArray(responseData.data.reasons), 'Reasons should be an array');
      assert(responseData.data.reasons.includes('Customer unavailable / Not at location'));
      assert(responseData.data.reasons.includes('Customer refused to pay'));
      assert(!responseData.data.reasons.includes('Professional misbehaved'), 'Worker should not see Professional misbehaved');
    });

    await it('getBookingDisputeInfo returns customer dispute reasons when called as a user', async () => {
      let responseData = null;
      const req = {
        params: { bookingId: booking._id.toString() },
        user: { id: user._id.toString(), role: USER_ROLES.USER, name: user.name },
        userRole: USER_ROLES.USER
      };
      const res = {
        status(code) {
          assert.strictEqual(code, 200);
          return this;
        },
        json(body) {
          responseData = body;
          return this;
        }
      };

      await disputeController.getBookingDisputeInfo(req, res);
      assert(responseData && responseData.success, 'Response should be successful');
      assert(Array.isArray(responseData.data.reasons), 'Reasons should be an array');
      assert(responseData.data.reasons.includes('Professional misbehaved'));
      assert(responseData.data.reasons.includes('Service not completed'));
      assert(!responseData.data.reasons.includes('Customer unavailable / Not at location'), 'User should not see worker reasons');
    });

    await it('worker can raise a dispute with a valid worker reason and gets appropriate priority', async () => {
      const dispute = await raiseDispute({
        bookingId: booking._id.toString(),
        party: 'worker',
        actorId: worker._id.toString(),
        actorName: worker.name,
        reason: 'Customer misbehaved / Inappropriate behavior',
        description: 'Customer used abusive language and threatened violence during service.',
        evidence: []
      });

      assert.strictEqual(dispute.raisedBy, 'worker');
      assert.strictEqual(dispute.reason, 'Customer misbehaved / Inappropriate behavior');
      assert.strictEqual(dispute.priority, 'high', 'Customer misbehaved should trigger high priority');
    });

    await it('worker cannot raise dispute with customer-only reason', async () => {
      const booking2 = await makeBooking('BK-DISPUTE-TEST-02', { finalAmount: 800 });

      let error = null;
      try {
        await raiseDispute({
          bookingId: booking2._id.toString(),
          party: 'worker',
          actorId: worker._id.toString(),
          actorName: worker.name,
          reason: 'Professional did not arrive', // invalid for worker
          description: 'Testing invalid reason submission.',
          evidence: []
        });
      } catch (err) {
        error = err;
      }

      assert(error instanceof DisputeError, 'Should throw a DisputeError');
      assert.strictEqual(error.message, 'Please choose a reason from the list');
    });

    await it('customer cannot raise dispute with worker-only reason', async () => {
      const booking3 = await makeBooking('BK-DISPUTE-TEST-03', { finalAmount: 1200 });

      let error = null;
      try {
        await raiseDispute({
          bookingId: booking3._id.toString(),
          party: 'user',
          actorId: user._id.toString(),
          actorName: user.name,
          reason: 'Customer refused to pay', // invalid for customer
          description: 'Testing invalid customer reason submission.',
          evidence: []
        });
      } catch (err) {
        error = err;
      }

      assert(error instanceof DisputeError, 'Should throw a DisputeError');
      assert.strictEqual(error.message, 'Please choose a reason from the list');
    });

  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }

  console.log(`\nDispute reasons test results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
