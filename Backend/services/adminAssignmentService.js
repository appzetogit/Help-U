/**
 * Admin Assignment Service
 *
 * A booking normally goes to professionals who have the skill and work in the customer's zone.
 * When that finds nobody (no one in the zone, nobody accepted in time, or the professional the
 * admin picked said no), the booking is not cancelled: it waits in the admin queue
 * (`awaitingAdmin`) and an admin picks a professional by hand. The pick goes out as an ordinary
 * booking request, so the professional accepts or declines exactly as with an automatic alert.
 *
 *   queueForAdmin()          put a booking in the queue and tell the admins and the customer
 *   listAssignableWorkers()  professionals the admin can choose from, with zone / online / distance
 *   assignWorker()           send the booking to the chosen professional
 *   requeueAfterDecline()    the chosen professional declined or did not answer: back to the queue
 */

const Booking = require('../models/Booking');
const BookingRequest = require('../models/BookingRequest');
const Worker = require('../models/Worker');
const Category = require('../models/Category');
const Zone = require('../models/Zone');
const Admin = require('../models/Admin');
const { BOOKING_STATUS, WORKER_STATUS } = require('../utils/constants');
const { getBookingConfig } = require('../utils/bookingConfig');
const { zonesInUse } = require('../utils/dispatchMode');
const { calculateDistance } = require('./locationService');
const { createNotification } = require('../controllers/notificationControllers/notificationController');
const escapeRegex = require('../utils/escapeRegex');

const OPEN_STATUSES = [BOOKING_STATUS.SEARCHING, BOOKING_STATUS.REQUESTED, BOOKING_STATUS.CONFIRMED];

const REASON_TEXT = {
  no_worker_in_zone: 'No professional with this skill works in the zone',
  no_worker_nearby: 'No professional is available nearby',
  no_worker_accepted: 'Nobody accepted within the search time',
  worker_declined: 'The professional picked by the admin did not accept'
};

class AssignmentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const emit = (room, event, payload) => {
  try {
    const { getIO } = require('../sockets');
    getIO().to(room).emit(event, payload);
  } catch (_) {
    // Best effort: the notification below still reaches them.
  }
};

const isQueueEnabled = async () => (await getBookingConfig()).isAdminAssignmentEnabled !== false;

/**
 * Names a professional can list that make them a match for this booking: the service, its
 * category and the parent category. Same rule the automatic search uses.
 */
const skillNamesFor = async (booking) => {
  const names = [booking.serviceName, booking.serviceCategory];
  if (booking.categoryId) {
    const category = await Category.findById(booking.categoryId).select('title parentId').lean();
    if (category) {
      names.push(category.title);
      if (category.parentId) {
        const parent = await Category.findById(category.parentId).select('title').lean();
        if (parent) names.push(parent.title);
      }
    }
  }
  return [...new Set(names.filter(Boolean).map((n) => String(n).trim()))];
};

/**
 * Puts an open, unassigned booking in the admin queue.
 * Returns the updated booking, or null when it was not eligible (already taken, cancelled, or the
 * queue is switched off).
 */
