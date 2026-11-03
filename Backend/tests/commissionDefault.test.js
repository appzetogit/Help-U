/**
 * The global default commission is edited in ONE place: the Commission page endpoint.
 * The Settings and Booking Configuration endpoints must ignore those fields, while bills keep
 * resolving the commission exactly as before. In-memory MongoDB.
 * Run: node tests/commissionDefault.test.js
 */
process.env.JWT_SECRET = 'x'; process.env.JWT_REFRESH_SECRET = 'y';
const path = require('path');
const R = path.join(__dirname, '..') + path.sep;
const mongoose = require(R + 'node_modules/mongoose');
const { MongoMemoryServer } = require(R + 'node_modules/mongodb-memory-server');

const np = require.resolve(R + 'controllers/notificationControllers/notificationController');
require.cache[np] = { id: np, filename: np, loaded: true, exports: { createNotification: async () => {} } };

const Settings = require(R + 'models/Settings');
const AdminAuditLog = require(R + 'models/AdminAuditLog');
const { invalidateBookingConfigCache, getBookingConfig, sanitizeConfigUpdate } = require(R + 'utils/bookingConfig');
const { updateSettings } = require(R + 'controllers/adminControllers/settingsController');
const { updateConfig } = require(R + 'controllers/adminControllers/bookingConfigController');
const { updateDefault, listRules } = require(R + 'controllers/adminControllers/commissionController');
const { resolveCommission, computeWorkerEarnings } = require(R + 'services/commissionService');

let ok = 0, bad = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

const ADMIN_ID = String(new mongoose.Types.ObjectId());
const call = async (fn, body = {}, query = {}) => {
  const out = {};
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await fn({ body, query, user: { id: ADMIN_ID, _id: ADMIN_ID }, app: { get: () => null } }, res, (e) => { out.error = e; });
  if (!out.status) out.status = 200;
  return out;
};
const reset = async (o = {}) => { await Settings.deleteMany({}); await Settings.create({ type: 'global', ...o }); invalidateBookingConfigCache(); };
const stored = () => Settings.findOne({ type: 'global' }).lean();

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  console.log('\n== Commission page saves the global default ==');
  await reset({ servicePayoutPercentage: 90, partsPayoutPercentage: 100, defaultCommissionType: 'percentage' });
  let r = await call(updateDefault, { commissionType: 'percentage', percentageCommission: 40, partsPayoutPercentage: 10 });
  let s = await stored();
  check('40% platform commission is stored as a 60% worker payout', r.status === 200 && s.servicePayoutPercentage === 60, `${r.status} ${s.servicePayoutPercentage}`);
  check('parts payout is stored', s.partsPayoutPercentage === 10);
  check('the response reports the same default', r.body.globalDefault.percentageCommission === 40 && r.body.globalDefault.servicePayoutPercentage === 60);
  let c = await resolveCommission({});
  check('a bill with no rule resolves to 40% / worker 60%', c.source === 'global' && c.commissionValue === 40 && c.serviceSplitPercentage === 60, JSON.stringify(c));
  let e = computeWorkerEarnings(c, { serviceBase: 1000, partsBase: 100 });
  check('worker earns 600 + 10 on 1000 service + 100 parts', e.vendorServiceEarning === 600 && e.vendorPartsEarning === 10, JSON.stringify(e));

  r = await call(updateDefault, { commissionType: 'fixed', fixedCommission: 50 });
  c = await resolveCommission({});
  check('switching to fixed uses the fixed ₹ amount', c.commissionType === 'fixed' && c.commissionValue === 50, JSON.stringify(c));
  check('and leaves the percentage it did not receive alone', (await stored()).servicePayoutPercentage === 60);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const audits = await AdminAuditLog.find({ description: /default commission/i }).lean();
  check('each change is recorded in the audit log', audits.length === 2 && audits.every((a) => a.module === 'financial'), `${audits.length} rows`);

  console.log('\n== Validation ==');
  await reset({ servicePayoutPercentage: 60 });
  for (const [label, body] of [
    ['commission above 100', { percentageCommission: 101 }],
    ['negative commission', { percentageCommission: -1 }],
    ['non-numeric commission', { percentageCommission: 'abc' }],
    ['blank commission', { percentageCommission: '' }],
    ['unknown type', { commissionType: 'both' }],
    ['parts payout above 100', { partsPayoutPercentage: 150 }],
    ['fixed above the limit', { fixedCommission: 1e9 }],
    ['nothing sent', {}]
  ]) {
    r = await call(updateDefault, body);
    check(`${label} is refused`, r.status === 400, `${r.status} ${r.body?.message}`);
  }
  s = await stored();
  check('and nothing was changed by the refused requests', s.servicePayoutPercentage === 60 && s.defaultCommissionType === 'percentage');

  console.log('\n== Other pages can no longer change it ==');
  await reset({ servicePayoutPercentage: 60, partsPayoutPercentage: 10, defaultCommissionType: 'percentage', defaultFixedCommission: 0 });
  r = await call(updateSettings, { servicePayoutPercentage: 99, partsPayoutPercentage: 99, visitedCharges: 77 });
  s = await stored();
  check('the Settings endpoint ignores the payout percentages', r.status === 200 && s.servicePayoutPercentage === 60 && s.partsPayoutPercentage === 10, `${r.status} ${s.servicePayoutPercentage}/${s.partsPayoutPercentage}`);
  check('...while still saving its own fields (visiting charge)', s.visitedCharges === 77);
  const san = sanitizeConfigUpdate({ defaultCommissionType: 'fixed', defaultFixedCommission: 500, minWithdrawalAmount: 250 });
  check('the Booking Config sanitiser drops the commission fields', !('defaultCommissionType' in san.updates) && !('defaultFixedCommission' in san.updates) && !san.errors.length, JSON.stringify(san));
  check('...but keeps its own (min withdrawal)', san.updates.minWithdrawalAmount === 250);
  r = await call(updateConfig, { defaultCommissionType: 'fixed', defaultFixedCommission: 500 });
  check('a request with only commission fields is refused as having nothing to save', r.status === 400, `${r.status} ${r.body?.message}`);
  await call(updateConfig, { defaultCommissionType: 'fixed', defaultFixedCommission: 500, minWithdrawalAmount: 250 });
  s = await stored();
  check('the Booking Config endpoint left the commission untouched', s.defaultCommissionType === 'percentage' && s.defaultFixedCommission === 0, `${s.defaultCommissionType}/${s.defaultFixedCommission}`);
  check('...and saved its own field', s.minWithdrawalAmount === 250);

  console.log('\n== Readers still work ==');
  const cfg = await getBookingConfig();
  check('the booking config still reads the stored commission settings', cfg.defaultCommissionType === 'percentage' && cfg.servicePayoutPercentage === 60);
  r = await call(listRules);
  check('the Commission page list returns the same default', r.body.globalDefault.percentageCommission === 40 && r.body.globalDefault.partsPayoutPercentage === 10, JSON.stringify(r.body.globalDefault));

  console.log(`\nRESULT: ${ok} passed, ${bad} failed`);
  await mongoose.disconnect(); await mongod.stop();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
