/**
 * Filters for the admin bookings list: free-text search, status groups and date ranges.
 */

const User = require('../models/User');
const Worker = require('../models/Worker');
const escapeRegex = require('./escapeRegex');
const { BOOKING_STATUS } = require('./constants');

// The statuses behind each card / filter on the admin bookings page. A raw status (e.g. "assigned") also works.
const STATUS_GROUPS = {
  awaiting: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.PENDING, BOOKING_STATUS.AWAITING_PAYMENT],
  confirmed: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ASSIGNED],
  in_progress: [BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.WORK_DONE],
  completed: [BOOKING_STATUS.COMPLETED],
  cancelled: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED]
};

const MAX_MATCHED_PEOPLE = 500;

/**
 * Query condition for a status filter: a group name, or one status (case-insensitive).
 */
const statusCondition = (status) => {
  const key = String(status || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (STATUS_GROUPS[key]) return { $in: STATUS_GROUPS[key] };
  return new RegExp(`^${escapeRegex(String(status).trim())}$`, 'i');
};

/**
 * The `$or` clauses that make one search box find a booking by anything an admin would type:
 * the booking number or id, the service, the address, and the customer's or professional's
 * name, phone or email. Returns null for an empty search.
 */
const buildBookingSearch = async (search) => {
  const term = String(search || '').trim().slice(0, 80);
  if (!term) return null;

  const rx = { $regex: escapeRegex(term), $options: 'i' };
  const clauses = [
    { bookingNumber: rx },
    { serviceName: rx },
    { serviceCategory: rx },
    { brandName: rx },
    { 'address.addressLine1': rx },
    { 'address.city': rx },
    { 'address.pincode': rx }
  ];

  if (/^[0-9a-fA-F]{24}$/.test(term)) clauses.push({ _id: term });

  // The customer and the professional live in their own collections, so find them first
  const [users, workers] = await Promise.all([
    User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('_id').limit(MAX_MATCHED_PEOPLE).lean(),
    Worker.find({ $or: [{ name: rx }, { businessName: rx }, { phone: rx }, { email: rx }] }).select('_id').limit(MAX_MATCHED_PEOPLE).lean()
  ]);
  if (users.length) clauses.push({ userId: { $in: users.map((u) => u._id) } });
  if (workers.length) clauses.push({ vendorId: { $in: workers.map((w) => w._id) } });

  return clauses;
};

/**
 * A yyyy-mm-dd end date should include that whole day, not stop at its first millisecond.
 */
const endOfDay = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) d.setUTCHours(23, 59, 59, 999);
  return d;
};

module.exports = { STATUS_GROUPS, statusCondition, buildBookingSearch, endOfDay };
