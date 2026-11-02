/**
 * Catalog: city scope and "workers mapped" must agree between admin, customer and worker views.
 *
 *   - empty cityIds = open to every city; listed cities = only those (everywhere)
 *   - the admin services list and health cards honour the selected city and are not capped at 50
 *   - "workers mapped" counts professionals the way booking dispatch matches them
 *     (case-insensitive; service, category or parent-category title; stored status 'approved')
 *
 * Runs against an in-memory MongoDB. Run: node Backend/tests/catalogCityConsistency.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'catalog-city-test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'catalog-city-test-refresh';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Admin = require('../models/Admin');
const City = require('../models/City');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const UserService = require('../models/UserService');
const Worker = require('../models/Worker');
const { generateAccessToken } = require('../utils/tokenService');
const { availableInCity } = require('../utils/cityScope');

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

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', require('../routes/admin-routes/serviceManagement.routes'));
  app.use('/api/admin', require('../routes/admin-routes/categoryManagement.routes'));
  app.use('/api/admin', require('../routes/admin-routes/brandManagement.routes'));
  app.use('/api/public', require('../routes/public-routes/catalog.routes'));
  return app;
};

(async () => {
  console.log('\n--- Testing catalog city scope + workers mapped ---');
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = buildApp();

  try {
    const admin = await Admin.create({ name: 'Root', email: 'root@example.com', password: 'secret123', role: 'super_admin' });
    const auth = { Authorization: `Bearer ${generateAccessToken({ userId: admin._id.toString(), role: 'super_admin' })}` };

    const indore = await City.create({ name: 'Indore', slug: 'indore' });
    const bangalore = await City.create({ name: 'Bangalore', slug: 'bangalore', isDefault: true });

    // Categories: one open to everyone, one Indore-only, one Bangalore-only (+ a sub-category)
    const catOpen = await Category.create({ title: 'Cleaning', slug: 'cleaning-ct' });
    const catIndore = await Category.create({ title: 'Electrician', slug: 'electrician-ct', cityIds: [indore._id] });
    const subIndore = await Category.create({ title: 'Fan Repair Pros', slug: 'fan-repair-pros-ct', parentId: catIndore._id, cityIds: [indore._id] });
    const catBlr = await Category.create({ title: 'Bike Washing', slug: 'bike-washing-ct', cityIds: [bangalore._id] });

    const mkSvc = (title, category, extra = {}) => UserService.create({
      title,
      categoryId: category._id,
      brandId: new mongoose.Types.ObjectId(), // a brand that no longer exists must not hide the service
      basePrice: 300,
      status: 'active',
      ...extra
    });

    const svcOpen = await mkSvc('Home Cleaning', catOpen);
    const svcIndore = await mkSvc('Fan Repair', subIndore);
    const svcBlr = await mkSvc('Car Washing', catBlr);
    // Enough extra Indore services to cross the old 50-row cap
    for (let i = 0; i < 55; i++) await mkSvc(`Indore Extra ${i}`, catIndore);

    const insertWorker = (fields) => Worker.collection.insertOne({
      approvalStatus: 'approved', isActive: true, isOnline: true, ...fields
    });
    // Lists the sub-category / services in different letter case and with stray spaces
    await insertWorker({ name: 'W1', phone: '1', email: 'w1@x.com', service: ['  fan repair '], categories: ['ELECTRICIAN'] });
    await insertWorker({ name: 'W2', phone: '2', email: 'w2@x.com', service: ['Home Cleaning'], categories: [] });
    // Not counted: pending, inactive, other skill
    await insertWorker({ name: 'W3', phone: '3', email: 'w3@x.com', service: ['Fan Repair'], approvalStatus: 'pending' });
    await insertWorker({ name: 'W4', phone: '4', email: 'w4@x.com', service: ['Fan Repair'], isActive: false });
    await insertWorker({ name: 'W5', phone: '5', email: 'w5@x.com', service: ['Plumber'] });
    // A legacy worker whose service is a single string rather than a list must not break the count
    await insertWorker({ name: 'W6', phone: '6', email: 'w6@x.com', service: 'Fan Repair' });

    console.log('\n[Rule]');
    await it('empty cityIds is open to every city; listed cities only to those', async () => {
      assert.strictEqual(availableInCity([], indore._id), true);
      assert.strictEqual(availableInCity(undefined, indore._id), true);
      assert.strictEqual(availableInCity([indore._id], indore._id), true);
      assert.strictEqual(availableInCity([bangalore._id], indore._id), false);
      assert.strictEqual(availableInCity([bangalore._id], null), true);
    });

    console.log('\n[Admin services list]');
    const list = (q) => request(app).get(`/api/admin/services/with-stats?${q}`).set(auth);

    await it('is no longer capped at 50: a page size of 200 returns every service', async () => {
      const res = await list('limit=200');
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.total, 58);
      assert.strictEqual(res.body.services.length, 58);
    });

    await it('filters by city: Indore sees its own and the open-to-all services, not Bangalore\'s', async () => {
      const res = await list(`cityId=${indore._id}&limit=200`);
      const titles = res.body.services.map((s) => s.title);
      assert.ok(titles.includes('Home Cleaning'), 'open-to-all service missing');
      assert.ok(titles.includes('Fan Repair'));
      assert.ok(!titles.includes('Car Washing'), 'Bangalore-only service leaked into Indore');
      assert.strictEqual(res.body.total, 57);
    });

    await it('filters by city: Bangalore sees Car Washing and the open service, not Indore\'s', async () => {
      const res = await list(`cityId=${bangalore._id}&limit=200`);
      const titles = res.body.services.map((s) => s.title);
      assert.deepStrictEqual(titles.sort(), ['Car Washing', 'Home Cleaning']);
    });

    await it('an unknown or malformed city does not hide everything', async () => {
      const res = await list('cityId=not-an-id&limit=200');
      assert.strictEqual(res.body.total, 58);
    });

    await it('pagination reports total and pages', async () => {
      const res = await list('limit=20&page=3');
      assert.strictEqual(res.body.services.length, 18);
      assert.strictEqual(res.body.pages, 3);
    });

    console.log('\n[Workers mapped]');
    await it('counts professionals case-insensitively by service / category / parent title', async () => {
      const res = await list('limit=200');
      const by = Object.fromEntries(res.body.services.filter((s) => !s.title.startsWith('Indore Extra')).map((s) => [s.title, s.workersMapped]));
      // W1 (service "  fan repair ", category ELECTRICIAN) and legacy-string W6 are not both countable:
      // W1 matches Fan Repair; W6 stores a string, which is skipped rather than crashing the list.
      assert.strictEqual(by['Fan Repair'], 1);
      assert.strictEqual(by['Home Cleaning'], 1);
      assert.strictEqual(by['Car Washing'], 0);
    });

    await it('a professional who lists the parent category counts for its sub-category services', async () => {
      const res = await list('limit=200');
      // W1 lists "ELECTRICIAN" (the parent of Fan Repair Pros) and the Indore Extra services sit in it
      const extra = res.body.services.find((s) => s.title === 'Indore Extra 0');
      assert.strictEqual(extra.workersMapped, 1);
    });

    console.log('\n[Catalog health cards]');
    const health = (q = '') => request(app).get(`/api/admin/catalog/health${q}`).set(auth);

    await it('health is city-scoped like the list (cards agree with the rows under them)', async () => {
      const all = await health();
      assert.strictEqual(all.body.totalServices, 58);
      const ind = await health(`?cityId=${indore._id}`);
      assert.strictEqual(ind.body.totalServices, 57);
      const blr = await health(`?cityId=${bangalore._id}`);
      assert.strictEqual(blr.body.totalServices, 2);
    });

    await it('"needs attention" no longer flags every service as having no workers', async () => {
      const ind = await health(`?cityId=${indore._id}`);
      const noWorkers = ind.body.needsAttention.filter((n) => n.reasons.includes('no-workers-mapped'));
      // Everything under Electrician has W1; only the services with nobody mapped are flagged
      assert.ok(noWorkers.length < ind.body.totalServices, 'every service flagged: worker match is broken');
      assert.ok(!ind.body.needsAttention.some((n) => n.title === 'Fan Repair' && n.reasons.includes('no-workers-mapped')));
    });

    console.log('\n[Customer + admin category / brand lists use the same city rule]');
    await it('admin category list: Indore = Indore + open-to-all', async () => {
      const res = await request(app).get(`/api/admin/categories?cityId=${indore._id}`).set(auth);
      const titles = res.body.categories.map((c) => c.title).sort();
      assert.deepStrictEqual(titles, ['Cleaning', 'Electrician']);
    });

    await it('customer category list agrees with the admin one', async () => {
      const res = await request(app).get(`/api/public/categories?cityId=${indore._id}`);
      const titles = res.body.categories.map((c) => c.title).sort();
      assert.deepStrictEqual(titles, ['Cleaning', 'Electrician']);
    });

    await it('customer search finds an open-to-all category in any city (it used to be excluded)', async () => {
      const res = await request(app).get(`/api/public/search/advanced?q=clean&cityId=${indore._id}`);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.body.categories.some((c) => c.title === 'Cleaning'));
      const blrOnly = await request(app).get(`/api/public/search/advanced?q=bike&cityId=${indore._id}`);
      assert.ok(!blrOnly.body.categories.some((c) => c.title === 'Bike Washing'));
    });

    await it('customer services list agrees: Indore never gets Bangalore-only services', async () => {
      const res = await request(app).get(`/api/public/services?cityId=${indore._id}`);
      const titles = res.body.services.map((s) => s.title);
      assert.ok(titles.includes('Home Cleaning'));
      assert.ok(!titles.includes('Car Washing'));
    });

    await it('admin brand list uses the same rule (open-to-all brands are in every city)', async () => {
      await Brand.create({ title: 'Open Brand', slug: 'open-brand-ct', categoryIds: [catOpen._id], categoryId: catOpen._id });
      await Brand.create({ title: 'Blr Brand', slug: 'blr-brand-ct', categoryIds: [catOpen._id], categoryId: catOpen._id, cityIds: [bangalore._id] });
      const res = await request(app).get(`/api/admin/brands?cityId=${indore._id}`).set(auth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const titles = res.body.brands.map((b) => b.title);
      assert.ok(titles.includes('Open Brand'));
      assert.ok(!titles.includes('Blr Brand'));
    });

    console.log('\n[Renaming keeps professionals attached]');
    const skillsOf = async (name) => {
      const w = await Worker.collection.findOne({ name });
      return { service: w.service, categories: w.categories };
    };

    await it('renaming a category updates the professionals who picked it', async () => {
      await insertWorker({ name: 'RenameCat', phone: '7', email: 'w7@x.com', service: ['Cleaning', 'Plumber'], categories: ['Cleaning'] });
      const res = await request(app).put(`/api/admin/categories/${catOpen._id}`).set(auth).send({ title: 'Home Care' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const now = await skillsOf('RenameCat');
      assert.deepStrictEqual(now.service, ['Home Care', 'Plumber']);
      assert.deepStrictEqual(now.categories, ['Home Care']);
    });

    await it('renaming a service updates the professionals who picked it, others untouched', async () => {
      await insertWorker({ name: 'RenameSvc', phone: '8', email: 'w8@x.com', service: ['Car Washing', 'Plumber'], categories: [] });
      const res = await request(app).put(`/api/admin/services/${svcBlr._id}`).set(auth).send({ title: 'Car Wash Deluxe' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual((await skillsOf('RenameSvc')).service, ['Car Wash Deluxe', 'Plumber']);
      assert.deepStrictEqual((await skillsOf('W5')).service, ['Plumber']);
    });

    await it('does not rename a skill that another category or service still uses', async () => {
      const dup = await mkSvc('Shared Title', catOpen);
      await mkSvc('Shared Title Two', catOpen);
      await insertWorker({ name: 'Shared', phone: '9', email: 'w9@x.com', service: ['Shared Title'], categories: [] });
      // a second item carries the same title, so renaming the first must leave the pick alone
      await UserService.collection.updateOne({ title: 'Shared Title Two' }, { $set: { title: 'Shared Title', slug: 'shared-title-two-x' } });
      const res = await request(app).put(`/api/admin/services/${dup._id}`).set(auth).send({ title: 'Renamed Elsewhere' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual((await skillsOf('Shared')).service, ['Shared Title']);
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
