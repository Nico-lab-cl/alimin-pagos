type CacheEntry = {
  data: any;
  expiresAt: number;
};

class MemoryCache {
  private cache = new Map<string, CacheEntry>();

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

const globalForCache = globalThis as unknown as { memoryCache: MemoryCache };

export const memoryCache =
  globalForCache.memoryCache || new MemoryCache();

if (process.env.NODE_ENV !== "production")
  globalForCache.memoryCache = memoryCache;
