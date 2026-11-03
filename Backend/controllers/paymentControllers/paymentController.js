const Booking = require('../../models/Booking');
const User = require('../../models/User');
const Settings = require('../../models/Settings');
const { validationResult } = require('express-validator');
const { PAYMENT_STATUS, BOOKING_STATUS, ADMIN_ROLES } = require('../../utils/constants');
const { createOrder, verifyPayment, refundPayment } = require('../../services/razorpayService');
const { createNotification } = require('../notificationControllers/notificationController');
const { recordBookingEarning } = require('../../services/earningTrackerService');
const { getBookingConfig, PASSTHROUGH_DEFAULTS } = require('../../utils/bookingConfig');
const mongoose = require('mongoose');

// Falls back to the admin-configured default commission rate when a
// booking has no WorkerBill yet, instead of a hardcoded 20/80 split.
const getDefaultWorkerShare = async () => {
  const config = await getBookingConfig();
  return (config.servicePayoutPercentage ?? PASSTHROUGH_DEFAULTS.servicePayoutPercentage) / 100;
};

const getFinalPaymentAmount = (booking) => {
  const advancePaid = booking.advancePayment?.status === 'paid'
    ? Number(booking.advancePayment?.paidAmount || booking.advancePayment?.requestedAmount || 0)
    : 0;
  if (booking.userPayableAmount != null && Number.isFinite(Number(booking.userPayableAmount))) {
    return Math.max(0, Number(booking.userPayableAmount));
  }
  const total = Number(booking.finalAmount ?? 0);
  return Number.isFinite(total) ? Math.max(0, total - advancePaid) : 0;
};

const getAdvancePaymentAmount = (booking) => {
  const amount = Number(booking.advancePayment?.requestedAmount ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

/**
 * Create Razorpay order for booking payment
 */
const createPaymentOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { bookingId } = req.body;
    const paymentType = req.body.paymentType === 'advance' ? 'advance' : 'final';

    // Get booking
    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (paymentType === 'advance') {
      if (booking.advancePayment?.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance payment already completed for this booking'
        });
      }

      if (booking.advancePayment?.status !== 'requested') {
        return res.status(400).json({
          success: false,
          message: 'No active advance payment request found for this booking'
        });
      }
    } else if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    // After the work is done the customer can only pay once the worker has sent the finished bill
    if (paymentType === 'final' && booking.status === BOOKING_STATUS.WORK_DONE && !booking.billFinalizedAt) {
      return res.status(409).json({
        success: false,
        message: 'The professional is still preparing your bill. Please wait until it is sent to you.'
      });
    }

    const payableAmount = paymentType === 'advance'
      ? getAdvancePaymentAmount(booking)
      : getFinalPaymentAmount(booking);

    if (payableAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: paymentType === 'advance' ? 'Advance payment amount is invalid' : 'No final payment is due for this booking'
      });
    }

    // Create Razorpay order
    console.log(`Creating Razorpay ${paymentType} order with amount:`, payableAmount);
    const orderResult = await createOrder(
      payableAmount,
      'INR',
      paymentType === 'advance' ? `${booking.bookingNumber}_ADVANCE` : booking.bookingNumber,
      {
        bookingId: booking._id.toString(),
        userId: userId.toString(),
        bookingNumber: booking.bookingNumber,
        paymentType
      }
    );

    console.log('Razorpay order result:', orderResult);

    if (!orderResult.success) {
      console.error('Razorpay order creation failed:', orderResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: orderResult.error || 'Unknown error'
      });
    }

    // Update booking with Razorpay order ID
    if (paymentType === 'advance') {
      booking.advancePayment.razorpayOrderId = orderResult.orderId;
    } else {
      booking.razorpayOrderId = orderResult.orderId;
      booking.paymentOrderCreatedAt = new Date();
    }
    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: orderResult.orderId,
        amount: orderResult.amount / 100, // Convert back to rupees
        currency: orderResult.currency,
        key: process.env.RAZORPAY_KEY_ID,
        bookingId: booking._id,
        paymentType
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order. Please try again.',
      error: error.message
    });
  }
};

/**
 * Verify payment (webhook handler)
 */
