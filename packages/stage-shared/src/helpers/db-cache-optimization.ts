/**
 * Utility functions for optimizing database operations and caching
 */

export interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  maxSize?: number // Maximum number of items in cache
  serialize?: (value: any) => string
  deserialize?: (value: string) => any
}

export interface DatabaseQueryOptions {
  useCache?: boolean
  cacheTtl?: number
  batchSize?: number
  timeout?: number
}

export class OptimizedCache<T = any> {
  private cache: Map<string, { value: T; expiry: number; size: number }> = new Map()
  private accessOrder: string[] = []
  private options: Required<CacheOptions>
  private currentSize: number = 0

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl || 300000,
      maxSize: options.maxSize || 100,
      serialize: options.serialize || JSON.stringify,
      deserialize: options.deserialize || JSON.parse,
    }
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key)

    if (!item) {
      return undefined
    }

    if (Date.now() > item.expiry) {
      this.delete(key)
      return undefined
    }

    const index = this.accessOrder.indexOf(key)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
      this.accessOrder.push(key)
    }

    return item.value
  }

  set(key: string, value: T, ttl?: number): void {
    const actualTtl = ttl ?? this.options.ttl
    const expiry = Date.now() + actualTtl
    const serialized = this.options.serialize(value)
    const size = serialized.length

    while (this.currentSize + size > this.options.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift()
      if (oldestKey) {
        const oldItem = this.cache.get(oldestKey)
        if (oldItem) {
          this.currentSize -= oldItem.size
          this.cache.delete(oldestKey)
        }
      }
    }

    this.cache.set(key, { value, expiry, size })
    this.currentSize += size
    this.accessOrder.push(key)
  }

  delete(key: string): boolean {
    const item = this.cache.get(key)
    if (item) {
      this.currentSize -= item.size
      this.cache.delete(key)
      const index = this.accessOrder.indexOf(key)
      if (index > -1) {
        this.accessOrder.splice(index, 1)
      }
      return true
    }
    return false
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.currentSize = 0
  }

  has(key: string): boolean {
    const item = this.cache.get(key)
    if (!item) return false

    if (Date.now() > item.expiry) {
      this.delete(key)
      return false
    }

    return true
  }

  size(): number {
    return this.cache.size
  }

  keys(): string[] {
    this.accessOrder = this.accessOrder.filter(key => this.has(key))
    return [...this.accessOrder].reverse()
  }
}

/**
 * LocalStorage wrapper with size optimization and fallback
 */
export class OptimizedLocalStorage {
  private prefix: string
  private maxSize: number

  constructor(prefix: string = 'airi_', maxSize: number = 5 * 1024 * 1024) { // 5MB default
    this.prefix = prefix
    this.maxSize = maxSize
  }

  set(key: string, value: any): boolean {
    try {
      const prefixedKey = this.prefix + key
      const serializedValue = JSON.stringify(value)
      
      // Check if we're approaching storage limits
      if (this.estimateSize(prefixedKey, serializedValue) > this.maxSize * 0.9) {
        this.cleanupOldestEntries()
      }

      localStorage.setItem(prefixedKey, serializedValue)
      return true
    } catch (error) {
      console.warn('LocalStorage set failed:', error)
      // Try to cleanup and retry
      this.cleanupOldestEntries()
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(value))
        return true
      } catch {
        return false
      }
    }
  }

  get(key: string): any {
    try {
      const value = localStorage.getItem(this.prefix + key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      console.warn('LocalStorage get failed:', error)
      return null
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(this.prefix + key)
    } catch (error) {
      console.warn('LocalStorage remove failed:', error)
    }
  }

  private estimateSize(key: string, value: string): number {
    // Rough estimate of storage usage
    return new Blob([key + value]).size
  }

  private cleanupOldestEntries(): void {
    // Implementation would identify and remove oldest entries
    // For now, just clear a few random entries to free space
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix))
    const keysToRemove = keys.slice(0, Math.floor(keys.length * 0.2)) // Remove 20% of keys
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }

  clear(): void {
    Object.keys(localStorage)
      .filter(key => key.startsWith(this.prefix))
      .forEach(key => localStorage.removeItem(key))
  }
}

