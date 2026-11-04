const User = require('../../models/User');
const Booking = require('../../models/Booking');
const { validationResult } = require('express-validator');
const escapeRegex = require('../../utils/escapeRegex');

/**
 * Get all users with filters and pagination
 */
const getAllUsers = async (req, res) => {
  try {
    const {
      search,
      isActive,
      isPhoneVerified,
      isEmailVerified,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = {};

    if (isActive !== undefined) {
      if (isActive === 'true') {
        query.isActive = true;
      } else if (isActive === 'false') {
        query.isActive = { $ne: true };
      }
    }
    if (isPhoneVerified !== undefined) {
      query.isPhoneVerified = isPhoneVerified === 'true';
    }
    if (isEmailVerified !== undefined) {
      query.isEmailVerified = isEmailVerified === 'true';
    }

    // Search by name, phone, email, or _id
    if (search && String(search).trim()) {
      const trimmedSearch = String(search).trim();
      const safeSearch = escapeRegex(trimmedSearch);
      const searchConditions = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } }
      ];

      const phoneDigits = trimmedSearch.replace(/\D/g, '');
      if (phoneDigits) {
        searchConditions.push({ phone: { $regex: escapeRegex(phoneDigits), $options: 'i' } });
        if (phoneDigits.length >= 12 && phoneDigits.startsWith('91')) {
          searchConditions.push({ phone: { $regex: escapeRegex(phoneDigits.slice(2)), $options: 'i' } });
        } else if (phoneDigits.length >= 11 && phoneDigits.startsWith('0')) {
          searchConditions.push({ phone: { $regex: escapeRegex(phoneDigits.slice(1)), $options: 'i' } });
        } else if (phoneDigits.length > 10) {
          searchConditions.push({ phone: { $regex: escapeRegex(phoneDigits.slice(-10)), $options: 'i' } });
        }
      } else {
        searchConditions.push({ phone: { $regex: safeSearch, $options: 'i' } });
      }

      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(trimmedSearch) && String(new mongoose.Types.ObjectId(trimmedSearch)) === trimmedSearch) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(trimmedSearch) });
      }

      query.$or = searchConditions;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users. Please try again.'
    });
  }
};

/**
 * Get user details
 */
const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user booking stats
    const bookingStats = await Booking.aggregate([
      {
        $match: { userId: user._id }
      },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          completedBookings: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          totalSpent: {
            $sum: {
              $cond: [
                { $eq: ['$paymentStatus', 'success'] },
                '$finalAmount',
                0
              ]
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        user,
        stats: bookingStats[0] || {
          totalBookings: 0,
          completedBookings: 0,
          totalSpent: 0
        }
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details. Please try again.'
    });
  }
};

/**
 * Block/unblock user
 */
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isActive = isActive !== undefined ? isActive : !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'blocked'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status. Please try again.'
    });
  }
};

/**
 * Delete user (soft delete)
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Soft delete
    user.isActive = false;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user. Please try again.'
    });
  }
};

/**
 * View user bookings
 */
const getUserBookings = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { userId: id };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get bookings
    const bookings = await Booking.find(query)
      .select('-workPhotos') // list views never show them; they can be megabytes
      .populate('vendorId', 'name businessName')
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
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user bookings. Please try again.'
    });
  }
};

/**
 * View user wallet transactions
 */
const getUserWalletTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const Transaction = require('../../models/Transaction');

    const user = await User.findById(id).select('wallet');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const transactions = await Transaction.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({
      success: true,
      data: {
        balance: user.wallet?.balance || 0,
        penalty: user.wallet?.penalty || 0,
        promoBalance: user.wallet?.promoBalance || 0,
        cashbackBalance: user.wallet?.cashbackBalance || 0,
        transactions
      }
    });
  } catch (error) {
    console.error('Get user wallet transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet transactions. Please try again.'
    });
  }
};

/**
 * Adjust user wallet (credit / debit cash, promo credits, cashback, or penalty)
 */
