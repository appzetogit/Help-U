/**
 * Regression tests for the settings conflicts found in the admin-settings audit:
 *   1. switching online payments off from the Settings page must not leave no way to pay
 *   2. response speed is a real, configurable ranking weight (0 = left out)
 *   3. the server enforces the admin's slot hours and slot length, not only the customer app
 *   4. the "on the way" cancellation fee is charged exactly as the admin set it
 * Runs against an in-memory MongoDB, never the real database. Run: node tests/settingsConflicts.test.js
 */
process.env.JWT_SECRET = 'x'; process.env.JWT_REFRESH_SECRET = 'y';
const path = require('path');
const R = path.join(__dirname, '..') + path.sep;
const express = require(R + 'node_modules/express');
const request = require(R + 'node_modules/supertest');
const mongoose = require(R + 'node_modules/mongoose');
const { MongoMemoryServer } = require(R + 'node_modules/mongodb-memory-server');

const np = require.resolve(R + 'controllers/notificationControllers/notificationController');
require.cache[np] = { id: np, filename: np, loaded: true, exports: { createNotification: async () => {} } };

const User = require(R + 'models/User');
const Booking = require(R + 'models/Booking');
const Settings = require(R + 'models/Settings');
const { generateAccessToken } = require(R + 'utils/tokenService');
const { invalidateBookingConfigCache, getBookingConfig, sanitizeConfigUpdate } = require(R + 'utils/bookingConfig');
const { isOfferedSlot } = require(R + 'services/workerAvailabilityService');
const { rankWorkers } = require(R + 'services/workerScoringService');
const { updateSettings } = require(R + 'controllers/adminControllers/settingsController');

