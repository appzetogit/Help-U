const Scrap = require('../models/Scrap');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Settings = require('../models/Settings');
const { validationResult } = require('express-validator');
const { createNotification } = require('./notificationControllers/notificationController');
const Worker = require('../models/Worker');
const { priceScrapItems, summarise } = require('../services/scrapPricing');
const { computeWeighing, payCustomer, computeWorkerEarning, creditWorker } = require('../services/scrapSettlement');
const { getBookingConfig } = require('../utils/bookingConfig');

// Create a new scrap item (User)
exports.createScrap = async (req, res) => {
  try {
    // Check if scrap feature is enabled globally
    const settings = await Settings.findOne({ type: 'global' });
    if (settings && settings.isScrapEnabled === false) {
      return res.status(403).json({
        success: false,
        message: 'Scrap selling feature is currently disabled by administrator.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { title, description, images, address, items: rawItems, preferredDate, preferredSlot } = req.body;

    let scrapFields;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      // Picked from the scrap types: the server prices it, nothing about price comes from the app
      const priced = await priceScrapItems(rawItems);
      if (priced.error) return res.status(400).json({ success: false, message: priced.error });
      if (priced.requiresPhoto && !(Array.isArray(images) && images.length > 0)) {
        return res.status(400).json({ success: false, message: 'Please add a photo of your scrap.' });
      }

      let pickupOn = null;
      if (preferredDate) {
        pickupOn = new Date(preferredDate);
        if (Number.isNaN(pickupOn.getTime())) {
          return res.status(400).json({ success: false, message: 'Choose a valid pickup date.' });
        }
      }

      scrapFields = {
        title: summarise(priced.items),
        description: String(description || '').trim().slice(0, 1000),
        items: priced.items,
        estimatedTotal: priced.estimatedTotal,
        hasQuoteItems: priced.hasQuoteItems,
        expectedPrice: priced.estimatedTotal,
        preferredDate: pickupOn,
        preferredSlot: String(preferredSlot || '').trim().slice(0, 40)
      };
    } else {
      // Free-text listing, as before scrap types existed
      if (!String(title || '').trim()) {
        return res.status(400).json({ success: false, message: 'Tell us what you are selling.' });
      }
      scrapFields = { title, description };
    }

    const scrap = new Scrap({
      userId: req.user.id,
      images,
      address,
      ...scrapFields
    });

    await scrap.save();

    // Fetch user details for notification
    const user = await User.findById(req.user.id);

    // Notify User
    await createNotification({
      userId: req.user.id,
      type: 'scrap_listed',
      title: 'Scrap Listed Successfully',
      message: `Your scrap item "${scrap.title}" has been listed. Workers in your area will be notified.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });

    // Notify Admins
    const admins = await Admin.find({});
    for (const admin of admins) {
      await createNotification({
        adminId: admin._id,
        type: 'new_scrap_added',
        title: 'New Scrap Item',
        message: `${user ? user.name : 'A user'} has added a new scrap item: "${scrap.title}"`,
        relatedId: scrap._id,
        relatedType: 'scrap'
      });
    }

    res.status(201).json({
      success: true,
      data: scrap,
      message: 'Scrap item listed successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get list of scrap items for the logged-in user
exports.getMyScrap = async (req, res) => {
  try {
    const scraps = await Scrap.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, data: scraps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get scrap items accepted by worker
exports.getMyAcceptedScrap = async (req, res) => {
  try {
    const scraps = await Scrap.find({ vendorId: req.user.id })
      .populate('userId', 'name phone address')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: scraps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get all pending scrap items (Worker view)
// Can filter by nearby location logic
exports.getAvailableScrap = async (req, res) => {
  try {
    // Return all pending items
    const scraps = await Scrap.find({ status: 'pending' })
      .populate('userId', 'name phone')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: scraps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Admin sets price offer or accepts scrap request
exports.acceptScrap = async (req, res) => {
  try {
    const { id } = req.params;
    let { offeredPrice } = req.body;
    const { adminNote, itemQuotes } = req.body;

    const scrap = await Scrap.findById(id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });

    if (['completed', 'cancelled'].includes(scrap.status)) {
      return res.status(400).json({ success: false, message: `Cannot modify item in ${scrap.status} state` });
    }

    // Requests with items that need a quote are priced per item: the offer is the priced items'
    // estimate plus what the admin quotes for each of the others.
    if (scrap.items?.length > 0 && scrap.hasQuoteItems) {
      const quotes = new Map((Array.isArray(itemQuotes) ? itemQuotes : []).map((q) => [String(q.itemId), Number(q.amount)]));
      for (const item of scrap.items) {
        if (item.pricingMode !== 'quote') continue;
        const amount = quotes.has(String(item._id)) ? quotes.get(String(item._id)) : item.quotedAmount;
        if (!Number.isFinite(amount) || amount < 0) {
          return res.status(400).json({ success: false, message: `Enter a price for ${item.name}.` });
        }
        item.quotedAmount = Math.round(amount * 100) / 100;
      }
      const quoted = scrap.items.filter((i) => i.pricingMode === 'quote').reduce((sum, i) => sum + (i.quotedAmount || 0), 0);
      offeredPrice = Math.round(((scrap.estimatedTotal || 0) + quoted) * 100) / 100;
    }

    // If an offered price is provided, mark as 'offered' so user can review and approve
    if (offeredPrice !== undefined && offeredPrice !== null && offeredPrice !== '') {
      const priceNum = Number(offeredPrice);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ success: false, message: 'Please enter a valid price amount' });
      }

      scrap.offeredPrice = priceNum;
      scrap.adminNote = adminNote || '';
      scrap.offeredAt = new Date();
      scrap.status = 'offered';
      await scrap.save();

      // Notify User
      await createNotification({
        userId: scrap.userId,
        type: 'scrap_price_offered',
        title: `Price Offer: ₹${scrap.offeredPrice}`,
        message: `Admin has offered ₹${scrap.offeredPrice} for your scrap item "${scrap.title}". Please review and accept or reject.`,
        relatedId: scrap._id,
        relatedType: 'scrap',
        data: {
          offeredPrice: scrap.offeredPrice,
          adminNote: scrap.adminNote
        }
      });

      return res.json({
        success: true,
        data: scrap,
        message: `Price offer of ₹${scrap.offeredPrice} sent to user successfully`
      });
    }

    // Fallback if accepted directly without price offer
    scrap.status = 'accepted';
    scrap.pickupDate = new Date();
    await scrap.save();

    // Notify User
    await createNotification({
      userId: scrap.userId,
      type: 'scrap_accepted',
      title: 'Scrap Request Accepted!',
      message: `Admin has accepted your scrap request for "${scrap.title}". They will contact you shortly.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });

    res.json({ success: true, data: scrap, message: 'Request accepted. Please contact user for pickup.' });
  } catch (error) {
    console.error('Accept/Offer scrap error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// User approves or rejects the admin's scrap price offer
exports.respondToOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be accept or reject' });
    }

    const scrap = await Scrap.findById(id);
    if (!scrap) {
      return res.status(404).json({ success: false, message: 'Scrap item not found' });
    }

    // Check that logged in user is the owner of this scrap
    if (scrap.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (scrap.status !== 'offered') {
      return res.status(400).json({ success: false, message: `Cannot respond to offer. Current status is ${scrap.status}` });
    }

    scrap.userResponseDate = new Date();

    if (action === 'accept') {
      scrap.status = 'accepted';
      scrap.finalPrice = scrap.offeredPrice;
      scrap.pickupDate = scrap.pickupDate || new Date(); // keep a date the admin already set
      await scrap.save();

      // Fetch user name
      const user = await User.findById(req.user.id);
      const userName = user ? user.name : 'User';

      // Notify Admins
      const admins = await Admin.find({});
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'scrap_accepted',
          title: 'Scrap Offer Accepted',
          message: `${userName} accepted the price offer of ₹${scrap.offeredPrice} for "${scrap.title}".`,
          relatedId: scrap._id,
          relatedType: 'scrap'
        });
      }

      // Notify User
      await createNotification({
        userId: scrap.userId,
        type: 'scrap_accepted',
        title: 'Offer Accepted Successfully',
        message: `You accepted the offer of ₹${scrap.offeredPrice} for "${scrap.title}". Pickup will be scheduled soon.`,
        relatedId: scrap._id,
        relatedType: 'scrap'
      });

      return res.json({
        success: true,
        data: scrap,
        message: 'Offer accepted! Pickup will be scheduled.'
      });
    } else {
      scrap.status = 'rejected';
      await scrap.save();

      // Fetch user name
      const user = await User.findById(req.user.id);
      const userName = user ? user.name : 'User';

      // Notify Admins
      const admins = await Admin.find({});
      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'scrap_rejected',
          title: 'Scrap Offer Rejected',
          message: `${userName} rejected the price offer of ₹${scrap.offeredPrice} for "${scrap.title}".`,
          relatedId: scrap._id,
          relatedType: 'scrap'
        });
      }

      // Notify User
      await createNotification({
        userId: scrap.userId,
        type: 'scrap_rejected',
        title: 'Offer Rejected',
        message: `You rejected the offer for "${scrap.title}".`,
        relatedId: scrap._id,
        relatedType: 'scrap'
      });

      return res.json({
        success: true,
        data: scrap,
        message: 'Offer rejected.'
      });
    }
  } catch (error) {
    console.error('Error responding to scrap offer:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Worker marks item as picked up / completed
exports.completeScrap = async (req, res) => {
  try {
    const { id } = req.params;
    const { finalPrice } = req.body;

    const scrap = await Scrap.findById(id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });

    // Check if the user is the assigned worker OR an admin
    const { USER_ROLES } = require('../utils/constants');
    const isAdmin = req.userRole === USER_ROLES.ADMIN || req.userRole === 'admin' || req.userRole === 'super_admin';

    if (scrap.vendorId && scrap.vendorId.toString() !== req.user.id && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Requests made from scrap types are completed by paying the customer (wallet, or cash handed over)
    if (scrap.items?.length > 0) {
      if (!['accepted', 'weighed'].includes(scrap.status)) {
        return res.status(400).json({ success: false, message: `Cannot complete a request that is ${scrap.status}` });
      }
      if (finalPrice !== undefined && finalPrice !== null && finalPrice !== '') {
        const n = Number(finalPrice);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, message: 'Enter a valid amount' });
        scrap.finalPrice = Math.round(n * 100) / 100;
      }
      if (!(scrap.finalPrice >= 0) || scrap.finalPrice === null) {
        return res.status(400).json({ success: false, message: 'Weigh the scrap or enter the final amount first' });
      }
      try {
        const payoutMethod = req.body.payoutMethod === 'cash' ? 'cash' : 'wallet';
        scrap.status = 'completed';
        scrap.payout = await payCustomer(scrap, payoutMethod);
      } catch (payErr) {
        console.error('Scrap payout error:', payErr);
        return res.status(500).json({ success: false, message: 'Could not pay the customer. Nothing was changed.' });
      }
      await creditPickupWorker(scrap);
      await scrap.save();
      await createNotification({
        userId: scrap.userId,
        type: 'scrap_completed',
        title: 'Scrap Pickup Completed',
        message: scrap.payout.method === 'wallet'
          ? `₹${scrap.finalPrice} for "${scrap.title}" was added to your wallet.`
          : `You received ₹${scrap.finalPrice} in cash for "${scrap.title}".`,
        relatedId: scrap._id,
        relatedType: 'scrap'
      });
      return res.json({ success: true, data: scrap, message: 'Completed and customer paid' });
    }

    scrap.status = 'completed';
    if (finalPrice) scrap.finalPrice = finalPrice;
    await scrap.save();

    // Notify User
    await createNotification({
      userId: scrap.userId,
      type: 'scrap_completed',
      title: 'Scrap Pickup Completed',
      message: `Your scrap item "${scrap.title}" has been successfully picked up and completed.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });

    res.json({ success: true, data: scrap, message: 'Transactions completed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Admin: Get all scrap items
exports.getAllScrapAdmin = async (req, res) => {
  try {
    const scraps = await Scrap.find({})
      .populate('userId', 'name email phone')
      .populate('vendorId', 'name businessName phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: scraps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Get single scrap by ID
exports.getScrapById = async (req, res) => {
  try {
    const scrap = await Scrap.findById(req.params.id)
      .populate('userId', 'name phone email profilePhoto')
      .populate('vendorId', 'name businessName phone profilePhoto');

    if (!scrap) {
      return res.status(404).json({ success: false, message: 'Scrap not found' });
    }

    res.json({ success: true, data: scrap });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Delete scrap item
exports.deleteScrap = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role; // e.g., 'ADMIN', 'USER'

    const scrap = await Scrap.findById(id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });

    // Authorization check
    // Allow deletion if:
    // 1. User is the creator of the scrap item
    // 2. User is an Admin
    const isOwner = scrap.userId.toString() === userId;
    const isAdmin = ['ADMIN', 'admin', 'super_admin'].includes(userRole);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this item' });
    }

    await Scrap.findByIdAndDelete(id);

    res.json({ success: true, message: 'Scrap item deleted successfully' });
  } catch (error) {
    console.error('Delete scrap error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── Pickup, weighing and payment (requests made from scrap types) ───────────────────────────

// Credits the pickup professional after the customer is paid. The customer's payment is never
// undone by a problem here: the failure is logged and the earning can be fixed by hand.
const creditPickupWorker = async (scrap) => {
  try {
    const earning = await creditWorker(scrap, await getBookingConfig());
    if (earning) scrap.workerEarning = earning;
  } catch (err) {
    console.error(`[Scrap] Could not credit the professional for ${scrap._id}:`, err.message);
  }
};

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Admin: choose the professional and the time. A request with nothing to quote is confirmed by this.
exports.assignPickup = async (req, res) => {
  try {
    const scrap = await Scrap.findById(req.params.id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });
    if (!['pending', 'offered', 'accepted'].includes(scrap.status)) {
      return res.status(400).json({ success: false, message: `Cannot schedule a request that is ${scrap.status}` });
    }

    const { vendorId, pickupDate, pickupSlot } = req.body;
    const worker = vendorId ? await Worker.findOne({ _id: vendorId, approvalStatus: 'approved' }).select('name isScrapOpted') : null;
    if (!worker) return res.status(400).json({ success: false, message: 'Choose an approved professional.' });
    if (!worker.isScrapOpted) {
      return res.status(400).json({ success: false, message: 'The selected professional has not opted in for scrap pickups.' });
    }

    const when = new Date(pickupDate);
    if (!pickupDate || Number.isNaN(when.getTime())) {
      return res.status(400).json({ success: false, message: 'Choose the pickup date.' });
    }

    scrap.vendorId = worker._id;
    scrap.pickupDate = when;
    scrap.pickupSlot = String(pickupSlot || '').trim().slice(0, 40);
    const confirms = scrap.status === 'pending' && scrap.items?.length > 0 && !scrap.hasQuoteItems;
    if (confirms) scrap.status = 'accepted';
    await scrap.save();

    const day = when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    const slot = scrap.pickupSlot ? `, ${scrap.pickupSlot}` : '';
    await createNotification({
      userId: scrap.userId,
      type: 'scrap_accepted',
      title: confirms ? 'Scrap pickup scheduled' : 'Pickup time set',
      message: `${worker.name || 'A professional'} will collect your scrap on ${day}${slot}. You are paid by the weight at pickup.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });
    await createNotification({
      vendorId: worker._id,
      type: 'scrap_pickup_assigned',
      title: 'New scrap pickup',
      message: `${scrap.title} on ${day}${slot}.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });

    res.json({ success: true, data: scrap, message: 'Pickup scheduled' });
  } catch (error) {
    console.error('Assign scrap pickup error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Worker: pickups assigned to them
exports.getWorkerPickups = async (req, res) => {
  try {
    const scraps = await Scrap.find({ vendorId: req.user.id, status: { $in: ['accepted', 'weighed', 'completed'] } })
      .populate('userId', 'name phone')
      .sort({ pickupDate: 1, createdAt: -1 })
      .limit(100);

    // What each pickup pays the professional under the admin's current setting (or what it paid)
    const config = await getBookingConfig();
    const data = scraps.map((scrap) => {
      const doc = scrap.toObject();
      doc.workerEarningPreview = scrap.workerEarning?.creditedAt
        ? scrap.workerEarning.amount
        : computeWorkerEarning(scrap.finalPrice ?? scrap.estimatedTotal ?? 0, config).amount;
      return doc;
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Worker scrap pickups error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Worker: enter what was actually collected; the customer then confirms the amount
exports.submitWeights = async (req, res) => {
  try {
    const scrap = await Scrap.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!scrap) return res.status(404).json({ success: false, message: 'Pickup not found' });
    if (scrap.status !== 'accepted') {
      return res.status(400).json({ success: false, message: scrap.status === 'weighed' ? 'Already weighed. Waiting for the customer to confirm.' : `Cannot weigh a pickup that is ${scrap.status}` });
    }
    if (!(scrap.items?.length > 0)) {
      return res.status(400).json({ success: false, message: 'This listing has no items to weigh.' });
    }

    const result = computeWeighing(scrap, req.body.items);
    if (result.error) return res.status(400).json({ success: false, message: result.error });

    result.items.forEach((row) => {
      const item = scrap.items.id(row.itemId);
      item.actualQuantity = row.actualQuantity;
      item.finalAmount = row.finalAmount;
    });
    scrap.finalPrice = result.total;
    scrap.status = 'weighed';
    scrap.weighedAt = new Date();
    scrap.weighNote = String(req.body.note || '').trim().slice(0, 300);
    scrap.weightDispute = { reason: '', at: null };
    await scrap.save();

    await createNotification({
      userId: scrap.userId,
      type: 'scrap_weighed',
      title: `Your scrap came to ₹${scrap.finalPrice}`,
      message: `"${scrap.title}" was weighed. Please confirm the amount to get paid.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });

    res.json({ success: true, data: scrap, message: 'Weights saved. Waiting for the customer to confirm.' });
  } catch (error) {
    console.error('Submit scrap weights error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Customer: accept the weighed amount and choose how to be paid
exports.confirmWeighing = async (req, res) => {
  try {
    const wantsCash = req.body.payoutMethod === 'cash';
    if (wantsCash && !(await getBookingConfig()).scrapAllowCashPayout) {
      return res.status(400).json({ success: false, message: 'Cash payout is not available. The amount will go to your wallet.' });
    }

    // Only one request can move it out of "weighed", so the customer is never paid twice
    const scrap = await Scrap.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: 'weighed' },
      { $set: { status: 'completed', userResponseDate: new Date() } },
      { new: true }
    );
    if (!scrap) return res.status(400).json({ success: false, message: 'This pickup is not waiting for your confirmation.' });

    try {
      scrap.payout = await payCustomer(scrap, wantsCash ? 'cash' : 'wallet');
      await scrap.save();
      await creditPickupWorker(scrap);
      if (scrap.workerEarning?.creditedAt) await scrap.save();
    } catch (payErr) {
      console.error('Scrap payout error:', payErr);
      await Scrap.updateOne({ _id: scrap._id }, { $set: { status: 'weighed' } });
      return res.status(500).json({ success: false, message: 'Could not complete the payment. Please try again.' });
    }

    await createNotification({
      userId: scrap.userId,
      type: 'scrap_completed',
      title: 'Scrap sold',
      message: scrap.payout.method === 'wallet'
        ? `₹${scrap.finalPrice} was added to your wallet.`
        : `Please collect ₹${scrap.finalPrice} in cash from the professional.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });
    if (scrap.payout.method === 'cash') {
      for (const admin of await Admin.find({})) {
        await createNotification({
          adminId: admin._id,
          type: 'scrap_completed',
          title: 'Scrap paid in cash',
          message: `The professional paid ₹${scrap.finalPrice} in cash for "${scrap.title}". Reimburse them.`,
          relatedId: scrap._id,
          relatedType: 'scrap'
        });
      }
    }

    res.json({ success: true, data: scrap, message: scrap.payout.method === 'wallet' ? 'Added to your wallet' : 'Confirmed' });
  } catch (error) {
    console.error('Confirm scrap weighing error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Customer: the weight looks wrong, so it goes back to be weighed again and the admin is told
exports.disputeWeighing = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ success: false, message: 'Tell us what looks wrong.' });

    const scrap = await Scrap.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, status: 'weighed' },
      { $set: { status: 'accepted', weightDispute: { reason, at: new Date() } } },
      { new: true }
    );
    if (!scrap) return res.status(400).json({ success: false, message: 'This pickup is not waiting for your confirmation.' });

    for (const admin of await Admin.find({})) {
      await createNotification({
        adminId: admin._id,
        type: 'scrap_weight_disputed',
        title: 'Scrap weight questioned',
        message: `The customer questioned the weight for "${scrap.title}": ${reason}`,
        relatedId: scrap._id,
        relatedType: 'scrap'
      });
    }
    res.json({ success: true, data: scrap, message: 'Sent to our team. It will be weighed again or adjusted.' });
  } catch (error) {
    console.error('Dispute scrap weighing error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Admin: set the final amount by hand (for example after a disputed weight)
exports.adjustFinalAmount = async (req, res) => {
  try {
    const scrap = await Scrap.findById(req.params.id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });
    if (!['accepted', 'weighed'].includes(scrap.status)) {
      return res.status(400).json({ success: false, message: `Cannot adjust a request that is ${scrap.status}` });
    }

    const amount = Number(req.body.finalPrice);
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Enter a valid amount' });
    if (!reason) return res.status(400).json({ success: false, message: 'Add a short reason for the change.' });

    scrap.finalPrice = money(amount);
    scrap.adjustReason = reason;
    scrap.status = 'weighed'; // the customer confirms the new amount
    scrap.weighedAt = scrap.weighedAt || new Date();
    await scrap.save();

    await createNotification({
      userId: scrap.userId,
      type: 'scrap_weighed',
      title: `Your scrap amount is ₹${scrap.finalPrice}`,
      message: `We updated the amount for "${scrap.title}": ${reason}. Please confirm to get paid.`,
      relatedId: scrap._id,
      relatedType: 'scrap'
    });
    res.json({ success: true, data: scrap, message: 'Amount updated. The customer will confirm it.' });
  } catch (error) {
    console.error('Adjust scrap amount error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
