/**
 * Push Notification Service
 * Handles FCM token registration and notification handling
 */

import { messaging, getToken, onMessage } from '../firebase';
import api from './api';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Check if running inside Flutter WebView
 * @returns {boolean}
 */
function isFlutterWebView() {
  return !!(window.flutter_inappwebview && window.flutter_inappwebview.callHandler);
}

/**
 * Get the current platform type
 * @returns {'web' | 'mobile'}
 */
function getPlatformType() {
  return isFlutterWebView() ? 'mobile' : 'web';
}

/**
 * Register service worker for push notifications
 * @returns {Promise<ServiceWorkerRegistration>}
 */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      // The service worker must use the same Firebase project as the app, or background pushes
      // never arrive. It cannot read Vite env vars, so the app's own config is passed in the URL
      // (these are public web keys) and the worker reads it from there.
      const params = new URLSearchParams({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
      });
      const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
      // console.log('✅ Service Worker registered:', registration.scope);
      return registration;
    } catch (error) {
      // console.error('❌ Service Worker registration failed:', error);
      throw error;
    }
  } else {
    throw new Error('Service Workers are not supported in this browser');
  }
}

/**
 * Request notification permission from user
 * @returns {Promise<boolean>}
 */
async function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.warn('[FCM] Notification permission request error:', error);
      return false;
    }
  }
  return false;
}

/**
 * Get current browser notification permission state
 * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
 */
function getNotificationPermissionState() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission;
  }
  return 'unsupported';
}

/**
 * Get FCM token from Firebase
 * @returns {Promise<string|null>}
 */
async function getFCMToken() {
  try {
    if (!messaging) {
      // console.error('Firebase messaging not initialized');
      return null;
    }

    const registration = await registerServiceWorker();
    await registration.update(); // Update service worker

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      // console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
      return token;
    } else {
      // console.log('❌ No FCM token available');
      return null;
    }
  } catch (error) {
    // console.error('❌ Error getting FCM token:', error);
    throw error;
  }
}

/**
 * Register this device for push notifications, and say why if it could not.
 * Resolves to { ok, token, reason, detail }. `reason` is one of:
 *   unsupported    this browser cannot receive pushes
 *   app            inside the Help U app, where the app registers the phone itself
 *   not-configured the web push keys are missing from this build
 *   denied         notifications are blocked for this site / app in the phone or browser settings
 *   dismissed      the permission question was closed without an answer
 *   no-token       Firebase gave no device token
 *   not-logged-in  there is no signed-in session to attach the device to
 *   server         the server refused the device
 *   error          anything else (detail has the message)
 * @param {string} userType - 'user' or 'worker'
 * @param {boolean} forceUpdate - Force token update
 */
async function registerFCMTokenDetailed(userType = 'user', forceUpdate = false) {
  const fail = (reason, detail) => {
    console.warn(`[FCM] This device was not registered for notifications (${reason})`, detail || '');
    return { ok: false, token: null, reason, detail };
  };

  try {
    const platform = getPlatformType();
    const storageKey = `fcm_token_${userType}_${platform}`;
    const savedToken = localStorage.getItem(storageKey);
    if (savedToken && !forceUpdate) {
      return { ok: true, token: savedToken, reason: null };
    }

    const canPush = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    if (!canPush) return fail(isFlutterWebView() ? 'app' : 'unsupported');
    if (!messaging) return fail('not-configured');
    if (Notification.permission === 'denied') return fail('denied');

    // Request permission
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) return fail(Notification.permission === 'denied' ? 'denied' : 'dismissed');

    // Get token
    const token = await getFCMToken();
    if (!token) return fail('no-token');

    // Determine API endpoint based on user type
    let endpoint;
    let authTokenKey;
    switch (userType) {
      case 'worker':
        endpoint = '/workers/fcm-tokens/save';
        authTokenKey = 'workerAccessToken';
        break;
      case 'user':
        endpoint = '/users/fcm-tokens/save';
        authTokenKey = 'accessToken';
        break;
      default:
        endpoint = '/users/fcm-tokens/save';
        authTokenKey = 'accessToken';
    }

    // Get auth token
    const authToken = localStorage.getItem(authTokenKey);
    if (!authToken) return fail('not-logged-in');

    // Save to backend
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        token: token,
        platform: platform
      })
    });

    if (response.ok) {
      localStorage.setItem(storageKey, token);
      return { ok: true, token, reason: null };
    }
    return fail('server', `HTTP ${response.status}`);
  } catch (error) {
    return fail('error', error?.message);
  }
}

