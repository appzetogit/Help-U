/**
 * Firebase Messaging Service Worker
 * Handles background push notifications with sound alerts
 * Like Ola/Uber/Rapido - works even when app is closed
 */

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Firebase configuration: passed in by the app when it registers this worker (see
// src/services/pushNotificationService.js), so it always matches the project the app's push
// tokens belong to. A worker on a different project never receives the app's pushes.
const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId')
};

const hasConfig = Boolean(firebaseConfig.messagingSenderId && firebaseConfig.appId);
if (hasConfig) {
  firebase.initializeApp(firebaseConfig);
} else {
  // Registered without config (e.g. an old cached registration): stay inert rather than guess a
  // project; the app re-registers this worker with the right config on its next load.
  console.warn('[SW] Firebase config missing; push disabled until the app re-registers this worker');
}

// Get messaging instance (a no-op stand-in when there is no config, so the script still loads)
const messaging = hasConfig ? firebase.messaging() : { onBackgroundMessage() {} };

// Notification sounds based on type
const NOTIFICATION_SOUNDS = {
  new_booking: '/booking-alert.mp3',
  booking_accepted: '/success.mp3',
  worker_assigned: '/notification.mp3',
  job_assigned: '/booking-alert.mp3',
  booking_completed: '/success.mp3',
  default: '/notification.mp3'
};

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] 🔔 Background message received:', payload);

  const data = payload.data || {};
  const notification = payload.notification || {};
  const notificationType = data.type || 'default';

  // Determine notification style based on type
  // Prioritize data properties for data-only notifications
  let notificationTitle = data.title || notification.title;
  let notificationBody = data.body || notification.body;

  // If absolutely no content, do not show notification (prevent empty bubbles)
  if (!notificationTitle && !notificationBody) {
    console.log('[SW] 🚫 Skipping empty notification');
    return;
  }

  // Default fallbacks if one is missing
  notificationTitle = notificationTitle || 'App Notification';
  notificationBody = notificationBody || 'You have a new update.';

  let icon = data.icon || notification.icon || '/helpu-logo.png';
  let badge = '/helpu-logo.png';
  // Same tag as the one the server put on the push, so a second copy of one event replaces the first
  let tag = data.tag || data.notificationId || data.bookingId || `notification-${Date.now()}`;
  let requireInteraction = false;
  let vibrate = [200, 100, 200];
  let actions = [];

  // Enhanced styling for different notification types
  switch (notificationType) {
    case 'booking_requested':
      notificationTitle = notificationTitle || '📅 Booking Created!';
      notificationBody = notificationBody || 'Your service request has been received.';
      vibrate = [200, 100];
      actions = [
        { action: 'view', title: '👁️ View Status' }
      ];
      break;

    case 'new_booking':
      // High priority booking alert - like Ola/Uber
      notificationTitle = data.title || notification.title || '🔔 New Booking Request!';
      notificationBody = data.body || notification.body || 'You have a new service request.';
      requireInteraction = true; // Keep notification visible until user interacts
      vibrate = [500, 200, 500, 200, 500]; // Strong vibration pattern
      actions = [
        { action: 'accept', title: '✓ Accept', icon: '/icons/accept.png' },
        { action: 'reject', title: '✗ Decline', icon: '/icons/reject.png' }
      ];
      break;

    case 'job_assigned':
      // Worker job assignment - urgent
      notificationTitle = data.title || notification.title || '🔔 New Job Assigned!';
      notificationBody = data.body || notification.body || 'You have been assigned a new job.';
      requireInteraction = true;
      vibrate = [500, 200, 500, 200, 500];
      actions = [
        { action: 'accept', title: '✓ Accept Job', icon: '/icons/accept.png' },
        { action: 'view', title: '👁️ View Details' }
      ];
      break;

    case 'booking_accepted':
      notificationTitle = data.title || notification.title || '✅ Booking Confirmed!';
      notificationBody = data.body || notification.body || 'Your booking has been accepted.';
      vibrate = [200, 100, 200];
      actions = [
        { action: 'view', title: '👁️ View Booking' }
      ];
      break;

    case 'worker_assigned':
      notificationTitle = data.title || notification.title || '👷 Worker Assigned';
      notificationBody = data.body || notification.body || 'A professional has been assigned to your booking.';
      vibrate = [200, 100, 200];
      actions = [
        { action: 'track', title: '📍 Track Worker' }
      ];
      break;

    case 'journey_started':
    case 'worker_started':
      notificationTitle = data.title || notification.title || '📍 Professional is on the way!';
      notificationBody = data.body || notification.body || 'Your service provider has started their journey.';
      requireInteraction = true;
      vibrate = [500, 200, 500];
      actions = [
        { action: 'track', title: '📍 Track Arrival', icon: '/icons/track.png' }
      ];
      break;

    case 'work_done':
    case 'worker_completed':
      notificationTitle = data.title || notification.title || '✅ Work Finished!';
      notificationBody = data.body || notification.body || 'Professional has finished the work and is preparing the bill.';
      requireInteraction = true;
      vibrate = [200, 100, 200, 100, 200];
      actions = [
        { action: 'view', title: '👁️ View Summary' }
      ];
      break;

    case 'booking_completed':
      notificationTitle = data.title || notification.title || '🎉 Booking Completed!';
      notificationBody = data.body || notification.body || 'Service has been completed successfully.';
      vibrate = [200, 100, 200, 100, 200];
      actions = [
        { action: 'rate', title: '⭐ Rate Now' }
      ];
      break;
  }

  const notificationOptions = {
    body: notificationBody,
    icon: icon,
    badge: badge,
    tag: tag,
    sound: NOTIFICATION_SOUNDS[notificationType] || NOTIFICATION_SOUNDS.default,
    data: {
      ...data,
      notificationType: notificationType,
      url: data.link || '/',
      timestamp: Date.now()
    },
    // Vibration pattern for mobile devices
    vibrate: vibrate,
    // Keep notification until user interacts (for important ones)
    requireInteraction: requireInteraction,
    // Action buttons
    actions: actions,
    // Sound will be played by the system for high priority
    silent: false,
    // Renotify even if same tag exists
    renotify: !data.tag, // a repeat of the same event replaces the first quietly
    // Timestamp
    timestamp: Date.now()
  };

  // Show the notification if app is not in foreground, or if it is an urgent job alert
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientList) {
      const isVisible = clientList.some(function (client) {
        return client.visibilityState === 'visible';
      });

      const isUrgent = ['new_booking', 'booking_request', 'job_assigned'].includes(notificationType);
      if (isVisible && !isUrgent) {
        console.log('[SW] 🚫 App is visible, skipping non-urgent notification to avoid duplicate');
        return;
      }

      return self.registration.showNotification(notificationTitle, notificationOptions);
    })
    .catch(function (err) {
      console.error('[SW] ⚠️ Error checking clients, falling back to notification:', err);
      return self.registration.showNotification(notificationTitle, notificationOptions);
    });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 📱 Notification clicked:', event.action, event.notification.data);

  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action;

  // Close the notification
  notification.close();

  let urlToOpen = data.url || data.link || '/';

  // Handle different actions
  switch (action) {
    case 'accept':
      // Accept booking/job - navigate to details page
      if (data.bookingId) {
        if (data.notificationType === 'job_assigned') {
          urlToOpen = `/worker/job/${data.bookingId}`;
        } else {
          urlToOpen = `/worker/bookings/${data.bookingId}`;
        }
      }
      break;

    case 'reject':
    case 'decline':
      // User rejected - just close notification
      return;

    case 'view':
    case 'track':
      // View details
      if (data.bookingId) {
        urlToOpen = data.link || `/user/booking/${data.bookingId}`;
      }
      break;

    case 'rate':
      // Navigate to rating page
      if (data.bookingId) {
        urlToOpen = `/user/booking/${data.bookingId}?rate=true`;
      }
      break;

    default:
      // Default click - open the link
      urlToOpen = data.link || data.url || '/';
  }

  // Ensure URL is absolute
  const origin = self.location.origin;
  if (urlToOpen && !urlToOpen.startsWith('http')) {
    urlToOpen = new URL(urlToOpen, origin).href;
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          // Navigate to the specific URL
          if (urlToOpen) {
            return client.navigate(urlToOpen);
          }
          return;
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] ❌ Notification closed:', event.notification.data);
});

// Handle push events for additional processing
self.addEventListener('push', (event) => {
  console.log('[SW] 📨 Push event received:', event);
});

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Service Worker installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] ✅ Service Worker activated');
  event.waitUntil(clients.claim());
});

console.log('[SW] 🚀 Firebase Messaging Service Worker loaded');
