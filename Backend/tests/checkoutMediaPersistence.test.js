const assert = require('assert');

// Mock localStorage and sessionStorage for Node.js test environment
function createStorage() {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
}

global.localStorage = createStorage();
global.sessionStorage = createStorage();

// Storage key logic
const getStorageKey = (type, category = null) => {
  try {
    const raw = global.localStorage.getItem('userData');
    const user = raw ? JSON.parse(raw) : null;
    const userId = user?._id || user?.id || 'guest';
    const catSlug = category ? String(category).toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'all';
    return `helpu_checkout_${type}_${userId}_${catSlug}`;
  } catch {
    return `helpu_checkout_${type}_guest`;
  }
};

const loadPersistedCheckoutMedia = (type = 'photos', category = null) => {
  try {
    const key = getStorageKey(type, category);
    const fallbackKey = getStorageKey(type, null);
    const raw =
      global.sessionStorage.getItem(key) ||
      global.localStorage.getItem(key) ||
      global.sessionStorage.getItem(fallbackKey) ||
      global.localStorage.getItem(fallbackKey);

    if (!raw) return [];
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return [];

    return items
      .filter((item) => item && typeof item.url === 'string' && item.url.trim().length > 0)
      .map((item) => ({
        id: item.id || `persisted_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: item.url,
        preview: item.url,
        status: 'done'
      }));
  } catch (err) {
    return [];
  }
};

const savePersistedCheckoutMedia = (type = 'photos', items = [], category = null) => {
  try {
    const key = getStorageKey(type, category);
    const completed = (items || []).filter(
      (item) => item && item.status === 'done' && typeof item.url === 'string' && item.url.trim().length > 0
    );

    if (completed.length > 0) {
      const payload = JSON.stringify(
        completed.map((item) => ({
          id: item.id,
          url: item.url,
          status: 'done'
        }))
      );
      global.sessionStorage.setItem(key, payload);
      global.localStorage.setItem(key, payload);
    } else {
      global.sessionStorage.removeItem(key);
      global.localStorage.removeItem(key);
    }
  } catch (err) {
    console.error(err);
  }
};

const clearPersistedCheckoutMedia = (category = null) => {
  try {
    const keysToRemove = [
      getStorageKey('photos', category),
      getStorageKey('videos', category),
      getStorageKey('photos', null),
      getStorageKey('videos', null)
    ];
    keysToRemove.forEach((key) => {
      global.sessionStorage.removeItem(key);
      global.localStorage.removeItem(key);
    });
  } catch (err) {}
};

async function run() {
  console.log('\n--- Testing Checkout Media Persistence Across Refreshes ---');

  // Setup logged in user
  global.localStorage.setItem('userData', JSON.stringify({ _id: 'user_123', name: 'John Doe' }));

  // 1. Initial state is empty
  let loaded = loadPersistedCheckoutMedia('photos', 'AC Service');
  assert.strictEqual(loaded.length, 0, 'Initial photos should be empty');
  console.log('  ✅ Initial state is empty');

  // 2. User uploads 2 photos: 1 done, 1 in-progress
  const uploadedPhotos = [
    { id: 'photo_1', preview: 'blob:http://localhost/abc', url: 'https://res.cloudinary.com/helpu/image1.jpg', status: 'done' },
    { id: 'photo_2', preview: 'blob:http://localhost/def', url: null, status: 'uploading' }
  ];
  savePersistedCheckoutMedia('photos', uploadedPhotos, 'AC Service');

  // 3. User refreshes page: loadPersistedCheckoutMedia is called on fresh component mount
  const rehydrated = loadPersistedCheckoutMedia('photos', 'AC Service');
  assert.strictEqual(rehydrated.length, 1, 'Only completed photos should be rehydrated');
  assert.strictEqual(rehydrated[0].id, 'photo_1');
  assert.strictEqual(rehydrated[0].url, 'https://res.cloudinary.com/helpu/image1.jpg');
  assert.strictEqual(rehydrated[0].preview, 'https://res.cloudinary.com/helpu/image1.jpg', 'Preview should use permanent URL');
  assert.strictEqual(rehydrated[0].status, 'done');
  console.log('  ✅ Refresh rehydrates uploaded photos with permanent Cloudinary preview');

  // 4. Second photo finishes uploading and state updates
  uploadedPhotos[1] = { id: 'photo_2', preview: 'blob:http://localhost/def', url: 'https://res.cloudinary.com/helpu/image2.jpg', status: 'done' };
  savePersistedCheckoutMedia('photos', uploadedPhotos, 'AC Service');

  const rehydratedBoth = loadPersistedCheckoutMedia('photos', 'AC Service');
  assert.strictEqual(rehydratedBoth.length, 2, 'Both completed photos are saved and rehydrated');
  console.log('  ✅ Subsequent photo uploads persist correctly');

  // 5. User removes one photo
  const afterRemove = [rehydratedBoth[1]];
  savePersistedCheckoutMedia('photos', afterRemove, 'AC Service');
  const rehydratedAfterRemove = loadPersistedCheckoutMedia('photos', 'AC Service');
  assert.strictEqual(rehydratedAfterRemove.length, 1);
  assert.strictEqual(rehydratedAfterRemove[0].id, 'photo_2');
  console.log('  ✅ Removed photos update persisted storage correctly');

  // 6. User completes booking -> clearPersistedCheckoutMedia is called
  clearPersistedCheckoutMedia('AC Service');
  const afterBooking = loadPersistedCheckoutMedia('photos', 'AC Service');
  assert.strictEqual(afterBooking.length, 0, 'Storage cleared after booking completion');
  console.log('  ✅ Draft cleared upon booking completion');

  console.log('\nCheckout Media Persistence tests passed successfully!\n');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