/**
 * Register FCM token with backend
 * @param {string} userType - 'user' or 'worker'
 * @param {boolean} forceUpdate - Force token update
 * @returns {Promise<string|null>}
 */
async function registerFCMToken(userType = 'user', forceUpdate = false) {
  const result = await registerFCMTokenDetailed(userType, forceUpdate);
  return result.token || null;
}

/**
 * How many devices the server has registered for this person (counts only).
 * @param {string} userType - 'user' or 'worker'
 */
async function getPushStatus(userType = 'user') {
  const response = await api.get(`/${userType === 'worker' ? 'workers' : 'users'}/fcm-tokens/status`);
  return response.data;
}

/**
 * Send a test notification to the person's own devices.
 * @param {string} userType - 'user' or 'worker'
 */
async function sendTestPush(userType = 'user') {
  try {
    const response = await api.post(`/${userType === 'worker' ? 'workers' : 'users'}/fcm-tokens/test`);
    return response.data;
  } catch (error) {
    return error.response?.data || { success: false, error: 'Could not send the test notification' };
  }
}

/**
 * Remove FCM token from backend (removes specific token for current device)
 * @param {string} userType - 'user' or 'worker'
 */
async function removeFCMToken(userType = 'user') {
  try {
    // Detect platform automatically
    const platform = getPlatformType();
    const storageKey = `fcm_token_${userType}_${platform}`;
    const tokenToRemove = localStorage.getItem(storageKey);

    if (!tokenToRemove) {
      // console.log('[FCM] No token found in localStorage to remove');
      return;
    }

    // console.log(`[FCM] Removing ${platform} token for ${userType}...`);

    // Determine API endpoint based on user type
    let endpoint;
    let authTokenKey;
    switch (userType) {
      case 'worker':
        endpoint = '/workers/fcm-tokens/remove';
        authTokenKey = 'workerAccessToken';
        break;
      default:
        endpoint = '/users/fcm-tokens/remove';
        authTokenKey = 'accessToken';
    }

    const authToken = localStorage.getItem(authTokenKey);
    // If we have an auth token, try to remove from backend
    if (authToken) {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

      // Call remove endpoint with specific token
      await fetch(`${baseUrl}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          token: tokenToRemove,
          platform: platform
        })
      });
      console.log(`[FCM] ✅ Token removed from backend`);
    }

    // Always remove from local storage
    localStorage.removeItem(storageKey);
    console.log(`[FCM] Token cleared from localStorage`);
  } catch (error) {
    console.error('[FCM] Error removing FCM token:', error);
    // Ensure local cleanup happens even on error
    const platform = getPlatformType();
    const storageKey = `fcm_token_${userType}_${platform}`;
    localStorage.removeItem(storageKey);
  }
}

/**
 * Setup foreground notification handler
 * @param {Function} handler - Custom handler function
 */
function setupForegroundNotificationHandler(handler) {
  if (!messaging) {
    // console.error('Firebase messaging not initialized');
    return;
  }

  onMessage(messaging, (payload) => {
    // console.log('📬 Foreground message received:', payload);

    const data = payload.data || {};
    const notification = payload.notification || {};

    // Use notification fields first, then data fields as fallback (for data-only messages)
    const title = notification.title || data.title || 'New Notification';
    const body = notification.body || data.body || '';
    const icon = notification.icon || data.icon || '/HomeBuddy-header-logo.png';
    const type = data.type || data.notificationType || 'default';

    // Call custom handler (e.g. for toast)
    if (handler) {
      handler(payload);
    }
  });
}

/**
 * Initialize push notifications
 * Call this on app load
 */
async function initializePushNotifications() {
  try {
    if (!('serviceWorker' in navigator)) {
      // console.log('Service workers not supported');
      return;
    }

    if (!('Notification' in window)) {
      // console.log('Notifications not supported');
      return;
    }

    await registerServiceWorker();
    // console.log('✅ Push notifications initialized');
  } catch (error) {
    // console.error('Error initializing push notifications:', error);
  }
}

export {
  initializePushNotifications,
  registerFCMToken,
  registerFCMTokenDetailed,
  getPushStatus,
  sendTestPush,
  isFlutterWebView,
  removeFCMToken,
  setupForegroundNotificationHandler,
  requestNotificationPermission,
  getNotificationPermissionState,
  getFCMToken
};
