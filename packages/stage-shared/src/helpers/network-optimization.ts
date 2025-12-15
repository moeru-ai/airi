/**
 * Utility functions for optimizing network requests and API calls
 */

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: any
  timeout?: number
  retries?: number
  cache?: 'no-store' | 'no-cache' | 'default' | 'force-cache' | 'only-if-cached'
  signal?: AbortSignal
}

export interface RateLimitOptions {
  maxRequests: number
  timeWindow: number // in milliseconds
}

export interface NetworkOptimizationOptions {
  enableCompression?: boolean
  enableCaching?: boolean
  retryOnFailure?: boolean
  timeout?: number
}

export class RequestQueue {
  private queue: Array<{
    url: string
    options: RequestOptions
    resolve: (value: Response) => void
    reject: (reason: any) => void
  }> = []
  private processing: number = 0
  private maxConcurrent: number
  private cooldown: number

  constructor(maxConcurrent: number = 6, cooldown: number = 100) {
    this.maxConcurrent = maxConcurrent
    this.cooldown = cooldown
  }

  async add(url: string, options: RequestOptions = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, options, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    this.processing++
    const { url, options, resolve, reject } = this.queue.shift()!

    try {
      const response = await fetch(url, options)
      resolve(response)
    } catch (error) {
      reject(error)
    } finally {
      this.processing--

      setTimeout(() => {
        this.processQueue()
      }, this.cooldown)
    }
  }

  clear(): void {
    this.queue = []
  }

  size(): number {
    return this.queue.length
  }
}

/**
 * Rate limiter for API requests
 */
export class RateLimiter {
  private timestamps: number[] = []
  private readonly maxRequests: number
  private readonly timeWindow: number

  constructor(options: RateLimitOptions) {
    this.maxRequests = options.maxRequests
    this.timeWindow = options.timeWindow
  }

  async wait(): Promise<void> {
    const now = Date.now()
    // Remove timestamps outside the time window
    this.timestamps = this.timestamps.filter(ts => now - ts < this.timeWindow)

    if (this.timestamps.length >= this.maxRequests) {
      // Wait until the oldest request exits the time window
      const oldest = this.timestamps[0]
      const waitTime = this.timeWindow - (now - oldest)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }

    this.timestamps.push(now)
  }

  currentUsage(): number {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(ts => now - ts < this.timeWindow)
    return this.timestamps.length
  }
}

/**
 * Optimized fetch with caching, retries, and rate limiting
 */
export class OptimizedFetch {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map()
  private requestQueue: RequestQueue
  private rateLimiter?: RateLimiter
  private readonly defaultOptions: NetworkOptimizationOptions

  constructor(
    options: NetworkOptimizationOptions = {},
    queueOptions?: { maxConcurrent?: number; cooldown?: number },
    rateLimitOptions?: RateLimitOptions
  ) {
    this.defaultOptions = {
      enableCompression: true,
      enableCaching: true,
      retryOnFailure: true,
      timeout: 10000,
      ...options
    }
    
    this.requestQueue = new RequestQueue(
      queueOptions?.maxConcurrent || 6,
      queueOptions?.cooldown || 100
    )
    
    if (rateLimitOptions) {
      this.rateLimiter = new RateLimiter(rateLimitOptions)
    }
  }

  async fetch(
    url: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    // Generate cache key
    const cacheKey = this.generateCacheKey(url, options)

    // Check cache first if enabled
    if (this.defaultOptions.enableCaching) {
      const cached = this.cache.get(cacheKey)
      if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
        // Return cached response
        return new Response(JSON.stringify(cached.data), {
          headers: { 'content-type': 'application/json' }
        })
      }
    }

    // Apply rate limiting if configured
    if (this.rateLimiter) {
      await this.rateLimiter.wait()
    }

    // Apply default options
    const fetchOptions = {
      method: options.method || 'GET',
      headers: {
        // Enable compression by default
        ...(this.defaultOptions.enableCompression && { 'Accept-Encoding': 'gzip, deflate, br' }),
        'Content-Type': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      // Implement timeout using AbortController
      signal: this.createTimeoutSignal(options.timeout || this.defaultOptions.timeout)
    }

    let lastError: any
    const maxRetries = options.retries ?? (this.defaultOptions.retryOnFailure ? 3 : 0)

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.requestQueue.add(url, fetchOptions)

        // Cache successful responses
        if (this.defaultOptions.enableCaching && response.ok) {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const data = await response.clone().json()
            this.cache.set(cacheKey, {
              data,
              timestamp: Date.now(),
              ttl: 300000 // 5 minutes default TTL
            })
          }
        }

        return response
      } catch (error) {
        lastError = error
        if (attempt === maxRetries) {
          break // Don't retry on the last attempt
        }

        // Exponential backoff: wait 1s, 2s, 4s, etc. between retries
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      }
    }

    throw lastError
  }

  private generateCacheKey(url: string, options: RequestOptions): string {
    return `${url}_${JSON.stringify({
      method: options.method,
      headers: options.headers,
      body: options.body
    })}`
  }

  private createTimeoutSignal(timeout: number): AbortSignal {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), timeout)
    return controller.signal
  }

  clearCache(): void {
    this.cache.clear()
  }

  setCacheTTL(url: string, ttl: number): void {
    const cacheKey = this.generateCacheKey(url, {})
    const cached = this.cache.get(cacheKey)
    if (cached) {
      cached.ttl = ttl
    }
  }
}

/**
 * Batch API request executor for reducing network overhead
 */
