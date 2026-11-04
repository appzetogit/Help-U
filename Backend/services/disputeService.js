/**
 * Dispute Service
 *
 * Raising, discussing and resolving disputes on bookings. Controllers for the
 * user app, worker app and admin panel all go through here so eligibility,
 * refund limits and the booking's dispute state stay consistent.
 */

const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Dispute = require('../models/Dispute');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Transaction = require('../models/Transaction');
const {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  DISPUTE_STATUS,
  DISPUTE_ACTIVE_STATUSES
} = require('../utils/constants');
const { getBookingConfig } = require('../utils/bookingConfig');
const { isOwnCloudinaryUrl } = require('../utils/issuePhotos');
const { createNotification } = require('../controllers/notificationControllers/notificationController');

class DisputeError extends Error {
  constructor(message, statusCode = 400, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const round2 = (n) => parseFloat((Number(n) || 0).toFixed(2));

// Statuses after which a booking can be disputed. A booking still in
// progress is handled through chat and support instead.
const DISPUTABLE_STATUSES = [
  BOOKING_STATUS.WORK_DONE,
  BOOKING_STATUS.COMPLETED,
  BOOKING_STATUS.CANCELLED
];

const DEFAULT_CUSTOMER_DISPUTE_REASONS = [
  'Service not completed',
  'Poor quality of work',
  'Overcharged / billing issue',
  'Professional misbehaved',
  'Damage to property',
  'Professional did not arrive',
  'Payment issue',
  'Other'
];

const DEFAULT_WORKER_DISPUTE_REASONS = [
  'Customer unavailable / Not at location',
  'Customer refused to pay',
  'Customer misbehaved / Inappropriate behavior',
  'Incorrect address / Location unreachable',
  'Scope mismatch / Extra work demanded',
  'Customer cancelled at doorstep',
  'Safety or security concern',
  'Payment or settlement issue',
  'Other'
];

/**
 * What the customer has actually paid on a booking, in rupees.
 */
const amountPaidOn = (booking) => {
  const fullyPaid = [PAYMENT_STATUS.SUCCESS, PAYMENT_STATUS.COLLECTED_BY_WORKER, PAYMENT_STATUS.REFUNDED]
    .includes(booking.paymentStatus);
  if (fullyPaid) return round2(booking.finalAmount);
  if (booking.advancePayment?.status === 'paid') return round2(booking.advancePayment.paidAmount);
  return 0;
};

const refundableOn = (booking) => Math.max(0, round2(amountPaidOn(booking) - (booking.refundedAmount || 0)));

/**
 * Whether `party` ('user' | 'worker') can raise a dispute on `booking`.
 * Returns { eligible, reason, deadline }.
 */
const getEligibility = async (booking, party) => {
  const config = await getBookingConfig();

  if (!config.isDisputeEnabled) {
    return { eligible: false, reason: 'Raising disputes is currently unavailable.' };
  }
  if (party === 'worker' && !booking.vendorId) {
    return { eligible: false, reason: 'You are not assigned to this booking.' };
  }
  if (!DISPUTABLE_STATUSES.includes(booking.status)) {
    return { eligible: false, reason: 'You can raise a dispute once the work is done or the booking is cancelled.' };
  }
  if (booking.status === BOOKING_STATUS.CANCELLED && !booking.vendorId && amountPaidOn(booking) === 0) {
    return { eligible: false, reason: 'Nothing to dispute: no professional was assigned and nothing was paid.' };
  }

  const endedAt = booking.completedAt || booking.cancelledAt || booking.updatedAt;
  const deadline = new Date(new Date(endedAt).getTime() + config.disputeWindowDays * 24 * 60 * 60 * 1000);
  if (Date.now() > deadline.getTime()) {
    return { eligible: false, reason: `Disputes must be raised within ${config.disputeWindowDays} days of the booking ending.`, deadline };
  }

  const active = await Dispute.exists({ bookingId: booking._id, status: { $in: DISPUTE_ACTIVE_STATUSES } });
  if (active) {
    return { eligible: false, reason: 'There is already an open dispute for this booking.', deadline };
  }

  return { eligible: true, reason: null, deadline };
};

/**
 * Keeps only evidence hosted in our own Cloudinary account.
 */
const sanitizeEvidence = (evidence, limit) => {
  if (!Array.isArray(evidence)) return [];
  const clean = [];
  for (const item of evidence) {
    const url = typeof item === 'string' ? item : item?.url;
    if (typeof url !== 'string') continue;
    if (isOwnCloudinaryUrl(url, 'image')) clean.push({ url, type: 'image' });
    else if (isOwnCloudinaryUrl(url, 'video')) clean.push({ url, type: 'video' });
  }
  return clean.slice(0, limit);
};

const disputeNumber = () =>
  `DSP${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

const notifyAdmins = async (dispute, title, message) => {
  try {
    const Admin = require('../models/Admin');
    const admins = await Admin.find({ isActive: { $ne: false } }).select('_id').limit(50).lean();
    await Promise.all(admins.map((admin) => createNotification({
      adminId: admin._id,
      type: 'dispute_raised',
      title,
      message,
      relatedId: dispute._id,
      relatedType: 'dispute',
      pushData: { type: 'admin_alert', link: `/admin/disputes/${dispute._id}` }
    })));
  } catch (error) {
    console.error('[Dispute] Failed to notify admins:', error.message);
  }
};

const notifyParty = (party, dispute, { type, title, message }) => {
  const isUser = party === 'user';
  const target = isUser ? { userId: dispute.userId } : { vendorId: dispute.workerId };
  if (!target.userId && !target.vendorId) return Promise.resolve();

  return createNotification({
    ...target,
    type,
    title,
    message,
    relatedId: dispute._id,
    relatedType: 'dispute',
    pushData: {
      type,
      disputeId: String(dispute._id),
      link: isUser ? `/user/disputes/${dispute._id}` : `/worker/disputes/${dispute._id}`
    }
  }).catch((err) => console.error('[Dispute] Notification failed:', err.message));
};

/**
 * Opens a dispute on a booking.
 */
const raiseDispute = async ({ bookingId, party, actorId, actorName, reason, description, evidence, requestedRefund }) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) throw new DisputeError('Booking not found', 404);

  const owner = party === 'worker' ? { vendorId: actorId } : { userId: actorId };
  const booking = await Booking.findOne({ _id: bookingId, ...owner });
  if (!booking) throw new DisputeError('Booking not found', 404);

  const eligibility = await getEligibility(booking, party);
  if (!eligibility.eligible) throw new DisputeError(eligibility.reason, 400, 'NOT_ELIGIBLE');

  const config = await getBookingConfig();
  const cleanReason = String(reason || '').trim();
  const cleanDescription = String(description || '').trim();

  const allowedReasons = party === 'worker'
    ? ((config.workerDisputeReasons && config.workerDisputeReasons.length > 0) ? config.workerDisputeReasons : DEFAULT_WORKER_DISPUTE_REASONS)
    : ((config.disputeReasons && config.disputeReasons.length > 0) ? config.disputeReasons : DEFAULT_CUSTOMER_DISPUTE_REASONS);

  if (!allowedReasons.includes(cleanReason)) {
    throw new DisputeError('Please choose a reason from the list');
  }
  if (cleanDescription.length < 10) {
    throw new DisputeError('Please describe the problem in at least 10 characters');
  }

  const isHighPriority = party === 'worker'
    ? ['Safety or security concern', 'Customer misbehaved / Inappropriate behavior'].includes(cleanReason)
    : ['Damage to property', 'Professional misbehaved'].includes(cleanReason);

  const paid = amountPaidOn(booking);
  const dispute = await Dispute.create({
    disputeNumber: disputeNumber(),
    bookingId: booking._id,
    userId: booking.userId,
    workerId: booking.vendorId || null,
    raisedBy: party,
    reason: cleanReason,
    description: cleanDescription.slice(0, 2000),
    evidence: sanitizeEvidence(evidence, config.maxDisputeEvidence),
    requestedRefund: party === 'user' ? Math.min(Math.max(0, Number(requestedRefund) || 0), paid) : 0,
    amountPaid: paid,
    priority: isHighPriority ? 'high' : 'medium',
    messages: [{
      senderType: 'system',
      message: `Dispute raised by the ${party === 'user' ? 'customer' : 'professional'}: ${cleanReason}`
    }]
  });

  booking.disputeStatus = 'open';
  booking.disputeId = dispute._id;
  booking.$locals.actor = party;
  await booking.save();

  const otherParty = party === 'user' ? 'worker' : 'user';
  notifyParty(otherParty, dispute, {
    type: 'dispute_raised',
    title: 'A dispute was raised',
    message: `A dispute (${dispute.disputeNumber}) was raised on booking ${booking.bookingNumber}. You can respond with your side.`
  });
  notifyParty(party, dispute, {
    type: 'dispute_raised',
    title: 'Dispute received',
    message: `Your dispute ${dispute.disputeNumber} has been received. Our team will review it shortly.`
  });
  notifyAdmins(dispute, 'New dispute', `${dispute.disputeNumber}: ${cleanReason} on booking ${booking.bookingNumber}`);

  return dispute;
};

/**
 * Adds a message (and optional attachments) to a dispute thread.
 */
const addMessage = async (disputeId, { senderType, senderId, senderName, message, attachments, isInternal = false }) => {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw new DisputeError('Dispute not found', 404);

  if (!DISPUTE_ACTIVE_STATUSES.includes(dispute.status)) {
    throw new DisputeError('This dispute is closed and no longer accepts messages', 400, 'DISPUTE_CLOSED');
  }

  const config = await getBookingConfig();
  const text = String(message || '').trim().slice(0, 2000);
  const files = sanitizeEvidence(attachments, config.maxDisputeEvidence);
  if (!text && files.length === 0) throw new DisputeError('Message cannot be empty');

  dispute.messages.push({
    senderType,
    senderId,
    senderName: senderName || '',
    message: text,
    attachments: files,
    isInternal: senderType === 'admin' && !!isInternal
  });
  dispute.lastActivityAt = new Date();

  // A reply from a party moves a case the admin was waiting on back to review.
  if (senderType !== 'admin' && dispute.status === DISPUTE_STATUS.AWAITING_RESPONSE) {
    dispute.status = DISPUTE_STATUS.UNDER_REVIEW;
  }
  await dispute.save();

  if (!(senderType === 'admin' && isInternal)) {
    const recipients = { user: ['worker'], worker: ['user'], admin: ['user', 'worker'] }[senderType] || [];
    for (const party of recipients) {
      notifyParty(party, dispute, {
        type: 'dispute_updated',
        title: senderType === 'admin' ? 'Update on your dispute' : 'New reply on dispute',
        message: `${dispute.disputeNumber}: ${text ? text.slice(0, 80) : 'New attachment'}`
      });
    }
  }

  return dispute;
};

/**
 * Admin status change without resolving (review, awaiting response, priority).
 */
const updateStatus = async (disputeId, { status, priority, assignedTo }) => {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw new DisputeError('Dispute not found', 404);
  if (!DISPUTE_ACTIVE_STATUSES.includes(dispute.status)) {
    throw new DisputeError('This dispute is already closed');
  }

  if (status) {
    if (!DISPUTE_ACTIVE_STATUSES.includes(status)) {
      throw new DisputeError('Use resolve to close a dispute');
    }
    dispute.status = status;
  }
  if (priority) dispute.priority = priority;
  if (assignedTo !== undefined) dispute.assignedTo = assignedTo || null;
  dispute.lastActivityAt = new Date();
  await dispute.save();
  return dispute;
};

/**
 * Resolves (or rejects) a dispute, refunding the customer and/or penalising
 * the worker as decided.
 *
 * The case is locked first so two admins resolving at once cannot both
 * refund. If a refund then fails, the lock is released and nothing else is
 * changed.
 */
const resolveDispute = async (disputeId, adminId, {
  decision = 'resolved', outcome, refundAmount = 0, refundMethod = 'none', workerPenalty = 0, note = ''
}) => {
  if (!['resolved', 'rejected'].includes(decision)) throw new DisputeError('Invalid decision');

  const refund = round2(Math.max(0, Number(refundAmount) || 0));
  const penalty = round2(Math.max(0, Number(workerPenalty) || 0));
  const method = refund > 0 ? refundMethod : 'none';

  if (decision === 'rejected' && (refund > 0 || penalty > 0)) {
    throw new DisputeError('A rejected dispute cannot include a refund or penalty');
  }
  if (refund > 0 && !['wallet', 'original'].includes(method)) {
    throw new DisputeError('Choose how the refund should be paid');
  }

  // Lock.
  const locked = await Dispute.findOneAndUpdate(
    { _id: disputeId, status: { $in: DISPUTE_ACTIVE_STATUSES }, 'resolution.resolvedAt': null },
    { $set: { 'resolution.resolvedAt': new Date(), 'resolution.resolvedBy': adminId } },
    { new: true }
  );
  if (!locked) throw new DisputeError('This dispute is already resolved or does not exist', 409);

  const releaseLock = () => Dispute.updateOne(
    { _id: disputeId },
    { $set: { 'resolution.resolvedAt': null, 'resolution.resolvedBy': null } }
  );

  // Once money has moved the lock is kept even if a later step fails, so a
  // retry can never refund twice; such a case needs manual follow-up.
  let moneyMoved = false;

  try {
    const booking = await Booking.findById(locked.bookingId);
    if (!booking) throw new DisputeError('Booking for this dispute no longer exists', 404);

    const refundable = refundableOn(booking);
    if (refund > refundable) {
      throw new DisputeError(`Refund cannot exceed ₹${refundable} (amount paid minus earlier refunds)`);
    }
    if (penalty > 0 && !locked.workerId) {
      throw new DisputeError('No professional is attached to this booking to penalise');
    }

    // 1. Gateway refund first: it is the step most likely to fail.
    let refundReference = null;
    if (refund > 0 && method === 'original') {
      if (!booking.razorpayPaymentId) {
        throw new DisputeError('This booking was not paid online. Refund to the customer wallet instead.');
      }
      const { refundPayment } = require('./razorpayService');
      const result = await refundPayment(booking.razorpayPaymentId, refund, {
        disputeId: String(locked._id),
        bookingNumber: booking.bookingNumber
      });
      if (!result.success) {
        throw new DisputeError(`Gateway refund failed: ${result.error || 'unknown error'}`, 502);
      }
      refundReference = result.refund?.id || null;
      moneyMoved = true;
    }

    // 2. Wallet refund.
    if (refund > 0 && method === 'wallet') {
      const before = await User.findByIdAndUpdate(
        booking.userId,
        { $inc: { 'wallet.balance': refund } },
        { new: false }
      ).select('wallet');
      moneyMoved = true;
      const balanceBefore = before?.wallet?.balance || 0;
      const txn = await Transaction.create({
        userId: booking.userId,
        bookingId: booking._id,
        type: 'refund',
        amount: refund,
        status: 'completed',
        paymentMethod: 'wallet',
        description: `Dispute ${locked.disputeNumber} refund for booking #${booking.bookingNumber}`,
        balanceBefore,
        balanceAfter: balanceBefore + refund,
        metadata: { disputeId: String(locked._id) }
      });
      refundReference = String(txn._id);
    } else if (refund > 0) {
      await Transaction.create({
        userId: booking.userId,
        bookingId: booking._id,
        type: 'refund',
        amount: refund,
        status: 'completed',
        paymentMethod: 'razorpay',
        referenceId: refundReference,
        description: `Dispute ${locked.disputeNumber} refund to original payment for booking #${booking.bookingNumber}`,
        metadata: { disputeId: String(locked._id) }
      });
    }

    // 3. Worker penalty: taken from their earnings (may go negative, meaning
    //    they owe the platform, which settlements already handle).
    if (penalty > 0) {
      await Worker.findByIdAndUpdate(locked.workerId, { $inc: { 'wallet.earnings': -penalty } });
      moneyMoved = true;
      await Transaction.create({
        vendorId: locked.workerId,
        bookingId: booking._id,
        type: 'penalty',
        amount: penalty,
        status: 'completed',
        paymentMethod: 'system',
        description: `Penalty for dispute ${locked.disputeNumber} on booking #${booking.bookingNumber}`,
        metadata: { disputeId: String(locked._id) }
      });
    }

    // 4. Booking state.
    booking.disputeStatus = decision === 'resolved' ? 'resolved' : 'rejected';
    if (refund > 0) {
      booking.refundedAmount = round2((booking.refundedAmount || 0) + refund);
      if (booking.refundedAmount >= amountPaidOn(booking) && amountPaidOn(booking) > 0) {
        booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
      } else {
        booking.statusHistory.push({
          status: booking.status,
          event: 'refunded',
          note: `Partial refund ₹${refund}`,
          by: 'admin',
          at: new Date()
        });
      }
    }
    booking.$locals.actor = 'admin';
    await booking.save();

    // 5. Close the case.
    locked.status = decision === 'resolved' ? DISPUTE_STATUS.RESOLVED : DISPUTE_STATUS.REJECTED;
    locked.resolution = {
      outcome: outcome || (decision === 'rejected' ? 'no_action' : (refund > 0 ? 'favour_user' : 'no_action')),
      refundAmount: refund,
      refundMethod: method,
      refundReference,
      workerPenalty: penalty,
      note: String(note || '').trim().slice(0, 1000),
      resolvedBy: adminId,
      resolvedAt: new Date()
    };
    const summary = decision === 'rejected'
      ? 'Dispute closed without action.'
      : [
        refund > 0 ? `Refund of ₹${refund} ${method === 'wallet' ? 'credited to wallet' : 'sent to the original payment method'}.` : null,
        penalty > 0 ? `Penalty of ₹${penalty} applied to the professional.` : null
      ].filter(Boolean).join(' ') || 'Dispute resolved.';
    locked.messages.push({
      senderType: 'system',
      message: `${summary}${locked.resolution.note ? ` Note: ${locked.resolution.note}` : ''}`
    });
    locked.lastActivityAt = new Date();
    await locked.save();

    notifyParty('user', locked, {
      type: 'dispute_resolved',
      title: decision === 'resolved' ? 'Dispute resolved' : 'Dispute closed',
      message: `${locked.disputeNumber}: ${summary}`
    });
    if (locked.workerId) {
      notifyParty('worker', locked, {
        type: 'dispute_resolved',
        title: decision === 'resolved' ? 'Dispute resolved' : 'Dispute closed',
        message: `${locked.disputeNumber}: ${penalty > 0 ? `A penalty of ₹${penalty} was applied.` : 'No action against you.'}`
      });
    }

    return locked;
  } catch (error) {
    if (!moneyMoved) {
      await releaseLock();
    } else {
      console.error(`[Dispute] ${locked.disputeNumber}: failed after money moved; left locked for manual review:`, error);
    }
    throw error;
  }
};

module.exports = {
  DisputeError,
  amountPaidOn,
  refundableOn,
  getEligibility,
  raiseDispute,
  addMessage,
  updateStatus,
  resolveDispute,
  DEFAULT_CUSTOMER_DISPUTE_REASONS,
  DEFAULT_WORKER_DISPUTE_REASONS
};
