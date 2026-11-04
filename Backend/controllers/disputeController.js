/**
 * Dispute Controller
 *
 * Customer and worker handlers are shared: the caller's role decides whose
 * disputes they can see. Admin handlers are separate below.
 *
 *   /api/users/disputes      /api/workers/disputes      /api/admin/disputes
 */

const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Dispute = require('../models/Dispute');
const ChatMessage = require('../models/ChatMessage');
const { USER_ROLES, DISPUTE_STATUS, DISPUTE_ACTIVE_STATUSES } = require('../utils/constants');
const { getBookingConfig } = require('../utils/bookingConfig');
const cloudinaryService = require('../services/cloudinaryService');
const disputeService = require('../services/disputeService');

const partyOf = (req) => (req.userRole === USER_ROLES.WORKER ? 'worker' : 'user');
const ownerFilter = (req) => (partyOf(req) === 'worker' ? { workerId: req.user.id } : { userId: req.user.id });

const sendError = (res, error, fallback) => {
  if (error instanceof disputeService.DisputeError) {
    return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ success: false, message: fallback });
};

const toPartyView = (dispute) => ({
  ...dispute,
  messages: (dispute.messages || []).filter((m) => !m.isInternal),
  assignedTo: undefined
});

// ── Customer & worker ──────────────────────────────────────────────

/**
 * GET /disputes — the caller's disputes, newest activity first.
 */
exports.listMyDisputes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const query = ownerFilter(req);
    if (req.query.status === 'active') query.status = { $in: DISPUTE_ACTIVE_STATUSES };
    else if (req.query.status === 'closed') query.status = { $nin: DISPUTE_ACTIVE_STATUSES };

    const [items, total] = await Promise.all([
      Dispute.find(query)
        .select('-messages')
        .populate('bookingId', 'bookingNumber serviceName serviceCategory categoryIcon scheduledDate finalAmount')
        .sort({ lastActivityAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(query)
    ]);

    res.status(200).json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    sendError(res, error, 'Failed to load disputes');
  }
};

/**
 * GET /disputes/:id
 */
exports.getMyDispute = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }
    const dispute = await Dispute.findOne({ _id: req.params.id, ...ownerFilter(req) })
      .populate('bookingId', 'bookingNumber serviceName serviceCategory categoryIcon scheduledDate scheduledTime finalAmount status paymentStatus refundedAmount')
      .populate('workerId', 'name businessName profilePhoto')
      .populate('userId', 'name profilePhoto')
      .lean();
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    res.status(200).json({ success: true, data: toPartyView(dispute) });
  } catch (error) {
    sendError(res, error, 'Failed to load dispute');
  }
};

/**
 * GET /disputes/booking/:bookingId — latest dispute on a booking and whether a
 * new one can be raised. Drives the "Report a problem" card on booking pages.
 */
exports.getBookingDisputeInfo = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    const party = partyOf(req);
    const owner = party === 'worker' ? { vendorId: req.user.id } : { userId: req.user.id };
    const booking = await Booking.findOne({ _id: bookingId, ...owner });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const [latest, eligibility, config] = await Promise.all([
      Dispute.findOne({ bookingId }).select('-messages').sort({ createdAt: -1 }).lean(),
      disputeService.getEligibility(booking, party),
      getBookingConfig()
    ]);

    const reasons = party === 'worker'
      ? ((config.workerDisputeReasons && config.workerDisputeReasons.length > 0) ? config.workerDisputeReasons : disputeService.DEFAULT_WORKER_DISPUTE_REASONS)
      : ((config.disputeReasons && config.disputeReasons.length > 0) ? config.disputeReasons : disputeService.DEFAULT_CUSTOMER_DISPUTE_REASONS);

    res.status(200).json({
      success: true,
      data: {
        dispute: latest,
        eligibility,
        reasons,
        maxEvidence: config.maxDisputeEvidence,
        amountPaid: disputeService.amountPaidOn(booking)
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to load dispute details');
  }
};

/**
 * POST /disputes — { bookingId, reason, description, evidence[], requestedRefund }
 */
exports.raiseDispute = async (req, res) => {
  try {
    const { bookingId, reason, description, evidence, requestedRefund } = req.body;
    const dispute = await disputeService.raiseDispute({
      bookingId,
      party: partyOf(req),
      actorId: req.user.id,
      actorName: req.user.name,
      reason,
      description,
      evidence,
      requestedRefund
    });
    res.status(201).json({ success: true, message: 'Dispute raised. Our team will review it shortly.', data: toPartyView(dispute.toObject()) });
  } catch (error) {
    sendError(res, error, 'Failed to raise dispute');
  }
};

/**
 * POST /disputes/:id/messages — { message, attachments[] }
 */
exports.postMyMessage = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }
    const owned = await Dispute.exists({ _id: req.params.id, ...ownerFilter(req) });
    if (!owned) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const party = partyOf(req);
    const dispute = await disputeService.addMessage(req.params.id, {
      senderType: party,
      senderId: req.user.id,
      senderName: party === 'worker' ? (req.user.businessName || req.user.name) : req.user.name,
      message: req.body.message,
      attachments: req.body.attachments
    });
    res.status(201).json({ success: true, data: toPartyView(dispute.toObject()) });
  } catch (error) {
    sendError(res, error, 'Failed to send message');
  }
};

