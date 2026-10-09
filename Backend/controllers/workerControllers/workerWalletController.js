const Worker = require('../../models/Worker');
const Transaction = require('../../models/Transaction');
const Settlement = require('../../models/Settlement');
const Withdrawal = require('../../models/Withdrawal');
const Booking = require('../../models/Booking');
const { uploadPaymentScreenshot } = require('../../utils/cloudinaryUpload');
const { validationResult } = require('express-validator');
const { createOrder, verifyPayment } = require('../../services/razorpayService');
const { createNotification } = require('../notificationControllers/notificationController');
const { recordSettlement } = require('../../services/earningTrackerService');

const sanitizeSettlementAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Number(amount.toFixed(2))) : 0;
};

const notifyAdminsAboutCompletedSettlement = async (worker, settlement) => {
  try {
    const Admin = require('../../models/Admin');
    const admins = await Admin.find({ isActive: true }).select('_id');

    for (const admin of admins) {
      await createNotification({
        adminId: admin._id,
        type: 'vendor_settlement_completed',
        title: 'Settlement Received',
        message: `${worker.businessName || worker.name} paid Rs.${settlement.amount} to clear dues.`,
        relatedId: settlement._id,
        relatedType: 'settlement',
        data: {
          vendorId: worker._id,
          workerName: worker.businessName || worker.name,
          amount: settlement.amount,
          settlementId: settlement._id,
          razorpayPaymentId: settlement.razorpayPaymentId
        },
        pushData: {
          type: 'admin_alert',
          link: '/admin/settlements/history'
        }
      });
    }
  } catch (error) {
    console.error('[Settlement] Failed to notify admins about completed settlement:', error);
  }
};

/**
 * Get worker wallet with ledger balance
 * Get worker wallet with ledger details
 * dues = Amount owed to admin
 * earnings = Amount admin owes worker
 */
const getWallet = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const worker = await Worker.findById(vendorId).select('wallet name businessName');

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    const dues = worker.wallet?.dues || 0;
    const earnings = worker.wallet?.earnings || 0;
    const totalWithdrawn = worker.wallet?.totalWithdrawn || 0;

    // Get pending settlements count
    const pendingSettlements = await Settlement.countDocuments({
      vendorId,
      status: 'pending'
    });

    // Get total cash collected (sum of all cash_collected transactions)
    const cashCollectedResult = await Transaction.aggregate([
      {
        $match: {
          vendorId: worker._id,
          type: 'cash_collected',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Get total settled amount
    const settledResult = await Transaction.aggregate([
      {
        $match: {
          vendorId: worker._id,
          type: 'settlement',
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const totalCashCollected = cashCollectedResult[0]?.total || 0;
    const totalSettled = settledResult[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: {
        dues,
        earnings,
        amountDue: dues, // Clarification for frontend but 'dues' is self-explanatory
        balance: earnings - dues, // Net position for reference (optional)
        totalWithdrawn,
        totalCashCollected,
        totalSettled,
        pendingSettlements,
        cashLimit: worker.wallet?.cashLimit || 10000,
        worker: {
          name: worker.name,
          businessName: worker.businessName
        }
      }
    });
  } catch (error) {
    console.error('Get worker wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet'
    });
  }
};

/**
 * Get worker transactions/ledger
 */
const getTransactions = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 20, type, status } = req.query;

    const query = { vendorId };
    if (type) query.type = type;
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('bookingId', 'bookingNumber serviceName scheduledDate');

    const total = await Transaction.countDocuments(query);

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions'
    });
  }
};

/**
 * Record cash collection from customer
 * Uses WorkerBill as the single source of truth for earnings.
 */
