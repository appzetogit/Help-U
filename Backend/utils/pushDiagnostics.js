/**
 * Helpers for the "is my phone set up for notifications?" check shown in the apps' Settings.
 * Only counts are ever returned; the push tokens themselves never leave the server.
 */

const unique = (list) => [...new Set((list || []).filter((t) => typeof t === 'string' && t.trim()))];

const summarizeDevices = (doc) => {
  const web = unique(doc?.fcmTokens);
  const mobile = unique(doc?.fcmTokenMobile);
  return { webDevices: web.length, mobileDevices: mobile.length, totalDevices: unique([...web, ...mobile]).length };
};

const allTokens = (doc) => unique([...(doc?.fcmTokens || []), ...(doc?.fcmTokenMobile || [])]);

// One test notification every few seconds per person is plenty, and stops the button being used to spam a phone
const TEST_INTERVAL_MS = 5000;
const lastTest = new Map();
const testAllowed = (id) => {
  const now = Date.now();
  const last = lastTest.get(String(id)) || 0;
  if (now - last < TEST_INTERVAL_MS) return false;
  lastTest.set(String(id), now);
  if (lastTest.size > 5000) lastTest.clear();
  return true;
};

module.exports = { summarizeDevices, allTokens, testAllowed };
