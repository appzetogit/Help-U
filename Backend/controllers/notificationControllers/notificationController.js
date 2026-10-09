const Notification = require('../../models/Notification');
const { validationResult } = require('express-validator');
const { sendNotificationToUser, sendNotificationToWorker } = require('../../services/firebaseAdmin');

/**
 * Create notification (internal use)
 */
const createNotification = async ({
  userId = null,
  vendorId = null,
  adminId = null,
  type,
  title,
  message,
  relatedId = null,
  relatedType = null,
  data = {},
  skipPush = false,
  pushData = {},
  priority = null
}) => {
  try {
    // ── DEDUP CHECK: Redis-first (< 1ms), DB fallback ──────────────────────
    let isDuplicate = false;
    const { getRedis, isRedisConnected } = require('../../services/redisService');

    // Build a deterministic dedup key from the notification fingerprint
    const dedupTarget = userId || vendorId || adminId || 'unknown';
    const dedupKey = `notif:dedup:${type}:${String(relatedId || '')}:${String(dedupTarget)}`;

    if (isRedisConnected()) {
      // Redis NX (set-if-not-exists) with 5s TTL — atomic, zero extra reads
      const set = await getRedis().set(dedupKey, '1', 'EX', 5, 'NX');
      isDuplicate = set === null; // null means key already existed
    } else {
      // Fallback: DB query (original behaviour when Redis is down)
      const duplicateQuery = {
        type,
        title,
        createdAt: { $gt: new Date(Date.now() - 5000) }
      };
      if (userId) duplicateQuery.userId = userId;
      if (vendorId) duplicateQuery.vendorId = vendorId;
      if (adminId) duplicateQuery.adminId = adminId;
      if (relatedId) duplicateQuery.relatedId = relatedId;

      const existing = await Notification.findOne(duplicateQuery);
      isDuplicate = !!existing;
      if (isDuplicate) return existing;
    }

    if (isDuplicate) {
      console.log(`[Notification] Dedup hit (Redis): ${type} for ${relatedId}`);
      return null;
    }

    const notification = await Notification.create({
      userId,
      vendorId,
      adminId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      data
    });

    // Check Socket Connectivity to prevent Duplicate Notifications (Push + Socket)
    let io = null;
    let room = null;
    let isOnline = false;

    try {
      const { getIO } = require('../../sockets');
      io = getIO();

      if (userId) room = `user_${userId.toString()}`;
      else if (vendorId) room = `vendor_${vendorId.toString()}`;
      else if (adminId) room = `admin_${adminId.toString()}`;

      if (io && room) {
        // Check if user is actively connected to the room
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        isOnline = roomSize > 0;
      }
    } catch (e) {
      console.log('Socket check failed:', e.message);
    }

    // DECISION: If User is Online (Socket Connected) -> Send Socket Event ONLY (Skip Push)
    // If User is Offline -> Send Push Notification

    // Override skipPush if user is online (to avoid double notification)
    if (isOnline) {
      console.log(`[Notification] User ${room} is ONLINE. Sending Socket event.`);
      // Prevent duplicate notification on active device
      // skipPush = true; // REVERTED: Causes missing notifications if mobile app is background

      // Emit Socket Event immediately
      if (io && room) {
        io.to(room).emit('notification', notification);
      }
    } else {
      console.log(`[Notification] User ${room} is OFFLINE. Sending Push Notification.`);
      // Socket emit useless here, but safe to ignore
    }

    // Send Push Notification (If not skipped)
    if (!skipPush) {
      // Prepare payload
      // Use explicit pushData if provided, otherwise merge generic data
      const payload = {
        title: title,
        body: message,
        priority: priority || pushData.priority || 'normal',
        data: {
          ...data,
          ...pushData,
          type: pushData.type || type, // Allow overriding type for push specifically
          relatedId: relatedId ? String(relatedId) : '',
          relatedType: relatedType ? String(relatedType) : '',
          notificationId: String(notification._id)
        }
      };

      // If dataOnly flag is in pushData, pass it
      if (pushData.dataOnly) {
        payload.dataOnly = true;
      }

      // Send to target
      try {
        if (userId) await sendNotificationToUser(userId, payload);
        if (vendorId) await sendNotificationToWorker(vendorId, payload);
        if (adminId) {
          const { sendNotificationToAdmin } = require('../../services/firebaseAdmin');
          await sendNotificationToAdmin(adminId, payload);
        }
      } catch (pushError) {
        console.error('Auto-push notification failed:', pushError);
        // Do not fail the function, notification is saved in DB
      }
    }
    // Socket emission handled above in "isOnline" block for clarity, 
    // but technically if we wanted to emit even if offline (for when they reconnect? No, socket doesn't buffer like that usually)
    // we could keep it here. But logic above is cleaner: Online -> Socket, Offline -> Push.

    return notification;
  } catch (error) {
    console.error('Create notification error:', error);
    return null;
  }
};

/**
 * Get user notifications
 */
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { userId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Get worker notifications
 */
const getWorkerNotifications = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { vendorId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ vendorId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get worker notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Get admin notifications
 */
const getAdminNotifications = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { isRead, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { adminId };
    if (isRead !== undefined) {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({ adminId, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get admin notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications. Please try again.'
    });
  }
};

/**
 * Mark notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = { _id: id };
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'WORKER') query.vendorId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;

    const notification = await Notification.findOne(query);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read. Please try again.'
    });
  }
};

/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = { isRead: false };
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'WORKER') query.vendorId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;

    await Notification.updateMany(query, {
      isRead: true,
      readAt: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read. Please try again.'
    });
  }
};

/**
 * Delete notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role
    let query = { _id: id };
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'WORKER') query.vendorId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;

    const notification = await Notification.findOneAndDelete(query);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification. Please try again.'
    });
  }
};

/**
 * Delete all notifications for the current user
 */
const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role to ensure they only delete their own notifications
    let query = {};
    if (userRole === 'USER' || userRole === 'user') query.userId = userId;
    else if (userRole === 'WORKER' || userRole === 'worker') query.vendorId = userId;
    else if (userRole === 'ADMIN' || userRole === 'admin' || userRole === 'super_admin') query.adminId = userId;
    else {
      console.log('Role mismatch in deleteAllNotifications:', userRole);
      return res.status(403).json({
        success: false,
        message: 'Invalid user role'
      });
    }

    const result = await Notification.deleteMany(query);

    res.status(200).json({
      success: true,
      message: 'All notifications deleted successfully',
      count: result.deletedCount
    });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all notifications. Please try again.'
    });
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  getWorkerNotifications,
  getAdminNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications
};