/**
 * POST /disputes/evidence — { file: dataUrl } → { url }
 * Uploads one evidence photo before it is attached to a dispute or message.
 */
exports.uploadEvidence = async (req, res) => {
  try {
    const { file } = req.body;
    if (typeof file !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(file)) {
      return res.status(400).json({ success: false, message: 'Please upload a JPG, PNG or WEBP image' });
    }
    if (file.length > 7.5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Photo is too large. Maximum size is 5MB.' });
    }

    const upload = await cloudinaryService.uploadFile(file, {
      folder: `disputes/${partyOf(req)}/${req.user.id}`,
      resource_type: 'image',
      transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }]
    });
    if (!upload.success) {
      return res.status(502).json({ success: false, message: 'Failed to upload photo. Please try again.' });
    }
    res.status(201).json({ success: true, url: upload.url });
  } catch (error) {
    sendError(res, error, 'Failed to upload photo');
  }
};

// ── Admin ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/disputes?status=&priority=&raisedBy=&q=&page=&limit=
 */
exports.adminListDisputes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const query = {};

    if (req.query.status === 'active') query.status = { $in: DISPUTE_ACTIVE_STATUSES };
    else if (req.query.status && Object.values(DISPUTE_STATUS).includes(req.query.status)) query.status = req.query.status;
    if (['low', 'medium', 'high'].includes(req.query.priority)) query.priority = req.query.priority;
    if (['user', 'worker'].includes(req.query.raisedBy)) query.raisedBy = req.query.raisedBy;

    if (req.query.q) {
      const q = String(req.query.q).trim().slice(0, 50);
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const bookings = await Booking.find({ bookingNumber: { $regex: escaped, $options: 'i' } }).select('_id').limit(50).lean();
      query.$or = [
        { disputeNumber: { $regex: escaped, $options: 'i' } },
        { bookingId: { $in: bookings.map((b) => b._id) } }
      ];
    }

    const [items, total, counts] = await Promise.all([
      Dispute.find(query)
        .select('-messages')
        .populate('bookingId', 'bookingNumber serviceName finalAmount')
        .populate('userId', 'name phone')
        .populate('workerId', 'name businessName phone')
        .sort({ lastActivityAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(query),
      Dispute.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);

    const stats = Object.fromEntries(Object.values(DISPUTE_STATUS).map((s) => [s, 0]));
    counts.forEach((c) => { stats[c._id] = c.count; });

    res.status(200).json({
      success: true,
      data: items,
      stats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    sendError(res, error, 'Failed to load disputes');
  }
};

/**
 * GET /api/admin/disputes/:id — full case, including internal notes and the
 * booking chat for context.
 */
exports.adminGetDispute = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Dispute not found' });
    }
    const dispute = await Dispute.findById(req.params.id)
      .populate('bookingId')
      .populate('userId', 'name phone email profilePhoto wallet.balance')
      .populate('workerId', 'name businessName phone email profilePhoto rating wallet.earnings')
      .populate('resolution.resolvedBy', 'name email')
      .lean();
    if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });

    const booking = dispute.bookingId;
    const chat = booking
      ? await ChatMessage.find({ bookingId: booking._id }).sort({ _id: 1 }).limit(500).lean()
      : [];

    res.status(200).json({
      success: true,
      data: {
        ...dispute,
        chat,
        refundable: booking ? disputeService.refundableOn(booking) : 0
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to load dispute');
  }
};

/**
 * POST /api/admin/disputes/:id/messages — { message, attachments[], isInternal }
 */
exports.adminPostMessage = async (req, res) => {
  try {
    const dispute = await disputeService.addMessage(req.params.id, {
      senderType: 'admin',
      senderId: req.user.id,
      senderName: req.user.name || 'Support',
      message: req.body.message,
      attachments: req.body.attachments,
      isInternal: req.body.isInternal === true
    });
    res.status(201).json({ success: true, data: dispute });
  } catch (error) {
    sendError(res, error, 'Failed to send message');
  }
};

/**
 * PUT /api/admin/disputes/:id — { status, priority, assignedTo }
 */
exports.adminUpdateDispute = async (req, res) => {
  try {
    const { status, priority, assignedTo } = req.body;
    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority' });
    }
    const dispute = await disputeService.updateStatus(req.params.id, { status, priority, assignedTo });
    res.status(200).json({ success: true, data: dispute });
  } catch (error) {
    sendError(res, error, 'Failed to update dispute');
  }
};

/**
 * POST /api/admin/disputes/:id/resolve
 * { decision: 'resolved'|'rejected', outcome, refundAmount, refundMethod, workerPenalty, note }
 */
exports.adminResolveDispute = async (req, res) => {
  try {
    const dispute = await disputeService.resolveDispute(req.params.id, req.user.id, req.body || {});
    res.status(200).json({ success: true, message: 'Dispute closed', data: dispute });
  } catch (error) {
    sendError(res, error, 'Failed to resolve dispute');
  }
};