/**
 * IndexedDB utility for larger data storage
 */
export class OptimizedIndexedDB {
  private dbName: string
  private version: number
  private storeName: string

  constructor(dbName: string, version: number = 1, storeName: string = 'defaultStore') {
    this.dbName = dbName
    this.version = version
    this.storeName = storeName
  }

  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' })
        }
      }
    })
  }

  async set(key: string, value: any): Promise<void> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.put({ id: key, ...value })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get(key: string): Promise<any> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      const request = store.get(key)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(key: string): Promise<void> {
    const db = await this.init()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

/**
 * Optimized database query executor with caching
 */
export class OptimizedDBQuery {
  private cache: OptimizedCache
  private db: any // This would be the actual database connection (e.g., Drizzle, DuckDB)

  constructor(db: any, cacheOptions: CacheOptions = {}) {
    this.db = db
    this.cache = new OptimizedCache(cacheOptions)
  }

  async execute<T>(
    query: string | (() => Promise<T>),
    params?: any[],
    options: DatabaseQueryOptions = {}
  ): Promise<T> {
    const { useCache = true, cacheTtl = 300000 } = options // 5 min default
    
    // Generate cache key based on query and params
    const cacheKey = this.generateCacheKey(query, params)
    
    if (useCache) {
      const cachedResult = this.cache.get(cacheKey)
      if (cachedResult !== undefined) {
        return cachedResult as T
      }
    }

    // Execute query
    let result: T
    if (typeof query === 'function') {
      result = await query()
    } else {
      // In a real implementation, this would execute the actual database query
      // result = await this.db.execute(query, params)
      result = {} as T // Placeholder
    }

    if (useCache) {
      this.cache.set(cacheKey, result, cacheTtl)
    }

    return result
  }

  private generateCacheKey(query: string | (() => Promise<any>), params?: any[]): string {
    if (typeof query === 'function') {
      // If it's a function, use its string representation as part of the key
      return `${query.toString()}_${params ? JSON.stringify(params) : ''}`
    }
    return `${query}_${params ? JSON.stringify(params) : ''}`
  }

  async clearCache(): Promise<void> {
    this.cache.clear()
  }

  async invalidateCache(pattern: string): Promise<void> {
    // In a real implementation, this would clear cache entries that match the pattern
    // For now, we'll just clear everything as an example
    this.cache.clear()
  }
}

/**
 * Batch operation utility for database efficiency
 */
export class BatchOperation<T> {
  private operations: Array<() => Promise<T>> = []
  private batchSize: number

  constructor(batchSize: number = 10) {
    this.batchSize = batchSize
  }

  add(operation: () => Promise<T>): void {
    this.operations.push(operation)

    // Execute batch if we've reached the limit
    if (this.operations.length >= this.batchSize) {
      this.executeBatch()
    }
  }

  async executeBatch(): Promise<T[]> {
    if (this.operations.length === 0) return []

    // Execute all operations in the batch in parallel
    const results = await Promise.all(
      this.operations.map(op => op().catch(err => ({ error: err })))
    )

    this.operations = []
    return results as T[]
  }

  async flush(): Promise<T[]> {
    return this.executeBatch()
  }

  get size(): number {
    return this.operations.length
  }
}

/**
 * Memoized query function for expensive operations
 */
export function createMemoizedQuery<T>(
  queryFunction: (...args: any[]) => Promise<T>,
  cache: OptimizedCache<T> = new OptimizedCache<T>({ ttl: 60000, maxSize: 50 })
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<T> => {
    const cacheKey = JSON.stringify(args)
    const cached = cache.get(cacheKey)
    
    if (cached !== undefined) {
      return cached
    }

    const result = await queryFunction(...args)
    cache.set(cacheKey, result)
    return result
  }
}