const recordCashCollection = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const bookingId = req.body.bookingId;
    const amount = Number(req.body.amount);
    const notes = req.body.notes;

    if (!bookingId || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID and valid amount are required'
      });
    }

    const worker = await Worker.findById(vendorId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    // Verify booking belongs to this worker
    const booking = await Booking.findOne({
      _id: bookingId,
      vendorId
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or does not belong to this worker'
      });
    }

    // Fetch WorkerBill (single source of truth for earnings)
    const WorkerBill = require('../../models/WorkerBill');
    const bill = await WorkerBill.findOne({ bookingId: booking._id });

    let vendorEarning = 0;
    const grandTotal = amount;

    if (bill) {
      vendorEarning = bill.vendorTotalEarning;
      bill.status = 'paid';
      bill.paidAt = new Date();
      await bill.save();
    }

    // Atomic wallet update
    const currentDues = (worker.wallet.dues || 0) + grandTotal;
    const currentEarnings = (worker.wallet.earnings || 0) + vendorEarning;
    const cashLimit = worker.wallet.cashLimit || 10000;
    const netOwed = currentDues - currentEarnings;

    const updateQuery = {
      $inc: {
        'wallet.dues': grandTotal,
        'wallet.earnings': vendorEarning,
        'wallet.totalCashCollected': grandTotal
      }
    };

    if (netOwed > cashLimit) {
      updateQuery.$set = {
        'wallet.isBlocked': true,
        'wallet.blockedAt': new Date(),
        'wallet.blockReason': `Cash limit exceeded. Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${cashLimit}`
      };

      // Notify admins
      try {
        const { createNotification } = require('../notificationControllers/notificationController');
        const Admin = require('../../models/Admin');

        const admins = await Admin.find({ isActive: true }).select('_id');

        for (const admin of admins) {
          await createNotification({
            adminId: admin._id,
            type: 'vendor_cash_limit_exceeded',
            title: '⚠️ Cash Limit Exceeded',
            message: `${worker.businessName || worker.name} exceeded cash limit! Net owed: ₹${netOwed.toFixed(2)}, Limit: ₹${cashLimit}`,
            relatedId: worker._id,
            relatedType: 'vendor',
            data: {
              vendorId: worker._id,
              workerName: worker.businessName || worker.name,
              netOwed,
              cashLimit
            },
            pushData: {
              type: 'admin_alert',
              link: '/admin/settlements'
            }
          });
        }
        console.log(`[CashLimit] Notified ${admins.length} admins: ${worker.name} exceeded limit`);
      } catch (notifyErr) {
        console.error('[CashLimit] Failed to notify admins:', notifyErr);
      }
    }

    await Worker.findByIdAndUpdate(vendorId, updateQuery);
    
    // Update booking status
    booking.status = 'completed';
    booking.paymentStatus = 'collected by worker';
    booking.paymentMethod = 'cash collected';
    booking.completedAt = new Date();
    await booking.save();

    // Create transaction record for Cash Collection
    const transaction = await Transaction.create({
      vendorId,
      bookingId,
      type: 'cash_collected',
      amount: grandTotal,
      status: 'completed',
      paymentMethod: 'cash collected',
      description: `Cash ₹${grandTotal} collected. Dues increased.`,
      metadata: {
        notes,
        type: 'dues_increase',
        billId: bill?._id?.toString(),
        vendorEarning,
        companyRevenue: bill?.companyRevenue
      }
    });

    // Create earnings credit transaction
    if (vendorEarning > 0) {
      await Transaction.create({
        vendorId,
        bookingId,
        type: 'earnings_credit',
        amount: vendorEarning,
        status: 'completed',
        paymentMethod: 'system',
        description: `Earnings ₹${vendorEarning} credited for booking #${booking.bookingNumber}`,
        metadata: {
          type: 'earnings_increase',
          billId: bill?._id?.toString(),
          serviceEarning: bill?.vendorServiceEarning,
          partsEarning: bill?.vendorPartsEarning
        }
      });
    }

    // Update booking payment status
    booking.paymentStatus = 'paid';
    booking.paymentMethod = 'cash';
    await booking.save();

    const newDues = currentDues;
    const newEarnings = currentEarnings;
    const newBalance = newEarnings - newDues;

    res.status(200).json({
      success: true,
      message: 'Cash collection recorded successfully',
      data: {
        transaction,
        newBalance,
        amountDue: newDues
      }
    });
  } catch (error) {
    console.error('Record cash collection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record cash collection'
    });
  }
};

/**
 * Request settlement (worker pays admin to clear negative balance)
 */