const queueForAdmin = async (bookingId, { reason = 'no_worker_nearby' } = {}) => {
  const config = await getBookingConfig();
  if (config.isAdminAssignmentEnabled === false) return null;

  const windowMs = (config.adminAssignmentWindowMins || 60) * 60 * 1000;
  const now = new Date();

  // A visit booked for later cannot wait past its own slot
  let queueDeadline = new Date(now.getTime() + windowMs);
  const current = await Booking.findById(bookingId).select('bookingType isEmergency scheduledDate timeSlot scheduledTime').lean();
  if (current && current.bookingType === 'scheduled' && !current.isEmergency) {
    const { slotStartMs } = require('./workerAvailabilityService');
    const slotStart = slotStartMs(current);
    if (Number.isFinite(slotStart) && slotStart > now.getTime() && slotStart < queueDeadline.getTime()) {
      queueDeadline = new Date(slotStart);
    }
  }

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, vendorId: null, status: { $in: OPEN_STATUSES } },
    {
      $set: {
        status: BOOKING_STATUS.SEARCHING,
        awaitingAdmin: true,
        adminQueuedAt: now,
        adminQueueReason: reason,
        adminAssignedAt: null,
        adminAssignedBy: null,
        // Out of the wave scheduler's hands: only an admin moves it now
        waveStartedAt: null,
        notifiedVendors: [],
        expiresAt: queueDeadline
      },
      $push: {
        statusHistory: {
          status: BOOKING_STATUS.SEARCHING,
          event: 'sent_to_admin',
          note: REASON_TEXT[reason] || 'Waiting for the admin to assign a professional',
          by: 'system',
          at: now
        }
      }
    },
    { new: true }
  );
  if (!booking) return null;

  // Anyone who was still alerted should stop seeing it
  await BookingRequest.updateMany(
    { bookingId: booking._id, status: { $in: ['PENDING', 'VIEWED'] } },
    { status: 'EXPIRED', respondedAt: now }
  ).catch(() => null);

  emit(`user_${booking.userId}`, 'booking_updated', {
    bookingId: booking._id,
    status: booking.status,
    awaitingAdmin: true,
    message: 'Our team is arranging a professional for you.'
  });

  // Tell the customer and every admin; neither failure may break the booking
  try {
    await createNotification({
      userId: booking.userId,
      type: 'booking_awaiting_admin',
      title: 'We are arranging a professional',
      message: `Our team is finding the right professional for booking ${booking.bookingNumber}. You will be notified as soon as one is assigned.`,
      relatedId: booking._id,
      relatedType: 'booking',
      pushData: {
        type: 'booking_awaiting_admin',
        bookingId: booking._id.toString(),
        link: `/user/booking/${booking._id}`
      }
    });
  } catch (err) {
    console.error('[AdminQueue] Could not notify the customer:', err.message);
  }

  try {
    const admins = await Admin.find({ isActive: { $ne: false } }).select('_id');
    await Promise.all(admins.map((a) => createNotification({
      adminId: a._id,
      type: 'booking_needs_assignment',
      title: 'Booking needs a professional',
      message: `${booking.bookingNumber} (${booking.serviceName}) - ${REASON_TEXT[reason] || 'assign a professional'}.`,
      relatedId: booking._id,
      relatedType: 'booking'
    })));
    admins.forEach((a) => emit(`admin_${a._id}`, 'booking_needs_assignment', {
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber
    }));
  } catch (err) {
    console.error('[AdminQueue] Could not notify the admins:', err.message);
  }

  console.log(`[AdminQueue] ${booking.bookingNumber} sent to admin (${reason})`);
  return booking;
};

/**
 * Professionals an admin can pick for this booking.
 * Everyone approved who lists the service, its category or the parent category. Those inside the
 * booking's zone are flagged and listed first, then online ones, then by distance, so the admin
 * can still choose someone outside the zone on purpose.
 */