let ok = 0, bad = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
const setSettings = async (o) => { await Settings.deleteMany({}); await Settings.create({ type: 'global', ...o }); invalidateBookingConfigCache(); };
const callUpdateSettings = async (body) => {
  const out = {};
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await updateSettings({ body, app: { get: () => null } }, res, (e) => { out.error = e; });
  if (!out.status) out.status = 200;
  return out;
};
// A slot `daysAhead` days from now at hh:mm India time, as the app sends it
const slotOn = (daysAhead, hhmm) => {
  const t = new Date(Date.now() + daysAhead * 86400e3 + 5.5 * 3600e3);
  return { scheduledDate: new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())).toISOString(), scheduledTime: hhmm, timeSlot: { start: hhmm, end: '23:59' } };
};

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // ───────────────────────────── 1. payment toggle guard
  console.log('\n== 1. online payments switch on the Settings page ==');
  await setSettings({ isCashEnabled: false, isWalletPaymentEnabled: false, isOnlinePaymentEnabled: true });
  let r = await callUpdateSettings({ isOnlinePaymentEnabled: false });
  check('cash and wallet already off: turning online off is refused', r.status === 400 && /payment method/i.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
  check('...and online payments stay on in the database', (await Settings.findOne({ type: 'global' })).isOnlinePaymentEnabled === true);
  await setSettings({ isCashEnabled: true, isWalletPaymentEnabled: false, isOnlinePaymentEnabled: true });
  r = await callUpdateSettings({ isOnlinePaymentEnabled: false });
  check('cash is on: turning online off is allowed', r.status === 200 && (await Settings.findOne({ type: 'global' })).isOnlinePaymentEnabled === false, `${r.status}`);
  await setSettings({ isCashEnabled: false, isWalletPaymentEnabled: false, isOnlinePaymentEnabled: false });
  r = await callUpdateSettings({ isOnlinePaymentEnabled: true });
  check('turning online ON is always allowed', r.status === 200 && (await Settings.findOne({ type: 'global' })).isOnlinePaymentEnabled === true, `${r.status}`);

  // ───────────────────────────── 2. response-speed weight
  console.log('\n== 2. response speed in the professional ranking ==');
  await Settings.deleteMany({}); invalidateBookingConfigCache();
  let cfg = await getBookingConfig();
  check('a default exists and is 0 (the ranking stays as it was)', cfg.assignmentResponseTimeWeight === 0, String(cfg.assignmentResponseTimeWeight));
  const s = sanitizeConfigUpdate({ assignmentResponseTimeWeight: 30 });
  check('the admin can save it', s.updates.assignmentResponseTimeWeight === 30 && !s.errors.length);
  check('a value above 100 is refused', sanitizeConfigUpdate({ assignmentResponseTimeWeight: 500 }).errors.length > 0);

  const fast = new mongoose.Types.ObjectId(), slow = new mongoose.Types.ObjectId();
  const vendors = mongoose.connection.db.collection('vendors');
  await vendors.insertMany([{ _id: fast, email: 'fast@x.com', phone: '9700000001', rating: 4.5, totalReviews: 10 }, { _id: slow, email: 'slow@x.com', phone: '9700000002', rating: 4.5, totalReviews: 10 }]);
  const sentAt = new Date(Date.now() - 3600e3);
  const reqs = mongoose.connection.db.collection('bookingrequests');
  await reqs.insertOne({ vendorId: fast, status: 'ACCEPTED', sentAt, respondedAt: new Date(sentAt.getTime() + 8000) });
  await reqs.insertOne({ vendorId: slow, status: 'ACCEPTED', sentAt, respondedAt: new Date(sentAt.getTime() + 400000) });
  const input = () => [{ _id: slow, distance: 2 }, { _id: fast, distance: 2 }];
  const base = { assignmentStrategy: 'smart', assignmentDistanceWeight: 40, assignmentRatingWeight: 25, assignmentAcceptanceWeight: 20, assignmentCompletionWeight: 15, assignmentStatsWindowDays: 90, assignmentMinRating: 0 };
  let ranked = await rankWorkers(input(), { ...base, assignmentResponseTimeWeight: 0 }, { radiusKm: 10 });
  check('weight 0: a fast and a slow responder score the same', ranked[0].score === ranked[1].score, ranked.map((w) => w.score).join(' vs '));
  ranked = await rankWorkers(input(), { ...base, assignmentResponseTimeWeight: 40 }, { radiusKm: 10 });
  check('weight 40: the fast responder ranks first with a higher score', String(ranked[0]._id) === String(fast) && ranked[0].score > ranked[1].score, ranked.map((w) => w.score).join(' vs '));
  ranked = await rankWorkers(input(), { ...base, assignmentResponseTimeWeight: 100 }, { radiusKm: 10 });
  const gapBig = ranked[0].score - ranked[1].score;
  ranked = await rankWorkers(input(), { ...base, assignmentResponseTimeWeight: 10 }, { radiusKm: 10 });
  check('a bigger weight separates them more', gapBig > ranked[0].score - ranked[1].score);
  ranked = await rankWorkers(input(), { ...base, assignmentDistanceWeight: 0, assignmentRatingWeight: 0, assignmentAcceptanceWeight: 0, assignmentCompletionWeight: 0, assignmentResponseTimeWeight: 50 }, { radiusKm: 10 });
  check('response speed alone can drive the ranking', String(ranked[0]._id) === String(fast));
  ranked = await rankWorkers([{ _id: slow, distance: 1 }, { _id: fast, distance: 9 }], { ...base, assignmentDistanceWeight: 0, assignmentRatingWeight: 0, assignmentAcceptanceWeight: 0, assignmentCompletionWeight: 0, assignmentResponseTimeWeight: 0 }, { radiusKm: 10 });
  check('every weight 0 does not crash (ties fall back to nearest)', ranked.length === 2 && String(ranked[0]._id) === String(slow));

  // ───────────────────────────── 3. slot hours and length on the server
  console.log('\n== 3. the admin\'s slot hours are enforced by the server ==');
  const at = (start) => ({ timeSlot: { start } });
  const std = { slotStartHour: 9, slotEndHour: 20, slotDurationMinutes: 60 };
  check('09:00 (first slot) is offered', isOfferedSlot(at('09:00'), std));
  check('14:00 is offered', isOfferedSlot(at('14:00'), std));
  check('20:00 (last slot may start at the end hour) is offered', isOfferedSlot(at('20:00'), std));
  check('03:00 is refused', !isOfferedSlot(at('03:00'), std));
  check('08:00 (before opening) is refused', !isOfferedSlot(at('08:00'), std));
  check('21:00 (after closing) is refused', !isOfferedSlot(at('21:00'), std));
  check('09:30 (between slots) is refused', !isOfferedSlot(at('09:30'), std));
  check('"Now" / junk / missing is refused', !isOfferedSlot(at('Now'), std) && !isOfferedSlot({}, std) && !isOfferedSlot(at(''), std));
  const long = { slotStartHour: 9, slotEndHour: 20, slotDurationMinutes: 90 };
  check('90-minute slots: 10:30 is offered, 10:00 is not', isOfferedSlot(at('10:30'), long) && !isOfferedSlot(at('10:00'), long));
  const late = { slotStartHour: 6, slotEndHour: 22, slotDurationMinutes: 30 };
  check('admin widens the window: 06:30 and 21:30 are offered', isOfferedSlot(at('06:30'), late) && isOfferedSlot(at('21:30'), late));

  // through the real reschedule route
  const app = express(); app.use(express.json());
  app.use('/api/users/bookings', require(R + 'routes/user-routes/booking.routes'));
  const user = await User.create({ name: 'T', phone: '9300000009' });
  const A = { Authorization: 'Bearer ' + generateAccessToken({ userId: String(user._id), role: 'USER' }) };
  const mk = () => Booking.create({ userId: user._id, categoryId: new mongoose.Types.ObjectId(), serviceId: new mongoose.Types.ObjectId(), serviceName: 'V', serviceCategory: 'AC', bookingNumber: 'BK' + Math.random().toString(36).slice(2, 9), status: 'searching', bookingType: 'scheduled', finalAmount: 500, basePrice: 500, address: { addressLine1: 'x', city: 'I', state: 'M', pincode: '1' }, paymentMethod: 'cash', paymentStatus: 'pending', scheduledDate: new Date(Date.now() + 3 * 86400e3), scheduledTime: '10:00', timeSlot: { start: '10:00', end: '11:00' } });
  await Settings.deleteMany({}); invalidateBookingConfigCache();
  const move = async (hhmm) => request(app).put(`/api/users/bookings/${(await mk())._id}/reschedule`).set(A).send(slotOn(3, hhmm));
  r = await move('03:00'); check('reschedule to 03:00 -> refused with a clear message', r.status === 400 && /available slots/i.test(r.body.message || ''), `${r.status} ${r.body.message}`);
  r = await move('09:30'); check('reschedule to 09:30 (between slots) -> refused', r.status === 400 && /available slots/i.test(r.body.message || ''), `${r.status}`);
  r = await move('21:00'); check('reschedule to 21:00 (after closing) -> refused', r.status === 400, `${r.status}`);
  r = await move('11:00'); check('reschedule to 11:00 -> accepted', r.status === 200, `${r.status} ${r.body.message || ''}`);
  await setSettings({ slotStartHour: 6, slotEndHour: 22, slotDurationMinutes: 30 });
  r = await move('06:30'); check('after the admin widens the hours, 06:30 is accepted', r.status === 200, `${r.status} ${r.body.message || ''}`);
  r = await move('11:15'); check('...but 11:15 is still not on the 30-minute grid', r.status === 400, `${r.status}`);

  // ───────────────────────────── 4. on-the-way fee honoured
  console.log('\n== 4. the "on the way" fee is charged as the admin set it ==');
  const mkBooking = (over) => Booking.create({ userId: user._id, vendorId: new mongoose.Types.ObjectId(), categoryId: new mongoose.Types.ObjectId(), serviceId: new mongoose.Types.ObjectId(), serviceName: 'V', serviceCategory: 'AC', bookingNumber: 'BK' + Math.random().toString(36).slice(2, 9), status: 'journey_started', journeyStartedAt: new Date(), bookingType: 'scheduled', finalAmount: 500, basePrice: 500, address: { addressLine1: 'x', city: 'I', state: 'M', pincode: '1' }, paymentMethod: 'cash', paymentStatus: 'pending', scheduledDate: new Date(Date.now() + 86400e3), scheduledTime: '10:00', timeSlot: { start: '10:00', end: '11:00' }, ...over });
  const feeFor = async (over) => (await request(app).get(`/api/users/bookings/${(await mkBooking(over))._id}/cancellation-preview`).set(A)).body.data;
  await setSettings({ cancellationPenalty: 21, userLateCancelFeeType: 'fixed', userLateCancelFeeValue: 49 });
  let p = await feeFor({}); check('on the way ₹21 with a ₹49 late fee -> charged ₹21 (what the admin set)', p.fee === 21 && p.stage === 'journey', JSON.stringify(p));
  await setSettings({ cancellationPenalty: 100, userLateCancelFeeType: 'fixed', userLateCancelFeeValue: 49 });
  p = await feeFor({}); check('on the way ₹100 -> ₹100', p.fee === 100, JSON.stringify(p));
  await setSettings({ cancellationPenalty: 21, userLateCancelFeeType: 'percentage', userLateCancelFeeValue: 20, userLateCancelFeeMax: 0 });
  p = await feeFor({}); check('a percentage late fee does not change the on-the-way fee (₹21)', p.fee === 21, JSON.stringify(p));
  await setSettings({ cancellationPenalty: 700, userLateCancelFeeType: 'fixed', userLateCancelFeeValue: 49 });
  p = await feeFor({}); check('never more than the booking amount (₹500)', p.fee === 500, JSON.stringify(p));
  await setSettings({ cancellationPenalty: 21, userLateCancelFeeType: 'fixed', userLateCancelFeeValue: 49 });
  // Once the professional has arrived the customer can no longer cancel, so there is no fee to preview
  const arrived = await request(app).get(`/api/users/bookings/${(await mkBooking({ status: 'visited', visitedAt: new Date(), visitingCharges: 80 }))._id}/cancellation-preview`).set(A);
  check('once the professional has arrived, cancelling is refused (no fee is offered)', arrived.status === 400 && /already arrived/i.test(arrived.body.message || ''), `${arrived.status} ${arrived.body.message || ''}`);
  await setSettings({ cancellationPenalty: 0, userLateCancelFeeType: 'fixed', userLateCancelFeeValue: 0 });
  p = await feeFor({}); check('everything 0 -> free', p.isFree === true, JSON.stringify(p));

  console.log(`\nRESULT: ${ok} passed, ${bad} failed`);
  await mongoose.disconnect(); await mongod.stop();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