const requestSettlement = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { amount, paymentMethod, paymentReference, paymentProof, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const worker = await Worker.findById(vendorId);
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    const currentDues = worker.wallet?.dues || 0;

    if (amount > currentDues) {
      return res.status(400).json({
        success: false,
        message: `Settlement amount (₹${amount}) cannot exceed current dues (₹${currentDues})`
      });
    }

    // Check for existing pending settlement
    const existingPending = await Settlement.findOne({
      vendorId,
      status: 'pending'
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending settlement request. Please wait for it to be processed.'
      });
    }

    // Create settlement request
    const settlement = await Settlement.create({
      vendorId,
      amount,
      balanceBefore: currentDues,
      balanceAfter: currentDues - amount, // Dues will decrease
      paymentMethod: paymentMethod || 'upi',
      paymentReference,
      paymentProof,
      vendorNotes: notes,
      status: 'pending'
    });

    // 🔔 NOTIFY ALL ADMINS about settlement request
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      const Admin = require('../../models/Admin');

      const admins = await Admin.find({ isActive: true }).select('_id');

      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'vendor_settlement_request',
          title: '💰 Settlement Request',
          message: `${worker.businessName || worker.name} submitted settlement of ₹${amount}`,
          relatedId: settlement._id,
          relatedType: 'settlement',
          data: {
            vendorId: worker._id,
            workerName: worker.businessName || worker.name,
            amount,
            settlementId: settlement._id
          },
          pushData: {
            type: 'admin_alert',
            link: '/admin/settlements'
          }
        });
      }
      console.log(`[Settlement] Notified ${admins.length} admins about settlement request from ${worker.name}`);
    } catch (notifyErr) {
      console.error('[Settlement] Failed to notify admins:', notifyErr);
    }

    res.status(200).json({
      success: true,
      message: 'Settlement request submitted successfully. Pending admin approval.',
      data: settlement
    });
  } catch (error) {
    console.error('Request settlement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit settlement request'
    });
  }
};

/**
 * Create Razorpay settlement order (worker pays admin directly)
 */
const createSettlementOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const vendorId = req.user.id;
    const amount = sanitizeSettlementAmount(req.body.amount);

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const worker = await Worker.findById(vendorId).select('name businessName wallet');
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    const currentDues = sanitizeSettlementAmount(worker.wallet?.dues || 0);
    if (currentDues <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No dues available for settlement'
      });
    }

    if (amount > currentDues) {
      return res.status(400).json({
        success: false,
        message: `Settlement amount (Rs.${amount}) cannot exceed current dues (Rs.${currentDues})`
      });
    }

    const orderResult = await createOrder(
      amount,
      'INR',
      `SETTLE_${vendorId}_${Date.now()}`,
      {
        purpose: 'vendor_settlement',
        vendorId: vendorId.toString(),
        workerName: worker.businessName || worker.name,
        amount: amount.toFixed(2)
      }
    );

    if (!orderResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create settlement order',
        error: orderResult.error || 'Unknown error'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Settlement order created successfully',
      data: {
        orderId: orderResult.orderId,
        amount: orderResult.amount / 100,
        currency: orderResult.currency,
        key: process.env.RAZORPAY_KEY_ID,
        settlementAmount: amount,
        balanceBefore: currentDues
      }
    });
  } catch (error) {
    console.error('Create settlement order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create settlement order',
      error: error.message
    });
  }
};

/**
 * Verify worker settlement payment and clear dues automatically
 */
const verifySettlementPayment = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { amount, razorpay_order_id, razorpay_payment_id, razorpay_signature, notes } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification details'
      });
    }

    const settlementAmount = sanitizeSettlementAmount(amount);
    if (settlementAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid settlement amount is required'
      });
    }

    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    const existingSettlement = await Settlement.findOne({
      vendorId,
      razorpayPaymentId: razorpay_payment_id
    });

    if (existingSettlement) {
      return res.status(200).json({
        success: true,
        message: 'Settlement already verified',
        data: {
          settlement: existingSettlement,
          newDues: existingSettlement.balanceAfter
        }
      });
    }

    const worker = await Worker.findById(vendorId).select('name businessName email wallet');
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    const currentDues = sanitizeSettlementAmount(worker.wallet?.dues || 0);
    if (currentDues <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No dues available for settlement'
      });
    }

    const appliedAmount = Math.min(settlementAmount, currentDues);
    const remainingDues = sanitizeSettlementAmount(currentDues - appliedAmount);

    worker.wallet.dues = remainingDues;
    if (worker.wallet.isBlocked && remainingDues <= (worker.wallet.cashLimit || 10000)) {
      worker.wallet.isBlocked = false;
      worker.wallet.blockedAt = null;
      worker.wallet.blockReason = null;
    }
    await worker.save();

    const settlement = await Settlement.create({
      vendorId,
      amount: appliedAmount,
      balanceBefore: currentDues,
      balanceAfter: remainingDues,
      status: 'completed',
      paymentMethod: 'razorpay',
      paymentReference: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      vendorNotes: notes || null,
      verifiedAt: new Date(),
      processedAt: new Date(),
      adminNotes: 'Automatically verified via Razorpay'
    });

    await Transaction.create({
      vendorId,
      type: 'settlement',
      amount: appliedAmount,
      status: 'completed',
      paymentMethod: 'razorpay',
      description: `Settlement of Rs.${appliedAmount} received from ${worker.businessName || worker.name}`,
      referenceId: razorpay_payment_id,
      metadata: {
        source: 'vendor_settlement_razorpay',
        razorpayOrderId: razorpay_order_id,
        balanceBefore: currentDues,
        balanceAfter: remainingDues
      }
    });

    recordSettlement(new Date(), appliedAmount);
    await notifyAdminsAboutCompletedSettlement(worker, settlement);

    res.status(200).json({
      success: true,
      message: 'Settlement completed successfully',
      data: {
        settlement,
        newDues: remainingDues
      }
    });
  } catch (error) {
    console.error('Verify settlement payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify settlement payment',
      error: error.message
    });
  }
};

