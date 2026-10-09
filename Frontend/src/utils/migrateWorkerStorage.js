/**
 * One-time move of browser storage keys from the old "vendor*" names to "worker*"
 * (e.g. vendorAccessToken -> workerAccessToken), so workers stay logged in after
 * the vendor -> worker rename. Runs before the app reads any storage.
 */
const migrate = (getStorage) => {
  try {
    const storage = getStorage();
    const oldKeys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('vendor')) oldKeys.push(key);
    }
    oldKeys.forEach((oldKey) => {
      const newKey = `worker${oldKey.slice('vendor'.length)}`;
      if (storage.getItem(newKey) === null) {
        storage.setItem(newKey, storage.getItem(oldKey));
      }
      storage.removeItem(oldKey);
    });
  } catch {
    // Storage can be unavailable (private mode, blocked site data); nothing to migrate then
  }
};

migrate(() => window.localStorage);
migrate(() => window.sessionStorage);
