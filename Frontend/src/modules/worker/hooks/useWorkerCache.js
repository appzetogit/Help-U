/**
 * useWorkerCache - Simple in-memory caching hook for worker API responses
 * Reduces redundant API calls and improves perceived performance
 */
import { useState, useCallback, useRef } from 'react';

// Global cache store (persists across component remounts)
const cacheStore = new Map();

/**
 * @param {string} key - Unique cache key
 * @param {Function} fetcher - Async function that returns data
 * @param {number} ttl - Time to live in milliseconds (default: 30 seconds)
 */
export const useWorkerCache = (key, fetcher, ttl = 30000) => {
  const [data, setData] = useState(() => {
    const cached = cacheStore.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }
    return null;
  });
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(null);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = cacheStore.get(key);
      if (cached && Date.now() < cached.expiry) {
        setData(cached.data);
        setLoading(false);
        return cached.data;
      }
    }

    // Prevent duplicate fetches
    if (fetchingRef.current) return data;
    fetchingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const result = await fetcher();

      // Store in cache
      cacheStore.set(key, {
        data: result,
        expiry: Date.now() + ttl
      });

      setData(result);
      setLoading(false);
      fetchingRef.current = false;
      return result;
    } catch (err) {
      setError(err);
      setLoading(false);
      fetchingRef.current = false;
      throw err;
    }
  }, [key, fetcher, ttl, data]);

  const invalidate = useCallback(() => {
    cacheStore.delete(key);
    setData(null);
  }, [key]);

  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  return { data, loading, error, fetchData, invalidate, refresh };
};

/**
 * Invalidate all worker caches (useful after major actions)
 */
export const invalidateAllWorkerCaches = () => {
  cacheStore.clear();
};

/**
 * Invalidate specific cache by key pattern
 */
export const invalidateCacheByPattern = (pattern) => {
  for (const key of cacheStore.keys()) {
    if (key.includes(pattern)) {
      cacheStore.delete(key);
    }
  }
};

export default useWorkerCache;
