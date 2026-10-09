/**
 * Firebase Admin Service
 * Handles push notification sending via Firebase Cloud Messaging (FCM)
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
// Initialize Firebase Admin SDK
let serviceAccount;

try {
  if (process.env.FIREBASE_CONFIG) {
    // Production: Use environment variable JSON content
    serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Alternative Env Var
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else {
    // Local: Use file path
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './config/firebase-service-account.json';
    serviceAccount = require(path.resolve(__dirname, '..', serviceAccountPath));
  }
} catch (error) {
  console.error('❌ Failed to load Firebase credentials:', error.message);
}

// Initialize only if not already initialized
if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('✅ Firebase Admin SDK initialized');
}

/**
 * Send push notification to multiple tokens
 * @param {string[]} tokens - Array of FCM tokens
 * @param {Object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {Object} payload.data - Additional data (optional)
 * @param {string} payload.icon - Notification icon (optional)
 * @param {boolean} payload.highPriority - Send as high priority (default: true)
 * @returns {Promise<Object>} - Response with success/failure counts
 */
/**
 * Send push notification to multiple tokens
 * @param {string[]} tokens - Array of FCM tokens
 * @param {Object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {Object} payload.data - Additional data (optional)
 * @param {string} payload.icon - Notification icon (optional)
 * @param {boolean} payload.highPriority - Send as high priority (default: true)
 * @returns {Promise<Object>} - Response with success/failure counts
 */
async function sendPushNotification(tokens, payload) {
  try {
    if (!tokens || tokens.length === 0) {
      console.log('No FCM tokens provided');
      return { successCount: 0, failureCount: 0 };
    }

    // Remove duplicates and empty values (Robust deduplication)
    const uniqueTokens = Array.from(new Set(tokens.filter(t => t && typeof t === 'string' && t.trim().length > 0)));

    if (uniqueTokens.length === 0) {
      console.log('No valid FCM tokens after filtering');
      return { successCount: 0, failureCount: 0 };
    }

    // Ensure data values are strings (FCM requirement)
    const stringData = {
      // Always include title and body in data for data-only notifications and Service Worker access
      title: payload.title || (payload.body ? 'New Update' : 'App Notification'),
      body: payload.body || ''
    };
    if (payload.data) {
      Object.keys(payload.data).forEach(key => {
        stringData[key] = String(payload.data[key]);
      });
    }

    const message = {
      data: stringData,
      tokens: uniqueTokens,
      // Android specific configuration for high priority
      android: {
        priority: 'high', // HIGH priority for immediate delivery
        // notification block removed to ensure Data-Only message
      },
      // iOS/APNs specific configuration
      apns: {
        headers: {
          'apns-priority': '10', // Highest priority for immediate delivery
          'apns-push-type': 'alert'
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1, // Wake up app in background
            'mutable-content': 1
          }
        }
      },
      // Web push configuration
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400' // 24 hours
        },
        fcmOptions: {
          link: payload.data?.link || '/'
        }
      },
      priority: payload.highPriority !== false ? 'high' : 'normal'
    };

    // Standard notification block (Top-level)
    message.notification = {
      title: payload.title || 'App Notification',
      body: payload.body || 'New Update',
    };
    
    // Android specific (Sound, Priority, Channel, Icon)
    message.android.notification = {
      title: message.notification.title,
      body: message.notification.body,
      icon: 'stock_ticker_update',
      color: '#f44336'
    };

    // iOS/APNs specific (Sound, Alert, Badge)
    message.apns.payload.aps.alert = {
      title: message.notification.title,
      body: message.notification.body,
    };

    // WebPush specific (Title, Body, Icon, Badge)
    message.webpush.notification = {
      title: message.notification.title,
      body: message.notification.body,
      icon: payload.icon || '/helpu-logo.png',
      badge: '/helpu-logo.png',
    };

    /*
    if (payload.icon) {
      message.notification.image = payload.icon;
      message.android.notification.image = payload.icon;
    }
    */

    // Ensure critical fields are also in data for background handling
    // Use payload source directly since message.notification is disabled
    message.data.title = payload.title || 'App Notification';
    message.data.body = payload.body || 'New Update';
    if (payload.icon) message.data.icon = payload.icon;

    // Log intent
    console.log(`[FCM] Sending standard notification to ${uniqueTokens.length} tokens:`, payload.title);

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(`✅ Push notification sent - Success: ${response.successCount}, Failed: ${response.failureCount}`);

    // Log failed tokens for debugging and cleanup invalid ones
    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          console.log(`❌ Failed token[${idx}]: ${errorCode} - ${resp.error?.message}`);

          if (errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token') {
            invalidTokens.push(uniqueTokens[idx]);
          }
        }
      });

      // Cleanup invalid tokens
      if (invalidTokens.length > 0) {
        removeInvalidTokens(invalidTokens);
      }
    }

    return response;
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    throw error;
  }
}

/**
 * Remove invalid FCM tokens from all collections
 * @param {string[]} tokens - Array of invalid tokens to remove
 */