const listAssignableWorkers = async (bookingId, { search = '', limit = 50 } = {}) => {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) throw new AssignmentError('Booking not found', 404);

  const names = await skillNamesFor(booking);
  const regexes = names.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i'));

  const query = {
    approvalStatus: WORKER_STATUS.APPROVED,
    isActive: true,
    $or: [{ categories: { $in: regexes } }, { service: { $in: regexes } }]
  };

  if (search && String(search).trim()) {
    const safe = new RegExp(escapeRegex(String(search).trim()), 'i');
    query.$and = [{ $or: [{ name: safe }, { businessName: safe }, { phone: safe }] }];
  }

  const workers = await Worker.find(query)
    .select('name businessName phone profilePhoto rating isOnline availability geoLocation address zoneId zoneIds service categories')
    .limit(Math.min(Number(limit) || 50, 200))
    .lean();

  // In distance mode zones are not used: no zone badges, ordering by distance only
  const zoneMode = await zonesInUse();
  const zone = zoneMode && booking.zoneId ? await Zone.findById(booking.zoneId).select('name coordinates').lean() : null;
  const inZoneIds = new Set();
  if (zone && workers.length > 0) {
    const inside = await Worker.find({
      _id: { $in: workers.map((w) => w._id) },
      geoLocation: { $geoWithin: { $geometry: zone.coordinates } }
    }).select('_id').lean();
    inside.forEach((w) => inZoneIds.add(String(w._id)));
  }

  const target = booking.address && Number.isFinite(booking.address.lat) && Number.isFinite(booking.address.lng)
    ? { lat: booking.address.lat, lng: booking.address.lng }
    : null;

  const busyBookings = await Booking.find({
    vendorId: { $in: workers.map((w) => w._id) },
    status: { $in: [BOOKING_STATUS.JOURNEY_STARTED, BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS] }
  }).select('vendorId').lean();
  const busyIds = new Set(busyBookings.map((b) => String(b.vendorId)));

  const excluded = new Set((booking.excludedVendors || []).map(String));

  const rows = workers.map((w) => {
    const coords = w.geoLocation && w.geoLocation.coordinates;
    const hasGeo = Array.isArray(coords) && coords.length === 2 && !(coords[0] === 0 && coords[1] === 0);
    const distanceKm = target && hasGeo
      ? Math.round(calculateDistance(target, { lat: coords[1], lng: coords[0] }) * 10) / 10
      : null;
    const id = String(w._id);
    return {
      _id: w._id,
      name: w.name,
      businessName: w.businessName || '',
      phone: w.phone,
      profilePhoto: w.profilePhoto || null,
      rating: w.rating || 0,
      isOnline: !!w.isOnline,
      isBusy: busyIds.has(id),
      city: w.address?.city || '',
      // null = zones are not in use (distance mode), so there is nothing to show
      inZone: !zoneMode ? null : (inZoneIds.has(id)
        || (!!booking.zoneId && (String(w.zoneId) === String(booking.zoneId)
          || (w.zoneIds || []).some((z) => String(z) === String(booking.zoneId))))),
      distanceKm,
      declinedEarlier: excluded.has(id)
    };
  });

  rows.sort((a, b) =>
    (Number(!!b.inZone) - Number(!!a.inZone))
    || (Number(b.isOnline) - Number(a.isOnline))
    || ((a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)));

  return { dispatchMode: zoneMode ? 'zone' : 'distance', booking: { _id: booking._id, zoneId: booking.zoneId || null, skills: names }, zoneName: zone?.name || null, workers: rows };
};

/**
 * Sends the booking to the professional the admin chose, as a normal pending request.
 */