const verifyPaymentWebhook = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId: reqBookingId,
      paymentType: reqPaymentType
    } = req.body;

    // Verify signature
    const isValid = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Find booking by Razorpay order ID
    let booking = await Booking.findOne({
      $or: [
        { razorpayOrderId: razorpay_order_id },
        { 'advancePayment.razorpayOrderId': razorpay_order_id }
      ]
    });

    // A newer order can overwrite the booking's stored order id while an earlier one is
    // still being paid. The signature already proves this payment is genuine, so fall
    // back to the booking the (authenticated) user says it belongs to.
    if (!booking && reqBookingId && mongoose.Types.ObjectId.isValid(reqBookingId)) {
      booking = await Booking.findOne({ _id: reqBookingId, userId: req.user.id });
      if (booking) {
        if (reqPaymentType === 'advance') booking.advancePayment.razorpayOrderId = razorpay_order_id;
        else booking.razorpayOrderId = razorpay_order_id;
      }
    }

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const isAdvancePayment = booking.advancePayment?.razorpayOrderId === razorpay_order_id;
    const Transaction = require('../../models/Transaction');
    const Worker = require('../../models/Worker');
    const WorkerBill = require('../../models/WorkerBill');

    // Idempotency: prevent double crediting or duplicate transaction generation on retries
    if (isAdvancePayment && booking.advancePayment?.status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Advance payment already verified successfully'
      });
    }

    if (!isAdvancePayment && [PAYMENT_STATUS.SUCCESS, 'paid'].includes(booking.paymentStatus)) {
      return res.status(200).json({
        success: true,
        message: 'Payment already completed for this booking'
      });
    }

    if (isAdvancePayment) {
      const advanceAmount = getAdvancePaymentAmount(booking);
      booking.advancePayment.status = 'paid';
      booking.advancePayment.paidAmount = advanceAmount;
      booking.advancePayment.paidAt = new Date();
      booking.advancePayment.paymentMethod = 'online';
      booking.advancePayment.paymentId = razorpay_payment_id;
      booking.advancePayment.razorpayPaymentId = razorpay_payment_id;

      // Booking update + transaction log must succeed or fail together —
      // otherwise a crash between the two leaves a booking marked "paid"
      // with no payment record, or vice versa.
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await booking.save({ session });
          await Transaction.create([{
            userId: booking.userId,
            bookingId: booking._id,
            amount: advanceAmount,
            type: 'advance_payment',
            paymentMethod: 'razorpay',
            status: 'completed',
            description: `Advance payment for booking ${booking.bookingNumber}`,
            referenceId: razorpay_payment_id
          }], { session });
        });
      } finally {
        await session.endSession();
      }

      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          advancePayment: booking.advancePayment
        });
        if (booking.vendorId) {
          io.to(`vendor_${booking.vendorId}`).emit('booking_updated', {
            bookingId: booking._id,
            advancePayment: booking.advancePayment
          });
        }
      }

      await createNotification({
        userId: booking.userId,
        type: 'payment_success',
        title: 'Advance Payment Successful',
        message: `Advance payment of ₹${advanceAmount} for booking ${booking.bookingNumber} was successful.`,
        relatedId: booking._id,
        relatedType: 'payment',
        priority: 'high'
      });

      if (booking.vendorId) {
        await createNotification({
          vendorId: booking.vendorId,
          type: 'payment_success',
          title: 'Advance Payment Received',
          message: `Customer paid the advance amount for booking ${booking.bookingNumber}.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Advance payment verified successfully'
      });
    }

    const finalPaymentAmount = getFinalPaymentAmount(booking);

    // Update booking payment status
    booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
    booking.paymentMethod = 'online';
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.paymentId = razorpay_payment_id;

    // Update booking status based on current state
    if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
      if (booking.vendorId) {
        booking.status = BOOKING_STATUS.CONFIRMED;
      } else {
        // Upfront payment before worker assignment keeps booking searching for a worker
        booking.status = BOOKING_STATUS.SEARCHING;
      }
    } else if (booking.status === BOOKING_STATUS.WORK_DONE) {
      booking.status = BOOKING_STATUS.COMPLETED;
      booking.completedAt = new Date();
    }

    // Fetch WorkerBill for earnings (only if bill exists = post-completion payment)
    const bill = await WorkerBill.findOne({ bookingId: booking._id });
    let vendorEarning = 0;

    // Booking status, the user's payment record, the bill, and the worker's
    // wallet credit all represent one financial event — wrapped in a
    // transaction so a mid-flight crash can't leave the booking "paid" while
    // the worker's wallet was never credited (or credited twice on retry).
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await booking.save({ session });

        // User payment transaction
        await Transaction.create([{
          userId: booking.userId,
          bookingId: booking._id,
          amount: finalPaymentAmount,
          type: 'payment',
          paymentMethod: 'razorpay',
          status: 'completed',
          description: `Final payment for booking ${booking.bookingNumber}`,
          referenceId: razorpay_payment_id
        }], { session });

        // Clear carried-over penalty from user account now that booking is legitimately paid
        if (booking.penalty > 0) {
          await User.findByIdAndUpdate(booking.userId, { $set: { 'wallet.penalty': 0 } }, { session });
        }

        if (bill && booking.vendorId) {
          vendorEarning = bill.vendorTotalEarning;

          // Mark bill as paid
          bill.status = 'paid';
          bill.paidAt = new Date();
          await bill.save({ session });

          // Online payment: only earnings increase, NO dues (platform holds the money)
          await Worker.findByIdAndUpdate(
            booking.vendorId,
            {
              $inc: { 'wallet.earnings': vendorEarning },
              ...(booking.status === BOOKING_STATUS.COMPLETED ? { $set: { availability: 'AVAILABLE' } } : {})
            },
            { session }
          );

          // Earnings credit transaction
          if (vendorEarning > 0) {
            await Transaction.create([{
              vendorId: booking.vendorId,
              bookingId: booking._id,
              amount: vendorEarning,
              type: 'earnings_credit',
              paymentMethod: 'system',
              status: 'completed',
              description: `Earnings ₹${vendorEarning} credited for booking ${booking.bookingNumber} (online payment)`,
              metadata: {
                type: 'earnings_increase',
                billId: bill._id.toString(),
                serviceEarning: bill.vendorServiceEarning,
                partsEarning: bill.vendorPartsEarning
              }
            }], { session });
          }
        }
      });
    } finally {
      await session.endSession();
    }

    if (bill && booking.vendorId) {
      console.log(`[Payment] Credited ₹${vendorEarning} to worker ${booking.vendorId}`);
    }

    // Record stats in the Daily Earning Tracker (Async)
    const defaultWorkerShare = bill ? null : await getDefaultWorkerShare();
    recordBookingEarning({
      date: new Date(),
      totalRevenue: Number(bill ? bill.grandTotal : booking.finalAmount) || 0,
      platformCommission: Number(bill ? bill.companyRevenue : (booking.finalAmount * (1 - defaultWorkerShare))) || 0,
      vendorEarnings: Number(bill ? bill.vendorTotalEarning : (booking.finalAmount * defaultWorkerShare)) || 0,
      totalGST: Number(bill ? bill.totalGST : 0) || 0,
      totalTDS: 0 // Tracked in withdrawals
    }).catch(err => console.error('[Payment] Daily tracker failed:', err));

    // Live update for both apps: the worker's Booking Details page listens for
    // `booking_updated` / `payment_success` and refreshes itself on these.
    const io = req.app.get('io');
    if (io) {
      const livePayload = {
        bookingId: booking._id.toString(),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        finalAmount: booking.finalAmount,
        userPayableAmount: booking.userPayableAmount,
        type: 'payment_success'
      };
      io.to(`user_${booking.userId}`).emit('booking_updated', livePayload);
      if (booking.vendorId) {
        io.to(`vendor_${booking.vendorId}`).emit('booking_updated', livePayload);
        io.to(`vendor_${booking.vendorId}`).emit('payment_success', livePayload);
      }
    }

    // Send notification to user
    await createNotification({
      userId: booking.userId,
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Payment of ₹${booking.finalAmount} for booking ${booking.bookingNumber} was successful. Thank you!`,
      relatedId: booking._id,
      relatedType: 'payment',
      priority: 'high'
    });

    // Notify worker
    let workerTitle = 'Booking Confirmed';
    let workerMsg = `Payment received for booking ${booking.bookingNumber}. The service is now confirmed.`;

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      workerTitle = 'Payment Received (Online)';
      workerMsg = `User paid ₹${booking.finalAmount} online for booking ${booking.bookingNumber}. Job Completed!`;
    }

    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'payment_success',
        title: workerTitle,
        message: workerMsg,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });
    }


    res.status(200).json({
      success: true,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment'
    });
  }
};