/**
 * Request Withdrawal (Worker requests payout of earnings)
 */
const requestWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { amount, bankDetails, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    const worker = await Worker.findById(vendorId);
    if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

    const currentEarnings = worker.wallet?.earnings || 0;

    // Check pending withdrawals?
    const pendingWithdrawals = await Withdrawal.aggregate([
      { $match: { vendorId: worker._id, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingAmount = pendingWithdrawals[0]?.total || 0;
    const availableEarnings = currentEarnings - pendingAmount;

    if (amount > availableEarnings) {
      return res.status(400).json({
        success: false,
        message: `Insufficient earnings. Available: ₹${availableEarnings} (Pending: ₹${pendingAmount})`
      });
    }

    const withdrawal = await Withdrawal.create({
      vendorId,
      amount,
      bankDetails,
      adminNotes: notes,
      status: 'pending'
    });

    // 🔔 NOTIFY ALL ADMINS about withdrawal request
    try {
      const { createNotification } = require('../notificationControllers/notificationController');
      const Admin = require('../../models/Admin');

      const admins = await Admin.find({ isActive: true }).select('_id');

      for (const admin of admins) {
        await createNotification({
          adminId: admin._id,
          type: 'vendor_withdrawal_request',
          title: '💸 Withdrawal Request',
          message: `${worker.businessName || worker.name} requested withdrawal of ₹${amount}`,
          relatedId: withdrawal._id,
          relatedType: 'withdrawal',
          data: {
            vendorId: worker._id,
            workerName: worker.businessName || worker.name,
            amount,
            withdrawalId: withdrawal._id
          },
          pushData: {
            type: 'admin_alert',
            link: '/admin/settlements'
          }
        });
      }
      console.log(`[Withdrawal] Notified ${admins.length} admins about withdrawal request from ${worker.name}`);
    } catch (notifyErr) {
      console.error('[Withdrawal] Failed to notify admins:', notifyErr);
    }

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: withdrawal
    });

  } catch (error) {
    console.error('Request withdrawal error:', error);
    res.status(500).json({ success: false, message: 'Failed to request withdrawal' });
  }
};

/**
 * Get worker's settlement history
 */
const getSettlements = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;

    const query = { vendorId };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const settlements = await Settlement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Settlement.countDocuments(query);

    res.status(200).json({
      success: true,
      data: settlements,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get settlements error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements'
    });
  }
};

/**
 * Get wallet summary for dashboard
 */
const getWalletSummary = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const worker = await Worker.findById(vendorId).select('wallet');

    if (!worker) {
      return res.status(404).json({
        success: false,
        message: 'Worker not found'
      });
    }

    const balance = worker.wallet?.balance || 0;

    // Get today's cash collections
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCollections = await Transaction.aggregate([
      {
        $match: {
          vendorId: worker._id,
          type: 'cash_collected',
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get this week's collections
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekCollections = await Transaction.aggregate([
      {
        $match: {
          vendorId: worker._id,
          type: 'cash_collected',
          createdAt: { $gte: weekStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        dues: worker.wallet?.dues || 0,
        earnings: worker.wallet?.earnings || 0,
        amountDue: worker.wallet?.dues || 0,
        today: {
          amount: todayCollections[0]?.total || 0,
          count: todayCollections[0]?.count || 0
        },
        thisWeek: {
          amount: weekCollections[0]?.total || 0,
          count: weekCollections[0]?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('Get wallet summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet summary'
    });
  }
};

/**
 * Get worker's withdrawal history
 */
const getWithdrawals = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;

    const query = { vendorId };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const withdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Withdrawal.countDocuments(query);

    res.status(200).json({
      success: true,
      data: withdrawals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch withdrawals'
    });
  }
};

module.exports = {
  getWallet,
  getTransactions,
  recordCashCollection,
  requestSettlement,
  createSettlementOrder,
  verifySettlementPayment,
  getSettlements,
  getWalletSummary,
  requestWithdrawal,
  getWithdrawals
};