export class BatchAPIExecutor {
  private requests: Array<{
    url: string
    options: RequestOptions
    resolve: (value: any) => void
    reject: (reason: any) => void
  }> = []
  private maxBatchSize: number
  private batchTimeout: number
  private timeoutId: any

  constructor(maxBatchSize: number = 10, batchTimeout: number = 1000) {
    this.maxBatchSize = maxBatchSize
    this.batchTimeout = batchTimeout
  }

  async add(url: string, options: RequestOptions = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requests.push({ url, options, resolve, reject })

      if (this.requests.length >= this.maxBatchSize) {
        this.executeBatch()
      } else if (!this.timeoutId) {
        this.timeoutId = setTimeout(() => this.executeBatch(), this.batchTimeout)
      }
    })
  }

  private async executeBatch(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    if (this.requests.length === 0) return

    // Group requests by base URL for potential batch processing
    const groupedRequests = this.groupRequestsByUrl()

    // Process each group
    for (const [baseUrl, requests] of groupedRequests.entries()) {
      await this.executeRequestGroup(baseUrl, requests)
    }

    this.requests = []
  }

  private groupRequestsByUrl(): Map<string, Array<{ url: string; options: RequestOptions }>> {
    // For now, just group by origin for demonstration
    // In a real implementation, you'd have a backend endpoint that accepts batched requests
    const groups = new Map<string, Array<{ url: string; options: RequestOptions }>>()
    
    for (const request of this.requests) {
      const url = new URL(request.url)
      const origin = `${url.protocol}//${url.host}`
      
      if (!groups.has(origin)) {
        groups.set(origin, [])
      }
      
      groups.get(origin)!.push({ url: request.url, options: request.options })
    }
    
    return groups
  }

  private async executeRequestGroup(
    baseUrl: string,
    requests: Array<{ url: string; options: RequestOptions }>
  ): Promise<void> {
    // Execute each request individually (in a real implementation, you'd send them as a batch to a backend endpoint)
    const promises = requests.map(req => fetch(req.url, req.options))
    const results = await Promise.allSettled(promises)
    
    // Resolve/reject individual promises based on results
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const { resolve, reject } = this.requests[i]
      
      if (result.status === 'fulfilled') {
        resolve(result.value)
      } else {
        reject(result.reason)
      }
    }
  }

  async flush(): Promise<void> {
    await this.executeBatch()
  }
}

/**
 * HTTP compression and decompression utilities
 */
export class CompressionHelper {
  /**
   * Compress data before sending (simulated, as browser compression is limited)
   */
  static compressRequest(data: any): any {
    // In a real implementation, you'd use compression libraries
    // For now, just return the data as is
    return data
  }

  /**
   * Decompress received data (simulated)
   */
  static decompressResponse(data: any): any {
    // In a real implementation, you'd decompress based on content-encoding header
    // For now, just return the data as is
    return data
  }

  /**
   * Determine the best compression method based on Accept-Encoding header
   */
  static getBestCompressionEncoding(acceptEncoding: string): string {
    const encodings = acceptEncoding.toLowerCase().split(',').map(e => e.trim())
    
    // Check in order of preference and efficiency
    if (encodings.includes('br')) return 'br' // Brotli is most efficient
    if (encodings.includes('gzip')) return 'gzip'
    if (encodings.includes('deflate')) return 'deflate'
    
    return '' // No compression
  }
}

/**
 * Connection quality estimator
 */
export class ConnectionQualityEstimator {
  private samples: Array<{ time: number; size: number }> = []

  addSample(size: number): void {
    this.samples.push({
      time: Date.now(),
      size
    })

    // Keep only the last 10 samples
    if (this.samples.length > 10) {
      this.samples.shift()
    }
  }

  estimateQuality(): 'excellent' | 'good' | 'poor' | 'offline' {
    if (this.samples.length < 2) {
      return 'good' // Default to good if insufficient data
    }

    // Calculate average download speed (bytes per second)
    const timeDiff = this.samples[this.samples.length - 1].time - this.samples[0].time
    const sizeDiff = this.samples.reduce((sum, sample) => sum + sample.size, 0)

    if (timeDiff === 0) return 'good'
    
    const speed = (sizeDiff / timeDiff) * 1000 // bytes per second

    if (speed > 1024 * 1024) return 'excellent' // > 1MB/s
    if (speed > 100 * 1024) return 'good'      // > 100KB/s
    if (speed > 0) return 'poor'               // > 0
    return 'offline'
  }
}

/**
 * Adaptive request based on connection quality
 */
export class AdaptiveRequest {
  private estimator: ConnectionQualityEstimator

  constructor() {
    this.estimator = new ConnectionQualityEstimator()
  }

  async request(url: string, options: RequestOptions = {}): Promise<Response> {
    const startTime = Date.now()
    
    try {
      // Adjust request based on connection quality
      const quality = this.estimator.estimateQuality()
      
      if (quality === 'poor' || quality === 'offline') {
        // For slow connections, reduce timeout and try lighter options
        options.timeout = Math.min(options.timeout || 10000, 5000)
        if (!options.headers) options.headers = {}
        options.headers['X-Adaptive-Request'] = 'light'
      }
      
      const response = await fetch(url, options)
      const contentLength = response.headers.get('content-length')
      
      if (contentLength) {
        this.estimator.addSample(parseInt(contentLength, 10))
      }
      
      return response
    } catch (error) {
      // Update with 0 size for failed requests
      this.estimator.addSample(0)
      throw error
    }
  }
}