/**
 * Process wallet payment
 */
const processWalletPayment = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user.id;
    const { bookingId } = req.body;
    const paymentType = req.body.paymentType === 'advance' ? 'advance' : 'final';

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get booking
    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (paymentType === 'advance') {
      if (booking.advancePayment?.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Advance payment already completed for this booking'
        });
      }

      if (booking.advancePayment?.status !== 'requested') {
        return res.status(400).json({
          success: false,
          message: 'No active advance payment request found for this booking'
        });
      }
    } else if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    // After the work is done the customer can only pay once the worker has sent the finished bill
    if (paymentType === 'final' && booking.status === BOOKING_STATUS.WORK_DONE && !booking.billFinalizedAt) {
      return res.status(409).json({
        success: false,
        message: 'The professional is still preparing your bill. Please wait until it is sent to you.'
      });
    }

    const payableAmount = paymentType === 'advance'
      ? getAdvancePaymentAmount(booking)
      : getFinalPaymentAmount(booking);

    if (payableAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: paymentType === 'advance' ? 'Advance payment amount is invalid' : 'No final payment is due for this booking'
      });
    }

    // Check wallet balance taking into account balance, promoBalance, cashbackBalance and penalty
    const currentBalance = Number(user.wallet?.balance || 0);
    const currentPromo = Number(user.wallet?.promoBalance || 0);
    const currentCashback = Number(user.wallet?.cashbackBalance || 0);
    const currentPenalty = Number(user.wallet?.penalty || 0);
    const totalAvailable = Math.max(0, currentBalance + currentPromo + currentCashback - currentPenalty);

    if (totalAvailable < payableAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Total available: ₹${totalAvailable.toFixed(2)}, required: ₹${payableAmount.toFixed(2)}`
      });
    }

    // Deduction order: 1) Promo, 2) Cashback, 3) Real Balance
    let remainingToDeduct = payableAmount;
    const promoDeduct = Math.min(currentPromo, remainingToDeduct);
    remainingToDeduct -= promoDeduct;

    const cashbackDeduct = Math.min(currentCashback, remainingToDeduct);
    remainingToDeduct -= cashbackDeduct;

    const balanceDeduct = remainingToDeduct;

    if (currentBalance < balanceDeduct) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient real wallet balance'
      });
    }

    const Transaction = require('../../models/Transaction');
    const Worker = require('../../models/Worker');
    const WorkerBill = require('../../models/WorkerBill');
    const bill = await WorkerBill.findOne({ bookingId: booking._id });
    let vendorEarning = 0;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Deduct from user wallet atomically across sub-wallets
        const debitedUser = await User.findOneAndUpdate(
          {
            _id: userId,
            'wallet.balance': { $gte: balanceDeduct },
            'wallet.promoBalance': { $gte: promoDeduct },
            'wallet.cashbackBalance': { $gte: cashbackDeduct }
          },
          {
            $inc: {
              'wallet.balance': -balanceDeduct,
              'wallet.promoBalance': -promoDeduct,
              'wallet.cashbackBalance': -cashbackDeduct
            }
          },
          { new: true, session }
        );

        if (!debitedUser) {
          throw new Error('Insufficient wallet balance or concurrent wallet deduction');
        }
        user.wallet = debitedUser.wallet;

        // Freshly query the booking in this session to prevent VersionError race conditions with background dispatch
        const currentBooking = await Booking.findById(booking._id).session(session);
        if (!currentBooking) {
          throw new Error('Booking not found during transaction');
        }

        if (paymentType === 'advance') {
          currentBooking.advancePayment.status = 'paid';
          currentBooking.advancePayment.paidAmount = payableAmount;
          currentBooking.advancePayment.paidAt = new Date();
          currentBooking.advancePayment.paymentMethod = 'wallet';
          currentBooking.advancePayment.paymentId = `ADV_WALLET_${Date.now()}`;

          await currentBooking.save({ session });

          await Transaction.create([{
            userId,
            bookingId: currentBooking._id,
            amount: payableAmount,
            type: 'advance_payment',
            paymentMethod: 'wallet',
            status: 'completed',
            description: `Advance wallet payment for booking ${currentBooking.bookingNumber}`,
            balanceAfter: user.wallet.balance
          }], { session });

        } else {
          // Final payment
          currentBooking.paymentStatus = PAYMENT_STATUS.SUCCESS;
          currentBooking.paymentMethod = 'wallet';
          currentBooking.paymentId = `WALLET_${Date.now()}`;

          if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(currentBooking.status)) {
            if (currentBooking.vendorId) {
              currentBooking.status = BOOKING_STATUS.CONFIRMED;
            } else {
              currentBooking.status = BOOKING_STATUS.SEARCHING;
            }
          } else if (currentBooking.status === BOOKING_STATUS.WORK_DONE) {
            currentBooking.status = BOOKING_STATUS.COMPLETED;
            currentBooking.completedAt = new Date();
          }

          // Clear user penalty now that booking is confirmed/completed
          if (currentBooking.penalty > 0) {
            await User.findByIdAndUpdate(userId, { $set: { 'wallet.penalty': 0 } }, { session });
          }

          await currentBooking.save({ session });

          // Record User Payment Transaction
          await Transaction.create([{
            userId,
            bookingId: currentBooking._id,
            amount: payableAmount,
            type: 'debit',
            paymentMethod: 'wallet',
            status: 'completed',
            description: `Final wallet payment for booking ${currentBooking.bookingNumber}`,
            balanceAfter: user.wallet.balance
          }], { session });

          // Credit worker earnings if bill exists
          if (bill && currentBooking.vendorId) {
            vendorEarning = bill.vendorTotalEarning;
            bill.status = 'paid';
            bill.paidAt = new Date();
            await bill.save({ session });

            await Worker.findByIdAndUpdate(
              currentBooking.vendorId,
              {
                $inc: { 'wallet.earnings': vendorEarning },
                ...(currentBooking.status === BOOKING_STATUS.COMPLETED ? { $set: { availability: 'AVAILABLE' } } : {})
              },
              { session }
            );

            if (vendorEarning > 0) {
              await Transaction.create([{
                vendorId: currentBooking.vendorId,
                bookingId: currentBooking._id,
                amount: vendorEarning,
                type: 'earnings_credit',
                paymentMethod: 'system',
                status: 'completed',
                description: `Earnings ₹${vendorEarning} credited for booking ${currentBooking.bookingNumber} (wallet payment)`,
                metadata: {
                  type: 'earnings_increase',
                  billId: bill._id.toString(),
                  serviceEarning: bill.vendorServiceEarning,
                  partsEarning: bill.vendorPartsEarning
                }
              }], { session });
            }
          }
        }
        Object.assign(booking, currentBooking.toObject());
      });
    } finally {
      await session.endSession();
    }

    if (paymentType === 'advance') {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${booking.userId}`).emit('booking_updated', {
          bookingId: booking._id,
          advancePayment: booking.advancePayment
        });
        if (booking.vendorId) {
          io.to(`vendor_${booking.vendorId}`).emit('booking_updated', {
            bookingId: booking._id,
            advancePayment: booking.advancePayment
          });
        }
      }

      await createNotification({
        userId,
        type: 'payment_success',
        title: 'Advance Payment Successful',
        message: `Advance payment of ₹${payableAmount} for booking ${booking.bookingNumber} was successful.`,
        relatedId: booking._id,
        relatedType: 'payment',
        priority: 'high'
      });

      if (booking.vendorId) {
        await createNotification({
          vendorId: booking.vendorId,
          type: 'payment_success',
          title: 'Advance Payment Received',
          message: `Customer paid the advance amount for booking ${booking.bookingNumber}.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Advance payment processed successfully',
        data: {
          bookingId: booking._id,
          amount: payableAmount,
          remainingBalance: user.wallet.balance
        }
      });
    }

    if (bill && booking.vendorId) {
      console.log(`[Wallet Payment] Credited ₹${vendorEarning} to worker ${booking.vendorId}`);
    }

    // Record stats in the Daily Earning Tracker (Async)
    const defaultWorkerShareWallet = bill ? null : await getDefaultWorkerShare();
    recordBookingEarning({
      date: new Date(),
      totalRevenue: Number(bill ? bill.grandTotal : booking.finalAmount) || 0,
      platformCommission: Number(bill ? bill.companyRevenue : (booking.finalAmount * (1 - defaultWorkerShareWallet))) || 0,
      vendorEarnings: Number(bill ? bill.vendorTotalEarning : (booking.finalAmount * defaultWorkerShareWallet)) || 0,
      totalGST: Number(bill ? bill.totalGST : 0) || 0,
      totalTDS: 0 // Tracked in withdrawals
    }).catch(err => console.error('[Wallet Payment] Daily tracker failed:', err));

    // Send notification to user
    await createNotification({
      userId,
      type: 'payment_success',
      title: 'Payment Successful',
      message: `Payment of ₹${booking.finalAmount} for booking ${booking.bookingNumber} was successful.`,
      relatedId: booking._id,
      relatedType: 'payment',
      priority: 'high'
    });

    // Notify worker
    let workerTitle = 'Booking Confirmed';
    let workerMsg = `Payment received for booking ${booking.bookingNumber}. The service is now confirmed.`;

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      workerTitle = 'Payment Received (Wallet)';
      workerMsg = `User paid ₹${booking.finalAmount} via wallet for booking ${booking.bookingNumber}. Job Completed!`;
    }

    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'payment_success',
        title: workerTitle,
        message: workerMsg,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high'
      });
    }


    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        bookingId: booking._id,
        amount: payableAmount,
        remainingBalance: user.wallet.balance
      }
    });
  } catch (error) {
    console.error('Process wallet payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process payment. Please try again.'
    });
  }
};

/**
 * Process refund
 */
const processRefund = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { bookingId } = req.body;
    const { amount } = req.body; // Optional: partial refund

    // Get booking
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const callerId = String(req.user?._id || req.user?.id);
    const isAdmin = ['admin', 'ADMIN', ...Object.values(ADMIN_ROLES || {})].includes(req.userRole);

    if (!isAdmin) {
      if (String(booking.userId) !== callerId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to refund this booking'
        });
      }
      if (booking.status !== BOOKING_STATUS.CANCELLED) {
        return res.status(400).json({
          success: false,
          message: 'Refund can only be requested for cancelled bookings'
        });
      }
    }

    // Check if payment was successful or advance was paid
    const isPaymentSuccess = booking.paymentStatus === PAYMENT_STATUS.SUCCESS;
    const isAdvancePaid = booking.advancePayment?.status === 'paid';
    if (!isPaymentSuccess && !isAdvancePaid) {
      return res.status(400).json({
        success: false,
        message: 'No completed payment found for this booking'
      });
    }

    const totalPaid = isPaymentSuccess
      ? Number(booking.finalAmount || 0)
      : Number(booking.advancePayment?.paidAmount || booking.advancePayment?.requestedAmount || 0);
    const alreadyRefunded = Number(booking.refundedAmount || 0);
    const maxRefundable = Math.max(0, totalPaid - alreadyRefunded);

    if (maxRefundable <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This booking has already been fully refunded'
      });
    }

    const requestedAmount = (amount !== undefined && amount !== null && amount !== '') ? Number(amount) : maxRefundable;
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Refund amount must be greater than zero'
      });
    }

    if (requestedAmount > maxRefundable) {
      return res.status(400).json({
        success: false,
        message: `Refund amount cannot exceed remaining refundable amount of ₹${maxRefundable}`
      });
    }

    const refundAmount = requestedAmount;
    const Transaction = require('../../models/Transaction');
    const isOnlineMethod = ['razorpay', 'online', 'Qr online'].includes(booking.paymentMethod);

    if (isOnlineMethod && booking.razorpayPaymentId) {
      // Razorpay refund
      const refundResult = await refundPayment(
        booking.razorpayPaymentId,
        refundAmount,
        {
          bookingId: booking._id.toString(),
          reason: 'Booking cancellation'
        }
      );

      if (!refundResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to process refund',
          error: refundResult.error
        });
      }

      // Record refund transaction
      await Transaction.create({
        userId: booking.userId,
        bookingId: booking._id,
        type: 'refund',
        amount: refundAmount,
        paymentMethod: 'razorpay',
        status: 'completed',
        description: `Refund of ₹${refundAmount} to original payment method for booking #${booking.bookingNumber}`,
        referenceId: refundResult.refund?.id || booking.razorpayPaymentId
      });

      // Update booking payment status
      booking.refundedAmount = alreadyRefunded + refundAmount;
      booking.paymentStatus = (booking.refundedAmount >= totalPaid) ? PAYMENT_STATUS.REFUNDED : 'partially_refunded';
    } else if (booking.paymentMethod === 'wallet' || !booking.razorpayPaymentId) {
      // Wallet refund - add back to user wallet atomically
      const updatedUser = await User.findOneAndUpdate(
        { _id: booking.userId },
        { $inc: { 'wallet.balance': refundAmount } },
        { new: true }
      );

      // Record refund transaction
      await Transaction.create({
        userId: booking.userId,
        bookingId: booking._id,
        type: 'refund',
        amount: refundAmount,
        paymentMethod: 'wallet',
        status: 'completed',
        description: `Wallet refund of ₹${refundAmount} for booking #${booking.bookingNumber}`,
        balanceAfter: updatedUser?.wallet?.balance || 0
      });

      // Update booking payment status
      booking.refundedAmount = alreadyRefunded + refundAmount;
      booking.paymentStatus = (booking.refundedAmount >= totalPaid) ? PAYMENT_STATUS.REFUNDED : 'partially_refunded';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Refund not supported for this payment method'
      });
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        bookingId: booking._id,
        refundAmount,
        remainingRefundable: Math.max(0, totalPaid - booking.refundedAmount)
      }
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund. Please try again.'
    });
  }
};