const adjustUserWallet = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, action = 'credit', walletType = 'balance', description } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    const validWalletTypes = ['balance', 'promoBalance', 'cashbackBalance', 'penalty'];
    if (!validWalletTypes.includes(walletType)) {
      return res.status(400).json({ success: false, message: 'Invalid wallet type' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.wallet) {
      user.wallet = { balance: 0, penalty: 0, promoBalance: 0, cashbackBalance: 0 };
    }

    const currentVal = user.wallet[walletType] || 0;
    let newVal;
    if (action === 'credit') {
      newVal = currentVal + numAmount;
    } else {
      newVal = Math.max(0, currentVal - numAmount);
    }

    user.wallet[walletType] = newVal;
    await user.save();

    let txnType = 'credit';
    if (action === 'debit') {
      txnType = 'debit';
    } else if (walletType === 'promoBalance') {
      txnType = 'promo_credit';
    } else if (walletType === 'cashbackBalance') {
      txnType = 'cashback';
    } else if (walletType === 'penalty') {
      txnType = 'penalty';
    }

    const Transaction = require('../../models/Transaction');
    await Transaction.create({
      userId: user._id,
      type: txnType,
      amount: numAmount,
      status: 'completed',
      paymentMethod: 'system',
      description: description || `Admin ${action} of ₹${numAmount} (${walletType})`,
      balanceBefore: currentVal,
      balanceAfter: newVal
    });

    res.status(200).json({
      success: true,
      message: `Successfully ${action === 'credit' ? 'credited' : 'debited'} ₹${numAmount}`,
      data: {
        wallet: user.wallet
      }
    });
  } catch (error) {
    console.error('Adjust user wallet error:', error);
    res.status(500).json({ success: false, message: 'Failed to adjust wallet balance' });
  }
};

/**
 * Get all user bookings with filters and pagination
 */
const getAllUserBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    // Search by user name, phone, bookingNumber, or booking _id
    if (search && String(search).trim()) {
      const trimmed = String(search).trim();
      const safeSearch = escapeRegex(trimmed);
      const phoneDigits = trimmed.replace(/\D/g, '');
      const userConditions = [
        { name: { $regex: safeSearch, $options: 'i' } }
      ];
      if (phoneDigits) {
        userConditions.push({ phone: { $regex: escapeRegex(phoneDigits), $options: 'i' } });
        if (phoneDigits.length >= 12 && phoneDigits.startsWith('91')) {
          userConditions.push({ phone: { $regex: escapeRegex(phoneDigits.slice(2)), $options: 'i' } });
        } else if (phoneDigits.length >= 11 && phoneDigits.startsWith('0')) {
          userConditions.push({ phone: { $regex: escapeRegex(phoneDigits.slice(1)), $options: 'i' } });
        } else if (phoneDigits.length > 10) {
          userConditions.push({ phone: { $regex: escapeRegex(phoneDigits.slice(-10)), $options: 'i' } });
        }
      } else {
        userConditions.push({ phone: { $regex: safeSearch, $options: 'i' } });
      }

      const users = await User.find({ $or: userConditions }).select('_id');
      const userIds = users.map(u => u._id);

      const searchOr = [
        { userId: { $in: userIds } },
        { bookingNumber: { $regex: safeSearch, $options: 'i' } }
      ];

      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(trimmed) && String(new mongoose.Types.ObjectId(trimmed)) === trimmed) {
        searchOr.push({ _id: new mongoose.Types.ObjectId(trimmed) });
      }

      query.$or = searchOr;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .select('-workPhotos') // list views never show them; they can be megabytes
      .populate('userId', 'name phone email')
      .populate('vendorId', 'name phone businessName profilePhoto')
      .populate('serviceId', 'title')
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
    console.error('Get all user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user bookings'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserDetails,
  toggleUserStatus,
  deleteUser,
  getUserBookings,
  getUserWalletTransactions,
  adjustUserWallet,
  getAllUserBookings
};