const assignWorker = async (bookingId, workerId, adminId, { note = '' } = {}) => {
  const worker = await Worker.findById(workerId).select('name businessName phone approvalStatus isActive geoLocation').lean();
  if (!worker) throw new AssignmentError('Professional not found', 404);
  if (worker.approvalStatus !== WORKER_STATUS.APPROVED || worker.isActive === false) {
    throw new AssignmentError('This professional is not approved or active');
  }

  const config = await getBookingConfig();
  const responseMs = (config.adminAssignedResponseMins || 15) * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + responseMs);

  const current = await Booking.findById(bookingId).select('address').lean();
  const distance = current?.address && Number.isFinite(current.address.lat) && Number.isFinite(current.address.lng)
    && worker.geoLocation?.coordinates && !(worker.geoLocation.coordinates[0] === 0 && worker.geoLocation.coordinates[1] === 0)
    ? calculateDistance(
      { lat: current.address.lat, lng: current.address.lng },
      { lat: worker.geoLocation.coordinates[1], lng: worker.geoLocation.coordinates[0] }
    )
    : null;

  const trimmedNote = String(note || '').trim().slice(0, 300);

  // Atomic: only a booking that is still open and unassigned can be handed out
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, vendorId: null, status: { $in: OPEN_STATUSES } },
    {
      $set: {
        status: BOOKING_STATUS.SEARCHING,
        awaitingAdmin: false,
        adminAssignedAt: now,
        adminAssignedBy: adminId || null,
        waveStartedAt: null,
        currentWave: 0,
        notifiedVendors: [worker._id],
        potentialVendors: [{ vendorId: worker._id, distance: distance ?? 0, score: null }],
        expiresAt
      },
      // An admin may deliberately re-pick someone who declined earlier
      $pull: { excludedVendors: worker._id },
      $push: {
        statusHistory: {
          status: BOOKING_STATUS.SEARCHING,
          event: 'admin_assigned',
          note: `Sent to ${worker.businessName || worker.name}${trimmedNote ? ` - ${trimmedNote}` : ''}`,
          by: 'admin',
          at: now
        }
      }
    },
    { new: true }
  );

  if (!booking) {
    const existing = await Booking.findById(bookingId).select('status vendorId').lean();
    if (!existing) throw new AssignmentError('Booking not found', 404);
    if (existing.vendorId) throw new AssignmentError('This booking already has a professional', 409);
    throw new AssignmentError(`A booking that is ${existing.status} cannot be assigned`, 409);
  }

  // Anyone who was alerted earlier no longer has the request
  await BookingRequest.updateMany(
    { bookingId: booking._id, vendorId: { $ne: worker._id }, status: { $in: ['PENDING', 'VIEWED'] } },
    { status: 'EXPIRED', respondedAt: now }
  ).catch(() => null);

  // upsert: the professional may hold an earlier REJECTED / EXPIRED request on this booking
  await BookingRequest.updateOne(
    { bookingId: booking._id, vendorId: worker._id },
    {
      $set: {
        status: 'PENDING',
        wave: 0,
        distance,
        sentAt: now,
        expiresAt: new Date(expiresAt.getTime() + 60 * 60 * 1000),
        viewedAt: null,
        respondedAt: null,
        socketDelivered: false,
        pushDelivered: false,
        rejectReason: null
      }
    },
    { upsert: true }
  );

  // Alert the professional exactly like an automatic request
  const [user, service] = await Promise.all([
    require('../models/User').findById(booking.userId).select('name phone').lean(),
    require('../models/Service').findById(booking.serviceId).select('title').lean()
  ]);
  const { buildWorkerAlertPayload } = require('./bookingCreationService');
  const payload = buildWorkerAlertPayload(booking, user, service);

  emit(`vendor_${worker._id}`, 'new_booking_request', {
    ...payload,
    distance,
    message: 'New booking request assigned to you by Help U support'
  });

  try {
    await createNotification({
      vendorId: worker._id,
      type: 'booking_request',
      title: booking.isEmergency ? 'Emergency Booking Request' : 'New Booking Request',
      message: `Help U assigned you a request for ${payload.serviceName} from ${payload.customerName}.`,
      relatedId: booking._id,
      relatedType: 'booking',
      priority: booking.isEmergency ? 'high' : null,
      data: {
        bookingId: booking._id,
        serviceName: payload.serviceName,
        customerName: payload.customerName,
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        location: booking.address,
        price: booking.finalAmount,
        distance,
        isEmergency: !!booking.isEmergency
      },
      pushData: { type: 'new_booking', dataOnly: false, link: `/worker/bookings/${booking._id}` }
    });
  } catch (err) {
    console.error('[AdminAssign] Could not notify the professional:', err.message);
  }

  emit(`user_${booking.userId}`, 'booking_updated', {
    bookingId: booking._id,
    status: booking.status,
    awaitingAdmin: false,
    message: 'A professional has been picked for you and is being asked to confirm.'
  });

  console.log(`[AdminAssign] ${booking.bookingNumber} sent to ${worker.businessName || worker.name}`);
  return { booking, worker: { _id: worker._id, name: worker.name, businessName: worker.businessName || '' } };
};

/**
 * The professional the admin picked said no, or never answered. Back to the admin queue (they are
 * excluded so the same person is not shown as a fresh option without a warning).
 */
const requeueAfterDecline = async (bookingId, workerId) => {
  if (workerId) {
    await Booking.updateOne({ _id: bookingId }, { $addToSet: { excludedVendors: workerId }, $set: { notifiedVendors: [] } });
  }
  return queueForAdmin(bookingId, { reason: 'worker_declined' });
};

module.exports = {
  AssignmentError,
  OPEN_STATUSES,
  isQueueEnabled,
  queueForAdmin,
  listAssignableWorkers,
  assignWorker,
  requeueAfterDecline
};
