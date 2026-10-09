const WorkerReferral = require('../../models/WorkerReferral');
const Worker = require('../../models/Worker');
const Settings = require('../../models/Settings');
const Transaction = require('../../models/Transaction');
const { createNotification } = require('../notificationControllers/notificationController');

/**
 * Admin: Get all worker referrals with filters and statistics
 */
exports.getAllReferrals = async (req, res) => {
  try {
    const { status, search } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const referrals = await WorkerReferral.find(query)
      .populate('referrerId', 'name email phone businessName wallet referralEarnings')
      .populate('referredVendorId', 'name email phone businessName service profilePhoto approvalStatus createdAt')
      .sort({ createdAt: -1 });

    // Client-side / regex search filter
    let filtered = referrals;
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      filtered = referrals.filter(r => {
        const refName = r.referrerId?.name?.toLowerCase() || '';
        const refPhone = r.referrerId?.phone?.toLowerCase() || '';
        const refCode = r.referralCode?.toLowerCase() || '';
        const newName = r.referredVendorId?.name?.toLowerCase() || '';
        const newPhone = r.referredVendorId?.phone?.toLowerCase() || '';
        return refName.includes(s) || refPhone.includes(s) || refCode.includes(s) || newName.includes(s) || newPhone.includes(s);
      });
    }

    // Stats
    const allRefs = await WorkerReferral.find({});
    const totalReferrals = allRefs.length;
    const pendingReferrals = allRefs.filter(r => r.status === 'pending').length;
    const rewardedReferrals = allRefs.filter(r => r.status === 'rewarded' || r.status === 'approved').length;
    const totalRewardsDisbursed = allRefs
      .filter(r => r.status === 'rewarded')
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0);

    // Settings
    const settings = await Settings.findOne({ type: 'global' }).lean();

    res.status(200).json({
      success: true,
      data: filtered,
      stats: {
        totalReferrals,
        pendingReferrals,
        rewardedReferrals,
        totalRewardsDisbursed
      },
      settings: {
        vendorReferralEnabled: settings?.vendorReferralEnabled ?? true,
        vendorReferralReward: settings?.vendorReferralReward ?? 100,
        vendorReferralCriteria: settings?.vendorReferralCriteria ?? 'MANUAL_ADMIN_APPROVAL'
      }
    });
  } catch (error) {
    console.error('Error fetching admin referrals:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * Admin: Approve and credit reward directly into referrer worker's wallet
 */
exports.approveAndRewardReferral = async (req, res) => {
  try {
    const { id } = req.params;
    const { customRewardAmount } = req.body;

    const referral = await WorkerReferral.findById(id)
      .populate('referrerId')
      .populate('referredVendorId');

    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral record not found' });
    }

    if (referral.status === 'rewarded') {
      return res.status(400).json({ success: false, message: 'Referral reward has already been credited' });
    }

    const referrer = referral.referrerId;
    if (!referrer) {
      return res.status(404).json({ success: false, message: 'Referrer worker account not found' });
    }

    // Determine final reward amount
    let reward = customRewardAmount ? Number(customRewardAmount) : (referral.rewardAmount || 100);
    if (isNaN(reward) || reward < 0) reward = 100;

    // Credit to Referrer Worker Wallet
    const currentEarnings = referrer.wallet?.earnings || 0;
    const updatedEarnings = currentEarnings + reward;

    if (!referrer.wallet) referrer.wallet = {};
    referrer.wallet.earnings = updatedEarnings;
    referrer.referralEarnings = (referrer.referralEarnings || 0) + reward;
    await referrer.save();

    // Create Wallet Transaction Entry
    await Transaction.create({
      vendorId: referrer._id,
      type: 'referral_bonus',
      amount: reward,
      status: 'completed',
      paymentMethod: 'wallet',
      description: `Referral bonus for referring worker ${referral.referredVendorId?.name || 'partner'}`,
      balanceBefore: currentEarnings,
      balanceAfter: updatedEarnings,
      metadata: {
        referralId: referral._id,
        referredVendorId: referral.referredVendorId?._id
      }
    });

    // Update Referral status
    referral.status = 'rewarded';
    referral.rewardAmount = reward;
    referral.rewardedAt = new Date();
    await referral.save();

    // Send push and in-app notification to Referrer Worker
    try {
      await createNotification({
        vendorId: referrer._id,
        type: 'vendor_referral_rewarded',
        title: '💰 Referral Bonus Credited!',
        message: `Congratulations! ₹${reward} referral bonus has been credited to your wallet for referring ${referral.referredVendorId?.name || 'a new worker'}.`,
        relatedId: referral._id,
        relatedType: 'vendor'
      });
    } catch (notifErr) {
      console.error('Notification error:', notifErr);
    }

    res.status(200).json({
      success: true,
      message: `₹${reward} referral bonus successfully credited to ${referrer.name}'s wallet!`,
      data: referral
    });

  } catch (error) {
    console.error('Error approving and rewarding referral:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * Admin: Reject a referral
 */
exports.rejectReferral = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const referral = await WorkerReferral.findById(id);
    if (!referral) {
      return res.status(404).json({ success: false, message: 'Referral record not found' });
    }

    if (referral.status === 'rewarded') {
      return res.status(400).json({ success: false, message: 'Cannot reject an already rewarded referral' });
    }

    referral.status = 'rejected';
    referral.rejectionReason = reason || 'Referral criteria not met';
    await referral.save();

    res.status(200).json({
      success: true,
      message: 'Referral has been marked as rejected',
      data: referral
    });
  } catch (error) {
    console.error('Error rejecting referral:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * Admin: Update Referral Program Settings
 */
exports.updateReferralSettings = async (req, res) => {
  try {
    const { vendorReferralEnabled, vendorReferralReward, vendorReferralCriteria } = req.body;

    let settings = await Settings.findOne({ type: 'global' });
    if (!settings) {
      settings = new Settings({ type: 'global' });
    }

    if (vendorReferralEnabled !== undefined) settings.vendorReferralEnabled = Boolean(vendorReferralEnabled);
    if (vendorReferralReward !== undefined && !isNaN(Number(vendorReferralReward))) {
      settings.vendorReferralReward = Number(vendorReferralReward);
    }
    if (vendorReferralCriteria) settings.vendorReferralCriteria = vendorReferralCriteria;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Referral settings updated successfully',
      settings: {
        vendorReferralEnabled: settings.vendorReferralEnabled,
        vendorReferralReward: settings.vendorReferralReward,
        vendorReferralCriteria: settings.vendorReferralCriteria
      }
    });
  } catch (error) {
    console.error('Error updating referral settings:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