async function removeInvalidTokens(tokens) {
  try {
    console.log(`[FCM Cleanup] Removing ${tokens.length} invalid tokens...`);
    const User = require('../models/User');
    const Worker = require('../models/Worker');

    const updateQuery = {
      $pull: {
        fcmTokens: { $in: tokens },
        fcmTokenMobile: { $in: tokens }
      }
    };

    // We run updates in parallel for all collections as a token might belong to any
    await Promise.all([
      User.updateMany({ $or: [{ fcmTokens: { $in: tokens } }, { fcmTokenMobile: { $in: tokens } }] }, updateQuery),
      Worker.updateMany({ $or: [{ fcmTokens: { $in: tokens } }, { fcmTokenMobile: { $in: tokens } }] }, updateQuery)
    ]);

    console.log('[FCM Cleanup] ✅ Invalid tokens removed from database');
  } catch (err) {
    console.error('[FCM Cleanup] ❌ Error removing tokens:', err);
  }
}

/**
 * Send notification to a specific user
 * @param {string} userId - User's MongoDB _id
 * @param {Object} payload - Notification payload
 * @param {boolean} includeMobile - Include mobile tokens (default: true)
 */
async function sendNotificationToUser(userId, payload, includeMobile = true) {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId);

    if (!user) {
      console.log(`[FCM] ❌ User not found for notification: ${userId}`);
      return;
    }

    let tokens = [];
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      tokens = [...tokens, ...user.fcmTokens];
    }
    if (includeMobile && user.fcmTokenMobile && user.fcmTokenMobile.length > 0) {
      tokens = [...tokens, ...user.fcmTokenMobile];
    }

    if (tokens.length === 0) {
      console.log(`[FCM] ⚠️ No FCM tokens found for user: ${userId}`);
      return;
    }

    console.log(`[FCM] 📤 Sending notification to user ${user.name} (${userId}) on ${tokens.length} devices`);

    // Add priority and sound for user notifications too
    const finalPayload = {
      ...payload,
      highPriority: payload.priority === 'high' ||
        ['booking_accepted', 'journey_started', 'work_done', 'work_completed', 'booking_completed', 'vendor_reached', 'visit_verified', 'payment_success', 'payment_received', 'work_started', 'in_progress'].includes(payload.data?.type),
      dataOnly: false // Explicitly disable dataOnly to force system tray notification
    };

    await sendPushNotification(tokens, finalPayload);
  } catch (error) {
    console.error(`[FCM] ❌ Error sending notification to user ${userId}:`, error);
  }
}

/**
 * Send notification to a specific worker
 * @param {string} vendorId - Worker's MongoDB _id
 * @param {Object} payload - Notification payload
 * @param {boolean} includeMobile - Include mobile tokens (default: true)
 */
async function sendNotificationToWorker(vendorId, payload, includeMobile = true) {
  try {
    const Worker = require('../models/Worker');
    const worker = await Worker.findById(vendorId);

    if (!worker) {
      console.log(`[FCM] ❌ Worker not found for notification: ${vendorId}`);
      return;
    }

    let tokens = [];
    if (worker.fcmTokens && worker.fcmTokens.length > 0) {
      tokens = [...tokens, ...worker.fcmTokens];
    }
    if (includeMobile && worker.fcmTokenMobile && worker.fcmTokenMobile.length > 0) {
      tokens = [...tokens, ...worker.fcmTokenMobile];
    }

    if (tokens.length === 0) {
      console.log(`[FCM] ⚠️ No FCM tokens found for worker: ${vendorId}`);
      return;
    }

    console.log(`[FCM] 📤 Sending notification to worker ${worker.businessName || worker.name} (${vendorId}) on ${tokens.length} devices`);

    const finalPayload = {
      ...payload,
      title: `🏢 [Partner] ${payload.title}` // Add identification
    };

    await sendPushNotification(tokens, finalPayload);
  } catch (error) {
    console.error(`[FCM] ❌ Error sending notification to worker ${vendorId}:`, error);
  }
}

/**
 * Send notification to a specific admin
 * @param {string} adminId - Admin's MongoDB _id
 * @param {Object} payload - Notification payload
 * @param {boolean} includeMobile - Include mobile tokens (default: true)
 */
async function sendNotificationToAdmin(adminId, payload, includeMobile = true) {
  try {
    const User = require('../models/User'); // Use User model for admin too as they share collection or separate Admin model?

    let adminUser = null;
    try {
      const Admin = require('../models/Admin');
      adminUser = await Admin.findById(adminId);
    } catch (e) {
      // If Admin model doesn't exist, try User model with role check?
      // Or maybe adminId refers to a User document.
      const User = require('../models/User');
      adminUser = await User.findById(adminId);
    }

    if (!adminUser) {
      console.log(`Admin not found: ${adminId}`);
      return;
    }

    let tokens = [];
    if (adminUser.fcmTokens && adminUser.fcmTokens.length > 0) {
      tokens = [...tokens, ...adminUser.fcmTokens];
    }
    if (includeMobile && adminUser.fcmTokenMobile && adminUser.fcmTokenMobile.length > 0) {
      tokens = [...tokens, ...adminUser.fcmTokenMobile];
    }

    console.log(`[FCM] 📤 Sending notification to admin (${adminId}) on ${tokens.length} devices`);

    const finalPayload = {
      ...payload,
      title: `🛡️ [Admin] ${payload.title}` // Add identification
    };

    await sendPushNotification(tokens, finalPayload);
  } catch (error) {
    console.error(`[FCM] ❌ Error sending notification to admin ${adminId}:`, error);
  }
}

module.exports = {
  sendPushNotification,
  sendNotificationToUser,
  sendNotificationToWorker,
  sendNotificationToAdmin
};
