const Worker = require('../../models/Worker');
const Booking = require('../../models/Booking');
const WorkerBill = require('../../models/WorkerBill');
const { validationResult } = require('express-validator');
const { WORKER_STATUS, BOOKING_STATUS, PAYMENT_STATUS } = require('../../utils/constants');
const { createNotification } = require('../notificationControllers/notificationController');

/**
 * Get all workers with filters and pagination
 */
const getAllWorkers = async (req, res) => {
  try {
    const {
      search,
      approvalStatus,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (approvalStatus) {
      query.approvalStatus = approvalStatus;
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Search by name, email, phone, or business name
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get workers
    const workers = await Worker.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Worker.countDocuments(query);

    res.status(200).json({
      success: true,
      data: workers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all workers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workers. Please try again.'
    });
  }
};

/**
 * Get worker details
 */
const getWorkerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id).select('-password');

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Get worker stats from WorkerBill (single source of truth)
    const totalBookings = await Booking.countDocuments({ vendorId: worker._id });
    const completedBookings = await Booking.countDocuments({ vendorId: worker._id, status: BOOKING_STATUS.COMPLETED });

    const earningsResult = await WorkerBill.aggregate([
      {
        $match: {
          vendorId: worker._id,
          status: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$vendorTotalEarning' },
          totalRevenue: { $sum: '$grandTotal' }
        }
      }
    ]);

    const bookingStats = [{
      totalBookings,
      completedBookings,
      totalEarnings: earningsResult[0]?.totalEarnings || 0,
      totalRevenue: earningsResult[0]?.totalRevenue || 0
    }];

    res.status(200).json({
      success: true,
      data: {
        worker,
        stats: bookingStats[0] || {
          totalBookings: 0,
          completedBookings: 0,
          totalEarnings: 0
        }
      }
    });
  } catch (error) {
    console.error('Get worker details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker details. Please try again.'
    });
  }
};

/**
 * Approve worker registration
 */
const approveWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.approvalStatus = WORKER_STATUS.APPROVED;
    worker.approvalDate = new Date();
    await worker.save();

    // Send notification to worker
    await createNotification({
      vendorId: worker._id,
      type: 'vendor_approved',
      title: 'Worker Registration Approved',
      message: 'Your worker registration has been approved. You can now start accepting bookings.',
      relatedId: worker._id,
      relatedType: 'vendor'
    });

    res.status(200).json({
      success: true,
      message: 'Worker approved successfully',
      data: worker
    });
  } catch (error) {
    console.error('Approve worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve worker. Please try again.'
    });
  }
};

/**
 * Reject worker registration
 */
const rejectWorker = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.approvalStatus = WORKER_STATUS.REJECTED;
    worker.rejectedReason = reason || 'Registration rejected by admin';
    await worker.save();

    // Send notification to worker
    await createNotification({
      vendorId: worker._id,
      type: 'vendor_rejected',
      title: 'Worker Registration Rejected',
      message: `Your worker registration has been rejected. Reason: ${worker.rejectedReason}`,
      relatedId: worker._id,
      relatedType: 'vendor'
    });

    res.status(200).json({
      success: true,
      message: 'Worker rejected successfully',
      data: worker
    });
  } catch (error) {
    console.error('Reject worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject worker. Please try again.'
    });
  }
};

/**
 * Suspend worker
 */
const suspendWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.approvalStatus = WORKER_STATUS.SUSPENDED;
    worker.isActive = false;
    await worker.save();

    res.status(200).json({
      success: true,
      message: 'Worker suspended successfully',
      data: worker
    });
  } catch (error) {
    console.error('Suspend worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend worker. Please try again.'
    });
  }
};

/**
 * View worker bookings
 */
const getWorkerBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { vendorId: id };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .populate('userId', 'name phone')
      .populate('serviceId', 'title iconUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker bookings. Please try again.'
    });
  }
};

/**
 * View worker earnings
 */
const getWorkerEarnings = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // Get earnings from WorkerBill (single source of truth)
    const billQuery = {
      vendorId: require('mongoose').Types.ObjectId(id),
      status: 'paid'
    };

    if (startDate || endDate) {
      billQuery.paidAt = {};
      if (startDate) billQuery.paidAt.$gte = new Date(startDate);
      if (endDate) billQuery.paidAt.$lte = new Date(endDate);
    }

    const earnings = await WorkerBill.aggregate([
      { $match: billQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$grandTotal' },
          vendorEarnings: { $sum: '$vendorTotalEarning' },
          platformCommission: { $sum: '$companyRevenue' },
          totalBookings: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: earnings[0] || {
        totalRevenue: 0,
        vendorEarnings: 0,
        platformCommission: 0,
        totalBookings: 0
      }
    });
  } catch (error) {
    console.error('Get worker earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker earnings. Please try again.'
    });
  }
};

/**
 * Get all worker bookings (global)
 */
const getAllWorkerBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = { vendorId: { $exists: true, $ne: null } };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // If search is provided, we need to find workers by business name or name first
    if (search) {
      const workers = await Worker.find({
        $or: [
          { businessName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');

      const workerIds = workers.map(v => v._id);
      query.vendorId = { $in: workerIds };
    }

    const bookings = await Booking.find(query)
      .populate('vendorId', 'name businessName phone profileImage')
      .populate('userId', 'name phone')
      .populate('serviceId', 'title iconUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.status(200).json({
      success: true,
      data: bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all worker bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch all worker bookings.'
    });
  }
};

/**
 * Get worker payments summary
 */
const getWorkerPaymentsSummary = async (req, res) => {
  try {
    // Return workers with their wallet balances and earnings
    const workers = await Worker.find({
      'wallet.balance': { $exists: true }
    })
      .select('name businessName phone wallet email approvalStatus')
      .sort({ 'wallet.balance': -1 });

    res.status(200).json({
      success: true,
      data: workers
    });
  } catch (error) {
    console.error('Get worker payments summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch worker payments summary.'
    });
  }
};

/**
 * Toggle worker active status (approve/disable login)
 */
const toggleWorkerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body; // Expecting { isActive: true/false }

    const worker = await Worker.findById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    worker.isActive = isActive;
    await worker.save();

    // Log the action (optional but recommended)
    // console.log(`Worker ${worker._id} status changed to ${isActive}`);

    res.status(200).json({
      success: true,
      message: `Worker ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: worker
    });
  } catch (error) {
    console.error('Toggle worker status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update worker status'
    });
  }
};

/**
 * Delete worker
 */
const deleteWorker = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await Worker.findByIdAndDelete(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Worker deleted successfully'
    });
  } catch (error) {
    console.error('Delete worker error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete worker'
    });
  }
};

module.exports = {
  getAllWorkers,
  getWorkerDetails,
  approveWorker,
  rejectWorker,
  suspendWorker,
  getWorkerBookings,
  getWorkerEarnings,
  getAllWorkerBookings,
  getWorkerPaymentsSummary,
  toggleWorkerStatus,
  deleteWorker
};

