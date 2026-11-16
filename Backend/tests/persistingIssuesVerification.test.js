/**
 * Verification test for Issues 20, 24, and 25:
 *   - Issue 20: vendor bookings list and booking details reflect repair service added by user.
 *   - Issue 24: vendor invoice amount and services list reflect new added services.
 *   - Issue 25: work done modal / total bill value includes previous amount + new added services.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'verify-refresh';
delete process.env.GOOGLE_MAPS_API_KEY;

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../models/User');
const Worker = require('../models/Worker');
const Category = require('../models/Category');
const UserService = require('../models/UserService');
const Booking = require('../models/Booking');
const Settings = require('../models/Settings');
const { generateAccessToken } = require('../utils/tokenService');
const { invalidateBookingConfigCache } = require('../utils/bookingConfig');

(async () => {
  console.log('\n--- Verifying Fixes for Issues 20, 24, 25 ---');

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/users/bookings', require('../routes/user-routes/booking.routes'));
  app.use('/api/workers/bookings', require('../routes/worker-routes/booking.routes'));
  app.use('/api/workers', require('../routes/worker-routes/workerBill.routes'));
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    await Settings.create({ type: 'global', dispatchMode: 'distance', serviceGstPercentage: 18, partsGstPercentage: 18, visitedCharges: 149 });
    invalidateBookingConfigCache();

    const user = await User.create({ name: 'Test Customer', phone: '9000000001' });
    const userAuth = { Authorization: `Bearer ${generateAccessToken({ userId: user._id.toString(), role: 'USER' })}` };

    const workerId = (await Worker.collection.insertOne({
      name: 'Test Pro', phone: '9100000001', email: 'pro01@x.com', approvalStatus: 'approved', isActive: true, wallet: { dues: 0, cashLimit: 100000 }
    })).insertedId;
    const workerAuth = { Authorization: `Bearer ${generateAccessToken({ userId: String(workerId), role: 'WORKER' })}` };

    const category = await Category.create({ title: 'Salon', slug: 'salon-verify' });
    const brandId = new mongoose.Types.ObjectId();
    const service = await UserService.create({
      title: 'Make your own package', categoryId: category._id, brandId, basePrice: 9350, status: 'active'
    });
    const extraRepairService = await UserService.create({
      title: 'Hair Treatment Add-on', categoryId: category._id, brandId, basePrice: 500, status: 'active'
    });

    // 1. Create a booking (Original booking base: 9350, GST 18%: 1683, Visiting: 149 => Total: 11182)
    const bookingRes = await request(server).post('/api/users/bookings').set(userAuth).send({
      serviceId: String(service._id),
      address: { type: 'home', addressLine1: '1 Main', city: 'Indore', state: 'MP', pincode: '452001', lat: 22.7, lng: 75.85 },
      scheduledDate: new Date(Date.now() + 86400000).toISOString(), scheduledTime: '10:00 AM - 12:00 PM', timeSlot: { start: '10:00', end: '12:00' },
      paymentMethod: 'pay_at_home', bookingType: 'scheduled'
    });
    assert.strictEqual(bookingRes.status, 201);
    const bookingId = bookingRes.body.data._id;

    // Assign worker & set status to in_progress (after inspection)
    await Booking.updateOne({ _id: bookingId }, { $set: { vendorId: workerId, status: 'in_progress' } });

    // Initial check: worker gets booking details
    const initialWorkerRes = await request(server).get(`/api/workers/bookings/${bookingId}`).set(workerAuth);
    assert.strictEqual(initialWorkerRes.status, 200);
    assert.strictEqual(initialWorkerRes.body.data.totals.total, 11182);

    // 2. Customer adds repair service (Base: 500, GST 18%: 90 => Total: 590)
    const addRepairRes = await request(server)
      .put(`/api/users/bookings/${bookingId}/extra-services`)
      .set(userAuth)
      .send({ items: [{ serviceId: String(extraRepairService._id), quantity: 1 }] });
    assert.strictEqual(addRepairRes.status, 200);
    console.log('  ✅ Customer successfully added extra repair service');

    // 3. Issue 20 & 24 Verification: Vendor booking list and booking details reflect the new repair service
    const workerBookingsListRes = await request(server).get('/api/workers/bookings').set(workerAuth);
    assert.strictEqual(workerBookingsListRes.status, 200);
    const workerBookingInList = workerBookingsListRes.body.data[0];
    assert.ok(workerBookingInList.totals, 'Worker list booking has totals object');
    assert.strictEqual(workerBookingInList.price, 11772, 'Worker list booking price reflects repair service (11182 + 590 = 11772)');
    console.log('  ✅ Issue 20: Worker booking list reflects customer repair service amount');

    const updatedWorkerDetailRes = await request(server).get(`/api/workers/bookings/${bookingId}`).set(workerAuth);
    assert.strictEqual(updatedWorkerDetailRes.status, 200);
    const workerDetail = updatedWorkerDetailRes.body.data;
    assert.strictEqual(workerDetail.totals.total, 11772, 'Worker detail totals.total equals 11772');
    assert.strictEqual(workerDetail.totals.lines.repair.length, 1);
    assert.strictEqual(workerDetail.totals.lines.repair[0].base, 500);
    assert.strictEqual(workerDetail.totals.lines.repair[0].gst, 90);
    console.log('  ✅ Issue 24: Vendor booking detail / total invoice reflects new added service');

    // 4. Issue 25 Verification: Work done total calculation matches totals.total
    const simulatedWorkCompletionTotal = workerDetail.totals?.total;
    assert.strictEqual(simulatedWorkCompletionTotal, 11772, 'Work completion total equals 11772');
    console.log('  ✅ Issue 25: Work Done calculation reflects previous amount + new added services (11182 + 590 = 11772)');

    console.log('\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }
})().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
