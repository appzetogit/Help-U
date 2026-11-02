/**
 * A city's position is stored in the database (so the admin map, and later nearest-city detection, do not
 * depend on a live lookup in the browser).
 *   - adding a city looks it up (name + state) and saves lat/lng
 *   - renaming it looks it up again; an unchanged city is not looked up again
 *   - the admin can send a position by hand, or press "Locate" for cities that have none
 *   - a failed lookup never blocks adding / editing a city
 * Runs against an in-memory MongoDB with the map lookup replaced. Run: node Backend/tests/cityLocation.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'city-location-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'city-location-test-refresh';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Replace the Google lookup before anything uses it
const locationService = require('../services/locationService');
const PLACES = {
  'Indore, Madhya Pradesh, India': { lat: 22.7196, lng: 75.8577 },
  'Bhopal, Madhya Pradesh, India': { lat: 23.2599, lng: 77.4126 },
  'Ujjain, Madhya Pradesh, India': { lat: 23.1765, lng: 75.7885 }
};
const asked = [];
let mapDown = false;
locationService.geocodeAddress = async (address) => {
  asked.push(address);
  if (mapDown) return null;
  return PLACES[address] || null;
};

const Admin = require('../models/Admin');
const City = require('../models/City');
const { generateAccessToken } = require('../utils/tokenService');

let passed = 0;
let failed = 0;
async function it(desc, fn) {
  try { await fn(); console.log(`  ✅ ${desc}`); passed++; } catch (err) { console.error(`  ❌ ${desc}:`, err.message); failed++; }
}

(async () => {
  console.log('\n--- Testing stored city positions ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin-routes/cityManagement.routes'));
  app.use('/api/public/cities', require('../routes/public-routes/city.routes'));
  // One server for the whole run: a fresh server on a random port per request can land on a port another program just took
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

  try {
    const admin = await Admin.create({ name: 'Root', email: 'root@example.com', password: 'secret123', role: 'super_admin' });
    const auth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };

    let indoreId;
    await it('adding a city looks it up and stores its position', async () => {
      asked.length = 0;
      const res = await request(server).post('/api/admin/cities').set(auth).send({ name: 'Indore', state: 'Madhya Pradesh', country: 'India' });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.deepStrictEqual(asked, ['Indore, Madhya Pradesh, India']);
      assert.strictEqual(res.body.city.location.lat, 22.7196);
      assert.strictEqual(res.body.city.location.lng, 75.8577);
      assert.strictEqual(res.body.city.location.source, 'geocoded');
      indoreId = res.body.city._id;
      const saved = await City.findById(indoreId).lean();
      assert.strictEqual(saved.location.lat, 22.7196, 'must be in the database, not just in the response');
    });

    await it('the admin list and the public list both carry it', async () => {
      const admin1 = await request(server).get('/api/admin/cities').set(auth);
      assert.strictEqual(admin1.body.cities[0].location.lng, 75.8577);
      const pub = await request(server).get('/api/public/cities');
      assert.strictEqual(pub.status, 200, JSON.stringify(pub.body));
      assert.strictEqual(pub.body.cities[0].location.lat, 22.7196);
    });

    await it('a lookup that fails never blocks adding the city', async () => {
      mapDown = true;
      const res = await request(server).post('/api/admin/cities').set(auth).send({ name: 'Bhopal', state: 'Madhya Pradesh' });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      assert.strictEqual(res.body.city.location.lat, null);
      assert.strictEqual(res.body.city.location.source, null);
      mapDown = false;
    });

    let bhopalId;
    await it('"Locate" finds a city that has no position yet', async () => {
      bhopalId = (await City.findOne({ name: 'Bhopal' }))._id;
      const res = await request(server).post(`/api/admin/cities/${bhopalId}/locate`).set(auth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.city.location.lat, 23.2599);
    });

    await it('"Locate" reports a failure clearly and leaves the city as it was', async () => {
      const unknown = await City.create({ name: 'Nowhereville', slug: 'nowhereville', state: 'Madhya Pradesh' });
      const res = await request(server).post(`/api/admin/cities/${unknown._id}/locate`).set(auth);
      assert.strictEqual(res.status, 422, JSON.stringify(res.body));
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Nowhereville/);
      assert.strictEqual((await City.findById(unknown._id)).location.lat, null);
    });

    await it('"Locate" on a missing city is a 404', async () => {
      const res = await request(server).post(`/api/admin/cities/${new mongoose.Types.ObjectId()}/locate`).set(auth);
      assert.strictEqual(res.status, 404);
    });

    await it('an unchanged city is not looked up again when other fields are edited', async () => {
      asked.length = 0;
      const res = await request(server).put(`/api/admin/cities/${indoreId}`).set(auth).send({ name: 'Indore', state: 'Madhya Pradesh', country: 'India', isActive: true });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual(asked, [], 'no lookup expected');
    });

    await it('renaming a city looks it up again and moves its position', async () => {
      const ujjain = await City.create({ name: 'Ujj', slug: 'ujj', state: 'Madhya Pradesh', location: { lat: 1, lng: 2, source: 'geocoded' } });
      asked.length = 0;
      const res = await request(server).put(`/api/admin/cities/${ujjain._id}`).set(auth).send({ name: 'Ujjain' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual(asked, ['Ujjain, Madhya Pradesh, India']);
      assert.strictEqual(res.body.city.location.lat, 23.1765);
    });

    await it('a position sent by the admin is kept and marked manual (no lookup)', async () => {
      asked.length = 0;
      const res = await request(server).put(`/api/admin/cities/${indoreId}`).set(auth).send({ location: { lat: 22.75, lng: 75.9 } });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual(asked, []);
      assert.deepStrictEqual([res.body.city.location.lat, res.body.city.location.lng, res.body.city.location.source], [22.75, 75.9, 'manual']);
    });

    await it('a nonsense position is ignored instead of saved', async () => {
      const res = await request(server).put(`/api/admin/cities/${indoreId}`).set(auth).send({ location: { lat: 999, lng: 'x' } });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.city.location.lat, 22.75, 'the earlier valid position must stay');
    });

    await it('only an admin can locate', async () => {
      const res = await request(server).post(`/api/admin/cities/${bhopalId}/locate`);
      assert.ok([401, 403].includes(res.status), `${res.status}`);
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
