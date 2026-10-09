/**
 * User FCM Token Routes
 * Manages FCM tokens for push notifications
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authMiddleware');
const { sendPushNotification } = require('../../services/firebaseAdmin');
const User = require('../../models/User');
const Worker = require('../../models/Worker');

const MAX_TOKENS = 10; // Maximum tokens per platform

/**
 * @route   POST /api/users/fcm-tokens/save
 * @desc    Save FCM token for user
 * @access  Private
 */
router.post('/save', authenticate, async (req, res) => {
  try {
    const { token, platform = 'web' } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    // Use atomic updates to prevent VersionError (Race Conditions)

    // 1. Remove token if it exists (to avoid duplicates)
    const pullQuery = platform === 'mobile'
      ? { $pull: { fcmTokenMobile: token } }
      : { $pull: { fcmTokens: token } };

    await User.findByIdAndUpdate(userId, pullQuery);

    // 2. Add token to front with limit
    const pushQuery = platform === 'mobile'
      ? {
        $push: {
          fcmTokenMobile: {
            $each: [token],
            $position: 0,
            $slice: MAX_TOKENS
          }
        }
      }
      : {
        $push: {
          fcmTokens: {
            $each: [token],
            $position: 0,
            $slice: MAX_TOKENS
          }
        }
      };

    const user = await User.findByIdAndUpdate(userId, pushQuery, { new: true });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Remove this token from Worker collection to prevent cross-account notifications
    // Remove this token from Worker collection to prevent cross-account notifications
    // COMMENTED OUT to allow testing on same device (e.g. localhost) without tokens getting deleted
    /*
    try {
      await Worker.updateMany(
        { $or: [{ fcmTokens: token }, { fcmTokenMobile: token }] },
        { $pull: { fcmTokens: token, fcmTokenMobile: token } }
      );

    } catch (cleanupError) {
      console.error('Error removing token from other collections:', cleanupError);
      // Don't fail the request if cleanup fails
    }
    */

    res.json({ success: true, message: 'FCM token saved successfully' });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ success: false, error: 'Failed to save FCM token' });
  }
});

/**
 * @route   DELETE /api/users/fcm-tokens/remove
 * @desc    Remove FCM token for user
 * @access  Private
 */
router.delete('/remove', authenticate, async (req, res) => {
  try {
    const { token, platform = 'web' } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Remove token based on platform
    if (platform === 'web' && user.fcmTokens) {
      user.fcmTokens = user.fcmTokens.filter(t => t !== token);
    } else if (platform === 'mobile' && user.fcmTokenMobile) {
      user.fcmTokenMobile = user.fcmTokenMobile.filter(t => t !== token);
    }

    await user.save();

    res.json({ success: true, message: 'FCM token removed successfully' });
  } catch (error) {
    console.error('Error removing FCM token:', error);
    res.status(500).json({ success: false, error: 'Failed to remove FCM token' });
  }
});

/**
 * @route   DELETE /api/users/fcm-tokens/remove-all
 * @desc    Remove ALL FCM tokens for a specific platform (called during logout)
 * @access  Private
 */
router.delete('/remove-all', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const { platform = 'web' } = req.body;

    // Clear only the specified platform's tokens
    const updateQuery = platform === 'mobile'
      ? { $set: { fcmTokenMobile: [] } }
      : { $set: { fcmTokens: [] } };

    const user = await User.findByIdAndUpdate(userId, updateQuery, { new: true });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[FCM] ✅ All ${platform} tokens removed for user: ${userId}`);
    res.json({ success: true, message: `All ${platform} FCM tokens removed successfully` });
  } catch (error) {
    console.error('Error removing FCM tokens:', error);
    res.status(500).json({ success: false, error: 'Failed to remove FCM tokens' });
  }
});

/**
 * @route   POST /api/users/fcm-tokens/test
 * @desc    Send test notification to user (development only)
 * @access  Private
 */
router.post('/test', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const tokens = [...(user.fcmTokens || []), ...(user.fcmTokenMobile || [])];
    const uniqueTokens = [...new Set(tokens)];

    if (uniqueTokens.length === 0) {
      return res.json({ success: false, error: 'No FCM tokens found for user' });
    }

    const response = await sendPushNotification(uniqueTokens, {
      title: '🔔 Test Notification',
      body: 'This is a test notification from Appzeto!',
      data: {
        type: 'test',
        link: '/'
      }
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
