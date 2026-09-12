/**
 * In-Memory Request Cache with TTL & Stale-While-Revalidate support.
 * Prevents redundant network roundtrips during rapid tab navigation.
 */
class ApiCache {
  constructor(defaultTtlMs = 15000) {
    this.cache = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    const isExpired = Date.now() > item.expiresAt;
    return {
      data: item.data,
      isStale: isExpired
    };
  }

  set(key, data, ttlMs = this.defaultTtlMs) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      savedAt: Date.now()
    });
  }

  invalidate(keyPrefix) {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }
}

export const apiCache = new ApiCache(15000);
