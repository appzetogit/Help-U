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
  // One server for the whole run: a fresh server on a random port per request can land on a port another program just took
  const server = require('http').createServer(app).listen(0, '127.0.0.1');

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
    const list = (q) => request(server).get(`/api/admin/services/with-stats?${q}`).set(auth);

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
    const health = (q = '') => request(server).get(`/api/admin/catalog/health${q}`).set(auth);

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
      const res = await request(server).get(`/api/admin/categories?cityId=${indore._id}`).set(auth);
      const titles = res.body.categories.map((c) => c.title).sort();
      assert.deepStrictEqual(titles, ['Cleaning', 'Electrician']);
    });

    await it('customer category list agrees with the admin one', async () => {
      const res = await request(server).get(`/api/public/categories?cityId=${indore._id}`);
      const titles = res.body.categories.map((c) => c.title).sort();
      assert.deepStrictEqual(titles, ['Cleaning', 'Electrician']);
    });

    await it('customer search finds an open-to-all category in any city (it used to be excluded)', async () => {
      const res = await request(server).get(`/api/public/search/advanced?q=clean&cityId=${indore._id}`);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.ok(res.body.categories.some((c) => c.title === 'Cleaning'));
      const blrOnly = await request(server).get(`/api/public/search/advanced?q=bike&cityId=${indore._id}`);
      assert.ok(!blrOnly.body.categories.some((c) => c.title === 'Bike Washing'));
    });

    await it('customer services list agrees: Indore never gets Bangalore-only services', async () => {
      const res = await request(server).get(`/api/public/services?cityId=${indore._id}`);
      const titles = res.body.services.map((s) => s.title);
      assert.ok(titles.includes('Home Cleaning'));
      assert.ok(!titles.includes('Car Washing'));
    });

    await it('admin brand list uses the same rule (open-to-all brands are in every city)', async () => {
      await Brand.create({ title: 'Open Brand', slug: 'open-brand-ct', categoryIds: [catOpen._id], categoryId: catOpen._id });
      await Brand.create({ title: 'Blr Brand', slug: 'blr-brand-ct', categoryIds: [catOpen._id], categoryId: catOpen._id, cityIds: [bangalore._id] });
      const res = await request(server).get(`/api/admin/brands?cityId=${indore._id}`).set(auth);
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
      const res = await request(server).put(`/api/admin/categories/${catOpen._id}`).set(auth).send({ title: 'Home Care' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const now = await skillsOf('RenameCat');
      assert.deepStrictEqual(now.service, ['Home Care', 'Plumber']);
      assert.deepStrictEqual(now.categories, ['Home Care']);
    });

    await it('renaming a service updates the professionals who picked it, others untouched', async () => {
      await insertWorker({ name: 'RenameSvc', phone: '8', email: 'w8@x.com', service: ['Car Washing', 'Plumber'], categories: [] });
      const res = await request(server).put(`/api/admin/services/${svcBlr._id}`).set(auth).send({ title: 'Car Wash Deluxe' });
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
      const res = await request(server).put(`/api/admin/services/${dup._id}`).set(auth).send({ title: 'Renamed Elsewhere' });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.deepStrictEqual((await skillsOf('Shared')).service, ['Shared Title']);
    });

    console.log('\n[Sub-categories follow their parent; list and cards agree]');
    // A sub-category with no cities of its own, under an Indore-only parent, must not appear elsewhere
    const subOpenUnderIndore = await Category.create({ title: 'Open Child', slug: 'open-child-ct', parentId: catIndore._id });
    const subOpenUnderOpen = await Category.create({ title: 'Open Child Of Open', slug: 'open-child-of-open-ct', parentId: catOpen._id });
    const svcInOrphan = await mkSvc('Orphan Child Service', subOpenUnderIndore);

    await it('admin category list: a sub-category is not available where its parent is not', async () => {
      const blr = await request(server).get(`/api/admin/categories?parentId=all&cityId=${bangalore._id}`).set(auth);
      const titles = blr.body.categories.map((c) => c.title);
      assert.ok(!titles.includes('Open Child'), 'sub-category of an Indore-only parent leaked into Bangalore');
      assert.ok(!titles.includes('Electrician') && !titles.includes('Fan Repair Pros'));
      assert.ok(titles.includes('Open Child Of Open'), 'child of an all-city parent should be everywhere');
      const ind = await request(server).get(`/api/admin/categories?parentId=all&cityId=${indore._id}`).set(auth);
      const indTitles = ind.body.categories.map((c) => c.title);
      assert.ok(indTitles.includes('Open Child') && indTitles.includes('Fan Repair Pros'));
    });

    await it('customer category list agrees (top level and children)', async () => {
      const kids = await request(server).get(`/api/public/categories?parentId=all&cityId=${bangalore._id}`);
      const titles = kids.body.categories.map((c) => c.title);
      assert.ok(!titles.includes('Open Child'));
      assert.ok(titles.includes('Open Child Of Open'));
    });

    await it('a service under such a sub-category is not in the other city either', async () => {
      const blr = await list(`cityId=${bangalore._id}&limit=200`);
      assert.ok(!blr.body.services.some((s) => s.title === 'Orphan Child Service'));
      const ind = await list(`cityId=${indore._id}&limit=200`);
      assert.ok(ind.body.services.some((s) => s.title === 'Orphan Child Service'));
    });

    await it('archived services stay out of the list unless asked for, like the cards', async () => {
      await UserService.updateOne({ _id: svcInOrphan._id }, { status: 'deleted' });
      const def = await list(`cityId=${indore._id}&limit=200`);
      assert.ok(!def.body.services.some((s) => s.title === 'Orphan Child Service'));
      const archived = await list(`cityId=${indore._id}&status=deleted&limit=200`);
      assert.ok(archived.body.services.some((s) => s.title === 'Orphan Child Service'));
    });

    await it('for every city the list total equals the cards total (no more 377 vs 1)', async () => {
      for (const c of [indore, bangalore]) {
        const l = await list(`cityId=${c._id}&limit=200`);
        const h = await health(`?cityId=${c._id}`);
        assert.strictEqual(l.body.total, h.body.totalServices, `city ${c.name}: list ${l.body.total} vs cards ${h.body.totalServices}`);
      }
      const l = await list('limit=200');
      const h = await health();
      assert.strictEqual(l.body.total, h.body.totalServices);
    });

    console.log('\n[Partner skill tree: category > sub-category > service]');
    await it('returns categories with their sub-categories and services, only active ones', async () => {
      const res = await request(server).get('/api/public/worker-skill-tree');
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const electrician = res.body.categories.find((c) => c.title === 'Electrician');
      assert.ok(electrician, 'top-level category missing');
      const fanPros = electrician.subCategories.find((s) => s.title === 'Fan Repair Pros');
      assert.ok(fanPros, 'sub-category not nested under its category');
      assert.ok(fanPros.services.some((s) => s.title === 'Fan Repair'), 'service not under its sub-category');
      assert.ok(electrician.services.some((s) => s.title.startsWith('Indore Extra')), 'service directly under the category missing');
      // sub-categories are never listed at the top level
      assert.ok(!res.body.categories.some((c) => c.title === 'Fan Repair Pros'));
    });

    await it('follows the city: an Indore-only category (and its children) is not offered in Bangalore', async () => {
      const blr = await request(server).get(`/api/public/worker-skill-tree?cityId=${bangalore._id}`);
      const titles = blr.body.categories.map((c) => c.title);
      assert.ok(!titles.includes('Electrician'));
      assert.ok(titles.includes('Cleaning') || titles.includes('Home Care'), 'an all-city category should be offered');
      const ind = await request(server).get(`/api/public/worker-skill-tree?cityId=${indore._id}`);
      assert.ok(ind.body.categories.some((c) => c.title === 'Electrician'));
    });

    await it('is public (a new partner has no login yet) and leaves out inactive items', async () => {
      await Category.updateOne({ _id: catBlr._id }, { status: 'inactive' });
      const res = await request(server).get('/api/public/worker-skill-tree');
      assert.strictEqual(res.status, 200);
      assert.ok(!res.body.categories.some((c) => c.title === 'Bike Washing'));
    });

    console.log('\n[What is inside each category (admin list counts)]');
    await Brand.create({ title: 'Indore Brand', slug: 'indore-brand-ct', categoryIds: [catIndore._id], categoryId: catIndore._id, cityIds: [indore._id] });
    const withCounts = async (q = '') => (await request(server).get(`/api/admin/categories?parentId=all&withCounts=true${q}`).set(auth)).body.categories;
    const find = (cats, title) => cats.find((c) => c.title === title);

    await it('is off unless asked for (the plain list stays cheap)', async () => {
      const res = await request(server).get('/api/admin/categories?parentId=all').set(auth);
      assert.ok(res.body.categories.every((c) => c.counts === undefined));
    });

    await it('a top-level category counts its sub-categories, brands, services and workers', async () => {
      const electrician = find(await withCounts(`&cityId=${indore._id}`), 'Electrician').counts;
      assert.deepStrictEqual(electrician.subCategories, { total: 2, active: 2 }); // Fan Repair Pros, Open Child
      assert.strictEqual(electrician.brands, 1);
      // 55 straight under it + Fan Repair (in Fan Repair Pros); the archived Orphan Child Service is left out
      assert.deepStrictEqual(electrician.services, { total: 56, active: 56 });
      assert.strictEqual(electrician.workers, 1); // W1 lists ELECTRICIAN; pending / inactive / other-skill / legacy-string workers do not count
    });

    await it('a sub-category counts its own services, and workers who list its parent', async () => {
      const cats = await withCounts(`&cityId=${indore._id}`);
      const fanPros = find(cats, 'Fan Repair Pros').counts;
      assert.deepStrictEqual(fanPros.subCategories, { total: 0, active: 0 });
      assert.deepStrictEqual(fanPros.services, { total: 1, active: 1 });
      assert.strictEqual(fanPros.workers, 1, 'W1 lists the parent, which covers the sub-category');
      const openChild = find(cats, 'Open Child').counts;
      assert.deepStrictEqual(openChild.services, { total: 0, active: 0 });
      assert.strictEqual(openChild.workers, 1);
    });

    await it('a category nobody can serve shows zero workers (so the admin can spot it)', async () => {
      const cats = await withCounts();
      // 3 distinct workers can take work in 'Home Care': RenameCat lists the category itself, W2 lists its service
      // 'Home Cleaning', and 'Shared' lists another service in it
      assert.strictEqual(find(cats, 'Home Care').counts.workers, 3);
      const empty = await Category.create({ title: 'Nobody Does This', slug: 'nobody-does-this-ct' });
      const again = await withCounts();
      assert.strictEqual(find(again, 'Nobody Does This').counts.workers, 0);
      await Category.deleteOne({ _id: empty._id });
    });

    await it('with a city the numbers match that city (the Services tab), not the whole catalogue', async () => {
      // 'Home Care' (open to all cities) has the open-to-all service everywhere
      // 'Home Care' is open to every city, so its 3 services (Home Cleaning + the two 'Shared Title' ones) are in Bangalore too
      const blr = find(await withCounts(`&cityId=${bangalore._id}`), 'Home Care').counts;
      assert.deepStrictEqual(blr.services, { total: 3, active: 3 });
      // while Indore-only Electrician is not even listed in Bangalore
      assert.strictEqual(find(await withCounts(`&cityId=${bangalore._id}`), 'Electrician'), undefined);
      // Brand tagged to Indore only: counted in Indore, not in Bangalore
      const indoreBrand = find(await withCounts(`&cityId=${indore._id}`), 'Electrician').counts.brands;
      assert.strictEqual(indoreBrand, 1);
    });

    await it('the workers behind a count can be listed, and are exactly that many', async () => {
      const cats = await withCounts(`&cityId=${indore._id}`);
      const electrician = find(cats, 'Electrician');
      const res = await request(server).get(`/api/admin/categories/${electrician.id}/workers?cityId=${indore._id}`).set(auth);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.total, electrician.counts.workers);
      assert.deepStrictEqual(res.body.workers.map((w) => w.name), ['W1']);
      assert.ok(res.body.workers[0].phone !== undefined);
      const missing = await request(server).get(`/api/admin/categories/${new mongoose.Types.ObjectId()}/workers`).set(auth);
      assert.strictEqual(missing.status, 404);
    });

    await it('the Services tab filtered by a category includes its sub-categories\' services (and a sub-category narrows it)', async () => {
      const electrician = find(await withCounts(`&cityId=${indore._id}`), 'Electrician');
      const parent = await request(server).get(`/api/admin/services/with-stats?categoryId=${electrician.id}&cityId=${indore._id}&limit=200`).set(auth);
      assert.strictEqual(parent.body.total, electrician.counts.services.total, 'list total must equal the count shown on the Categories tab');
      assert.ok(parent.body.services.some((s) => s.title === 'Fan Repair'), 'a service under a sub-category must be included');
      const fanPros = find(await withCounts(`&cityId=${indore._id}`), 'Fan Repair Pros');
      const sub = await request(server).get(`/api/admin/services/with-stats?categoryId=${fanPros.id}&limit=200`).set(auth);
      assert.deepStrictEqual(sub.body.services.map((s) => s.title), ['Fan Repair']);
    });

    await it('archived categories stay out of the lists unless asked for', async () => {
      const gone = await Category.create({ title: 'Archived Thing', slug: 'archived-thing-ct', status: 'deleted' });
      const plain = (await request(server).get('/api/admin/categories?parentId=all').set(auth)).body.categories.map((c) => c.title);
      assert.ok(!plain.includes('Archived Thing'), 'an archived category leaked into the normal list');
      const archived = (await request(server).get('/api/admin/categories?parentId=all&status=deleted').set(auth)).body.categories.map((c) => c.title);
      assert.ok(archived.includes('Archived Thing'));
      const everything = (await request(server).get('/api/admin/categories?parentId=all&includeDeleted=true').set(auth)).body.categories.map((c) => c.title);
      assert.ok(everything.includes('Archived Thing') && everything.includes('Electrician'));
      await Category.deleteOne({ _id: gone._id });
    });

    await it('archived services are not counted', async () => {
      const before = find(await withCounts(`&cityId=${indore._id}`), 'Electrician').counts.services.total;
      const svc = await UserService.findOne({ title: 'Indore Extra 3' });
      await UserService.updateOne({ _id: svc._id }, { status: 'deleted' });
      const after = find(await withCounts(`&cityId=${indore._id}`), 'Electrician').counts.services.total;
      assert.strictEqual(after, before - 1);
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
