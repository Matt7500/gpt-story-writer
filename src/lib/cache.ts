/**
 * Simple browser-based caching utility
 */

interface CacheItem<T> {
  value: T;
  timestamp: number;
}

export class BrowserCache {
  private static instance: BrowserCache;
  private cache: Map<string, CacheItem<any>>;
  private defaultTTL: number;

  private constructor(defaultTTL: number = 1000 * 60 * 15) { // 15 minutes default TTL
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.loadFromStorage();
  }

  public static getInstance(): BrowserCache {
    if (!BrowserCache.instance) {
      BrowserCache.instance = new BrowserCache();
    }
    return BrowserCache.instance;
  }

  /**
   * Get a value from the cache
   * @param key The cache key
   * @returns The cached value or undefined if not found or expired
   */
  public get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    // Check if the item has expired
    if (Date.now() - item.timestamp > this.defaultTTL) {
      this.cache.delete(key);
      this.saveToStorage();
      return undefined;
    }

    return item.value as T;
  }

  /**
   * Set a value in the cache
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Optional TTL in milliseconds
   */
  public set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    this.saveToStorage();
  }

  /**
   * Remove a value from the cache
   * @param key The cache key
   */
  public remove(key: string): void {
    this.cache.delete(key);
    this.saveToStorage();
  }

  /**
   * Clear all cached values
   */
  public clear(): void {
    this.cache.clear();
    this.saveToStorage();
  }

  /**
   * Save the cache to localStorage
   */
  private saveToStorage(): void {
    try {
      const serialized = JSON.stringify(Array.from(this.cache.entries()));
      localStorage.setItem('app_cache', serialized);
    } catch (error) {
      console.error('Failed to save cache to localStorage:', error);
    }
  }

  /**
   * Load the cache from localStorage
   */
  private loadFromStorage(): void {
    try {
      const serialized = localStorage.getItem('app_cache');
      if (serialized) {
        const entries = JSON.parse(serialized);
        this.cache = new Map(entries);
        
        // Clean up expired items
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
          if (now - item.timestamp > this.defaultTTL) {
            this.cache.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load cache from localStorage:', error);
      this.cache.clear();
    }
  }
}

// Export a singleton instance
export const browserCache = BrowserCache.getInstance(); 