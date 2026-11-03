/**
 * The admin's "booking notifications" feed.
 *
 * Built from what the bookings themselves recorded (every booking keeps a timeline of what happened and who did
 * it) plus two things that are true right now: a booking waiting for an admin to assign someone, and a payment
 * that failed. Nothing is stored per notification, so the feed is always in step with the bookings.
 */

const Booking = require('../models/Booking');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { BOOKING_STATUS, PAYMENT_STATUS } = require('../utils/constants');

const WINDOW_DAYS = 30;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const TYPES = ['new_booking', 'cancelled', 'completed', 'payment', 'refund', 'payment_failed', 'needs_assignment'];
const WHO = { user: 'the customer', worker: 'the professional', vendor: 'the professional', admin: 'an admin', system: 'the system' };

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Which timeline entries are worth an admin's attention, and what kind they are
const typeOfEntry = (entry) => {
  if (entry.event === 'created') return 'new_booking';
  if (entry.event === 'refunded') return 'refund';
  if (entry.event === 'payment') return 'payment';
  if (entry.event === 'status') {
    if ([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.REJECTED].includes(entry.status)) return 'cancelled';
    if (entry.status === BOOKING_STATUS.COMPLETED) return 'completed';
  }
  return null;
};

const describe = (type, b, entry, customerName) => {
  const ref = `#${b.bookingNumber}`;
  const service = b.serviceName ? ` for ${b.serviceName}` : '';
  switch (type) {
    case 'new_booking':
      return { title: 'New booking received', message: `${ref} was placed by ${customerName}${service} (${money(b.finalAmount)}).` };
    case 'cancelled': {
      const who = WHO[entry?.by || b.cancelledBy] || 'someone';
      const rejected = (entry?.status || b.status) === BOOKING_STATUS.REJECTED;
      const reason = b.cancellationReason ? ` Reason: ${b.cancellationReason}.` : '';
      return { title: rejected ? 'Booking rejected' : 'Booking cancelled', message: `${ref} (${customerName}) was ${rejected ? 'rejected' : 'cancelled'} by ${who}.${reason}` };
    }
    case 'completed':
      return { title: 'Booking completed', message: `${ref}${service} for ${customerName} was completed (${money(b.finalAmount)}).` };
    case 'payment':
      return { title: 'Payment received', message: `Payment for ${ref} from ${customerName} was received.` };
    case 'refund':
      return { title: 'Refund issued', message: `${money(b.refundedAmount)} was refunded to ${customerName} for ${ref}.` };
    case 'payment_failed':
      return { title: 'Payment failed', message: `The payment for ${ref} from ${customerName} did not go through.` };
    case 'needs_assignment':
      return { title: 'Needs a professional', message: `${ref}${service} has no professional. Assign one or cancel it.` };
    default:
      return { title: 'Booking update', message: ref };
  }
};

/**
 * One page of the feed, newest first.
 *   type    one of TYPES, or empty for everything
 *   before  an ISO time: only events older than this (to load the next page)
 *   limit   page size
 */
