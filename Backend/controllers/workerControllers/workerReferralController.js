const Worker = require('../../models/Worker');
const WorkerReferral = require('../../models/WorkerReferral');
const Settings = require('../../models/Settings');

/**
 * Get Refer & Earn details for logged-in worker
 */
exports.getWorkerReferralDetails = async (req, res) => {
  try {
    const vendorId = req.user.id;

    let worker = await Worker.findById(vendorId);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    // Ensure worker has a referralCode
    if (!worker.referralCode) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = 'HOMV';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      worker.referralCode = code;
      await worker.save();
    }

    // Fetch Global Settings
    const settings = await Settings.findOne({ type: 'global' }).lean();
    const rewardPerReferral = settings?.vendorReferralReward ?? 100;
    const isProgramEnabled = settings?.vendorReferralEnabled ?? true;

    // Fetch Referrals for this worker
    const referrals = await WorkerReferral.find({ referrerId: vendorId })
      .populate('referredVendorId', 'name phone businessName service profilePhoto approvalStatus createdAt')
      .sort({ createdAt: -1 });

    const totalReferrals = referrals.length;
    const rewardedReferrals = referrals.filter(r => r.status === 'rewarded' || r.status === 'approved').length;
    const pendingReferrals = referrals.filter(r => r.status === 'pending').length;
    const rejectedReferrals = referrals.filter(r => r.status === 'rejected').length;
    
    // Total earned
    const totalEarnings = referrals
      .filter(r => r.status === 'rewarded')
      .reduce((sum, r) => sum + (r.rewardAmount || 0), 0) || (worker.referralEarnings || 0);

    res.status(200).json({
      success: true,
      data: {
        referralCode: worker.referralCode,
        rewardPerReferral,
        isProgramEnabled,
        stats: {
          totalReferrals,
          rewardedReferrals,
          pendingReferrals,
          rejectedReferrals,
          totalEarnings
        },
        referrals: referrals.map(r => ({
          id: r._id,
          referredWorker: r.referredVendorId ? {
            id: r.referredVendorId._id,
            name: r.referredVendorId.name,
            phone: r.referredVendorId.phone,
            businessName: r.referredVendorId.businessName,
            approvalStatus: r.referredVendorId.approvalStatus,
            joinedAt: r.referredVendorId.createdAt
          } : null,
          status: r.status,
          rewardAmount: r.rewardAmount,
          rewardedAt: r.rewardedAt,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching worker referral details:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
