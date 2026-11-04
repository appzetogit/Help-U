/**
 * Persistence for optional problem photos and videos attached at checkout.
 * Preserves successfully uploaded media across page refreshes (F5 / reload).
 */

const getStorageKey = (type, category = null) => {
  try {
    const raw = localStorage.getItem('userData');
    const user = raw ? JSON.parse(raw) : null;
    const userId = user?._id || user?.id || 'guest';
    const catSlug = category ? String(category).toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'all';
    return `helpu_checkout_${type}_${userId}_${catSlug}`;
  } catch {
    return `helpu_checkout_${type}_guest`;
  }
};

/**
 * Loads completed media (with valid URLs) from sessionStorage/localStorage.
 */
export const loadPersistedCheckoutMedia = (type = 'photos', category = null) => {
  try {
    const key = getStorageKey(type, category);
    const fallbackKey = getStorageKey(type, null);
    const raw =
      sessionStorage.getItem(key) ||
      localStorage.getItem(key) ||
      sessionStorage.getItem(fallbackKey) ||
      localStorage.getItem(fallbackKey);

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
    console.error(`Failed to load persisted checkout ${type}:`, err);
    return [];
  }
};

/**
 * Saves completed media items to both sessionStorage and localStorage.
 */
export const savePersistedCheckoutMedia = (type = 'photos', items = [], category = null) => {
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
      sessionStorage.setItem(key, payload);
      localStorage.setItem(key, payload);
    } else {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.error(`Failed to save checkout ${type}:`, err);
  }
};

/**
 * Clears persisted media drafts when booking is completed, cancelled, or cart is emptied.
 */
export const clearPersistedCheckoutMedia = (category = null) => {
  try {
    const keysToRemove = [
      getStorageKey('photos', category),
      getStorageKey('videos', category),
      getStorageKey('photos', null),
      getStorageKey('videos', null)
    ];
    keysToRemove.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
  } catch (err) {
    console.error('Failed to clear checkout media:', err);
  }
};