/**
 * Get payment history
 */
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings with successful payments
    const bookings = await Booking.find({
      userId,
      paymentStatus: PAYMENT_STATUS.SUCCESS
    })
      .populate('serviceId', 'title iconUrl')
      .populate('vendorId', 'name businessName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Booking.countDocuments({
      userId,
      paymentStatus: PAYMENT_STATUS.SUCCESS
    });

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
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history. Please try again.'
    });
  }
};

/**
 * Confirm Pay at Home option
 */
const confirmPayAtHome = async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, userId });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.paymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        success: false,
        message: 'Payment already completed for this booking'
      });
    }

    if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot switch payment method when booking is in ${booking.status} status`
      });
    }

    // Update booking payment method
    booking.paymentMethod = 'pay_at_home';
    booking.paymentStatus = PAYMENT_STATUS.PENDING;

    // Only set to CONFIRMED if booking is in initial search/requested phase and worker has accepted;
    // Otherwise keep current status (SEARCHING if no worker, or WORK_DONE / AWAITING_PAYMENT if work is completed)
    if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.REQUESTED].includes(booking.status)) {
      booking.status = booking.vendorId ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.SEARCHING;
    }

    await booking.save();

    // Notify Worker that booking is confirmed
    if (booking.vendorId) {
      await createNotification({
        vendorId: booking.vendorId,
        type: 'booking_confirmed',
        title: 'Booking Confirmed (Pay at Home)',
        message: `Booking ${booking.bookingNumber} has been confirmed. Payment method: Pay at Home.`,
        relatedId: booking._id,
        relatedType: 'booking'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Booking confirmed with Pay at Home option',
      data: booking
    });
  } catch (error) {
    console.error('Confirm Pay at Home error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm booking. Please try again.'
    });
  }
};

/**
 * Handle server-to-server Razorpay webhooks
 */
const handleRazorpayWebhook = async (req, res) => {
  try {
    const crypto = require('crypto');
    const webhookSignature = req.headers['x-razorpay-signature'];
    const settings = await Settings.findOne({ type: 'global' });
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || settings?.razorpayWebhookSecret;

    if (!webhookSecret) {
      console.warn('[Razorpay Webhook] Webhook secret not configured');
      return res.status(200).json({ received: true });
    }

    // Verify signature using rawBody buffer when available for strict byte-accuracy
    const payload = req.rawBody ? req.rawBody.toString('utf8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    const sigOk = typeof webhookSignature === 'string'
      && webhookSignature.length === expectedSignature.length
      && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(webhookSignature));
    if (!sigOk) {
      console.error('[Razorpay Webhook] Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventType = event.event;
    console.log(`[Razorpay Webhook] Received event: ${eventType}`);

    const Transaction = require('../../models/Transaction');

    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      const orderId = payment?.order_id;
      const paymentId = payment?.id;
      const notes = payment?.notes || {};
      const amountInRupees = payment ? (payment.amount / 100) : 0;
      const receipt = payment?.receipt || '';

      // 1. User Wallet Top-up Webhook Handler
      if (notes.type === 'wallet_topup' || receipt.startsWith('WALLET_')) {
        const targetUserId = notes.userId || (receipt ? receipt.split('_')[1] : null);
        if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
          const { creditWalletTopup } = require('../../services/walletTopupService');
          const result = await creditWalletTopup({
            userId: targetUserId,
            paymentId,
            orderId,
            amount: amountInRupees,
            source: 'webhook'
          });
          // A payment already credited by the app (or by the other webhook event) is a no-op
          if (!result.duplicate) {
            const io = req.app.get('io');
            if (io) io.to(`user_${targetUserId}`).emit('wallet_updated', { balance: result.balance });

            await createNotification({
              userId: targetUserId,
              type: 'payment_success',
              title: 'Wallet Top-up Successful',
              message: `₹${amountInRupees} credited to your Help-U wallet via Razorpay.`,
              relatedType: 'wallet'
            });
            console.log(`[Razorpay Webhook] Credited ₹${amountInRupees} to user wallet ${targetUserId}`);
          }
        }
        return res.status(200).json({ received: true });
      }

      // 2. Worker Settlement Dues Payment Webhook Handler
      if (notes.purpose === 'vendor_settlement' || notes.type === 'settlement' || receipt.startsWith('SETTLE_')) {
        const vendorId = notes.vendorId || notes.workerId || (receipt ? receipt.split('_')[1] : null);
        if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
          const Settlement = require('../../models/Settlement');
          const existingSettlement = await Settlement.findOne({ razorpayPaymentId: paymentId });
          if (!existingSettlement) {
            const Worker = require('../../models/Worker');
            const worker = await Worker.findById(vendorId).select('name businessName email wallet');
            if (worker) {
              const currentDues = Number(worker.wallet?.dues || 0);
              const appliedAmount = Math.min(amountInRupees, currentDues);
              const remainingDues = Math.max(0, currentDues - appliedAmount);

              worker.wallet.dues = remainingDues;
              if (worker.wallet.isBlocked && remainingDues <= (worker.wallet.cashLimit ?? 10000)) {
                worker.wallet.isBlocked = false;
                worker.wallet.blockedAt = null;
                worker.wallet.blockReason = null;
              }
              await worker.save();

              await Settlement.create({
                vendorId,
                amount: appliedAmount,
                balanceBefore: currentDues,
                balanceAfter: remainingDues,
                status: 'completed',
                paymentMethod: 'razorpay',
                paymentReference: paymentId,
                razorpayOrderId: orderId,
                razorpayPaymentId: paymentId,
                verifiedAt: new Date(),
                processedAt: new Date(),
                adminNotes: 'Automatically verified via Razorpay Webhook'
              });

              await Transaction.create({
                vendorId,
                type: 'settlement',
                amount: appliedAmount,
                status: 'completed',
                paymentMethod: 'razorpay',
                description: `Settlement of ₹${appliedAmount} received via Webhook`,
                referenceId: paymentId,
                metadata: {
                  source: 'vendor_settlement_webhook',
                  razorpayOrderId: orderId,
                  balanceBefore: currentDues,
                  balanceAfter: remainingDues
                }
              });

              try {
                const { recordSettlement } = require('../../services/earningTrackerService');
                recordSettlement(new Date(), appliedAmount);
              } catch (tErr) {
                console.warn('[Razorpay Webhook] Settlement tracker error:', tErr.message);
              }

              console.log(`[Razorpay Webhook] Settlement of ₹${appliedAmount} processed for worker ${vendorId}`);
            }
          }
        }
        return res.status(200).json({ received: true });
      }

      // 3. Subscription plans no longer exist. Acknowledge a late webhook for an old plan order so it is
      // not mistaken for a booking payment; the payment itself must be refunded by hand.
      if (notes.type === 'plan' || receipt.startsWith('PLAN_')) {
        console.warn(`[Razorpay Webhook] Payment ${paymentId} was for a removed subscription plan. Refund it manually.`);
        return res.status(200).json({ received: true });
      }

      // 4. Booking Payment Webhook Handler (Advance or Final)
      if (orderId || notes.bookingId) {
        const booking = await Booking.findOne({
          $or: [
            ...(orderId ? [{ razorpayOrderId: orderId }, { 'advancePayment.razorpayOrderId': orderId }] : []),
            ...(notes.bookingId && mongoose.Types.ObjectId.isValid(notes.bookingId) ? [{ _id: notes.bookingId }] : [])
          ]
        });

        if (booking) {
          const isAdvance = booking.advancePayment?.razorpayOrderId === orderId || notes.paymentType === 'advance';

          if (isAdvance) {
            if (booking.advancePayment?.status !== 'paid') {
              booking.advancePayment.status = 'paid';
              booking.advancePayment.paidAmount = amountInRupees;
              booking.advancePayment.paidAt = new Date();
              booking.advancePayment.paymentMethod = 'online';
              booking.advancePayment.paymentId = paymentId;
              booking.advancePayment.razorpayPaymentId = paymentId;
              await booking.save();

              await Transaction.create({
                userId: booking.userId,
                bookingId: booking._id,
                amount: amountInRupees,
                type: 'advance_payment',
                paymentMethod: 'razorpay',
                status: 'completed',
                description: `Advance payment captured for booking ${booking.bookingNumber} (Webhook)`,
                referenceId: paymentId
              });

              const io = req.app.get('io');
              if (io) {
                io.to(`user_${booking.userId}`).emit('booking_updated', { bookingId: booking._id, advancePayment: booking.advancePayment });
                if (booking.vendorId) io.to(`vendor_${booking.vendorId}`).emit('booking_updated', { bookingId: booking._id, advancePayment: booking.advancePayment });
              }

              await createNotification({
                userId: booking.userId,
                type: 'payment_success',
                title: 'Advance Payment Successful',
                message: `Advance payment of ₹${amountInRupees} for booking ${booking.bookingNumber} was captured.`,
                relatedId: booking._id,
                relatedType: 'payment',
                priority: 'high'
              });
            }
          } else {
            // Final payment
            if (booking.paymentStatus !== PAYMENT_STATUS.SUCCESS) {
              booking.paymentStatus = PAYMENT_STATUS.SUCCESS;
              booking.paymentMethod = 'online';
              booking.razorpayPaymentId = paymentId;
              booking.paymentId = paymentId;

              if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.SEARCHING, BOOKING_STATUS.AWAITING_PAYMENT].includes(booking.status)) {
                booking.status = booking.vendorId ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.SEARCHING;
              } else if (booking.status === BOOKING_STATUS.WORK_DONE) {
                booking.status = BOOKING_STATUS.COMPLETED;
                booking.completedAt = new Date();
              }
              await booking.save();

              await Transaction.create({
                userId: booking.userId,
                bookingId: booking._id,
                amount: amountInRupees,
                type: 'payment',
                paymentMethod: 'razorpay',
                status: 'completed',
                description: `Online payment captured for booking ${booking.bookingNumber} (Webhook)`,
                referenceId: paymentId
              });

              // Clear carried-over penalty from user account
              if (booking.penalty > 0) {
                await User.findByIdAndUpdate(booking.userId, { $set: { 'wallet.penalty': 0 } });
              }

              // Settle WorkerBill & credit worker earnings
              const WorkerBill = require('../../models/WorkerBill');
              const Worker = require('../../models/Worker');
              const bill = await WorkerBill.findOne({ bookingId: booking._id });
              if (bill && booking.vendorId) {
                const vendorEarning = bill.vendorTotalEarning || bill.vendorEarning || 0;
                if (bill.status !== 'paid' && vendorEarning > 0) {
                  await Worker.findByIdAndUpdate(booking.vendorId, { $inc: { 'wallet.earnings': vendorEarning } });
                  bill.status = 'paid';
                  bill.paidAt = new Date();
                  await bill.save();

                  await Transaction.create({
                    vendorId: booking.vendorId,
                    bookingId: booking._id,
                    amount: vendorEarning,
                    type: 'earnings_credit',
                    paymentMethod: 'wallet',
                    status: 'completed',
                    description: `Earnings ₹${vendorEarning} credited for booking ${booking.bookingNumber} (Webhook)`,
                    metadata: {
                      type: 'earnings_increase',
                      billId: bill._id.toString()
                    }
                  });
                  console.log(`[Razorpay Webhook] Credited earnings ₹${vendorEarning} to worker ${booking.vendorId}`);
                }
              }

              // Daily platform earning tracker
              recordBookingEarning({
                date: new Date(),
                totalRevenue: Number(bill ? bill.grandTotal : booking.finalAmount) || amountInRupees,
                platformCommission: Number(bill ? bill.companyRevenue : 0),
                vendorEarnings: Number(bill ? bill.vendorTotalEarning : 0),
                totalGST: Number(bill ? bill.totalGST : 0),
                totalTDS: 0
              }).catch(err => console.error('[Razorpay Webhook] Daily tracker error:', err));

              // Real-time socket broadcast
              const io = req.app.get('io');
              if (io) {
                const livePayload = {
                  bookingId: booking._id.toString(),
                  status: booking.status,
                  paymentStatus: booking.paymentStatus,
                  paymentMethod: booking.paymentMethod,
                  finalAmount: booking.finalAmount,
                  type: 'payment_success'
                };
                io.to(`user_${booking.userId}`).emit('booking_updated', livePayload);
                if (booking.vendorId) {
                  io.to(`vendor_${booking.vendorId}`).emit('booking_updated', livePayload);
                  io.to(`vendor_${booking.vendorId}`).emit('payment_success', livePayload);
                }
              }

              // Notifications
              await createNotification({
                userId: booking.userId,
                type: 'payment_success',
                title: 'Payment Successful',
                message: `Payment of ₹${amountInRupees} for booking ${booking.bookingNumber} was confirmed.`,
                relatedId: booking._id,
                relatedType: 'payment',
                priority: 'high'
              });

              if (booking.vendorId) {
                await createNotification({
                  vendorId: booking.vendorId,
                  type: 'payment_success',
                  title: 'Payment Received (Online)',
                  message: `Payment of ₹${amountInRupees} received for booking ${booking.bookingNumber}.`,
                  relatedId: booking._id,
                  relatedType: 'booking',
                  priority: 'high'
                });
              }
            }
          }
        }
      }
    }

    // 5. Handle Refund Processed Event
    if (eventType === 'refund.processed') {
      const refund = event.payload?.refund?.entity;
      const paymentId = refund?.payment_id;
      const refundId = refund?.id;
      const refundAmount = refund ? (refund.amount / 100) : 0;

      if (paymentId) {
        const booking = await Booking.findOne({
          $or: [
            { razorpayPaymentId: paymentId },
            { paymentId: paymentId },
            { 'advancePayment.razorpayPaymentId': paymentId }
          ]
        });

        if (booking) {
          const alreadyRefunded = Number(booking.refundedAmount || 0);
          booking.refundedAmount = alreadyRefunded + refundAmount;
          const totalPaid = Number(booking.finalAmount || booking.advancePayment?.paidAmount || 0);
          booking.paymentStatus = (booking.refundedAmount >= totalPaid) ? PAYMENT_STATUS.REFUNDED : 'partially_refunded';
          await booking.save();

          const existingTxn = await Transaction.findOne({ referenceId: refundId });
          if (!existingTxn) {
            await Transaction.create({
              userId: booking.userId,
              bookingId: booking._id,
              type: 'refund',
              amount: refundAmount,
              paymentMethod: 'razorpay',
              status: 'completed',
              description: `Refund of ₹${refundAmount} processed by payment gateway (Webhook)`,
              referenceId: refundId || paymentId
            });
          }
          console.log(`[Razorpay Webhook] Refund ₹${refundAmount} recorded for booking ${booking.bookingNumber}`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Razorpay Webhook] Processing error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

module.exports = {
  createPaymentOrder,
  verifyPaymentWebhook,
  processWalletPayment,
  processRefund,
  getPaymentHistory,
  confirmPayAtHome,
  handleRazorpayWebhook
};