const getFeed = async ({ adminId, type, before, limit } = {}) => {
  const size = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const wanted = TYPES.includes(type) ? type : null;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const beforeDate = before && !Number.isNaN(new Date(before).getTime()) ? new Date(before) : null;
  const upper = beforeDate ? { $lt: beforeDate } : {};

  const admin = adminId ? await Admin.findById(adminId).select('bookingNotificationsReadAt').lean() : null;
  const readAt = admin?.bookingNotificationsReadAt || null;

  const events = [];

  // 1. Things the bookings recorded
  if (!wanted || !['payment_failed', 'needs_assignment'].includes(wanted)) {
    const rows = await Booking.aggregate([
      { $match: { 'statusHistory.at': { $gte: since } } },
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.at': { $gte: since, ...upper }, 'statusHistory.event': { $in: ['created', 'status', 'payment', 'refunded'] } } },
      { $sort: { 'statusHistory.at': -1 } },
      // A little more than a page, since entries that are not worth showing (e.g. "assigned") are dropped below
      { $limit: size * 6 },
      { $project: {
        bookingNumber: 1, userId: 1, serviceName: 1, finalAmount: 1, refundedAmount: 1, status: 1,
        cancelledBy: 1, cancellationReason: 1, entry: '$statusHistory'
      } }
    ]);
    for (const r of rows) {
      const kind = typeOfEntry(r.entry);
      if (!kind || (wanted && kind !== wanted)) continue;
      events.push({ kind, booking: r, entry: r.entry, at: r.entry.at, id: `${r._id}:${r.entry.event}:${r.entry.status}:${+new Date(r.entry.at)}` });
    }
  }

  // 2. Things that are true right now
  if (!wanted || wanted === 'needs_assignment') {
    const queued = await Booking.find({ awaitingAdmin: true, vendorId: null, status: { $in: [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.CONFIRMED] }, ...(beforeDate ? { adminQueuedAt: upper } : {}) })
      .select('bookingNumber userId serviceName finalAmount status adminQueuedAt createdAt').sort({ adminQueuedAt: -1 }).limit(size).lean();
    queued.forEach((b) => events.push({ kind: 'needs_assignment', booking: b, entry: null, at: b.adminQueuedAt || b.createdAt, id: `${b._id}:needs_assignment` }));
  }
  if (!wanted || wanted === 'payment_failed') {
    const failed = await Booking.find({ paymentStatus: PAYMENT_STATUS.FAILED, updatedAt: { $gte: since, ...upper } })
      .select('bookingNumber userId serviceName finalAmount status updatedAt').sort({ updatedAt: -1 }).limit(size).lean();
    failed.forEach((b) => events.push({ kind: 'payment_failed', booking: b, entry: null, at: b.updatedAt, id: `${b._id}:payment_failed` }));
  }

  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  const page = events.slice(0, size);
  const hasMore = events.length > size;

  // Customer names
  const userIds = [...new Set(page.map((e) => String(e.booking.userId || '')).filter(Boolean))];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('name phone').lean() : [];
  const nameOf = new Map(users.map((u) => [String(u._id), u.name || u.phone || 'a customer']));

  const items = page.map((e) => {
    const customerName = nameOf.get(String(e.booking.userId)) || 'a customer';
    const text = describe(e.kind, e.booking, e.entry, customerName);
    return {
      id: e.id,
      type: e.kind,
      ...text,
      at: e.at,
      bookingId: String(e.booking._id),
      bookingNumber: e.booking.bookingNumber,
      unread: !readAt || new Date(e.at) > readAt
    };
  });

  return { items, hasMore, nextBefore: hasMore ? page[page.length - 1].at : null, readAt };
};

/**
 * How many events this admin has not seen yet (all types, within the window).
 */
const countUnread = async (adminId) => {
  const admin = adminId ? await Admin.findById(adminId).select('bookingNotificationsReadAt').lean() : null;
  const readAt = admin?.bookingNotificationsReadAt || null;
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const from = readAt && readAt > since ? readAt : since;

  const [rows, queued] = await Promise.all([
    Booking.aggregate([
      { $match: { 'statusHistory.at': { $gt: from } } },
      { $unwind: '$statusHistory' },
      { $match: { 'statusHistory.at': { $gt: from } } },
      { $group: { _id: { event: '$statusHistory.event', status: '$statusHistory.status' }, n: { $sum: 1 } } }
    ]),
    Booking.countDocuments({ awaitingAdmin: true, vendorId: null, adminQueuedAt: { $gt: from } })
  ]);
  const fromHistory = rows.reduce((sum, r) => sum + (typeOfEntry({ event: r._id.event, status: r._id.status }) ? r.n : 0), 0);
  return fromHistory + queued;
};

const markAllRead = async (adminId) => {
  const readAt = new Date();
  await Admin.findByIdAndUpdate(adminId, { $set: { bookingNotificationsReadAt: readAt } });
  return readAt;
};

module.exports = { getFeed, countUnread, markAllRead, TYPES };
