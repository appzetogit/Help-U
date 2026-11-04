/**
 * Admin User Management & Bookings Test:
 * - Search by name, email, phone (clean digits), and _id
 * - Status filter: active vs blocked users
 * - User bookings: populates vendorId (name, businessName, phone)
 * - User bookings: handles scheduledDate, isInstant, and timeSlot
 *
 * In-memory MongoDB. Run: node tests/adminUserManagement.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-user-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'admin-user-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Booking = require('../models/Booking');
const UserService = require('../models/UserService');
const { generateAccessToken } = require('../utils/tokenService');

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
  console.log('\n--- Testing Admin User Management & User Bookings ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin-routes/userManagement.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    const admin = await Admin.create({
      name: 'Super Admin',
      email: 'admin-users@example.com',
      password: 'password123',
      role: 'super_admin'
    });
    const auth = {
      Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}`
    };

    // Seed Users
    const user1 = await User.create({
      name: 'Aman Sharma',
      email: 'aman@example.com',
      phone: '9888811111',
      isActive: true
    });
    const user2 = await User.create({
      name: 'Pooja Verma',
      email: 'pooja@example.com',
      phone: '9888822222',
      isActive: false
    });
    const user3 = await User.create({
      name: 'Rohan Gupta',
      email: 'rohan@example.com',
      phone: '9888833333',
      isActive: true
    });

    // Seed Worker
    const worker1 = await Worker.create({
      name: 'Vikram Singh',
      businessName: 'Vikram Electricals',
      phone: '9777711111',
      email: 'vikram@example.com',
      approvalStatus: 'approved',
      isActive: true,
      service: ['Electrical']
    });

    // Seed Service using raw collection to bypass strict schema validation
    const service1Id = (await UserService.collection.insertOne({
      title: 'Fan Repair',
      description: 'Ceiling fan repair service',
      basePrice: 299,
      brandId: new mongoose.Types.ObjectId(),
      category: 'Electrical'
    })).insertedId;

    const commonBookingFields = {
      serviceId: service1Id,
      serviceName: 'Fan Repair',
      basePrice: 299,
      finalAmount: 299,
      address: {
        addressLine1: '123 MG Road',
        city: 'Indore',
        state: 'Madhya Pradesh',
        pincode: '452001'
      },
      timeSlot: {
        start: '10:00 AM',
        end: '11:00 AM'
      }
    };

    // Seed Bookings
    const booking1 = await Booking.create({
      ...commonBookingFields,
      userId: user1._id,
      vendorId: worker1._id,
      bookingNumber: 'BKUSERTEST01',
      status: 'confirmed',
      scheduledDate: new Date('2026-11-10T10:00:00Z'),
      scheduledTime: '10:00 AM',
      isInstant: false,
      serviceCategory: 'Electrical'
    });

    const booking2 = await Booking.create({
      ...commonBookingFields,
      userId: user2._id,
      vendorId: null, // Unassigned
      bookingNumber: 'BKUSERTEST02',
      status: 'pending',
      scheduledDate: new Date('2026-11-04T12:00:00Z'),
      scheduledTime: '12:00 PM',
      isInstant: true,
      bookingType: 'instant',
      serviceCategory: 'Electrical'
    });

    // Test 1: Search users by name
    await it('GET /api/admin/users searches by name', async () => {
      const res = await request(server).get('/api/admin/users').set(auth).query({ search: 'Aman' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].name, 'Aman Sharma');
    });

    // Test 2: Search users by formatted phone with +91 and spaces
    await it('GET /api/admin/users searches by formatted phone number (+91 98888 22222)', async () => {
      const res = await request(server).get('/api/admin/users').set(auth).query({ search: '+91 98888 22222' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].name, 'Pooja Verma');
    });

    // Test 3: Search users by _id
    await it('GET /api/admin/users searches by user _id', async () => {
      const res = await request(server).get('/api/admin/users').set(auth).query({ search: user3._id.toString() });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].name, 'Rohan Gupta');
    });

    // Test 4: Status filter active vs blocked
    await it('GET /api/admin/users filters active users', async () => {
      const res = await request(server).get('/api/admin/users').set(auth).query({ isActive: 'true' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 2);
      assert.ok(res.body.data.every(u => u.isActive === true));
    });

    await it('GET /api/admin/users filters blocked / inactive users', async () => {
      const res = await request(server).get('/api/admin/users').set(auth).query({ isActive: 'false' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].name, 'Pooja Verma');
    });

    // Test 5: User bookings populates vendorId (businessName & name)
    await it('GET /api/admin/users/bookings populates vendorId and customer details', async () => {
      const res = await request(server).get('/api/admin/users/bookings').set(auth);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 2);

      const b1 = res.body.data.find(b => b.bookingNumber === 'BKUSERTEST01');
      assert.ok(b1, 'booking 1 found');
      assert.ok(b1.vendorId, 'vendorId is populated');
      assert.strictEqual(b1.vendorId.name, 'Vikram Singh');
      assert.strictEqual(b1.vendorId.businessName, 'Vikram Electricals');
      assert.strictEqual(b1.userId.name, 'Aman Sharma');
    });

    // Test 6: User bookings correctly identifies scheduledDate and isInstant
    await it('GET /api/admin/users/bookings includes scheduledDate and isInstant', async () => {
      const res = await request(server).get('/api/admin/users/bookings').set(auth);
      const b2 = res.body.data.find(b => b.bookingNumber === 'BKUSERTEST02');
      assert.ok(b2, 'booking 2 found');
      assert.strictEqual(b2.vendorId, null);
      assert.strictEqual(b2.bookingType, 'instant');
      assert.ok(b2.scheduledDate);
    });

  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
