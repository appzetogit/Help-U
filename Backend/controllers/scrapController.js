const Scrap = require('../models/Scrap');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Settings = require('../models/Settings');
const { validationResult } = require('express-validator');
const { createNotification } = require('./notificationControllers/notificationController');

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

    const { title, description, images, address } = req.body;

    const scrap = new Scrap({
      userId: req.user.id,
      title,
      description,
      images,
      address
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
    const { offeredPrice, adminNote } = req.body;

    const scrap = await Scrap.findById(id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });

    if (['completed', 'cancelled'].includes(scrap.status)) {
      return res.status(400).json({ success: false, message: `Cannot modify item in ${scrap.status} state` });
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
      scrap.pickupDate = new Date();
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
